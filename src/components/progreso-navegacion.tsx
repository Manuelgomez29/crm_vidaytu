'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

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

  // Cuando la ruta o los filtros cambian, la navegación ha terminado.
  useEffect(() => {
    setActiva(false);
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
    function alEnviar(e: SubmitEvent) {
      const form = e.target as HTMLFormElement;
      if (form?.method?.toLowerCase() === 'get') setActiva(true);
    }

    // En CAPTURA: hay que llegar antes que el manejador del propio <Link>.
    document.addEventListener('click', alPulsar, true);
    document.addEventListener('submit', alEnviar, true);
    return () => {
      document.removeEventListener('click', alPulsar, true);
      document.removeEventListener('submit', alEnviar, true);
    };
  }, []);

  /*
   * Red de seguridad: si la navegación se cancela —se pierde la red, el usuario
   * da atrás— nadie va a avisar de que terminó. Una barra encallada para
   * siempre es peor que no tenerla, porque enseña a no mirarla.
   */
  useEffect(() => {
    if (!activa) return;
    const reloj = setTimeout(() => setActiva(false), 15_000);
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
