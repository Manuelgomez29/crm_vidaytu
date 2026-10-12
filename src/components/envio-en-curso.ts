/**
 * Lo que está pasando entre que se pulsa un botón y el servidor contesta.
 *
 * Lo comparten tres piezas que no se ven entre sí —la barra de progreso, el eco
 * de los avisos y el formulario a prueba de cortes—, así que vive en un módulo:
 * en el navegador es una sola instancia para toda la aplicación.
 */

export type Envio = {
  /** La ruta desde la que se envió: si la respuesta vuelve a ella, se conserva el sitio. */
  ruta: string;
  /** Hasta dónde se había bajado. */
  y: number;
  cuando: number;
};

let envio: Envio | null = null;

/** Un envío de hace más de esto ya no es «el que acaba de terminar». */
const VIGENCIA_MS = 20_000;

export function empezarEnvio(): void {
  envio = { ruta: window.location.pathname, y: window.scrollY, cuando: Date.now() };
}

/** El envío en curso, si sigue vigente. No lo consume. */
export function envioEnCurso(): Envio | null {
  if (!envio || Date.now() - envio.cuando > VIGENCIA_MS) return null;
  return envio;
}

/**
 * Da por terminado lo que hubiera en marcha: devuelve el envío (para quien
 * quiera restaurar el sitio) y suelta todos los botones que estuvieran girando.
 */
export function terminarEnvio(): Envio | null {
  const anterior = envioEnCurso();
  envio = null;
  if (typeof document !== 'undefined') {
    for (const el of document.querySelectorAll('[data-cargando]')) {
      el.removeAttribute('data-cargando');
      el.removeAttribute('aria-busy');
    }
  }
  return anterior;
}

/**
 * ¿Este formulario lo envía React a una acción del servidor?
 *
 * Solo esos se marcan. Un formulario con su propio `onSubmit` (los del segundo
 * factor) decide él qué hacer y cuándo acaba: marcarlo dejaría un botón girando
 * sin nadie que lo pare. React deja dos huellas reconocibles: el atributo
 * `action` con `javascript:` en el cliente, o los campos ocultos `$ACTION_…`
 * cuando la página llega pintada del servidor.
 */
export function esFormularioDeAccion(form: HTMLFormElement): boolean {
  if ((form.getAttribute('action') ?? '').startsWith('javascript:')) return true;
  return form.querySelector('input[name^="$ACTION_"]') !== null;
}
