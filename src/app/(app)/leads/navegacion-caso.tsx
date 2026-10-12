'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** ¿El foco está en un sitio donde la persona está escribiendo? */
function escribiendo(destino: EventTarget | null): boolean {
  const el = destino as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  );
}

/**
 * Encadenar casos sin cerrar la ficha.
 *
 * Un comercial hace las llamadas en tandas: abre un caso, llama, apunta y pasa
 * al siguiente. Cerrar el panel y volver a buscar en el tablero entre llamada y
 * llamada cuesta segundos que se multiplican por veinte cada mañana.
 *
 * Los dos vecinos se precargan al montar, así que el salto es instantáneo. Las
 * flechas no responden mientras se escribe: dentro de una nota, ↑ y ↓ mueven el
 * cursor, que es lo que espera cualquiera.
 */
export function NavegacionCaso({
  anterior,
  siguiente,
  posicion,
}: {
  anterior: string | null;
  siguiente: string | null;
  posicion: string;
}) {
  const router = useRouter();

  useEffect(() => {
    if (anterior) router.prefetch(anterior);
    if (siguiente) router.prefetch(siguiente);
  }, [router, anterior, siguiente]);

  useEffect(() => {
    function alPulsar(e: KeyboardEvent) {
      if (escribiendo(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowUp' && anterior) {
        e.preventDefault();
        router.push(anterior, { scroll: false });
      }
      if (e.key === 'ArrowDown' && siguiente) {
        e.preventDefault();
        router.push(siguiente, { scroll: false });
      }
    }
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [router, anterior, siguiente]);

  const clases =
    'flex h-7 w-7 items-center justify-center rounded-lg border border-line2 text-ink2 transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-line2 disabled:hover:text-ink2';

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        className={clases}
        disabled={!anterior}
        aria-label="Caso anterior (flecha arriba)"
        title="Caso anterior · ↑"
        onClick={() => anterior && router.push(anterior, { scroll: false })}
      >
        ↑
      </button>
      <button
        type="button"
        className={clases}
        disabled={!siguiente}
        aria-label="Caso siguiente (flecha abajo)"
        title="Caso siguiente · ↓"
        onClick={() => siguiente && router.push(siguiente, { scroll: false })}
      >
        ↓
      </button>
      <span className="text-[11px] tabular-nums text-muted">{posicion}</span>
    </div>
  );
}
