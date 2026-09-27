/**
 * Normaliza un teléfono a E.164. Los móviles/fijos españoles de 9 cifras
 * (6xx, 7xx, 9xx) reciben el prefijo +34 automáticamente.
 * Devuelve null si el resultado no es un E.164 válido.
 */
/**
 * Normaliza el número que llega como IDENTIFICADOR de un canal de WhatsApp.
 *
 * ZeroChats manda ahí «los dígitos del teléfono», sin prefijo y sin signos:
 * `34600111222`, `59891234567`. Eso NO se puede pasar por
 * `normalizarTelefono()`, que exige un `+` y devolvería null —y entonces el
 * número se guardaría en crudo y no emparejaría nunca con la persona del
 * directorio, que está en E.164.
 *
 * La diferencia está en lo que se puede dar por supuesto: aquí los dígitos ya
 * SON el número internacional completo, porque es así como WhatsApp identifica
 * una cuenta. Por eso basta ponerle el `+`. Va aparte a propósito: aplicar esta
 * suposición al teléfono que alguien escribe en un formulario convertiría
 * cualquier cifra larga mal teclada en un número de otro país.
 *
 * Los nueve dígitos españoles se siguen tratando como tales: mucha gente de
 * aquí tiene el WhatsApp con el número a secas.
 */
export function telefonoDeCanal(entrada: string): string | null {
  const digitos = (entrada ?? '').replace(/\D/g, '').replace(/^00/, '');
  if (!digitos) return null;
  if (/^[679]\d{8}$/.test(digitos)) return `+34${digitos}`;
  return /^[1-9]\d{6,14}$/.test(digitos) ? `+${digitos}` : null;
}
export function normalizarTelefono(entrada: string): string | null {
  const limpio = entrada.replace(/[\s\-().]/g, '').replace(/^00/, '+');
  const conPrefijo = /^[679]\d{8}$/.test(limpio) ? `+34${limpio}` : limpio;
  return /^\+[1-9]\d{6,14}$/.test(conPrefijo) ? conPrefijo : null;
}
