/**
 * Una dirección de centro manda en su centro, y en su centro nada más.
 *
 * Es la comprobación más delicada de todas las que hay, porque aquí un fallo no
 * se ve: si el muro tiene un hueco, todo funciona igual de bien —solo que la
 * dirección de Horizonte está viendo los casos de Eclipse—. Nadie se queja de
 * ver de más.
 *
 * Se prueba contra la base con sesiones de verdad, no contra la interfaz. Que
 * una pantalla no enseñe algo no demuestra nada: lo que importa es que la
 * consulta devuelva cero filas aunque alguien la haga a mano.
 *
 * Y se comprueba en las dos direcciones. Que no vea lo ajeno es la mitad; la
 * otra es que SÍ vea lo suyo, porque un muro que lo tapa todo también «pasa» y
 * deja a alguien sin poder trabajar.
 *
 *   npx tsx --env-file=.env.staging scripts/verificar-alcance.ts
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/database.types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PASSWORD = 'vidaytu-dev-2026';
const EMAIL = 'dir-horizonte@test.com';

const admin = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

let fallos = 0;
const comprobar = (t: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK  ' : 'FALLA'}  ${t}${d ? ' — ' + d : ''}`);
  if (!ok) fallos++;
};

async function sesion(email: string) {
  const cliente = createClient<Database>(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await cliente.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) {
    comprobar(`sesión de ${email}`, false, error.message);
    return null;
  }
  return cliente;
}

async function main() {
  console.log('\nAlcance por centro: una dirección que manda solo en lo suyo\n');

  const { data: centros } = await admin.from('centros').select('id, nombre');
  const horizonte = (centros ?? []).find((c) => /horizonte/i.test(c.nombre))!;
  const eclipse = (centros ?? []).find((c) => /eclipse/i.test(c.nombre))!;
  if (!horizonte || !eclipse) {
    console.log('  Faltan los centros de prueba.\n');
    process.exit(1);
  }

  /*
   * Este script CREA un usuario, que es más de lo que hace cualquier otra
   * comprobación. Si alguien lo lanza contra producción por descuido —el
   * comando sin `staging:` apunta ahí— acabaría con una dirección de centro de
   * mentira dentro de la plataforma real. Así que primero se comprueba que esto
   * es un entorno de pruebas.
   */
  const { count: cuentasDePrueba } = await admin
    .from('perfiles')
    .select('id', { count: 'exact', head: true })
    .like('email', '%@test.com');
  if ((cuentasDePrueba ?? 0) === 0) {
    console.log('  Esto no parece un entorno de pruebas: no hay cuentas @test.com.');
    console.log('  Este script crea usuarios, así que no se ejecuta aquí.\n');
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // Se monta (o se rehace) la dirección de Horizonte.
  // ---------------------------------------------------------------------------
  const { data: usuarios } = await admin.auth.admin.listUsers();
  const yaEstaba = usuarios.users.find((u) => u.email === EMAIL);
  const idUsuario =
    yaEstaba?.id ??
    (
      await admin.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
      })
    ).data.user!.id;

  await admin.from('perfiles').upsert(
    {
      id: idUsuario,
      email: EMAIL,
      nombre: 'Dirección Horizonte (prueba)',
      rol: 'direccion',
      alcance: 'centros',
      activo: true,
    },
    { onConflict: 'id' },
  );
  await admin.from('perfil_centros').delete().eq('perfil_id', idUsuario);
  await admin.from('perfil_centros').insert({ perfil_id: idUsuario, centro_id: horizonte.id });

  const jefeCentro = await sesion(EMAIL);
  const jefeGrupo = await sesion('direccion@test.com');
  if (!jefeCentro || !jefeGrupo) process.exit(1);

  // ---------------------------------------------------------------------------
  console.log('Lo suyo, sí (si no, el muro sería un muro y ya):');

  const { data: susCasos } = await jefeCentro.from('leads').select('id, centro_id');
  comprobar(
    've los casos de Horizonte',
    (susCasos ?? []).length > 0 && (susCasos ?? []).every((l) => l.centro_id === horizonte.id),
    `${(susCasos ?? []).length} caso(s), todos de Horizonte`,
  );

  const { data: unCaso } = await admin
    .from('leads')
    .select('id, nombre')
    .eq('centro_id', horizonte.id)
    .limit(1)
    .single();

  const { data: deEclipse } = await admin
    .from('leads')
    .select('id, nombre')
    .eq('centro_id', eclipse.id)
    .limit(1)
    .single();

  if (!unCaso || !deEclipse) {
    console.log('  Hacen falta casos en Horizonte y en Eclipse para poder distinguir.\n');
    process.exit(1);
  }

  const { error: alEditar } = await jefeCentro
    .from('leads')
    .update({ zona: 'Jerez (prueba de alcance)' })
    .eq('id', unCaso.id);
  comprobar('y puede editarlos', alEditar === null, alEditar?.message ?? '');

  // ---------------------------------------------------------------------------
  console.log('\nLo ajeno, no:');

  const { data: loQueVe } = await jefeCentro.from('leads').select('id').eq('id', deEclipse.id);
  comprobar('no ve un caso de Eclipse ni pidiéndolo por su id', (loQueVe ?? []).length === 0);

  const { error: alTocarAjeno, count: tocados } = await jefeCentro
    .from('leads')
    .update({ zona: 'INTRUSIÓN' }, { count: 'exact' })
    .eq('id', deEclipse.id);
  comprobar(
    'ni puede editarlo',
    (tocados ?? 0) === 0,
    alTocarAjeno ? 'rechazado' : `${tocados ?? 0} fila(s) tocada(s)`,
  );

  /*
   * Llevarse un caso ajeno a su centro seria la forma elegante de saltarse el
   * muro: primero lo mueves, luego ya lo ves.
   */
  const { count: robados } = await jefeCentro
    .from('leads')
    .update({ centro_id: horizonte.id }, { count: 'exact' })
    .eq('id', deEclipse.id);
  comprobar('ni llevárselo a su centro para poder verlo', (robados ?? 0) === 0);

  const { data: actividadesAjenas } = await jefeCentro
    .from('actividades')
    .select('id')
    .eq('lead_id', deEclipse.id);
  comprobar('no ve el historial de un caso ajeno', (actividadesAjenas ?? []).length === 0);

  const { data: tareasAjenas } = await jefeCentro
    .from('tareas')
    .select('id')
    .eq('lead_id', deEclipse.id);
  comprobar('ni sus tareas', (tareasAjenas ?? []).length === 0);

  const { data: presupuestosAjenos } = await jefeCentro
    .from('presupuestos')
    .select('id')
    .eq('lead_id', deEclipse.id);
  comprobar('ni sus presupuestos', (presupuestosAjenos ?? []).length === 0);

  // ---------------------------------------------------------------------------
  console.log('\nLas personas del directorio:');

  const { data: contactosSuyos } = await jefeCentro.from('contactos').select('id');
  const { data: contactosTodos } = await jefeGrupo.from('contactos').select('id');
  comprobar(
    've menos personas que la dirección de grupo',
    (contactosSuyos ?? []).length < (contactosTodos ?? []).length,
    `${(contactosSuyos ?? []).length} de ${(contactosTodos ?? []).length}`,
  );

  const { data: vinculoAjeno } = await admin
    .from('lead_contactos')
    .select('contacto_id')
    .eq('lead_id', deEclipse.id)
    .limit(1)
    .maybeSingle();
  if (vinculoAjeno) {
    const { data: personaAjena } = await jefeCentro
      .from('contactos')
      .select('id')
      .eq('id', vinculoAjeno.contacto_id);
    comprobar('no ve a la persona de un caso de Eclipse', (personaAjena ?? []).length === 0);
  }

  // ---------------------------------------------------------------------------
  console.log('\nLo que es de todo el grupo:');

  const { error: alTocarCatalogo } = await jefeCentro
    .from('canales')
    .update({ nombre: 'INTRUSIÓN' })
    .eq('slug', 'meta_ads');
  const { data: canalIntacto } = await admin
    .from('canales')
    .select('nombre')
    .eq('slug', 'meta_ads')
    .maybeSingle();
  comprobar(
    'no puede cambiar un catálogo del grupo',
    canalIntacto?.nombre !== 'INTRUSIÓN',
    alTocarCatalogo ? 'rechazado' : `quedó «${canalIntacto?.nombre}»`,
  );

  const { data: catalogoLeido } = await jefeCentro.from('canales').select('id').limit(5);
  comprobar('pero sí leerlo, que lo necesita para trabajar', (catalogoLeido ?? []).length > 0);

  const { error: alTocarParametros } = await jefeCentro
    .from('configuracion')
    .update({ valor: 999 })
    .eq('clave', 'sla_primera_respuesta_minutos');
  const { data: slaIntacto } = await admin
    .from('configuracion')
    .select('valor')
    .eq('clave', 'sla_primera_respuesta_minutos')
    .maybeSingle();
  comprobar(
    'no puede cambiar el SLA del grupo',
    Number(slaIntacto?.valor) !== 999,
    alTocarParametros ? 'rechazado' : `quedó en ${slaIntacto?.valor}`,
  );

  const { error: alTocarScoring } = await jefeCentro
    .from('scoring_reglas')
    .update({ puntos: 99 })
    .eq('nombre', 'Urgencia alta');
  const { data: reglaIntacta } = await admin
    .from('scoring_reglas')
    .select('puntos')
    .eq('nombre', 'Urgencia alta')
    .maybeSingle();
  comprobar(
    'ni las reglas de lead scoring',
    reglaIntacta?.puntos !== 99,
    alTocarScoring ? 'rechazado' : `quedaron en ${reglaIntacta?.puntos}`,
  );

  const { data: accesosVistos } = await jefeCentro.from('accesos').select('id').limit(3);
  comprobar('no ve el registro de accesos del grupo', (accesosVistos ?? []).length === 0);

  // ---------------------------------------------------------------------------
  console.log('\nLo que más miedo daba: ascenderse a uno mismo');

  const { error: alAscenderse } = await jefeCentro
    .from('perfiles')
    .update({ alcance: 'grupo' })
    .eq('id', idUsuario);
  const { data: comoQuedo } = await admin
    .from('perfiles')
    .select('alcance, rol')
    .eq('id', idUsuario)
    .single();
  comprobar(
    'no puede darse alcance de grupo',
    comoQuedo?.alcance === 'centros',
    alAscenderse ? 'rechazado por la base' : `quedó en «${comoQuedo?.alcance}»`,
  );

  const { error: alAutoasignarse } = await jefeCentro
    .from('perfil_centros')
    .insert({ perfil_id: idUsuario, centro_id: eclipse.id });
  const { data: susCentros } = await admin
    .from('perfil_centros')
    .select('centro_id')
    .eq('perfil_id', idUsuario);
  comprobar(
    'ni asignarse otro centro',
    (susCentros ?? []).length === 1,
    alAutoasignarse ? 'rechazado' : `acabó con ${(susCentros ?? []).length} centro(s)`,
  );

  // ---------------------------------------------------------------------------
  console.log('\nLa dirección de grupo sigue mandando en todo:');

  const { data: todosLosCasos } = await jefeGrupo.from('leads').select('id, centro_id');
  const centrosVistos = new Set((todosLosCasos ?? []).map((l) => l.centro_id));
  comprobar(
    've casos de más de un centro',
    centrosVistos.size > 1,
    `${(todosLosCasos ?? []).length} casos en ${centrosVistos.size} centros`,
  );

  const { error: grupoEditaCatalogo } = await jefeGrupo
    .from('canales')
    .update({ activo: true })
    .eq('slug', 'meta_ads');
  comprobar('y sigue pudiendo tocar los catálogos', grupoEditaCatalogo === null);

  // Se deja el caso de prueba como estaba.
  await admin.from('leads').update({ zona: 'Jerez de la Frontera' }).eq('id', unCaso.id);

  console.log(
    fallos === 0
      ? '\nEl alcance aguanta: manda en lo suyo y en nada más.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main();
