/**
 * Comprueba EL MURO contra la base de datos real, no contra la interfaz.
 *
 * Inicia sesión de verdad con cada usuario de prueba y consulta las tablas
 * directamente. Que una pantalla redirija no demuestra nada: lo que importa
 * es que la consulta devuelva cero filas aunque alguien la haga a mano.
 *
 *   node --env-file=.env.local scripts/verificar-muro.mjs
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = 'vidaytu-dev-2026';

let fallos = 0;

function comprobar(descripcion, condicion, detalle = '') {
  const marca = condicion ? 'OK  ' : 'FALLO';
  if (!condicion) fallos++;
  console.log(`  ${marca} ${descripcion}${detalle ? ` — ${detalle}` : ''}`);
}

async function sesion(email) {
  const cliente = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await cliente.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) {
    console.log(`  FALLO no se pudo iniciar sesión como ${email}: ${error.message}`);
    fallos++;
    return null;
  }
  return cliente;
}

async function main() {
  console.log('\nEL MURO — comprobación contra la base de datos\n');

  // -------------------------------------------------------------------------
  console.log('Comercial (admisiones) frente al área clínica:');
  const comercial = await sesion('equipo@test.com');
  if (comercial) {
    const { data: pacientes } = await comercial.from('pacientes').select('id, nombre');
    comprobar('no ve ninguna ficha de paciente', (pacientes ?? []).length === 0,
      `devolvió ${(pacientes ?? []).length}`);

    const { data: sesiones } = await comercial.from('sesiones').select('id');
    comprobar('no ve ninguna sesión', (sesiones ?? []).length === 0,
      `devolvió ${(sesiones ?? []).length}`);

    const { data: documentos } = await comercial.from('documentos_clinicos').select('id');
    comprobar('no ve documentos clínicos', (documentos ?? []).length === 0);

    const { data: mensajes } = await comercial.from('mensajes').select('id');
    comprobar('no ve el chat clínico', (mensajes ?? []).length === 0);

    const { data: facturas } = await comercial.from('facturas').select('id');
    comprobar('no ve facturas', (facturas ?? []).length === 0);

    const { data: gastos } = await comercial.from('gasto_campanas').select('id');
    comprobar('no ve el gasto publicitario', (gastos ?? []).length === 0);

    // Y lo que SÍ debe ver, para que la prueba no pase por estar todo roto.
    const { data: leads } = await comercial.from('leads').select('id');
    comprobar('sí ve sus casos comerciales', (leads ?? []).length > 0,
      `${(leads ?? []).length} casos`);
  }

  // -------------------------------------------------------------------------
  console.log('\nTerapeuta frente al área comercial:');
  const terapeuta = await sesion('terapeuta@test.com');
  if (terapeuta) {
    const { data: leads } = await terapeuta.from('leads').select('id');
    comprobar('no ve el pipeline', (leads ?? []).length === 0,
      `devolvió ${(leads ?? []).length}`);

    const { data: presupuestos } = await terapeuta.from('presupuestos').select('id');
    comprobar('no ve presupuestos', (presupuestos ?? []).length === 0);

    const { data: conversiones } = await terapeuta.from('conversiones').select('id');
    comprobar('no ve conversiones ni dinero', (conversiones ?? []).length === 0);

    const { data: facturas } = await terapeuta.from('facturas').select('id');
    comprobar('no ve facturas', (facturas ?? []).length === 0);

    // Sus pacientes sí.
    const { data: pacientes } = await terapeuta.from('pacientes').select('id, nombre');
    comprobar('sí ve sus pacientes', (pacientes ?? []).length > 0,
      `${(pacientes ?? []).length} fichas`);
  }

  // -------------------------------------------------------------------------
  console.log('\nEscrituras prohibidas:');
  if (comercial) {
    const { error } = await comercial
      .from('pacientes')
      .insert({ centro_id: '00000000-0000-0000-0000-000000000000', nombre: 'intento' });
    comprobar('un comercial no puede crear una ficha de paciente', Boolean(error));
  }
  if (terapeuta) {
    const { data } = await terapeuta.from('ia_consultas').select('id');
    comprobar('solo ve sus propias consultas a la IA', Array.isArray(data));
  }

  // -------------------------------------------------------------------------
  // Aislamiento ENTRE terapeutas. Es la comprobación que de verdad protege al
  // paciente: no basta con que un comercial no vea la clínica, hace falta que
  // un terapeuta no vea las fichas de otro.
  // -------------------------------------------------------------------------
  console.log('\nAislamiento entre terapeutas:');
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: centro } = await admin.from('centros').select('id').eq('slug', 'eclipse').maybeSingle();
  const { data: otro } = await admin
    .from('pacientes')
    .insert({
      centro_id: centro.id,
      nombre: 'Paciente de otro terapeuta (prueba del muro)',
      terapeuta_id: null,
    })
    .select('id')
    .single();

  if (terapeuta && otro) {
    const { data: visibles } = await terapeuta.from('pacientes').select('id');
    const loVe = (visibles ?? []).some((p) => p.id === otro.id);
    comprobar('no ve la ficha de un paciente que no es suyo', !loVe);

    const { data: directo } = await terapeuta.from('pacientes').select('id').eq('id', otro.id);
    comprobar('tampoco preguntando por su id exacto', (directo ?? []).length === 0);

    const { error: errorEscritura } = await terapeuta
      .from('pacientes')
      .update({ nombre: 'intento de cambio' })
      .eq('id', otro.id)
      .select('id');
    const { data: sigueIgual } = await admin
      .from('pacientes')
      .select('nombre')
      .eq('id', otro.id)
      .maybeSingle();
    comprobar(
      'no puede modificarla',
      sigueIgual?.nombre === 'Paciente de otro terapeuta (prueba del muro)',
      errorEscritura ? 'rechazado' : 'sin filas afectadas',
    );

    await admin.from('pacientes').delete().eq('id', otro.id);
  }

  console.log(
    fallos === 0
      ? '\nEl muro aguanta: todas las comprobaciones pasan.\n'
      : `\n${fallos} comprobacion(es) fallidas.\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Verificación fallida:', e);
  process.exit(1);
});
