/**
 * Las acciones en bloque no saltan el muro de los centros.
 *
 * Comprueba lo que dice el enunciado: una accion sobre casos de dos centros,
 * lanzada por alguien que solo lleva uno, se aplica solo a los suyos — y el
 * numero que devuelve permite informar de cuantos se quedaron fuera, en vez de
 * decir «hecho» habiendo cambiado la mitad.
 *
 *   node --env-file=.env.staging scripts/verificar-bloque.mjs
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICIO = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLAVE = 'vidaytu-dev-2026';

let fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
  console.log(`  ${ok ? 'OK  ' : 'FALLA'}  ${titulo}${detalle ? ' — ' + detalle : ''}`);
  if (!ok) fallos++;
};

const admin = createClient(URL, SERVICIO, { auth: { persistSession: false } });

const { data: centros } = await admin.from('centros').select('id, slug');
const idDe = (slug) => centros.find((c) => c.slug === slug)?.id;

const { data: deHorizonte } = await admin
  .from('leads')
  .select('id, urgencia')
  .eq('centro_id', idDe('horizonte'));
const { data: deEclipse } = await admin
  .from('leads')
  .select('id, urgencia')
  .eq('centro_id', idDe('eclipse'));

if (!deHorizonte?.length || !deEclipse?.length) {
  console.log('Faltan casos de prueba en ambos centros. Ejecuta la siembra antes.');
  process.exit(1);
}

const seleccion = [...deHorizonte.map((l) => l.id), ...deEclipse.map((l) => l.id)];
const original = new Map([...deHorizonte, ...deEclipse].map((l) => [l.id, l.urgencia]));

console.log('\nAccion en bloque sobre casos de dos centros\n');
console.log(`  Seleccion: ${seleccion.length} casos (${deHorizonte.length} Horizonte + ${deEclipse.length} Eclipse)`);

// La misma operacion que hace `aplicar()` en acciones-bloque.ts.
const cliente = createClient(URL, ANON);
const { error: errorEntrada } = await cliente.auth.signInWithPassword({
  email: 'horizonte@test.com',
  password: CLAVE,
});
if (errorEntrada) {
  console.log('No se pudo entrar: ' + errorEntrada.message);
  process.exit(1);
}

const { data: tocados, error } = await cliente
  .from('leads')
  .update({ urgencia: 'alta' })
  .in('id', seleccion)
  .select('id');

comprobar('La operacion no da error', !error, error?.message ?? '');

const idsTocados = new Set((tocados ?? []).map((l) => l.id));
comprobar(
  'Solo se aplican los de su centro',
  idsTocados.size === deHorizonte.length,
  `${idsTocados.size} de ${seleccion.length}`,
);
comprobar(
  'Ningun caso de Eclipse ha cambiado',
  deEclipse.every((l) => !idsTocados.has(l.id)),
);
comprobar(
  'Se puede informar de cuantos quedaron fuera',
  seleccion.length - idsTocados.size === deEclipse.length,
  `${seleccion.length - idsTocados.size} omitidos`,
);

// Comprobacion independiente contra la base, por si el `select` mintiera.
const { data: despues } = await admin
  .from('leads')
  .select('id, urgencia, centro_id')
  .in('id', seleccion);
const eclipseIntactos = despues
  .filter((l) => l.centro_id === idDe('eclipse'))
  .every((l) => l.urgencia === original.get(l.id));
comprobar('CONTROL: leidos de nuevo con service_role, los de Eclipse siguen igual', eclipseIntactos);

// Dejar la siembra como estaba.
for (const [id, urgencia] of original) {
  await admin.from('leads').update({ urgencia }).eq('id', id);
}
console.log('\n  (urgencias restauradas a como estaban)');

console.log(
  fallos === 0
    ? '\nLas acciones en bloque respetan el muro: todas las comprobaciones pasan.\n'
    : `\n${fallos} comprobacion(es) FALLIDA(S).\n`,
);
process.exit(fallos === 0 ? 0 : 1);
