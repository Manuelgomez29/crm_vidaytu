/**
 * Traerlo TODO, aunque sean más de mil.
 *
 * PostgREST corta en 1.000 filas por respuesta y no avisa: devuelve mil y se
 * calla. Una consulta sin límite parece que trae todo y trae mil, así que el
 * fallo no se ve hasta el día que la tabla pasa de ese número —y entonces se
 * manifiesta como datos que faltan sin motivo aparente.
 *
 * Dónde importa de verdad:
 *
 *   · Una EXPORTACIÓN. Dirección se descarga «todos los contactos», recibe
 *     mil y no tiene forma de saberlo.
 *   · Un SEGMENTO, que decide a quién se le manda una campaña.
 *   · El MOTOR de etiquetado, que dejaría de etiquetar al lead 1.001.
 *   · Las tareas de la noche, que a cuarenta contactos nuevos al día cruzan
 *     ese número en menos de un mes.
 *
 * Donde NO importa es en un catálogo —centros, canales, parámetros— que nunca
 * se acercará a mil. Ahí añadir paginación sería ruido.
 *
 * El tope existe para que un fallo no se convierta en un bucle infinito
 * pidiendo páginas. Si se alcanza, se DICE: `truncado` es la diferencia entre
 * una respuesta incompleta y una respuesta incompleta que se cree entera.
 */

const TAMANO = 1000;
const TOPE_PAGINAS = 100;

type Respuesta<T> = { data: T[] | null; error: { message: string } | null };

export async function traerTodo<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<Respuesta<T>>,
  opciones: { tamano?: number; topePaginas?: number } = {},
): Promise<{ filas: T[]; truncado: boolean }> {
  const tamano = opciones.tamano ?? TAMANO;
  const topePaginas = opciones.topePaginas ?? TOPE_PAGINAS;

  const filas: T[] = [];
  for (let p = 0; p < topePaginas; p++) {
    const desde = p * tamano;
    const { data, error } = await pagina(desde, desde + tamano - 1);
    if (error) throw new Error(error.message);
    const lote = data ?? [];
    filas.push(...lote);
    // Una página incompleta es la última: no hay más que pedir.
    if (lote.length < tamano) return { filas, truncado: false };
  }
  return { filas, truncado: true };
}
