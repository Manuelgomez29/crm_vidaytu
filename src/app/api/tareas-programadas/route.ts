import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ejecutarAlertas } from '@/lib/alertas';
import { ejecutarAutomatizaciones } from '@/lib/automatizacion';
import { procesarCampanas } from '@/lib/campanas';
import { enviarPushPendientes } from '@/lib/push-pendientes';
import { repartirLeadsSinPropietario } from '@/lib/reparto';
import { enviarRecordatoriosCita } from '@/lib/recordatorios';
import { dentroDelLimite, ipDeLaPeticion } from '@/lib/limites';
import { secretoCoincide } from '@/lib/enlaces';
import { fase, registrarEjecucion, type FalloDeFase } from '@/lib/salud-motor';

/**
 * Motor periódico de la plataforma. Pensado para llamarse cada 15–30 minutos
 * desde un cron
 * (Vercel Cron, GitHub Actions, cron-job.org…), protegido por secreto.
 *
 *   POST /api/tareas-programadas
 *
 * Acepta el secreto de tres formas, para que valga con cualquier cron:
 *   · `Authorization: Bearer <secreto>` — lo que manda Vercel Cron solo.
 *   · Cabecera `x-cron-secret`.
 *   · `?token=` en la URL, para los cron que no saben poner cabeceras. Es la
 *     peor: el secreto queda en los registros del servidor y del proxy.
 *
 * Es idempotente: cada aviso lleva clave única, así que llamarlo de más no
 * duplica nada. Devuelve el recuento de lo que ha hecho.
 */
export async function POST(req: NextRequest) {
  const secretoEsperado = process.env.CRON_SECRET;
  const autorizacion = req.headers.get('authorization') ?? '';
  const secreto =
    (autorizacion.startsWith('Bearer ') ? autorizacion.slice(7) : '') ||
    req.headers.get('x-cron-secret') ||
    req.nextUrl.searchParams.get('token') ||
    '';
  if (!(await dentroDelLimite('cron', ipDeLaPeticion(req.headers)))) {
    return NextResponse.json({ error: 'Demasiadas peticiones' }, { status: 429 });
  }

  // En tiempo constante: `!==` corta en el primer caracter distinto y filtra
  // cuantos acertaste.
  if (!secretoCoincide(secreto, secretoEsperado)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const inicio = new Date();

  try {
    const admin = createAdminClient();

    /*
     * Cada fase, aislada de las demás.
     *
     * Iban encadenadas con `await` a secas: la primera que fallara se llevaba
     * por delante toda la pasada, y las siguientes ni se intentaban. Que las
     * campañas de marketing estén rotas no puede dejar los leads sin repartir
     * ni las citas sin recordatorio; son cosas que no tienen nada que ver.
     *
     * El orden sí importa y se mantiene: el reparto va primero para que las
     * alertas de esta misma pasada avisen al propietario nuevo y no a
     * dirección, y el envío al móvil va el último para que empuje todo lo que
     * los pasos anteriores acaban de crear.
     */
    const fallos: FalloDeFase[] = [];

    const reparto = await fase('reparto', fallos, () => repartirLeadsSinPropietario(admin), {
      asignados: 0,
      sinCandidato: 0,
    });
    const automatizacion = await ejecutarAutomatizaciones(admin, fallos);
    const alertas = await fase('alertas', fallos, () => ejecutarAlertas(admin), null);
    const recordatorios = await fase(
      'recordatorios',
      fallos,
      () => enviarRecordatoriosCita(admin),
      {
        enviados: 0,
        sinDestinatario: 0,
      },
    );
    const campanas = await fase('campanas', fallos, () => procesarCampanas(admin), null);
    const push = await fase('push', fallos, () => enviarPushPendientes(admin), {
      enviados: 0,
      dispositivosRetirados: 0,
    });

    const resultado = {
      ...(alertas ?? {}),
      ...automatizacion,
      ...(campanas ?? {}),
      repartidos: reparto.asignados,
      recordatorios: recordatorios.enviados,
      push: push.enviados,
    };

    await registrarEjecucion(admin, { inicio, resultado, fallos });

    /*
     * Si algo falló se devuelve 500 aunque el resto haya funcionado: así el
     * panel de Vercel marca la ejecución en rojo. La pasada ya ha hecho todo lo
     * que podía hacer —eso es lo que separa esto de caerse— y en la tabla queda
     * escrito qué fase falló y por qué.
     */
    return NextResponse.json(
      { ok: fallos.length === 0, ...resultado, ...(fallos.length ? { fallos } : {}) },
      { status: fallos.length === 0 ? 200 : 500 },
    );
  } catch (e) {
    // Aquí solo se llega si falla lo de fuera de las fases: crear el cliente.
    const mensaje = e instanceof Error ? e.message : 'Error desconocido';
    try {
      await registrarEjecucion(createAdminClient(), {
        inicio,
        resultado: {},
        fallos: [{ fase: 'arranque', error: mensaje }],
      });
    } catch {
      // Si ni el cliente se puede crear, no hay dónde escribirlo.
    }
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}

// Algunos cron solo saben hacer GET.
export const GET = POST;
