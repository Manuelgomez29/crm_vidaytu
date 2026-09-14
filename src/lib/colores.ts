/**
 * Paleta fija de colores para etiquetas. Se guarda el nombre del color en
 * `etiquetas.color`; las clases son estáticas porque Tailwind no genera
 * clases construidas en tiempo de ejecución.
 */
export const COLORES_ETIQUETA = {
  gris: { nombre: 'Gris', clases: 'bg-surface2 text-ink ring-line' },
  verde: { nombre: 'Verde', clases: 'bg-ok-soft text-ok ring-ok/25' },
  azul: { nombre: 'Azul', clases: 'bg-bm-bg text-bm ring-bm/25' },
  violeta: { nombre: 'Violeta', clases: 'bg-ec-bg text-ec ring-ec/25' },
  ambar: { nombre: 'Ámbar', clases: 'bg-warn-soft text-warn ring-warn/25' },
  rojo: { nombre: 'Rojo', clases: 'bg-danger-soft text-danger ring-danger/25' },
  turquesa: { nombre: 'Turquesa', clases: 'bg-primary-soft text-primary ring-primary/25' },
} as const;

export type ColorEtiqueta = keyof typeof COLORES_ETIQUETA;

export function clasesEtiqueta(color: string | null): string {
  return (COLORES_ETIQUETA[color as ColorEtiqueta] ?? COLORES_ETIQUETA.gris).clases;
}

/**
 * El color de cada centro, que es la otra mitad del sistema: el chip y el borde
 * izquierdo de la tarjeta. Vivía dentro del kanban, pero el centro del que
 * viene un caso hace falta mirarlo desde más sitios —el directorio de
 * contactos, sin ir más lejos— y una paleta copiada en dos ficheros se queda
 * coja en uno de los dos el día que cambie.
 *
 * Las clases son literales a propósito: Tailwind no genera lo que se construye
 * en tiempo de ejecución.
 */
export const CLASES_CENTRO: Record<string, { borde: string; chip: string }> = {
  horizonte: { borde: 'borde-hz', chip: 'chip-hz' },
  eclipse: { borde: 'borde-ec', chip: 'chip-ec' },
  bellamar: { borde: 'borde-bm', chip: 'chip-bm' },
  'bandeja-grupo': { borde: 'borde-gr', chip: 'chip-gr' },
};

export function clasesCentro(slug: string | null | undefined) {
  return CLASES_CENTRO[slug ?? ''] ?? { borde: '', chip: 'chip-mut' };
}
