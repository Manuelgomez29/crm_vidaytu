/**
 * Verificación automática del esquema y la seguridad (apartado 6 del Prompt #1):
 *   1. Insertar un lead 'perdido' sin motivo debe FALLAR por constraint.
 *   2. Un UPDATE sobre auditoria como usuario autenticado debe FALLAR.
 *   3. Mover un lead de etapa debe cambiar su estado automáticamente.
 *   4. Cada usuario del seed ve exactamente los centros que le tocan (RLS).
 *
 * Ejecutar: npx tsx --env-file=.env.local scripts/verificar.ts
 * Requiere SUPABASE_ACCESS_TOKEN en .env.local para los tests SQL (1-3).
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const token = process.env.SUPABASE_ACCESS_TOKEN!;
const REF = new URL(url).hostname.split('.')[0];

let fallos = 0;

function resultado(nombre: string, ok: boolean, detalle: string) {
  console.log(`${ok ? '✓' : '✗'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  if (!ok) fallos++;
}

async function sql(query: string): Promise<{ ok: boolean; body: string }> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return { ok: res.ok, body: await res.text() };
}

async function main() {
// --- 1. CHECK: perdido exige motivo -----------------------------------------
const t1 = await sql(`
  insert into leads (centro_id, pipeline_id, etapa_id, nombre, telefono, canal_id, estado)
  select c.id, p.id, e.id, 'Verificacion Constraint', '+34600000999', ca.id, 'perdido'
  from centros c, pipelines p, pipeline_etapas e, canales ca
  where c.slug = 'horizonte' and p.nombre = 'Estándar Vida y Tu'
    and e.pipeline_id = p.id and e.orden = 1 and ca.slug = 'otro';
`);
resultado(
  "1. Lead 'perdido' sin motivo es rechazado",
  !t1.ok && t1.body.includes('chk_perdido_requiere_motivo'),
  t1.ok ? 'la inserción NO falló (mal)' : 'constraint chk_perdido_requiere_motivo',
);

// --- 2. auditoria es inmutable para usuarios --------------------------------
const t2 = await sql(`
  set role authenticated;
  update auditoria set accion = 'manipulado' where id in (select id from auditoria limit 1);
`);
resultado(
  '2. UPDATE sobre auditoria falla para usuarios',
  !t2.ok && /permission denied/i.test(t2.body),
  t2.ok ? 'el UPDATE NO falló (mal)' : 'permission denied',
);

// --- 3. mover de etapa sincroniza el estado ---------------------------------
const t3a = await sql(`
  update leads set etapa_id = (
    select e.id from pipeline_etapas e
    join pipelines p on p.id = e.pipeline_id
    where p.nombre = 'Estándar Vida y Tu' and e.orden = 3)
  where origen_sistema = 'seed' and origen_ref = 'lead-2';
  select estado from leads where origen_sistema = 'seed' and origen_ref = 'lead-2';
`);
resultado(
  '3. Mover a la etapa "Cita agendada" pone estado cita_agendada',
  t3a.ok && t3a.body.includes('cita_agendada'),
  t3a.body.slice(0, 120),
);
// dejamos el lead como estaba
await sql(`
  update leads set etapa_id = (
    select e.id from pipeline_etapas e
    join pipelines p on p.id = e.pipeline_id
    where p.nombre = 'Estándar Vida y Tu' and e.orden = 1)
  where origen_sistema = 'seed' and origen_ref = 'lead-2';
`);

// --- 4. RLS por usuario ------------------------------------------------------
async function centrosVisibles(email: string): Promise<Map<string, number>> {
  const cliente = createClient(url, anon);
  const { error: errorLogin } = await cliente.auth.signInWithPassword({
    email,
    password: 'vidaytu-dev-2026',
  });
  if (errorLogin) throw new Error(`login de ${email}: ${errorLogin.message}`);
  const { data, error } = await cliente
    .from('leads')
    .select('id, centro:centros(nombre)')
    .order('created_at');
  if (error) throw new Error(`select de ${email}: ${error.message}`);
  const cuenta = new Map<string, number>();
  for (const fila of data as unknown as { centro: { nombre: string } | null }[]) {
      // Staging rotula sus centros con un sufijo de entorno para que nadie
    // confunda una base con otra. Esta prueba va de permisos, no de rotulos:
    // se compara el nombre real, sin la marca.
    const nombre = (fila.centro?.nombre ?? '(sin centro)').replace(/ [[A-Z]+]$/, '');
    cuenta.set(nombre, (cuenta.get(nombre) ?? 0) + 1);
  }
  await cliente.auth.signOut();
  return cuenta;
}

const bandeja = 'Vida y Tu — Bandeja de grupo';

const vistaHorizonte = await centrosVisibles('horizonte@test.com');
resultado(
  '4a. horizonte@test.com ve SOLO Horizonte',
  vistaHorizonte.size === 1 && vistaHorizonte.get('Horizonte') === 2,
  JSON.stringify([...vistaHorizonte]),
);

const vistaEquipo = await centrosVisibles('equipo@test.com');
resultado(
  '4b. equipo@test.com ve Eclipse + Bellamar + bandeja y NADA de Horizonte',
  vistaEquipo.size === 3 &&
    vistaEquipo.get('Eclipse') === 2 &&
    vistaEquipo.get('Bellamar') === 2 &&
    vistaEquipo.get(bandeja) === 2 &&
    !vistaEquipo.has('Horizonte'),
  JSON.stringify([...vistaEquipo]),
);

const vistaDireccion = await centrosVisibles('direccion@test.com');
resultado(
  '4c. direccion@test.com lo ve todo (8 leads, 4 centros)',
  vistaDireccion.size === 4 && [...vistaDireccion.values()].reduce((a, b) => a + b, 0) === 8,
  JSON.stringify([...vistaDireccion]),
);

console.log('');
if (fallos > 0) {
  console.error(`${fallos} verificación(es) FALLIDA(S)`);
  process.exit(1);
}
console.log('Todas las verificaciones pasaron.');
}

main().catch((e) => {
  console.error('Verificación fallida:', e);
  process.exit(1);
});
