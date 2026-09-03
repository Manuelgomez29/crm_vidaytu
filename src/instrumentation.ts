/**
 * Monitorización de errores (Sentry).
 *
 * INERTE SIN `SENTRY_DSN`. Mientras no haya DSN configurado no se inicializa
 * nada, no sale ni un byte del servidor y la plataforma funciona igual. Así el
 * código está listo el día que el grupo contrate el servicio, sin que hasta
 * entonces haya un cliente a medio configurar mandando cosas a ningún sitio.
 *
 * DATOS SENSIBLES: `sendDefaultPii` se queda en false y se filtran las
 * cabeceras de sesión. Un informe de error de esta plataforma puede arrastrar
 * el nombre y el teléfono de alguien que llamó a un centro de adicciones, y
 * eso no puede acabar en un servicio de terceros por accidente.
 */
export async function register() {
  if (!process.env.SENTRY_DSN) return;

  const Sentry = await import('@sentry/nextjs');

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,

    // Muestreo bajo: interesa saber QUÉ falla, no medir el rendimiento de cada
    // petición de un CRM que usan doce personas.
    tracesSampleRate: 0.1,

    // Nunca la información personal que Sentry recoge por defecto (IP,
    // cookies, cabeceras de usuario).
    sendDefaultPii: false,

    beforeSend(evento) {
      // Las cookies llevan el token de sesión de Supabase: fuera.
      if (evento.request?.cookies) delete evento.request.cookies;
      if (evento.request?.headers) {
        for (const cabecera of ['cookie', 'authorization', 'x-cron-secret', 'x-webhook-secret']) {
          delete evento.request.headers[cabecera];
        }
      }

      // Las URLs pueden llevar tokens de baja de campaña o ids de consulta.
      if (evento.request?.query_string) delete evento.request.query_string;

      return evento;
    },
  });
}

/**
 * Errores de las peticiones que Next captura por su cuenta. Sin DSN no hace
 * nada, igual que `register`.
 */
export async function onRequestError(
  ...argumentos: Parameters<typeof import('@sentry/nextjs').captureRequestError>
) {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.captureRequestError(...argumentos);
}
