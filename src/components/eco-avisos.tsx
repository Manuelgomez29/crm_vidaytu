'use client';

import { useEffect } from 'react';
import { useAviso } from './avisos';
import type { Envio } from './envio-en-curso';

/**
 * El resultado de una acción, donde se está mirando.
 *
 * Las acciones responden con `?aviso=` o `?error=`, y cada pantalla lo pinta
 * como un recuadro ARRIBA. Desde que la barra de progreso devuelve a cada cual
 * al sitio donde estaba al pulsar, ese recuadro puede quedar fuera de la vista:
 * guardas el paso diez de un flujo, sigues abajo, y el «Guardado» está arriba
 * donde nadie mira. O peor, el error.
 *
 * Así que, si la respuesta vuelve a la MISMA pantalla y se estaba más abajo de
 * la cabecera, el mismo mensaje sale también como aviso flotante. Arriba, con
 * el recuadro a la vista, no se repite: dos veces lo mismo es ruido.
 *
 * Escucha el evento que dispara la barra de progreso al terminar un envío, en
 * vez de vigilar la URL por su cuenta: la primera versión lo hacía y perdía el
 * aviso cuando React volvía a montar este componente con la página nueva.
 */

/** Por encima de esto, el recuadro de arriba ya no se ve. */
const UMBRAL_PX = 160;

export function EcoAvisos() {
  const { mostrar } = useAviso();

  useEffect(() => {
    function alTerminar(e: Event) {
      const envio = (e as CustomEvent<Envio>).detail;
      if (!envio || envio.ruta !== window.location.pathname || envio.y < UMBRAL_PX) return;

      const parametros = new URLSearchParams(window.location.search);
      const error = parametros.get('error');
      const aviso = parametros.get('aviso');
      if (error) mostrar({ texto: error, tono: 'error' });
      else if (aviso) mostrar({ texto: aviso, tono: 'ok' });
    }
    window.addEventListener('vd:envio-terminado', alTerminar);
    return () => window.removeEventListener('vd:envio-terminado', alTerminar);
  }, [mostrar]);

  return null;
}
