'use client';

import { useState } from 'react';

/**
 * Los filtros, plegados en el móvil.
 *
 * Son cinco desplegables, dos casillas y dos botones. En un ordenador caben en
 * una línea y no molestan. En un teléfono se apilan y ocupan más de media
 * pantalla: al abrir el tablero veías filtros, filtros y filtros, y para llegar
 * a la primera tarjeta había que bajar. El tablero empezaba fuera de la vista.
 *
 * Plegados por defecto, con el aviso de cuántos hay puestos —que es lo único que
 * hace falta saber sin abrirlos: si lo que ves está filtrado o es todo—.
 *
 * En pantalla grande no cambia nada: el botón se esconde y el formulario está
 * siempre desplegado, sin depender de ningún estado. Por eso la clase lleva
 * `sm:flex` en vez de mirar el ancho desde JavaScript, que obligaría a decidir
 * en el servidor algo que solo se sabe en el navegador.
 */
export function FiltrosPlegables({
  puestos,
  children,
}: {
  /** Cuántos filtros hay aplicados ahora mismo. */
  puestos: number;
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="mb-3 flex w-full items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink2 sm:hidden"
      >
        <span>
          Filtros
          {puestos > 0 && (
            <span className="chip chip-primary ml-2">
              {puestos} {puestos === 1 ? 'puesto' : 'puestos'}
            </span>
          )}
        </span>
        <span aria-hidden className="text-muted">
          {abierto ? '▴' : '▾'}
        </span>
      </button>

      <div className={abierto ? 'block' : 'hidden sm:block'}>{children}</div>
    </>
  );
}
