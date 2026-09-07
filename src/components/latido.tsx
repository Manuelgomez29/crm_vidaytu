'use client';

import { useEffect } from 'react';

/**
 * Dice «sigo aquí» cada dos minutos, y solo mientras se esté mirando.
 *
 * Va en el armazón, así que late en todas las pantallas de la aplicación. Es lo
 * que hace que la lista de conectados sea de fiar: si solo se marcara al
 * navegar, quien pasa veinte minutos con una ficha abierta —hablando por
 * teléfono con la familia, que es lo normal— constaría como desconectado.
 *
 * `visibilitychange` importa por lo contrario: una pestaña olvidada en el
 * navegador de casa no puede seguir diciendo que esa persona está trabajando.
 * Con la pestaña oculta no se late, así que a los pocos minutos desaparece
 * sola de la lista.
 */
const CADA_MS = 2 * 60_000;

export function Latido() {
  useEffect(() => {
    let vivo = true;

    const latir = () => {
      if (!vivo || document.visibilityState !== 'visible') return;
      // Sin await ni manejo de error: que falle un latido no es nada, y el
      // siguiente llega en dos minutos.
      void fetch('/api/presencia', { method: 'POST', keepalive: true }).catch(() => {});
    };

    latir();
    const reloj = setInterval(latir, CADA_MS);
    document.addEventListener('visibilitychange', latir);

    return () => {
      vivo = false;
      clearInterval(reloj);
      document.removeEventListener('visibilitychange', latir);
    };
  }, []);

  return null;
}
