'use client';

import { useRouter } from 'next/navigation';

/**
 * Vuelve a la pantalla anterior. Es un botón, no un enlace fijo: así respeta
 * el camino real del usuario (por ejemplo, llegar a una ficha desde la
 * búsqueda y volver a la búsqueda, no al tablero).
 */
export function BotonAtras() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      title="Volver a la pantalla anterior"
      aria-label="Volver"
      className="flex shrink-0 items-center gap-1 rounded-lg border border-line2 bg-surface px-2.5 py-1.5 text-sm font-medium text-ink2 transition hover:border-primary hover:text-primary"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      <span className="hidden sm:inline">Atrás</span>
    </button>
  );
}
