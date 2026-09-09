/**
 * La búsqueda encuentra lo que hay, y no se rompe con lo que se teclee.
 *
 * El filtro `or()` de PostgREST separa condiciones por COMAS. Meter ahí el texto
 * tal cual hacía que buscar «Gómez, Ana» —justo lo que sale al copiar un nombre
 * de una lista— tumbara la página de búsqueda con «failed to parse logic tree».
 * Y la paleta de comandos, que sí saneaba, lo hacía sustituyendo la coma por un
 * espacio: no reventaba, pero contestaba «sin resultados» sobre una persona que
 * estaba en la base.
 *
 * Esto comprueba las dos mitades, que son distintas:
 *
 *   · Que ningún texto raro produzca un error.
 *   · Que un nombre CON coma se encuentre de verdad. Lo primero sin lo segundo
 *     se consigue tirando la coma a la basura, que es justo lo que estaba mal.
 *
 *   npx tsx --env-file=.env.staging scripts/verificar-busqueda.ts
 */
import { createClient } from '@supabase/supabase-js';
import { patronesDeBusqueda, valorSeguro } from '../src/lib/busqueda';
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

/** Los mismos textos que se le pueden pegar a un buscador sin querer. */
const RAROS = [
  'Gómez, Ana',
  'Ana (madre)',
  'a"b',
  'c\\d',
  '100%',
  'a_b',
  'a.b:c',
  "O'Brien",
  '<script>',
  'x,y,z',
];

async function main() {
  console.log('\nBúsqueda global\n');

  console.log('Nada de lo que se teclee produce un error:');
  const conError: string[] = [];
  for (const q of RAROS) {
    const { error } = await admin
      .from('leads')
      .select('id')
      .or(patronesDeBusqueda(q, ['nombre', 'telefono']))
      .limit(3);
    if (error) conError.push(`${q}: ${error.message.slice(0, 40)}`);
  }
  comprobar(
    `${RAROS.length} textos con comas, comillas, paréntesis y comodines`,
    conError.length === 0,
    conError.length ? conError.slice(0, 2).join(' · ') : 'ninguno falla',
  );

  console.log('\nY encuentra de verdad, no solo «sin errores»:');

  /*
   * Se le pone una coma al nombre de un caso de prueba, se busca por un trozo
   * que la incluye, y se deja como estaba. Sin esto, la comprobación de arriba
   * se aprobaría tirando la coma a la basura — que es exactamente el fallo que
   * tenía la paleta de comandos.
   */
  const { data: victima } = await admin
    .from('leads')
    .select('id, nombre')
    .order('created_at')
    .limit(1)
    .maybeSingle();

  if (!victima) {
    console.log('  No hay casos con los que probar.\n');
    process.exit(1);
  }

  const nombreOriginal = victima.nombre;
  const nombreConComa = 'Verificación, Coma (temporal)';
  await admin.from('leads').update({ nombre: nombreConComa }).eq('id', victima.id);

  const buscar = async (q: string) => {
    const { data, error } = await admin
      .from('leads')
      .select('id')
      .or(patronesDeBusqueda(q, ['nombre', 'telefono']))
      .limit(5);
    return { encontrado: (data ?? []).some((l) => l.id === victima.id), error };
  };

  const conLaComa = await buscar('Verificación, Coma');
  comprobar(
    'un nombre con coma se encuentra buscando la coma incluida',
    conLaComa.encontrado && !conLaComa.error,
    conLaComa.error ? conLaComa.error.message.slice(0, 60) : '',
  );

  const conParentesis = await buscar('Coma (temporal)');
  comprobar('y con paréntesis, igual', conParentesis.encontrado && !conParentesis.error);

  const trozo = await buscar('Verificación');
  comprobar('un trozo suelto también lo encuentra', trozo.encontrado);

  /*
   * El comodín de LIKE se escapa: quien busca «100%» quiere ese texto, no
   * «cualquier cosa que empiece por 100». Si `%` pasara sin escapar, esta
   * búsqueda encontraría el caso de prueba, que no contiene ningún 100.
   */
  const comodin = await buscar('100%');
  comprobar(
    'el comodín % se busca como texto, no como «lo que sea»',
    !comodin.encontrado && !comodin.error,
  );

  await admin.from('leads').update({ nombre: nombreOriginal }).eq('id', victima.id);
  console.log(`\n  (nombre de «${nombreOriginal}» restaurado)`);

  console.log('\nEl teléfono, que va por igualdad y no por «contiene»:');
  const { data: conTelefono } = await admin
    .from('leads')
    .select('id, telefono')
    .not('telefono', 'is', null)
    .limit(1)
    .maybeSingle();

  if (conTelefono?.telefono) {
    const { data, error } = await admin
      .from('leads')
      .select('id')
      .or(`telefono.eq.${valorSeguro(conTelefono.telefono)}`)
      .limit(5);
    comprobar(
      'un teléfono exacto encuentra su caso',
      !error && (data ?? []).some((l) => l.id === conTelefono.id),
      error ? error.message.slice(0, 60) : conTelefono.telefono,
    );
  } else {
    console.log('  --    no hay ningún caso con teléfono para probarlo');
  }

  console.log('\nEl escapado, sin tocar la base:');
  comprobar('las comillas se escapan', valorSeguro('a"b') === '"a\\"b"', valorSeguro('a"b'));
  comprobar('las barras también', valorSeguro('c\\d') === '"c\\\\d"', valorSeguro('c\\d'));
  comprobar(
    'y la coma queda dentro de las comillas, no fuera',
    patronesDeBusqueda('a,b', ['nombre']) === 'nombre.ilike."%a,b%"',
    patronesDeBusqueda('a,b', ['nombre']),
  );

  console.log(
    fallos === 0
      ? '\nLa búsqueda aguanta cualquier texto y sigue encontrando.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main();
