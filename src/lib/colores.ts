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
