'use client';

import { IconoLupa } from './iconos';

/**
 * La caja de buscar de la barra superior, y la lupa del móvil.
 *
 * Antes era un formulario a pelo: escribías, pulsabas Enter, y solo entonces
 * pasaba algo. Al lado tenía una pista que ponía «Ctrl K» —o sea, la aplicación
 * te decía que había otra forma mejor de buscar, en una caja que no la usaba—.
 *
 * Ahora las dos abren la MISMA paleta, que sugiere mientras escribes. Un solo
 * buscador: dos parecidos que se comportan distinto es peor que uno.
 *
 * Y en móvil no había ninguno. La caja de arriba estaba oculta por debajo de
 * `sm` y la paleta solo se abría con Ctrl+K, que en un teléfono no existe. Un
 * comercial al que le entra una llamada de un número que no conoce no tenía
 * forma de buscarlo desde el móvil, que es justo desde donde atiende.
 */
function abrir(texto = '') {
  window.dispatchEvent(new CustomEvent('abrir-paleta', { detail: texto }));
}

/** La caja ancha de la barra superior. Se ve a partir de `sm`. */
export function CajaBuscar() {
  return (
    <div className="hidden max-w-[420px] flex-1 sm:flex">
      <button
        type="button"
        onClick={() => abrir()}
        className="flex w-full items-center gap-2 rounded-lg border border-line bg-ground px-3 py-1.5 text-left text-muted transition hover:border-primary/50"
      >
        <IconoLupa />
        <span className="flex-1 text-[13px]">Buscar por nombre o teléfono…</span>
        <kbd className="chip chip-mut hidden shrink-0 md:inline-flex">Ctrl K</kbd>
      </button>
    </div>
  );
}

/**
 * La lupa del móvil.
 *
 * Se esconde a partir de `sm` porque ahí ya está la caja ancha. Área de toque de
 * 40 px: es lo que se pulsa con el pulgar andando por un pasillo.
 */
export function LupaMovil() {
  return (
    <button
      type="button"
      onClick={() => abrir()}
      aria-label="Buscar por nombre o teléfono"
      className="flex items-center rounded-lg p-2 text-ink2 transition hover:bg-ground sm:hidden"
    >
      <IconoLupa />
    </button>
  );
}
