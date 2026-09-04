/**
 * Enlaces firmados y destinos de redirección.
 *
 * Una redirección abierta —una URL de tu dominio que lleva a donde le digan—
 * es una herramienta de phishing regalada, y en un endpoint de autenticación o
 * en el dominio desde el que envías correo es de lo peor que puedes dejar
 * abierto: la víctima ve el dominio del grupo, se fía, y acaba en una copia
 * del login.
 *
 * Aquí viven las dos defensas:
 *
 * · `rutaInternaSegura` para los saltos dentro de la aplicación.
 * · `firmarDestino` / `destinoValido` para el redirector de clics de las
 *   campañas, donde el destino sí puede ser externo pero solo si lo generó
 *   la propia plataforma.
 */
import crypto from 'node:crypto';

/**
 * Normaliza un `?next=` a una ruta interna.
 *
 * Solo se acepta una ruta que empiece por una barra y NO por dos: `//evil.com`
 * es una URL protocolo-relativa, la trampa clásica de este parámetro. Cualquier
 * otra cosa cae al valor por defecto en lugar de rechazarse, porque quien llega
 * por un enlace de invitación tiene que acabar en algún sitio útil.
 */
export function rutaInternaSegura(valor: string | null, porDefecto: string): string {
  if (!valor) return porDefecto;
  if (!valor.startsWith('/')) return porDefecto;
  if (valor.startsWith('//') || valor.startsWith('/\\')) return porDefecto;
  // Un intento de colar un esquema («/javascript:...») o de salir con «..».
  if (valor.includes('://') || valor.includes('..')) return porDefecto;
  return valor;
}

/** Secreto con el que se firman los enlaces salientes. */
function secreto(): string | null {
  return process.env.ENLACES_SECRET || process.env.CRON_SECRET || null;
}

/**
 * Firma un destino externo. La firma va en la URL junto al destino, así que el
 * redirector puede comprobar que ese enlace lo generó la plataforma sin
 * guardar nada en base de datos.
 */
export function firmarDestino(destino: string): string {
  const clave = secreto();
  if (!clave) return '';
  return crypto.createHmac('sha256', clave).update(destino).digest('hex').slice(0, 32);
}

/**
 * ¿Este destino viene con una firma válida? Comparación en tiempo constante:
 * comparar dos firmas con `===` filtra por longitud y deja un canal lateral
 * de temporización.
 */
export function destinoValido(destino: string, firma: string | null): boolean {
  if (!firma) return false;
  const esperada = firmarDestino(destino);
  if (!esperada) return false;
  const a = Buffer.from(esperada);
  const b = Buffer.from(firma);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Comparación de secretos compartidos (webhooks) en tiempo constante.
 *
 * Con `!==`, el tiempo de respuesta depende de cuántos caracteres coinciden.
 * A través de internet el ruido lo tapa casi siempre, pero es una diferencia
 * gratis de eliminar y el atacante puede promediar miles de intentos.
 */
export function secretoCoincide(recibido: string, esperado: string | undefined): boolean {
  if (!esperado) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) {
    // Longitudes distintas: se compara igualmente contra sí mismo para no
    // devolver antes que en el caso de longitud correcta.
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}
