'use client';

import { Suspense, useEffect, useLayoutEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { empezarEnvio, esFormularioDeAccion, terminarEnvio } from './envio-en-curso';

/**
 * Una barra que dice «voy».
 *
 * Con Server Components, al tocar un enlace el navegador se queda en la pantalla
 * anterior hasta que el servidor termina de responder. En un ordenador son dos
 * décimas y no se nota. En un móvil con dos rayas, dentro de un centro, son
 * segundos en los que NO PASA NADA: ni la pantalla cambia, ni el enlace se
 * marca, ni hay rueda. Y lo que hace cualquiera entonces es volver a tocar.
 *
 * Lo suyo sería un esqueleto por pantalla (`loading.tsx`), pero aquí la barra
 * lateral y la cabecera viven DENTRO de cada página, no en un layout: un
 * `loading.tsx` las borraría y las volvería a pintar en cada navegación, y el
 * parpadeo de la interfaz entera es peor que la espera. Esta barra deja el
 * armazón quieto y solo dice que hay algo en marcha.
 *
 * No es un porcentaje: no sabemos cuánto falta, y una barra que finge saberlo
 * miente. Avanza deprisa al principio y se va frenando, que es la forma honesta
 * de decir «esto sigue vivo» sin prometer un final concreto.
 */
function Barra() {
  const ruta = usePathname();
  const parametros = useSearchParams();
  const [activa, setActiva] = useState(false);

  /*
   * Cuando la ruta o los filtros cambian, la navegación ha terminado: se suelta
   * el botón que giraba y, si la respuesta volvió a la MISMA pantalla, se
   * devuelve a cada cual al sitio donde estaba. Sin esto, guardar el paso diez
   * de un flujo te subía al principio de la página a buscar dónde ibas.
   */
  /*
   * En `useLayoutEffect`, antes de pintar: Next sube arriba al cambiar la URL,
   * y recolocar en un efecto normal dejaba ver un fotograma arriba del todo.
   */
  useLayoutEffect(() => {
    setActiva(false);
    const envio = terminarEnvio();
    if (!envio || envio.ruta !== window.location.pathname) return;

    /*
     * Volver al sitio, ahora y otra vez un instante después por si el ajuste de
     * Next llega detrás. Sin `requestAnimationFrame` (con la pestaña en segundo
     * plano no se ejecuta) y SIN devolver una limpieza: este efecto se ejecuta
     * dos veces seguidas al cambiar la URL, y la limpieza de la primera cancelaba
     * los temporizadores antes de que saltaran. La prueba lo cazó: ni volvía al
     * sitio ni salía el aviso. El envío se consume una sola vez, así que la
     * segunda pasada sale arriba sin programar nada.
     */
    const volver = () => {
      if (Math.abs(window.scrollY - envio.y) > 2) window.scrollTo({ top: envio.y });
    };
    volver();
    setTimeout(volver, 60);
    setTimeout(volver, 250);

    /*
     * Y se avisa de que terminó, para que el eco de los avisos enseñe el
     * resultado si el recuadro de arriba ha quedado fuera de la vista. Va por un
     * evento y en diferido: así da igual qué componente se monte antes.
     */
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('vd:envio-terminado', { detail: envio }));
    }, 0);
  }, [ruta, parametros]);

  useEffect(() => {
    function alPulsar(e: MouseEvent) {
      /*
       * Clic con modificador, botón central, «abrir en pestaña nueva»: eso no
       * navega en esta pestaña y marcar la barra sería mentir.
       *
       * NO se mira `defaultPrevented`, y esa es toda la historia de por qué esto
       * no funcionaba: `<Link>` de Next llama a `preventDefault()` en el propio
       * enlace para navegar por su cuenta. Escuchando en `document` durante la
       * burbuja, para cuando llegaba aquí ya venía marcado como prevenido y la
       * barra no salía NUNCA. Por eso se escucha en captura —antes que nadie— y
       * por eso este comentario existe.
       */
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const enlace = (e.target as HTMLElement | null)?.closest?.('a');
      if (!(enlace instanceof HTMLAnchorElement)) return;
      if (enlace.target && enlace.target !== '_self') return;
      if (enlace.hasAttribute('download')) return;

      const destino = new URL(enlace.href, window.location.href);
      if (destino.origin !== window.location.origin) return;

      // Ir a donde ya estás no es navegar; y un ancla dentro de la página
      // tampoco, aunque cambie la URL.
      const aqui = window.location.pathname + window.location.search;
      if (destino.pathname + destino.search === aqui) return;

      setActiva(true);
    }

    /*
     * Los formularios `method="get"` de los filtros —el periodo del panel, los
     * filtros del kanban— también navegan, y son de lo más lento que hay.
     */
    /*
     * Y las ACCIONES: guardar, crear, activar. Son el 90% de los botones y no
     * daban ninguna señal: pulsabas, la pantalla se quedaba igual y al rato
     * cambiaba entera. Ahora el botón pulsado gira (CSS: `[data-cargando]`) y
     * la barra de arriba avanza.
     */
    function alEnviar(e: SubmitEvent) {
      const form = e.target as HTMLFormElement;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.hasAttribute('data-sin-espera')) return;

      const esGet = form.method?.toLowerCase() === 'get';
      if (!esGet && !esFormularioDeAccion(form)) return;

      /*
       * Doble envío: si este formulario ya está en marcha, el segundo clic se
       * corta aquí, en captura, antes de que React lo vea. Es el «vuelvo a
       * pulsar porque no pasa nada» que creaba dos campañas iguales.
       */
      if (form.hasAttribute('data-cargando')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      const boton =
        (e.submitter as HTMLElement | null) ??
        form.querySelector<HTMLElement>('button[type="submit"], button:not([type])');
      form.setAttribute('data-cargando', '');
      if (boton) {
        boton.setAttribute('data-cargando', '');
        boton.setAttribute('aria-busy', 'true');
      }

      if (!esGet) empezarEnvio();
      setActiva(true);
    }

    /*
     * Una acción que no redirige —solo revalida— no cambia la URL, y nadie
     * diría que terminó. Pero React vacía el formulario al acabar una acción,
     * y eso dispara `reset`: es la señal.
     */
    function alVaciar(e: Event) {
      if ((e.target as HTMLElement | null)?.hasAttribute?.('data-cargando')) {
        terminarEnvio();
        setActiva(false);
      }
    }

    // En CAPTURA: hay que llegar antes que el manejador del propio <Link>.
    document.addEventListener('click', alPulsar, true);
    document.addEventListener('submit', alEnviar, true);
    document.addEventListener('reset', alVaciar, true);
    return () => {
      document.removeEventListener('click', alPulsar, true);
      document.removeEventListener('submit', alEnviar, true);
      document.removeEventListener('reset', alVaciar, true);
    };
  }, []);

  /*
   * Red de seguridad: si la navegación se cancela —se pierde la red, el usuario
   * da atrás— nadie va a avisar de que terminó. Una barra encallada para
   * siempre es peor que no tenerla, porque enseña a no mirarla.
   */
  useEffect(() => {
    if (!activa) return;
    const reloj = setTimeout(() => {
      setActiva(false);
      // Y lo mismo para los botones: uno girando para siempre es un botón muerto.
      terminarEnvio();
    }, 15_000);
    return () => clearTimeout(reloj);
  }, [activa]);

  if (!activa) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] overflow-hidden"
      role="status"
      aria-live="polite"
      aria-label="Cargando"
    >
      <div className="barra-progreso h-full bg-coral" />
    </div>
  );
}

/**
 * `useSearchParams` obliga a que haya un Suspense por encima. Sin él, Next
 * saca de la generación estática a todo lo que quede dentro — y esto está en el
 * armazón, o sea que sería todo.
 */
export function ProgresoNavegacion() {
  return (
    <Suspense fallback={null}>
      <Barra />
    </Suspense>
  );
}
