/**
 * Una campaña de un centro no llega a nadie de otro.
 *
 * De todo lo que hace la plataforma, esto es de lo poco que sale HACIA FUERA.
 * Un caso mal visto es un problema interno; un correo mal enviado llega a una
 * persona que no lo esperaba, no se puede retirar, y a veces llega a una
 * dirección que comparte con su familia.
 *
 * Se comprueban las tres capas, porque cada una tapa un agujero distinto:
 *
 *   1. La FUNCIÓN que arma los destinatarios filtra por el centro de la
 *      campaña, aunque la lista traiga a medio directorio.
 *   2. La BASE lo impide igual con un trigger, por si alguien mete un
 *      destinatario a mano saltándose la aplicación.
 *   3. Las POLÍTICAS: una dirección de centro no ve ni toca las campañas de
 *      otro.
 *
 * Y una cuarta que no se parte por centros a propósito: la baja. Quien se da de
 * baja se la da de Vidaitu, no de Horizonte.
 *
 *   npx tsx --env-file=.env.staging scripts/verificar-marketing-centro.ts
 */
import { createClient } from '@supabase/supabase-js';
import { prepararDestinatarios } from '../src/lib/campanas';
import type { Database } from '../src/lib/database.types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PASSWORD = 'vidaytu-dev-2026';

const admin = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

let fallos = 0;
const comprobar = (t: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK  ' : 'FALLA'}  ${t}${d ? ' — ' + d : ''}`);
  if (!ok) fallos++;
};

async function sesion(email: string) {
  const c = createClient<Database>(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) {
    comprobar(`sesión de ${email}`, false, error.message);
    return null;
  }
  return c;
}

