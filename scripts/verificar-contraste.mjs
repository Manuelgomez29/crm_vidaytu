/**
 * Contraste de la paleta, en los dos temas.
 *
 * El codigo de color por centro solo sirve si se lee. Esto no lo da por bueno:
 * saca los valores del propio globals.css y calcula el ratio WCAG de cada
 * combinacion texto/fondo que se usa de verdad.
 *
 * El baremo es AA para texto normal (4.5:1) y no AA grande (3:1), porque los
 * chips son de 11px: son texto pequeno aunque vayan en negrita.
 *
 *   node scripts/verificar-contraste.mjs
 */
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');

/** Variables de un bloque, identificado por su selector. */
function tokens(selector) {
  const i = css.indexOf(selector);
  if (i < 0) throw new Error(`No encuentro el bloque ${selector}`);
  const abre = css.indexOf('{', i);
  let nivel = 0;
  let fin = abre;
  for (let j = abre; j < css.length; j++) {
    if (css[j] === '{') nivel++;
    if (css[j] === '}') {
      nivel--;
      if (nivel === 0) {
        fin = j;
        break;
      }
    }
  }
  const cuerpo = css.slice(abre, fin);
  const mapa = new Map();
  for (const m of cuerpo.matchAll(/(--color-[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})/g)) {
    mapa.set(m[1], m[2]);
  }
  return mapa;
}

function aRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function luminancia(hex) {
  const [r, g, b] = aRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Combinaciones tal como se usan en la interfaz.
const PARES = [
  ['Horizonte', '--color-hz', '--color-hz-bg'],
  ['Eclipse', '--color-ec', '--color-ec-bg'],
  ['Bellamar', '--color-bm', '--color-bm-bg'],
  ['Bandeja de grupo', '--color-gr', '--color-gr-bg'],
  ['Chip éxito', '--color-ok-ink', '--color-ok-soft'],
  ['Chip aviso', '--color-warn-ink', '--color-warn-soft'],
  ['Chip peligro', '--color-danger-ink', '--color-danger-soft'],
  ['Primario', '--color-primary', '--color-primary-soft'],
  ['Tinta sobre fondo', '--color-ink', '--color-ground'],
  ['Tinta sobre superficie', '--color-ink', '--color-surface'],
  ['Tinta 2 sobre superficie', '--color-ink2', '--color-surface'],
  ['Muted sobre superficie', '--color-muted', '--color-surface'],
];

const MINIMO = 4.5;
let fallos = 0;

for (const [nombre, selector] of [
  ['CLARO', '@theme'],
  ['OSCURO', ':root.tema-oscuro'],
]) {
  const t = tokens(selector);
  console.log(`\n  ${nombre}`);
  console.log('  ' + '-'.repeat(52));
  for (const [etiqueta, frente, fondo] of PARES) {
    const f = t.get(frente);
    const b = t.get(fondo);
    if (!f || !b) {
      console.log(`  ?      ${etiqueta.padEnd(26)} falta ${!f ? frente : fondo}`);
      fallos++;
      continue;
    }
    const r = ratio(f, b);
    const ok = r >= MINIMO;
    if (!ok) fallos++;
    console.log(
      `  ${ok ? 'OK  ' : 'BAJO'}   ${etiqueta.padEnd(26)} ${r.toFixed(2)}:1  ${f} sobre ${b}`,
    );
  }
}

console.log(
  fallos === 0
    ? `\n  Toda la paleta cumple AA (>= ${MINIMO}:1) en los dos temas.\n`
    : `\n  ${fallos} combinacion(es) por debajo de ${MINIMO}:1.\n`,
);
process.exit(fallos === 0 ? 0 : 1);
