/**
 * La paleta de comandos no abre una puerta nueva.
 *
 * Busca con la sesión de quien teclea, así que RLS decide qué aparece. Esto lo
 * comprueba de la única forma que vale: cogiendo un caso real de un centro y
 * pidiéndoselo, por nombre y por teléfono, a alguien que no lleva ese centro.
 *
 *   node --env-file=.env.staging scripts/verificar-paleta.mjs
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICIO = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLAVE = 'vidaytu-dev-2026';

let fallos = 0;
function comprobar(titulo, condicion, detalle = '') {
  console.log(`  ${condicion ? 'OK  ' : 'FALLA'}  ${titulo}${detalle ? ' — ' + detalle : ''}`);
  if (!condicion) fallos++;
}

/** La misma consulta que hace `buscarRapido`, con la sesión de cada persona. */
async function buscar(cliente, texto) {
  const patrones = [`nombre.ilike.%${texto}%`, `telefono.ilike.%${texto}%`].join(',');
  const { data } = await cliente
    .from('leads')
    .select('id, nombre')
    .or(patrones)
    .limit(10);
  return data ?? [];
}

async function entrar(email) {
  const c = createClient(URL, ANON);
  const { error } = await c.auth.signInWithPassword({ email, password: CLAVE });
  if (error) throw new Error(`No se pudo entrar como ${email}: ${error.message}`);
  return c;
}

const admin = createClient(URL, SERVICIO, { auth: { persistSession: false } });

// Un caso de Eclipse y otro de Horizonte, para cruzarlos.
const { data: centros } = await admin.from('centros').select('id, nombre, slug');
const idDe = (slug) => centros.find((c) => c.slug === slug)?.id;

const { data: deEclipse } = await admin
  .from('leads')
  .select('nombre, telefono')
  .eq('centro_id', idDe('eclipse'))
  .limit(1);
const { data: deHorizonte } = await admin
  .from('leads')
  .select('nombre, telefono')
  .eq('centro_id', idDe('horizonte'))
  .limit(1);

const eclipse = deEclipse?.[0];
const horizonte = deHorizonte?.[0];
if (!eclipse || !horizonte) {
  console.log('Faltan casos de prueba. Ejecuta la siembra antes.');
  process.exit(1);
}

console.log('\nBúsqueda desde la paleta, con la sesión de cada persona\n');

const cHorizonte = await entrar('horizonte@test.com');
const cDireccion = await entrar('direccion@test.com');

// 1. Encuentra lo suyo, por nombre parcial.
const parcial = horizonte.nombre.split(' ')[0];
const suyos = await buscar(cHorizonte, parcial);
comprobar(
  `admisiones-Horizonte encuentra su caso por nombre parcial ("${parcial}")`,
  suyos.some((l) => l.nombre === horizonte.nombre),
  `${suyos.length} resultado(s)`,
);

// 2. Encuentra lo suyo por teléfono.
if (horizonte.telefono) {
  const trozo = horizonte.telefono.slice(-6);
  const porTelefono = await buscar(cHorizonte, trozo);
  comprobar(
    `y por teléfono parcial ("…${trozo}")`,
    porTelefono.some((l) => l.nombre === horizonte.nombre),
  );
}

// 3. NO encuentra lo de otro centro, ni con el nombre exacto.
const ajeno = await buscar(cHorizonte, eclipse.nombre);
comprobar(
  `NO encuentra un caso de Eclipse ni con su nombre exacto ("${eclipse.nombre}")`,
  !ajeno.some((l) => l.nombre === eclipse.nombre),
  `${ajeno.length} resultado(s)`,
);

// 4. Ni por su teléfono exacto, que es la vía menos evidente.
if (eclipse.telefono) {
  const porTel = await buscar(cHorizonte, eclipse.telefono);
  comprobar(
    'ni buscando su teléfono exacto',
    !porTel.some((l) => l.nombre === eclipse.nombre),
  );
}

// 5. Control: dirección sí lo encuentra. Sin esto, un "no aparece" podría ser
//    simplemente que la búsqueda está rota.
const todo = await buscar(cDireccion, eclipse.nombre);
comprobar(
  'CONTROL: dirección sí encuentra ese mismo caso',
  todo.some((l) => l.nombre === eclipse.nombre),
);

console.log(
  fallos === 0
    ? '\nLa paleta no abre ninguna puerta: todas las comprobaciones pasan.\n'
    : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
);
process.exit(fallos === 0 ? 0 : 1);