async function main() {
  console.log('\nMarketing por centro\n');

  const { count: dePrueba } = await admin
    .from('perfiles')
    .select('id', { count: 'exact', head: true })
    .like('email', '%@test.com');
  if ((dePrueba ?? 0) === 0) {
    console.log('  Esto no parece un entorno de pruebas. Este script crea campañas.\n');
    process.exit(1);
  }

  const { data: centros } = await admin.from('centros').select('id, nombre');
  const horizonte = centros!.find((c) => /horizonte/i.test(c.nombre))!;
  const eclipse = centros!.find((c) => /eclipse/i.test(c.nombre))!;

  /** Una persona de cada centro, con consentimiento y correo. */
  const personaDe = async (centroId: string) => {
    const { data } = await admin
      .from('lead_contactos')
      .select('contacto_id, lead:leads!inner (centro_id)')
      .eq('leads.centro_id', centroId)
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    await admin
      .from('contactos')
      .update({
        consentimiento_marketing: true,
        email: `prueba-${data.contacto_id.slice(0, 8)}@test.com`,
      })
      .eq('id', data.contacto_id);
    return data.contacto_id;
  };

  const deHorizonte = await personaDe(horizonte.id);
  const deEclipse = await personaDe(eclipse.id);
  if (!deHorizonte || !deEclipse) {
    console.log('  Hacen falta contactos ligados a casos de Horizonte y de Eclipse.\n');
    process.exit(1);
  }

  // Una lista GLOBAL con gente de los dos centros: el caso peligroso.
  const { data: lista } = await admin
    .from('listas')
    .insert({ nombre: 'Prueba mezclada (se borra)', tipo: 'estatica' })
    .select('id')
    .single();
  await admin.from('lista_contactos').insert([
    { lista_id: lista!.id, contacto_id: deHorizonte },
    { lista_id: lista!.id, contacto_id: deEclipse },
  ]);

  const nuevaCampana = async (centroId: string | null, nombre: string) => {
    const { data } = await admin
      .from('campanas_email')
      .insert({
        nombre,
        asunto: 'Charla informativa',
        cuerpo_texto: 'Hola {nombre}, te escribimos por la charla del jueves.',
        lista_id: lista!.id,
        centro_id: centroId,
      })
      .select('id')
      .single();
    return data!.id;
  };

  const deCentro = await nuevaCampana(horizonte.id, 'Prueba Horizonte (se borra)');
  const deGrupo = await nuevaCampana(null, 'Prueba grupo (se borra)');

  // ---------------------------------------------------------------------------
  console.log('1. La función que arma los destinatarios:');

  const rCentro = await prepararDestinatarios(admin, deCentro);
  const { data: destCentro } = await admin
    .from('campana_destinatarios')
    .select('contacto_id')
    .eq('campana_id', deCentro);

  comprobar(
    'una campaña de Horizonte solo coge a los de Horizonte',
    (destCentro ?? []).length === 1 && destCentro![0].contacto_id === deHorizonte,
    `${(destCentro ?? []).length} destinatario(s) de una lista con 2`,
  );
  comprobar(
    'y la persona de Eclipse se queda fuera',
    !(destCentro ?? []).some((d) => d.contacto_id === deEclipse),
    rCentro.error ?? '',
  );

  await prepararDestinatarios(admin, deGrupo);
  const { data: destGrupo } = await admin
    .from('campana_destinatarios')
    .select('contacto_id')
    .eq('campana_id', deGrupo);
  comprobar(
    'una campaña de grupo sí coge a los dos',
    (destGrupo ?? []).length === 2,
    `${(destGrupo ?? []).length} destinatario(s)`,
  );

  // ---------------------------------------------------------------------------
  console.log('\n2. La base, por si alguien se salta la aplicación:');

  const { error: alColar } = await admin.from('campana_destinatarios').insert({
    campana_id: deCentro,
    contacto_id: deEclipse,
    email: 'colado@test.com',
  });
  comprobar(
    'meter a mano a alguien de otro centro se rechaza',
    alColar !== null,
    alColar ? 'rechazado por la base' : 'LA BASE LO ACEPTÓ',
  );

  // ---------------------------------------------------------------------------
  console.log('\n3. Quién ve qué campaña:');

  const jefeHorizonte = await sesion('dir-horizonte@test.com');
  const jefeGrupo = await sesion('direccion@test.com');
  if (!jefeHorizonte || !jefeGrupo) process.exit(1);

  const { data: veHorizonte } = await jefeHorizonte.from('campanas_email').select('id, centro_id');
  comprobar(
    'la dirección de Horizonte ve la suya',
    (veHorizonte ?? []).some((c) => c.id === deCentro),
  );
  comprobar(
    'y NO ve la del grupo',
    !(veHorizonte ?? []).some((c) => c.id === deGrupo),
    `ve ${(veHorizonte ?? []).length} campaña(s)`,
  );

  const { count: tocadas } = await jefeHorizonte
    .from('campanas_email')
    .update({ asunto: 'INTRUSIÓN' }, { count: 'exact' })
    .eq('id', deGrupo);
  comprobar('ni puede editarla', (tocadas ?? 0) === 0);

  const { data: veGrupo } = await jefeGrupo.from('campanas_email').select('id');
  comprobar(
    'la dirección de grupo ve las dos',
    (veGrupo ?? []).some((c) => c.id === deCentro) && (veGrupo ?? []).some((c) => c.id === deGrupo),
  );

  // ---------------------------------------------------------------------------
  console.log('\n4. La baja es de Vidaitu, no de un centro:');

  await admin
    .from('bajas_marketing')
    .upsert({ contacto_id: deHorizonte }, { onConflict: 'contacto_id' });
  await admin.from('contactos').update({ consentimiento_marketing: false }).eq('id', deHorizonte);
  await admin.from('campana_destinatarios').delete().eq('campana_id', deGrupo);

  await prepararDestinatarios(admin, deGrupo);
  const { data: trasLaBaja } = await admin
    .from('campana_destinatarios')
    .select('contacto_id')
    .eq('campana_id', deGrupo);
  comprobar(
    'quien se dio de baja en un centro tampoco entra en una campaña de grupo',
    !(trasLaBaja ?? []).some((d) => d.contacto_id === deHorizonte),
    `${(trasLaBaja ?? []).length} destinatario(s) tras la baja`,
  );

  // --- Limpieza ---
  await admin.from('campana_destinatarios').delete().in('campana_id', [deCentro, deGrupo]);
  await admin.from('campanas_email').delete().in('id', [deCentro, deGrupo]);
  await admin.from('lista_contactos').delete().eq('lista_id', lista!.id);
  await admin.from('listas').delete().eq('id', lista!.id);
  await admin.from('bajas_marketing').delete().eq('contacto_id', deHorizonte);
  await admin
    .from('contactos')
    .update({ consentimiento_marketing: false, email: null })
    .in('id', [deHorizonte, deEclipse]);
  console.log('\n  (campañas, lista y consentimientos de prueba deshechos)');

  console.log(
    fallos === 0
      ? '\nUna campaña de un centro no sale del centro.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main();
