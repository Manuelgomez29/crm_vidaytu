/**
 * Ningún remitente deja ver el motivo (regla 12).
 *
 * Sin base de datos: comprueba que `remitenteRevela` encuentra los términos
 * clínicos también PEGADOS dentro de un dominio, que es justo lo que la
 * búsqueda por palabras del contenido no ve, y que no salta con los nombres
 * neutros que de verdad se van a usar.
 *
 *   npm run verificar:discrecion
 */
import { remitenteRevela } from '../src/lib/discrecion';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = '') {
  console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${nombre}${detalle ? ' — ' + detalle : ''}`);
  if (!ok) fallos++;
}

console.log('\nRemitentes que cuentan el motivo:');
for (const r of [
  'Bellamar <hola@bellamaradicciones.com>',
  'hola@centrodeadiccionesentarragona.com',
  'Centro de Adicciones <info@ejemplo.com>',
  'Rehabilitación Bellamar <a@b.com>',
  'DESINTOXICACION@ejemplo.es',
]) {
  comprobar(r, remitenteRevela(r).length > 0, remitenteRevela(r).join(', '));
}

console.log('\nRemitentes neutros que no deben saltar:');
for (const r of [
  'Bellamar <hola@bellamarcentro.com>',
  'Vidaitu <hola@lolodrago.com>',
  'Eclipse <citas@centroeclipse.es>',
  'Horizonte <info@horizontejerez.com>',
  '',
]) {
  comprobar(r || '(vacío)', remitenteRevela(r).length === 0, remitenteRevela(r).join(', '));
}

console.log(
  fallos === 0
    ? '\nEl remitente no cuenta lo que el paciente no ha contado.\n'
    : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
);
process.exit(fallos === 0 ? 0 : 1);
