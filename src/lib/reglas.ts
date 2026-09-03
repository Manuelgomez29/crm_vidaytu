/**
 * Reglas de etiquetado automático. Aquí viven los campos sobre los que se
 * puede condicionar; la ejecución la hará el motor de la fase 2.
 */
export const CAMPOS_REGLA = {
  canal: 'Canal de entrada',
  estado: 'Estado del caso',
  centro: 'Centro',
  motivo_perdida: 'Motivo de pérdida',
} as const;

export type CampoRegla = keyof typeof CAMPOS_REGLA;

export type CondicionRegla = { campo: CampoRegla; valor: string };

/** Texto legible de una condición, para mostrarla en la lista. */
export function describirCondicion(condicion: CondicionRegla): string {
  return `${CAMPOS_REGLA[condicion.campo] ?? condicion.campo} = «${condicion.valor}»`;
}
