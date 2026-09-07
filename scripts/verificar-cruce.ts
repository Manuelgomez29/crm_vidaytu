/**
 * El cruce de datos dice la verdad, en las 75 combinaciones.
 *
 * Cinco dimensiones por cinco por tres métricas. Basta con que una casilla sume
 * mal para que dirección tome una decisión sobre un centro con una cifra que no
 * es. Y una tabla cruzada no se revisa a ojo: si el número está mal, parece un
 * número igual de bien.
 *
 * Se comprueban tres cosas distintas:
 *
 *   1. Que el total de la matriz coincide con la cuenta hecha por separado, en
 *      todas las combinaciones.
 *   2. Que aguanta las dos formas en que PostgREST devuelve las conversiones
 *      —objeto suelto o lista—, que es lo que reventó en producción.
 *   3. Que el filtro de centro llega hasta aquí. No llegaba: los KPIs mostraban
 *      un centro y la tabla cruzada seguía sumando los tres.
 *
 *   npx tsx --env-file=.env.staging scripts/verificar-cruce.ts
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import {
  DIMENSIONES,
  METRICAS,
  cruzar,
  conversionesDe,
  resolverCruce,
  type FilaCruce,
} from '../src/lib/cruce';
import type { Database } from '../src/lib/database.types';

const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

let fallos = 0;
const comprobar = (t: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK  ' : 'FALLA'}  ${t}${d ? ' — ' + d : ''}`);
  if (!ok) fallos++;
};

const SELECT =
  'id, estado, urgencia, created_at, centro_id, centro:centros (nombre), canal:canales (nombre), propietario:perfiles!leads_propietario_id_fkey (nombre), conversiones (importe_primer_pago, estado)';

async function main() {
  console.log('\nCruce de datos del panel\n');

  const { data: crudo } = await admin.from('leads').select(SELECT);
  const casos = (crudo ?? []) as unknown as (FilaCruce & { centro_id: string | null })[];

  if (casos.length === 0) {
    console.log('  No hay casos con los que cruzar nada.\n');
    process.exit(1);
  }
  console.log(`  ${casos.length} casos en la base.\n`);

  // ---------------------------------------------------------------------------
  console.log('Las 75 combinaciones cuadran:');

  const dims = Object.keys(DIMENSIONES);
  const mets = Object.keys(METRICAS);
  let combinaciones = 0;
  const descuadres: string[] = [];

  for (const f of dims) {
    for (const c of dims) {
      for (const m of mets) {
        combinaciones++;
        const { totalGeneral, filas, cols, totalPorCol, totalDeFila } = cruzar(casos, f, c, m);

        // La misma cifra, contada sin pasar por la matriz.
        const aparte = casos.reduce((s, l) => s + METRICAS[m].de(l), 0);
        if (totalGeneral !== aparte) descuadres.push(`${f}×${c}/${m}: ${totalGeneral} ≠ ${aparte}`);

        // Sumar por filas y sumar por columnas tiene que dar lo mismo.
        const porFilas = filas.reduce((s, [, mapa]) => s + totalDeFila(mapa), 0);
        const porCols = totalPorCol.reduce((s, n) => s + n, 0);
        if (porFilas !== porCols)
          descuadres.push(`${f}×${c}/${m}: filas ${porFilas} ≠ cols ${porCols}`);

        // Ninguna casilla puede caer fuera de las columnas declaradas.
        for (const [, mapa] of filas) {
          for (const clave of mapa.keys()) {
            if (!cols.includes(clave))
              descuadres.push(`${f}×${c}/${m}: columna huérfana «${clave}»`);
          }
        }
      }
    }
  }

  comprobar(
    `${combinaciones} combinaciones, todas cuadradas`,
    descuadres.length === 0,
    descuadres.slice(0, 3).join(' · '),
  );

  // ---------------------------------------------------------------------------
  console.log('\nLas dos formas de PostgREST:');

  /*
   * Esto es la regresión del fallo que tumbó la pantalla en producción (digest
   * 3710425268): PostgREST devuelve un OBJETO cuando la relación incrustada
   * resuelve a una sola fila, y una LISTA cuando resuelve a varias. El código
   * llamaba a `.filter` a ciegas.
   */
  const conversion = { importe_primer_pago: 1000, estado: 'validada' };
  const base: FilaCruce = {
    id: 'x',
    estado: 'convertido',
    urgencia: null,
    centro: { nombre: 'Prueba' },
    canal: { nombre: 'Prueba' },
    propietario: null,
    conversiones: null,
  };

  comprobar(
    'con lista, cuenta',
    conversionesDe({ ...base, conversiones: [conversion] }).length === 1,
  );
  comprobar(
    'con objeto suelto, cuenta igual',
    conversionesDe({ ...base, conversiones: conversion }).length === 1,
  );
  comprobar('sin conversión, cero y sin reventar', conversionesDe(base).length === 0);

  const comoLista = cruzar(
    [{ ...base, conversiones: [conversion] }],
    'centro',
    'canal',
    'ingresos',
  );
  const comoObjeto = cruzar([{ ...base, conversiones: conversion }], 'centro', 'canal', 'ingresos');
  comprobar(
    'y el cruce da la MISMA cifra con las dos formas',
    comoLista.totalGeneral === 1000 && comoObjeto.totalGeneral === 1000,
    `lista ${comoLista.totalGeneral} € · objeto ${comoObjeto.totalGeneral} €`,
  );

  // ---------------------------------------------------------------------------
  console.log('\nEl filtro de centro llega al cruce:');

  const { data: centros } = await admin.from('centros').select('id, nombre');
  const conCasos = (centros ?? []).filter((c) => casos.some((l) => l.centro_id === c.id));

  if (conCasos.length < 2) {
    console.log('  --    hacen falta casos en dos centros para poder distinguirlo');
  } else {
    const uno = conCasos[0];
    const soloEse = casos.filter((l) => l.centro_id === uno.id);

    const todos = cruzar(casos, 'centro', 'canal', 'casos');
    const filtrado = cruzar(soloEse, 'centro', 'canal', 'casos');

    comprobar(
      `filtrando por «${uno.nombre}» solo queda ese centro`,
      filtrado.filas.length === 1,
      `${filtrado.filas.map(([f]) => f).join(', ')}`,
    );
    comprobar(
      'y el total baja de verdad, no se queda igual',
      filtrado.totalGeneral < todos.totalGeneral && filtrado.totalGeneral === soloEse.length,
      `${filtrado.totalGeneral} de ${todos.totalGeneral}`,
    );
  }

  /*
   * Lo de arriba comprueba que la suma respeta la lista que se le pasa. Pero el
   * fallo de verdad no estaba ahí: estaba en que el cruce tenía su PROPIA
   * consulta, y a esa se le había olvidado el filtro de centro. Así que a
   * `cruzar` le llegaban los tres centros mientras los KPIs mostraban uno.
   *
   * La solución fue quitar la consulta duplicada: ahora hay una sola lista de
   * casos del periodo y la usan los dos. Estas dos comprobaciones vigilan justo
   * eso —que siga siendo una, y que lleve el filtro—, porque el día que alguien
   * vuelva a añadir una consulta aparte, el problema vuelve entero.
   */
  const panel = readFileSync('src/app/panel/page.tsx', 'utf8');

  comprobar(
    'el cruce sale de la misma lista que las métricas, no de otra consulta',
    /const casosCruce = \(leadsData \?\? \[\]\)/.test(panel),
    /consultaCruce/.test(panel) ? 'ha vuelto a aparecer una consulta aparte' : '',
  );
  comprobar(
    'y esa lista aplica el filtro de centro',
    /if \(filtros\.centro\) consultaLeads = consultaLeads\.eq\('centro_id'/.test(panel),
  );

  // ---------------------------------------------------------------------------
  console.log('\nLo que venga por la URL no rompe la pantalla:');

  const basura = resolverCruce({
    cruceFila: 'loquesea',
    cruceCol: '../../etc/passwd',
    cruceMetrica: '1; drop table leads',
    cruceVista: '<script>',
  });
  comprobar(
    'parámetros inventados caen en valores por defecto',
    Boolean(
      DIMENSIONES[basura.claveFila] &&
      DIMENSIONES[basura.claveCol] &&
      METRICAS[basura.claveMetrica],
    ),
    `${basura.claveFila} × ${basura.claveCol} / ${basura.claveMetrica}`,
  );

  const mismaDosVeces = resolverCruce({ cruceFila: 'centro', cruceCol: 'centro' });
  comprobar(
    'cruzar una dimensión consigo misma se corrige solo',
    mismaDosVeces.claveFila !== mismaDosVeces.claveCol,
    `${mismaDosVeces.claveFila} × ${mismaDosVeces.claveCol}`,
  );

  console.log(
    fallos === 0
      ? '\nEl cruce suma bien y respeta el filtro.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main();
