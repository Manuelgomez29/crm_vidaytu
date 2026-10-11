/**
 * Un correo por bloques no puede llevar nada que quien lo redactó no haya
 * querido, y tiene que decir lo mismo en HTML y en texto.
 *
 * El renderizador convierte texto escrito por una persona en HTML que se manda
 * a cientos de buzones. Lo que se comprueba es lo que haría daño:
 *
 *   1. Escapado: un «<script>» o un «"» en un párrafo salen como texto, nunca
 *      como etiqueta ni como atributo.
 *   2. Enlaces: solo https. Ni http, ni javascript:, ni rutas sueltas.
 *   3. Paridad: el texto plano lleva lo mismo que el HTML, botón y enlace
 *      incluidos. Es lo que lee el filtro clínico y quien no carga HTML.
 *   4. Límites: vacío, demasiados bloques y tipos desconocidos se rechazan con
 *      un mensaje que señala el bloque.
 *
 * No toca la base. `npx tsx scripts/verificar-bloques.ts`
 */
import { renderizarBloques, validarBloques, type Bloque } from '../src/lib/bloques';

let fallos = 0;
const comprobar = (t: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK  ' : 'FALLA'}  ${t}${d ? ' — ' + d : ''}`);
  if (!ok) fallos++;
};

console.log('\nCorreos por bloques\n');

// ---------------------------------------------------------------------------
console.log('Escapado:');
const malicioso: Bloque[] = [
  { tipo: 'titulo', texto: 'Hola <script>alert(1)</script>' },
  { tipo: 'parrafo', texto: 'Comillas " y <b>negrita</b>' },
  { tipo: 'imagen', url: 'https://ejemplo.com/a.png', alt: '" onerror="alert(1)' },
];
const r1 = renderizarBloques(malicioso, { nombre: 'Prueba', color: '#2E5C48' });
comprobar('no hay <script> en el HTML', !/<script/i.test(r1.html));
comprobar('las etiquetas del párrafo salen escapadas', r1.html.includes('&lt;b&gt;negrita&lt;/b&gt;'));
comprobar('las comillas no rompen atributos', !r1.html.includes('alt="" onerror='));
comprobar('el color de marca se aplica', r1.html.includes('#2E5C48'));

// ---------------------------------------------------------------------------
console.log('\nEnlaces:');
const esError = (v: unknown): v is { error: string } => typeof v === 'object' && v !== null && 'error' in v;
comprobar('http:// se rechaza', esError(validarBloques([{ tipo: 'boton', texto: 'Ir', url: 'http://ejemplo.com' }])));
comprobar('javascript: se rechaza', esError(validarBloques([{ tipo: 'boton', texto: 'Ir', url: 'javascript:alert(1)' }])));
comprobar('una ruta suelta se rechaza', esError(validarBloques([{ tipo: 'imagen', url: '/foto.png', alt: '' }])));
comprobar('https:// se acepta', !esError(validarBloques([{ tipo: 'boton', texto: 'Ir', url: 'https://ejemplo.com/guia' }])));

// ---------------------------------------------------------------------------
console.log('\nParidad HTML / texto:');
const guia: Bloque[] = [
  { tipo: 'titulo', texto: 'Una guía para familias' },
  { tipo: 'parrafo', texto: 'Hola {nombre},\nte mandamos lo que comentamos.' },
  { tipo: 'boton', texto: 'Descargar la guía', url: 'https://ejemplo.com/guia' },
  { tipo: 'separador' },
];
const r2 = renderizarBloques(guia, { nombre: 'Bellamar', color: '#384B71' });
comprobar('el texto lleva el título', r2.texto.includes('UNA GUÍA PARA FAMILIAS'));
comprobar('el texto lleva el botón con su enlace', r2.texto.includes('Descargar la guía: https://ejemplo.com/guia'));
comprobar('el HTML lleva el enlace del botón', r2.html.includes('href="https://ejemplo.com/guia"'));
comprobar('{nombre} se conserva para el envío', r2.html.includes('{nombre}') && r2.texto.includes('{nombre}'), 'lo sustituye componer(), persona a persona');
comprobar('el salto de línea del párrafo es <br> en HTML', r2.html.includes('Hola {nombre},<br>te mandamos'));
comprobar('la firma del centro va al final', r2.texto.trimEnd().endsWith('Bellamar'));
comprobar('no lleva pie de baja: eso lo pone el envío', !/baja/i.test(r2.html));

// ---------------------------------------------------------------------------
console.log('\nLímites:');
comprobar('vacío se rechaza', esError(validarBloques([])));
comprobar('tipo desconocido se rechaza señalando el bloque', (() => { const v = validarBloques([{ tipo: 'parrafo', texto: 'ok' }, { tipo: 'video' }]); return esError(v) && v.error.startsWith('Bloque 2'); })());
comprobar('párrafo vacío se rechaza', esError(validarBloques([{ tipo: 'parrafo', texto: '   ' }])));
comprobar('41 bloques se rechazan', esError(validarBloques(Array.from({ length: 41 }, () => ({ tipo: 'separador' })))));
comprobar('lo que no es una lista se rechaza', esError(validarBloques({ tipo: 'parrafo' })));

console.log(
  fallos === 0
    ? '\nEl correo dice lo que se escribió, y nada más.\n'
    : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
);
process.exit(fallos === 0 ? 0 : 1);
