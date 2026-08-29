/**
 * Paleta fija de colores para etiquetas. Se guarda el nombre del color en
 * `etiquetas.color`; las clases son estáticas porque Tailwind no genera
 * clases construidas en tiempo de ejecución.
 */
export const COLORES_ETIQUETA = {
  gris: { nombre: 'Gris', clases: 'bg-slate-100 text-slate-700 ring-slate-200' },
  verde: { nombre: 'Verde', clases: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  azul: { nombre: 'Azul', clases: 'bg-blue-50 text-blue-700 ring-blue-200' },
  violeta: { nombre: 'Violeta', clases: 'bg-violet-50 text-violet-700 ring-violet-200' },
  ambar: { nombre: 'Ámbar', clases: 'bg-amber-50 text-amber-700 ring-amber-200' },
  rojo: { nombre: 'Rojo', clases: 'bg-red-50 text-red-700 ring-red-200' },
  turquesa: { nombre: 'Turquesa', clases: 'bg-teal-50 text-teal-700 ring-teal-200' },
} as const;

export type ColorEtiqueta = keyof typeof COLORES_ETIQUETA;

export function clasesEtiqueta(color: string | null): string {
  return (COLORES_ETIQUETA[color as ColorEtiqueta] ?? COLORES_ETIQUETA.gris).clases;
}
