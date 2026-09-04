import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizarTelefono } from '@/lib/telefonos';
import { dentroDelLimite, ipDeLaPeticion } from '@/lib/limites';
import {
  anotarEnCasoAbierto,
  pipelineYPrimeraEtapa,
  reabrirCaso,
  ultimoCasoPorTelefono,
} from '@/lib/casos';

/**
 * Webhook de WhatsApp Business API (Meta).
 *
 * Cuando alguien escribe al número del centro, Meta llama aquí. El mensaje se
 * guarda siempre y se empareja con el caso por teléfono, con las MISMAS reglas
 * que el resto de la plataforma:
 *
 *   · Si hay un caso abierto de ese teléfono → se anota como actividad.
 *   · Si el caso estaba cerrado → se REABRE, con su historial y su propietario
 *     anterior (regla 4). No se crea un caso nuevo.
 *   · Si el teléfono es desconocido → nace un lead en la bandeja de grupo.
 *
 * En campañas click-to-WhatsApp, Meta manda además qué anuncio trajo a la
 * persona: eso es la atribución exacta que el registro manual nunca da.
 *
 * SEGURIDAD: se verifica la firma HMAC de Meta. Sin `WHATSAPP_APP_SECRET`
 * configurado la ruta rechaza todo, porque un webhook abierto que crea leads
 * es una puerta para llenar el CRM de basura.
 */

/** Verificación del webhook: Meta hace un GET con un reto al configurarlo. */
export async function GET(req: NextRequest) {
  const modo = req.nextUrl.searchParams.get('hub.mode');
  const token = req.nextUrl.searchParams.get('hub.verify_token');
  const reto = req.nextUrl.searchParams.get('hub.challenge');

  const esperado = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!esperado) {
    return NextResponse.json({ error: 'Webhook no configurado' }, { status: 503 });
  }
  if (modo === 'subscribe' && token === esperado && reto) {
    return new NextResponse(reto, { status: 200 });
  }
  return NextResponse.json({ error: 'Verificación fallida' }, { status: 403 });
}

/** Firma HMAC-SHA256 que Meta envía en `x-hub-signature-256`. */
function firmaValida(cuerpo: string, cabecera: string | null, secreto: string): boolean {
  if (!cabecera?.startsWith('sha256=')) return false;
  const esperada = crypto.createHmac('sha256', secreto).update(cuerpo, 'utf8').digest('hex');
  const recibida = cabecera.slice(7);
  // Comparación en tiempo constante: comparar con === filtra por longitud y
  // deja un canal lateral de temporización.
  const a = Buffer.from(esperada, 'hex');
  const b = Buffer.from(recibida, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

type MensajeMeta = {
  from?: string;
  id?: string;
  timestamp?: string;
  text?: { body?: string };
  referral?: { source_id?: string; headline?: string; body?: string };
};

export async function POST(req: NextRequest) {
  const secreto = process.env.WHATSAPP_APP_SECRET;
  if (!secreto) {
    return NextResponse.json({ error: 'Webhook no configurado' }, { status: 503 });
  }

  // Meta puede mandar rafagas legitimas, asi que el limite es generoso: frena
  // una inundacion, no el trafico normal de un numero de atencion.
  if (!(await dentroDelLimite('whatsapp', ipDeLaPeticion(req.headers)))) {
    return NextResponse.json({ error: 'Demasiadas peticiones' }, { status: 429 });
  }

  const cuerpo = await req.text();
  if (!firmaValida(cuerpo, req.headers.get('x-hub-signature-256'), secreto)) {
    return NextResponse.json({ error: 'Firma no válida' }, { status: 401 });
  }

  let carga: {
    entry?: { changes?: { value?: { messages?: MensajeMeta[] } }[] }[];
  };
  try {
    carga = JSON.parse(cuerpo);
  } catch {
    return NextResponse.json({ error: 'JSON no válido' }, { status: 400 });
  }

  const admin = createAdminClient();
  const mensajes: MensajeMeta[] = [];
  for (const entrada of carga.entry ?? []) {
    for (const cambio of entrada.changes ?? []) {
      mensajes.push(...(cambio.value?.messages ?? []));
    }
  }

  let registrados = 0;
  let casosNuevos = 0;
  let reaperturas = 0;

  for (const mensaje of mensajes) {
    const telefono = normalizarTelefono(mensaje.from ?? '');
    if (!telefono || !mensaje.id) continue;

    // `mensaje_ref` es único: Meta reintenta los webhooks, y sin esto un
    // reintento crearía el mismo mensaje dos veces.
    const { data: yaEstaba } = await admin
      .from('mensajes_whatsapp')
      .select('id')
      .eq('mensaje_ref', mensaje.id)
      .maybeSingle();
    if (yaEstaba) continue;

    const caso = await ultimoCasoPorTelefono(admin, telefono);
    const texto = mensaje.text?.body ?? '(mensaje sin texto)';
    let leadId = caso?.leadId ?? null;

    if (!caso) {
      // Teléfono desconocido: nace un lead en la bandeja de grupo, que es
      // donde van los contactos sin centro claro (regla 2).
      const [{ data: bandeja }, { data: canal }] = await Promise.all([
        admin.from('centros').select('id').eq('es_bandeja_grupo', true).maybeSingle(),
        admin.from('canales').select('id').eq('slug', 'whatsapp').maybeSingle(),
      ]);

      if (bandeja && canal) {
        const etapa = await pipelineYPrimeraEtapa(admin, bandeja.id);
        if ('pipelineId' in etapa) {
          const { data: nuevo } = await admin
            .from('leads')
            .insert({
              centro_id: bandeja.id,
              pipeline_id: etapa.pipelineId,
              etapa_id: etapa.etapaId,
              nombre: `WhatsApp ${telefono}`,
              telefono,
              canal_id: canal.id,
              subcanal: mensaje.referral?.headline ?? 'WhatsApp entrante',
              origen_sistema: 'whatsapp',
              origen_ref: mensaje.id,
              utm_campaign: mensaje.referral?.source_id ?? null,
            })
            .select('id')
            .single();
          if (nuevo) {
            leadId = nuevo.id;
            casosNuevos++;
          }
        }
      }
    } else if (caso.cerrado) {
      // Un teléfono conocido que vuelve NO abre caso nuevo: reabre el suyo.
      await reabrirCaso(admin, {
        caso,
        motivo: `Escribe por WhatsApp: «${texto.slice(0, 120)}»`,
      });
      reaperturas++;
    } else {
      await anotarEnCasoAbierto(admin, {
        caso,
        nota: `Mensaje entrante por WhatsApp: «${texto.slice(0, 200)}»`,
      });
    }

    await admin.from('mensajes_whatsapp').insert({
      telefono,
      direccion: 'entrante',
      cuerpo: texto,
      mensaje_ref: mensaje.id,
      lead_id: leadId,
      anuncio_ref: mensaje.referral?.source_id ?? null,
      anuncio_titulo: mensaje.referral?.headline ?? null,
      recibido_at: mensaje.timestamp
        ? new Date(Number(mensaje.timestamp) * 1000).toISOString()
        : new Date().toISOString(),
      procesado_at: new Date().toISOString(),
    });
    registrados++;
  }

  await admin
    .from('integraciones')
    .update({ ultima_sincronizacion_at: new Date().toISOString(), ultimo_error: null })
    .eq('clave', 'whatsapp');

  // Meta reintenta ante cualquier respuesta que no sea 200.
  return NextResponse.json({ ok: true, registrados, casosNuevos, reaperturas });
}
