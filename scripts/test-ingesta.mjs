/**
 * Test E2E de la ingesta de formularios (POST /api/formularios).
 * Requiere el dev server arrancado y datos del seed.
 *   node --env-file=.env.local scripts/test-ingesta.mjs [puerto]
 * Limpia sus propios datos al terminar.
 */
import { createClient } from '@supabase/supabase-js';

const puerto = process.argv[2] ?? '3000';
const BASE = `http://localhost:${puerto}/api/formularios`;
const SECRETO = process.env.FORMULARIOS_WEBHOOK_SECRET;
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

let fallos = 0;
function check(nombre, ok, detalle = '') {
  console.log(`${ok ? '✓' : '✗'} ${nombre}${detalle ? ' — ' + detalle : ''}`);
  if (!ok) fallos++;
}

async function post(body, conToken = true) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(conToken ? { 'x-webhook-secret': SECRETO } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

// 1. Sin token → 401
const t1 = await post({ nombre: 'X', telefono: '600000001' }, false);
check('1. Sin token devuelve 401', t1.status === 401, `status ${t1.status}`);

// 2. Teléfono nuevo sin centro → creado en bandeja
const t2 = await post({
  nombre: 'Prueba Web Ingesta',
  telefono: '611 22 23 33',
  mensaje: 'Quiero información (test)',
  utm_campaign: 'test-ingesta',
  landing_url: 'https://ejemplo.com/gracias',
  origen_ref: 'test-ingesta-1',
});
check(
  '2. Lead nuevo creado',
  t2.status === 201 && t2.json?.accion === 'creado',
  JSON.stringify(t2.json),
);

const { data: leadNuevo } = await admin
  .from('leads')
  .select(
    'id, telefono, estado, centro:centros(slug), tareas(titulo), lead_contactos(es_principal), actividades(tipo)',
  )
  .eq('id', t2.json?.lead_id ?? '00000000-0000-0000-0000-000000000000')
  .maybeSingle();
check('2b. Normaliza teléfono a +34611222333', leadNuevo?.telefono === '+34611222333', leadNuevo?.telefono);
check('2c. Nace en la bandeja de grupo', leadNuevo?.centro?.slug === 'bandeja-grupo', leadNuevo?.centro?.slug);
check('2d. Tiene contacto principal', leadNuevo?.lead_contactos?.some((c) => c.es_principal) === true);
check('2e. Tiene tarea de primera llamada', (leadNuevo?.tareas ?? []).length === 1, JSON.stringify(leadNuevo?.tareas));
check('2f. Nota del formulario registrada', leadNuevo?.actividades?.some((a) => a.tipo === 'nota') === true);

// 3. Mismo origen_ref → duplicado, sin lead nuevo
const t3 = await post({
  nombre: 'Prueba Web Ingesta',
  telefono: '611222333',
  origen_ref: 'test-ingesta-1',
});
check(
  '3. Reenvío idempotente',
  t3.status === 200 && t3.json?.accion === 'duplicado' && t3.json?.lead_id === t2.json?.lead_id,
  JSON.stringify(t3.json),
);

// 4. Teléfono conocido con caso ABIERTO → se anota, NO se cambia su estado
const { data: antes } = await admin
  .from('leads')
  .select('id, estado')
  .eq('origen_sistema', 'seed')
  .eq('origen_ref', 'lead-1')
  .single();

const t4b = await post({ nombre: 'Da igual', telefono: '600000001', mensaje: 'Caso abierto (test)' });
const { data: despues } = await admin.from('leads').select('estado').eq('id', antes.id).single();
check(
  '4. Caso ABIERTO se anota sin tocar su estado',
  t4b.status === 200 && t4b.json?.accion === 'anotado' && despues?.estado === antes.estado,
  `accion=${t4b.json?.accion} estado ${antes.estado} → ${despues?.estado}`,
);

// 4bis. Con el caso CERRADO (perdido) sí se reabre
const { data: motivo } = await admin.from('motivos_perdida').select('id').limit(1).single();
await admin
  .from('leads')
  .update({ estado: 'perdido', motivo_perdida_id: motivo.id })
  .eq('id', antes.id);

const t4 = await post({ nombre: 'Da igual', telefono: '600000001', mensaje: 'Vuelvo a escribir (test)' });
check(
  '4bis. Caso CERRADO se reabre',
  t4.status === 200 && t4.json?.accion === 'reabierto',
  JSON.stringify(t4.json),
);

const { data: reabierto } = await admin
  .from('leads')
  .select('estado, origen_ref, propietario:perfiles!leads_propietario_id_fkey(email), actividades(tipo)')
  .eq('id', t4.json?.lead_id ?? '00000000-0000-0000-0000-000000000000')
  .maybeSingle();
check('4c. Es el lead-1 del seed', reabierto?.origen_ref === 'lead-1', reabierto?.origen_ref);
check('4d. Estado reabierto', reabierto?.estado === 'reabierto', reabierto?.estado);
check('4e. Vuelve a su propietario anterior', reabierto?.propietario?.email === 'horizonte@test.com', reabierto?.propietario?.email);
check('4f. Actividad de reapertura', reabierto?.actividades?.some((a) => a.tipo === 'reapertura') === true);

// Limpieza: quitar el lead y contacto del test 2, y devolver el lead-1 a 'contactado'
if (t2.json?.lead_id) await admin.from('leads').delete().eq('id', t2.json.lead_id);
await admin.from('contactos').delete().eq('telefono', '+34611222333');
await admin.from('leads').update({ estado: 'contactado', motivo_perdida_id: null }).eq('id', antes.id);

console.log('');
console.log(fallos ? `${fallos} FALLOS` : 'Todo OK (datos de test limpiados)');
process.exit(fallos ? 1 : 0);
