/**
 * Normaliza un teléfono a E.164. Los móviles/fijos españoles de 9 cifras
 * (6xx, 7xx, 9xx) reciben el prefijo +34 automáticamente.
 * Devuelve null si el resultado no es un E.164 válido.
 */
export function normalizarTelefono(entrada: string): string | null {
  const limpio = entrada.replace(/[\s\-().]/g, '').replace(/^00/, '+');
  const conPrefijo = /^[679]\d{8}$/.test(limpio) ? `+34${limpio}` : limpio;
  return /^\+[1-9]\d{6,14}$/.test(conPrefijo) ? conPrefijo : null;
}
