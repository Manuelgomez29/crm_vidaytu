/**
 * Reglas de etiquetado automático: sobre qué se puede condicionar.
 *
 * El motor que las ejecuta está en `etiquetado.ts`. Añadir un campo aquí es
 * añadirlo también allí: el formulario de Contactos → Etiquetas se construye
 * solo a partir de este objeto.
 *
 * LO QUE NO ESTÁ, Y ES A PROPÓSITO: la ADICCIÓN.
 *
 * Es el campo por el que primero se pregunta —«etiqueta a los de alcohol»— y
 * es justo el que no puede estar. Una etiqueta vive en el CONTACTO, no en el
 * caso, así que sería pegarle a una persona una categoría de salud, que es
 * dato de categoría especial (regla 11). Y las etiquetas alimentan los
 * segmentos del email marketing: bastaría una campaña mal filtrada para que el
 * motivo de consulta de alguien se dedujera de a quién le llegó (regla 12).
 *
 * Que el caso guarde la adicción es correcto y necesario. Que la persona la
 * lleve pegada como etiqueta reutilizable, no. Para analizar por adicción está
 * el panel, que cuenta casos sin nombrar a nadie.
 */
export const CAMPOS_REGLA = {
  canal: 'Canal de entrada',
  estado: 'Estado del caso',
  centro: 'Centro',
  modalidad: 'Modalidad de interés',
  motivo_perdida: 'Motivo de pérdida',
  /*
   * Este es el único que mira al CONTACTO y no al caso, y por eso es el más
   * útil: en un caso donde están la madre y el hijo, los demás campos les
   * pondrían la misma etiqueta a los dos. «Quién es en este caso» los
   * distingue, que es lo que hace falta para escribirles distinto.
   */
  tipo_contacto: 'Quién es en el caso',
} as const;

export type CampoRegla = keyof typeof CAMPOS_REGLA;

export type CondicionRegla = { campo: CampoRegla; valor: string };

/** Texto legible de una condición, para mostrarla en la lista. */
export function describirCondicion(condicion: CondicionRegla): string {
  return `${CAMPOS_REGLA[condicion.campo] ?? condicion.campo} = «${condicion.valor}»`;
}
