/**
 * Buscar por texto sin que el texto rompa la consulta.
 *
 * El filtro `or()` de PostgREST separa sus condiciones por COMAS, así que meter
 * ahí lo que alguien teclea es pedir problemas. Y no problemas teóricos: buscar
 * «Gómez, Ana» —justo lo que sale al copiar un nombre de una lista— tumbaba la
 * página de búsqueda con un «failed to parse logic tree». Con paréntesis o
 * puntos, la consulta se deformaba en silencio y devolvía otra cosa.
 *
 * La solución de PostgREST es entrecomillar el valor y escapar dentro las
 * comillas y las barras. Con eso, la coma pasa a ser una coma y no un separador.
 *
 * No es solo comodidad: interpolar entrada de usuario en un filtro es la misma
 * familia de agujero que una inyección SQL. Aquí el daño posible es menor
 * —PostgREST no deja saltar de tabla y RLS sigue mandando— pero se pueden
 * inventar condiciones sobre columnas que no eran las que se querían mirar.
 */

/** Un valor listo para ir dentro de `or()`: entrecomillado y escapado. */
export function valorSeguro(texto: string): string {
  return `"${texto.replace(/[\\"]/g, (c) => `\\${c}`)}"`;
}

/**
 * Los patrones de un «contiene» sobre varias columnas.
 *
 *   patronesDeBusqueda('Gómez, Ana', ['nombre', 'telefono'])
 *   → 'nombre.ilike."%Gómez, Ana%",telefono.ilike."%Gómez, Ana%"'
 *
 * Los comodines de LIKE que venga tecleando la persona se escapan también: quien
 * busca «100%» quiere ese texto, no «cualquier cosa que empiece por 100».
 */
export function patronesDeBusqueda(texto: string, columnas: string[]): string {
  const limpio = texto.replace(/[%_]/g, (c) => `\\${c}`);
  return columnas.map((col) => `${col}.ilike.${valorSeguro(`%${limpio}%`)}`).join(',');
}
