import { NextRequest, NextResponse } from 'next/server';
import { secretoCoincide } from '@/lib/enlaces';

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
      // El interruptor de las webs que mandan con el secreto global.
      FORMULARIOS_WEBHOOK_SECRET: puesta('FORMULARIOS_WEBHOOK_SECRET'),
      ENLACES_SECRET: puesta('ENLACES_SECRET'),
      NEXT_PUBLIC_URL_APP: process.env.NEXT_PUBLIC_URL_APP ?? null,
    },
  });
}
