import { NextRequest, NextResponse } from 'next/server';
import { secretoCoincide } from '@/lib/enlaces';
import { remitenteRevela } from '@/lib/discrecion';

/**
 * Qué hay vivo ahí fuera.
 *
 *   GET /api/estado   (mismo secreto que el motor)
 *
 * Nació de perder media hora larga preguntándose por qué producción no hacía
 * lo que el código dice. Las respuestas posibles eran varias —el despliegue no
 * llegó, llegó otro commit, la variable no está, está pero sin marcar
 * Production— y desde fuera todas se parecen.
 *
 * Esto las separa en una llamada: qué commit sirve y qué variables ve el
 * servidor. Y evita la trampa de mirar el fichero del ordenador propio y creer
 * que se está mirando el servidor, que es en lo que caímos.
 *
 * NUNCA DEVUELVE VALORES, solo si están puestas. Un endpoint que dijera cuánto
 * mide una clave o por dónde empieza sería una ayuda para adivinarla; y va
 * detrás del secreto del motor porque ni siquiera saber qué integraciones hay
 * montadas es asunto de cualquiera.
 */
export async function GET(req: NextRequest) {
  const esperado = process.env.CRON_SECRET;
  const dado =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    req.headers.get('x-cron-secret') ??
    req.nextUrl.searchParams.get('token') ??
    '';

  if (!esperado || !secretoCoincide(dado, esperado)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const puesta = (nombre: string) => (process.env[nombre] ?? '').trim().length > 0;

  return NextResponse.json({
    commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'desconocido').slice(0, 7),
    mensaje: process.env.VERCEL_GIT_COMMIT_MESSAGE?.split('\n')[0] ?? null,
    entorno: process.env.VERCEL_ENV ?? 'local',
    ahora: new Date().toISOString(),
    variables: {
      HIGHLEVEL_TOKEN: puesta('HIGHLEVEL_TOKEN'),
      HIGHLEVEL_LOCATION_ID: puesta('HIGHLEVEL_LOCATION_ID'),
      ZEROCHATS_WEBHOOK_SECRET: puesta('ZEROCHATS_WEBHOOK_SECRET'),
      ZEROCHATS_API_KEY: puesta('ZEROCHATS_API_KEY'),
      RESEND_API_KEY: puesta('RESEND_API_KEY'),
      // Las dos hacen falta para enviar: una clave sin remitente no manda nada.
      EMAIL_REMITENTE: puesta('EMAIL_REMITENTE'),
      // El interruptor de las webs que mandan con el secreto global.
      FORMULARIOS_WEBHOOK_SECRET: puesta('FORMULARIOS_WEBHOOK_SECRET'),
      ENLACES_SECRET: puesta('ENLACES_SECRET'),
      NEXT_PUBLIC_URL_APP: process.env.NEXT_PUBLIC_URL_APP ?? null,
      // Avisos al móvil: las dos mitades del par, y el remitente que firma.
      VAPID_PRIVATE_KEY: puesta('VAPID_PRIVATE_KEY'),
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: puesta('NEXT_PUBLIC_VAPID_PUBLIC_KEY'),
      // El asistente de IA (además necesita el interruptor ia_activa).
      ANTHROPIC_API_KEY: puesta('ANTHROPIC_API_KEY'),
      // WhatsApp Business: verificación del webhook y firma de lo que llega.
      WHATSAPP_VERIFY_TOKEN: puesta('WHATSAPP_VERIFY_TOKEN'),
      WHATSAPP_APP_SECRET: puesta('WHATSAPP_APP_SECRET'),
      SENTRY_DSN: puesta('SENTRY_DSN'),
    },
    // Si el remitente global deja ver el motivo, recordatorios y campañas se
    // detienen solos (lib/discrecion.ts). Se dice aquí para no tener que
    // adivinarlo por qué no sale nada.
    remitenteDiscreto: remitenteRevela(process.env.EMAIL_REMITENTE).length === 0,
  });
}
