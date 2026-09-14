/**
 * Un área apagada está apagada de verdad, no solo escondida del menú.
 *
 * La plataforma se entrega por partes: al arrancar, solo el área comercial y la
 * administración. La tentación es quitar las entradas del menú y dar el trabajo
 * por hecho, pero eso no cierra nada — quedan los enlaces guardados, las
 * direcciones escritas a mano y los correos antiguos con un enlace dentro.
 *
 * Asi que se comprueban las tres cosas, que fallan de formas distintas:
 *
 *   1. Que el ajuste se lee bien, y que ante la duda cierra en vez de abrir.
 *   2. Que `comercial` y `administracion` NO se pueden apagar. Apagar la
 *      administración sería apagar el interruptor desde dentro de la habitación
 *      del interruptor: no habría forma de volver a encender nada.
 *   3. Que cada área apagada tiene su guardián EN EL SERVIDOR, cubriendo
 *      también sus subrutas.
 *
 *   npx tsx --env-file=.env.staging scripts/verificar-areas.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { AREAS, AREAS_FIJAS, CLAVE_CONFIG, areaDeRuta, areasActivas } from '../src/lib/areas';
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

async function main() {
  console.log('\nÁreas por etapas\n');

  // ---------------------------------------------------------------------------
  console.log('El ajuste existe y se lee:');

  const { data: fila } = await admin
    .from('configuracion')
    .select('valor')
    .eq('clave', CLAVE_CONFIG)
    .maybeSingle();
  comprobar('hay un ajuste `areas_activas`', !!fila, JSON.stringify(fila?.valor));

  const activas = await areasActivas(admin);
  comprobar(
    'el área comercial está en marcha',
    activas.has('comercial'),
    [...activas].join(', '),
  );
  comprobar('y la administración también', activas.has('administracion'));

  // ---------------------------------------------------------------------------
  console.log('\nLas fijas no se pueden apagar:');

  /*
   * Se intenta de verdad: se guarda una lista vacia, que es lo que llegaria si
   * alguien desmarcara todo, y se comprueba que siguen encendidas. Leerlo del
   * codigo no valdria — lo que importa es que el guardian este en el camino que
   * se recorre, no que exista en algun sitio.
   */
  const original = fila?.valor ?? ['comercial', 'administracion'];
  await admin.from('configuracion').update({ valor: [] }).eq('clave', CLAVE_CONFIG);
  const conListaVacia = await areasActivas(admin);
  for (const fija of AREAS_FIJAS) {
    comprobar(`con la lista vacía, «${AREAS[fija].texto}» sigue en marcha`, conListaVacia.has(fija));
  }

  // Y con basura dentro, que es el otro modo de romperlo.
  await admin
    .from('configuracion')
    .update({ valor: ['loquesea', 'marketing; drop table'] })
    .eq('clave', CLAVE_CONFIG);
  const conBasura = await areasActivas(admin);
  comprobar(
    'lo que no es un área conocida se ignora',
    conBasura.size === AREAS_FIJAS.length,
    [...conBasura].join(', '),
  );

  await admin.from('configuracion').update({ valor: original }).eq('clave', CLAVE_CONFIG);
  const restaurado = await areasActivas(admin);
  comprobar(
    'y el ajuste se ha dejado como estaba',
    JSON.stringify([...restaurado].sort()) ===
      JSON.stringify([...(original as string[])].sort()),
    [...restaurado].join(', '),
  );

  // ---------------------------------------------------------------------------
  console.log('\nCada área apagable tiene guardián en el servidor:');

  const apagables = (Object.keys(AREAS) as (keyof typeof AREAS)[]).filter(
    (a) => !AREAS_FIJAS.includes(a),
  );
  for (const area of apagables) {
    const ruta = `src/app/${area === 'clinica' ? 'clinica' : area}/layout.tsx`;
    const hay = existsSync(ruta);
    comprobar(
      `${AREAS[area].texto} se bloquea en ${ruta}`,
      hay && /areasActivas|AreaApagada/.test(hay ? readFileSync(ruta, 'utf8') : ''),
    );
  }

  /*
   * Un layout cubre la ruta y TODO lo que cuelga de ella. Se comprueba que el
   * mapa de rutas lo dice igual, porque de ahi saldria cualquier comprobacion
   * futura: si `areaDeRuta` no reconociera una subruta, un enlace guardado a
   * `/facturacion/algo/hondo` se colaria.
   */
  const subrutas = [
    ['/facturacion', 'facturacion'],
    ['/facturacion/cobros', 'facturacion'],
    ['/facturacion/abc-123/imprimir', 'facturacion'],
    ['/clinica/chat/xyz', 'clinica'],
    ['/marketing/plantillas', 'marketing'],
    ['/leads', null],
    ['/admin/parametros', null],
    // Ni un prefijo parecido cuela por accidente.
    ['/facturacionista', null],
  ] as const;
  const malas = subrutas.filter(([ruta, esperado]) => areaDeRuta(ruta) !== esperado);
  comprobar(
    'el mapa de rutas reconoce las subrutas y no se pasa de listo',
    malas.length === 0,
    malas.map(([r, e]) => `${r} → ${areaDeRuta(r)} (esperaba ${e})`).join(' · '),
  );

  // ---------------------------------------------------------------------------
  console.log('\nEl menú no ofrece lo que está apagado:');

  const shell = readFileSync('src/components/app-shell.tsx', 'utf8');
  comprobar(
    'cada entrada del menú declara a qué área pertenece',
    (shell.match(/area: '/g) ?? []).length >= 10,
  );
  comprobar(
    'y una entrada apagada deja de ser un enlace',
    /const apagada =[\s\S]{0,400}if \(apagada\)/.test(shell),
    'si siguiera siendo <Link>, cada clic sería una promesa incumplida',
  );

  console.log(
    fallos === 0
      ? '\nLo apagado no se entra, ni escribiendo la dirección a mano.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main();
