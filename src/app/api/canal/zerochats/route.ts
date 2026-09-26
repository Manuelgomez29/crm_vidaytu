import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dentroDelLimite, ipDeLaPeticion } from '@/lib/limites';
import {
  firmaZeroChatsValida,
  identidadDesdeEvento,
  ingerirEvento,
  type EventoZeroChats,
} from '@/lib/canal';

/**
 * Entrada de los canales sociales, vía ZeroChats.
 *
 *   POST /api/canal/zerochats
 *
 * ZeroChats manda un aviso cada vez que un lead nace, cambia de etapa, recibe
 * etiquetas o responde a una publicación. Este endpoint lo guarda en crudo y
 * actualiza la identidad. NO crea contactos ni casos: durante el piloto esas
 * personas se atienden en HighLevel, y la unión con el modelo es la decisión
 * de enero.
 *
 * ESTE ENDPOINT NO ESTÁ EN MEDIO. ZeroChats manda a HighLevel por su
 * integración nativa y aquí en paralelo, por su webhook personalizado. Si esto
 * se cae, a ellos no les pasa nada: el lead se crea y avanza igual. Lo único
 * que perdemos es nuestra copia, y para eso están sus reintentos.
 *
 * RESPONDER RÁPIDO. Dan 10 segundos por intento y un 200 lento cuesta lo mismo
 * que un error. Guardar el crudo es una escritura; interpretar viene después.
 */
export async function POST(req: NextRequest) {
  const secreto = process.env.ZEROCHATS_WEBHOOK_SECRET;
  if (!secreto) {
    // Sin clave de firma no se acepta nada. Un webhook abierto que escribe en
    // la base es una puerta para llenarla de basura, y este además se alimenta
    // de una URL pública que cualquiera puede adivinar.
    return NextResponse.json({ error: 'Webhook no configurado' }, { status: 503 });
  }

  /*
   * El límite va ANTES de verificar la firma: comprobar un HMAC es barato,
   * pero no gratis, y quien no tenga la clave no debe poder gastarnos CPU
   * repitiendo peticiones. Es el mismo orden que en los otros webhooks.
   */
  const ip = ipDeLaPeticion(req.headers);
  if (!(await dentroDelLimite('canal_social', ip))) {
    // Respetan `Retry-After`: decirles cuánto esperar hace que el envío acabe
    // entrando en vez de perderse.
    return NextResponse.json(
      { error: 'Demasiadas peticiones' },
      { status: 429, headers: { 'Retry-After': '30' } },
    );
  }

  // El cuerpo CRUDO, antes de parsear: es lo que está firmado.
  const cuerpo = await req.text();

  if (!firmaZeroChatsValida(cuerpo, req.headers, secreto)) {
    return NextResponse.json({ error: 'Firma no válida' }, { status: 401 });
  }

  let evento: EventoZeroChats;
  try {
    evento = JSON.parse(cuerpo) as EventoZeroChats;
  } catch {
    // Un 4xx no lo reintentan, y hacen bien: un cuerpo ilegible no mejora
    // repitiéndolo.
    return NextResponse.json({ error: 'JSON no válido' }, { status: 400 });
  }

  const nombreEvento = req.headers.get('x-zerochats-event') ?? evento.event ?? 'desconocido';
  const entregaRef = req.headers.get('x-zerochats-delivery') ?? evento.id ?? null;

  try {
    const resultado = await ingerirEvento(createAdminClient(), {
      sistema: 'zerochats',
      evento: nombreEvento,
      entregaRef,
      payload: evento,
      ip,
      identidad: identidadDesdeEvento(evento),
    });

    // El duplicado también es un 200: es su reintento de algo que ya tenemos,
    // y contestarle un error solo haría que lo repitiera.
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    /*
     * Un 5xx aquí es correcto: significa «no lo he guardado, vuelve a
     * intentarlo». Reintentan hasta tres veces ante un 5xx, así que una caída
     * corta de la base no nos cuesta el evento.
     */
    const mensaje = e instanceof Error ? e.message : 'Error desconocido';
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
