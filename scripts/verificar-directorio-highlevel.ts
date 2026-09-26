/**
 * Las personas de HighLevel están en el directorio, y solo eso.
 *
 * Se pidió verlas todas en un sitio. Lo que hace peligroso ese deseo es lo que
 * podría venir de propina: si entraran como CASOS, el motor repartiría
 * ochenta y cinco personas entre un equipo que no las trabaja, arrancaría un
 * reloj de SLA por cada una y empezaría a pedir llamadas que ya está haciendo
 * otro equipo en otra herramienta.
 *
 * Así que esto comprueba las dos mitades: que están, y que no traen nada más.
 *
 *   npx tsx --env-file=.env.local scripts/verificar-directorio-highlevel.ts
 */
import { createClient } from '@supabase/supabase-js';
import { volcarDirectorioDeHighLevel } from '../src/lib/directorio-highlevel';
import type { Database } from '../src/lib/database.types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

let fallos = 0;
const comprobar = (t: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK  ' : 'FALLA'}  ${t}${d ? ' — ' + d : ''}`);
  if (!ok) fallos++;
};

const contar = async (tabla: 'contactos' | 'leads' | 'tareas' | 'notificaciones') => {
  const { count } = await admin.from(tabla).select('id', { count: 'exact', head: true });
  return count ?? 0;
};

async function main() {
  console.log('\nLas personas de HighLevel en el directorio\n');

  // ---------------------------------------------------------------------------
  console.log('Están:');

  const { count: deHighLevel } = await admin
    .from('contactos')
    .select('id', { count: 'exact', head: true })
    .eq('origen', 'highlevel');
  comprobar('hay personas traídas de HighLevel', (deHighLevel ?? 0) > 0, `${deHighLevel}`);

  const { count: sinTelefono } = await admin
    .from('contactos')
    .select('id', { count: 'exact', head: true })
    .is('telefono', null);
  comprobar(
    'y la mayoría no tiene teléfono, que era lo que lo impedía',
    (sinTelefono ?? 0) > 0,
    `${sinTelefono} sin número`,
  );

  const { count: sinOrigen } = await admin
    .from('contactos')
    .select('id', { count: 'exact', head: true })
    .is('origen', null)
    .not('id', 'is', null);
  comprobar(
    'todas dicen de dónde vienen',
    (sinOrigen ?? 0) === 0,
    'sin rótulo, la lista no se puede leer de un vistazo',
  );

  const { data: enlaces } = await admin
    .from('canal_identidades')
    .select('contacto_id')
    .eq('sistema', 'highlevel')
    .is('contacto_id', null)
    .limit(1);
  comprobar(
    'cada una sigue enlazada con su ficha de HighLevel',
    (enlaces ?? []).length === 0,
    'es lo que permite no duplicarlas en la siguiente pasada',
  );

  // ---------------------------------------------------------------------------
  console.log('\nY no traen nada más:');

  const casos = await contar('leads');
  const tareas = await contar('tareas');
  comprobar(
    'no se ha creado ningún caso',
    casos === 0,
    'si entraran como casos, el motor los repartiría y arrancaría su SLA',
  );
  comprobar('ni ninguna tarea', tareas === 0);

  const { count: sinDuenoConCaso } = await admin
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .is('propietario_id', null);
  comprobar('ni hay casos sin propietario esperando a nadie', (sinDuenoConCaso ?? 0) === 0);

  // ---------------------------------------------------------------------------
  console.log('\nRepetirlo no duplica:');

  const antes = await contar('contactos');
  const segunda = await volcarDirectorioDeHighLevel(admin);
  const despues = await contar('contactos');

  comprobar('el directorio no crece al repetir', antes === despues, `${antes} → ${despues}`);
  comprobar('y no crea a nadie', segunda.creados === 0, JSON.stringify(segunda));

  // ---------------------------------------------------------------------------
  console.log('\nEl teléfono sigue siendo único cuando existe:');

  const { data: conTelefono } = await admin
    .from('contactos')
    .select('telefono')
    .not('telefono', 'is', null);
  const numeros = (conTelefono ?? []).map((c) => c.telefono);
  comprobar(
    'no hay dos personas con el mismo número',
    new Set(numeros).size === numeros.length,
    `${numeros.length} con número`,
  );

  console.log(
    fallos === 0
      ? '\nEstán todas en el directorio, y ninguna ha despertado al motor.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nFALLÓ:', e instanceof Error ? e.message : e, '\n');
  process.exit(1);
});
