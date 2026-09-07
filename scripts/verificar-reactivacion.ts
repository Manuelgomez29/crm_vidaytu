/**
 * La reactivación llega a quien toca, y no llega a quien pidió que no.
 *
 * Usa la función real del motor. Monta el escenario en staging, la ejecuta y
 * deshace lo que tocó.
 *
 *   npx tsx --env-file=.env.staging scripts/verificar-reactivacion.ts
 */
import { createClient } from '@supabase/supabase-js';
import { reactivarPerdidos } from '../src/lib/automatizacion';
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

const HACE_100_DIAS = new Date(Date.now() - 100 * 86_400_000).toISOString();

async function main() {
  console.log('\nReactivación de «no es el momento»\n');

  const { data: motivo } = await admin
    .from('motivos_perdida')
    .select('id')
    .in('slug', ['no_es_el_momento', 'no-es-el-momento'])
    .limit(1)
    .then((r) => ({ data: r.data?.[0] }));
  if (!motivo) {
    console.log('  No existe el motivo «no-es-el-momento». Nada que probar.\n');
    process.exit(1);
  }

  // Dos casos con propietario y contacto, para montar los dos escenarios.
  const { data: candidatos } = await admin
    .from('leads')
    .select('id, nombre, estado, motivo_perdida_id, cerrado_at, reactivacion_propuesta_at, propietario_id')
    .not('propietario_id', 'is', null)
    .limit(2);

  if (!candidatos || candidatos.length < 2) {
    console.log('  Hacen falta dos casos con propietario. Ejecuta la siembra.\n');
    process.exit(1);
  }

  const [normal, conBaja] = candidatos;
  const original = candidatos.map((c) => ({ ...c }));

  // Contacto del segundo caso, para darle de baja.
  const { data: vinculo } = await admin
    .from('lead_contactos')
    .select('contacto_id')
    .eq('lead_id', conBaja.id)
    .limit(1)
    .maybeSingle();

  const perdidoHace100 = {
    estado: 'perdido' as const,
    motivo_perdida_id: motivo.id,
    cerrado_at: HACE_100_DIAS,
    reactivacion_propuesta_at: null,
  };

  await admin.from('leads').update(perdidoHace100).eq('id', normal.id);
  await admin.from('leads').update(perdidoHace100).eq('id', conBaja.id);

  let bajaId: string | undefined;
  if (vinculo?.contacto_id) {
    const { data } = await admin
      .from('bajas_marketing')
      .insert({ contacto_id: vinculo.contacto_id, origen: 'prueba de verificación' })
      .select('id')
      .single();
    bajaId = data?.id;
  }

  // Tareas previas, para contar solo las nuevas.
  const antes = new Date().toISOString();
  const creadas = await reactivarPerdidos(admin, 90);
  console.log(`  (la función creó ${creadas} tarea(s))\n`);

  const tareasDe = async (leadId: string) => {
    const { data } = await admin
      .from('tareas')
      .select('id, titulo, responsable_id')
      .eq('lead_id', leadId)
      .gte('created_at', antes);
    return data ?? [];
  };

  const tNormal = await tareasDe(normal.id);
  comprobar(
    `Un caso perdido hace 100 días genera su tarea («${normal.nombre}»)`,
    tNormal.length === 1,
    tNormal[0]?.titulo ?? 'ninguna',
  );
  comprobar('y la tarea tiene responsable', !!tNormal[0]?.responsable_id);

  const tBaja = await tareasDe(conBaja.id);
  comprobar(
    `Un caso cuyo contacto pidió la baja NO genera tarea («${conBaja.nombre}»)`,
    tBaja.length === 0,
    tBaja.length ? `generó ${tBaja.length}` : 'ninguna, correcto',
  );

  const { data: marcado } = await admin
    .from('leads')
    .select('reactivacion_propuesta_at')
    .eq('id', conBaja.id)
    .maybeSingle();
  comprobar(
    'y queda marcado, para no volver a mirarlo en cada pasada',
    marcado?.reactivacion_propuesta_at !== null,
  );

  /*
   * Un caso reciente no debe reactivarse.
   *
   * Se comprueba por EXISTENCIA de tareas, no por marca de tiempo: comparar la
   * hora del cliente con la de la base hace que un desfase de dos segundos
   * entre relojes convierta esta comprobación en una moneda al aire. Fue
   * exactamente lo que fallo la primera vez, y no era el producto.
   */
  await admin.from('tareas').delete().eq('lead_id', normal.id);
  await admin
    .from('leads')
    .update({ cerrado_at: new Date().toISOString(), reactivacion_propuesta_at: null })
    .eq('id', normal.id);
  await reactivarPerdidos(admin, 90);
  const { data: recientes } = await admin.from('tareas').select('id').eq('lead_id', normal.id);
  comprobar(
    'Un caso cerrado HOY no se reactiva',
    (recientes ?? []).length === 0,
    (recientes ?? []).length ? `aparecieron ${(recientes ?? []).length}` : 'ninguna tarea',
  );

  // --- Deshacer ---
  if (bajaId) await admin.from('bajas_marketing').delete().eq('id', bajaId);
  await admin.from('tareas').delete().in('lead_id', [normal.id, conBaja.id]).gte('created_at', antes);
  for (const c of original) {
    await admin
      .from('leads')
      .update({
        estado: c.estado,
        motivo_perdida_id: c.motivo_perdida_id,
        cerrado_at: c.cerrado_at,
        reactivacion_propuesta_at: c.reactivacion_propuesta_at,
      })
      .eq('id', c.id);
  }
  console.log('\n  (escenario deshecho: casos y baja restaurados)');

  console.log(
    fallos === 0
      ? '\nLa reactivación respeta sus reglas: todas las comprobaciones pasan.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main();
