/**
 * La política de seguridad de contenido, con nonce.
 *
 * QUÉ ESTABA MAL. La CSP vivía en `next.config.ts` y su cabecera decía:
 * «`'unsafe-inline'` … en scripts NO está, que es donde importa». Dos líneas
 * más abajo, `script-src 'self' 'unsafe-inline'`. Estaba, y era lo único que
 * hacía falta para que un XSS ejecutara: bastaba con que un nombre de contacto
 * o una plantilla de correo llegase a pintarse sin escapar. Un comentario que
 * afirma lo contrario de lo que hace el código es peor que el agujero, porque
 * quien lo lea deja de mirar.
 *
 * POR QUÉ ESTABA. Next inyecta sus propios `<script>` en línea para arrancar la
 * página. Sin `'unsafe-inline'` no arranca — salvo que cada uno lleve un NONCE,
 * un número irrepetible por petición que el navegador exige para ejecutarlo. Un
 * atacante que consiga inyectar HTML no puede adivinarlo, así que su script no
 * corre. Eso es lo que se hace ahora: el nonce lo genera el middleware en cada
 * petición y Next lo pone en los suyos.
 *
 * `'strict-dynamic'` acompaña al nonce: lo que cargue un script de confianza
 * hereda la confianza, que es como Next carga sus trozos.
 *
 * EN DESARROLLO NO. El recargado en caliente necesita `eval` y scripts que no
 * pasan por el nonce, así que en local se deja la política permisiva de
 * siempre. No se pierde nada: lo que hay que proteger es lo que está publicado,
 * y una CSP que obliga a apagar el modo desarrollo acaba apagada del todo.
 *
 * `'unsafe-inline'` SÍ sigue en los ESTILOS, y ahí no es lo mismo: Tailwind y
 * el propio Next inyectan estilos en línea, y un estilo no ejecuta código.
 */
export function politicaCSP(nonce: string | null): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const esDesarrollo = process.env.NODE_ENV === 'development';

  const scripts = esDesarrollo
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;

  return [
    "default-src 'self'",
    scripts,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    // Las imágenes pueden venir del almacenamiento privado por URL firmada.
    `img-src 'self' data: blob: ${supabase}`,
    // A dónde puede hablar el navegador: la propia app y Supabase (REST,
    // almacenamiento y el websocket de tiempo real). Nada más.
    `connect-src 'self' ${supabase} ${supabase.replace('https://', 'wss://')}`,
    // Los adjuntos y documentos se abren por redirección al almacenamiento.
    "form-action 'self'",
    // Nadie puede meter esta aplicación en un iframe: es lo que evita el
    // clickjacking sobre botones como «validar conversión» o «anonimizar».
    "frame-ancestors 'none'",
    // La vista previa de campañas usa un iframe con sandbox y srcDoc.
    "frame-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(esDesarrollo ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

/** Un número irrepetible por petición. `crypto` global: esto corre en el Edge. */
export function nuevoNonce(): string {
  return btoa(crypto.randomUUID());
}
