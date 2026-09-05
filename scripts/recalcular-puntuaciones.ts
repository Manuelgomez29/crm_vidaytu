/**
 * Recalcula la puntuación de todos los casos abiertos, ahora.
 *
 * En producción esto lo hace el cron cada quince minutos. En staging no: los
 * cron de Vercel solo corren en despliegues de producción, así que sin esto la
 * puntuación se queda a 0 para siempre y no hay forma de ver ni probar el
 * scoring en el entorno donde precisamente hay que probarlo.
 *
 *   npx tsx --env-file=.env.staging scripts/recalcular-puntuaciones.ts
 */
import { createClient } from '@supabase/supabase-js';
import { recalcularPuntuaciones } from '../src/lib/automatizacion';
import type { Database } from '../src/lib/database.types';

async function main() {
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const cambiados = await recalcularPuntuaciones(admin);
  console.log(`\n  ${cambiados} caso(s) con la puntuación actualizada.\n`);

  const { data } = await admin
    .from('leads')
    .select('nombre, estado, urgencia, puntuacion')
    .not('estado', 'in', '(convertido,perdido,no_valido,derivado)')
    .order('puntuacion', { ascending: false })
    .limit(10);

  console.log('  CASO                      ESTADO           URGENCIA  PUNTOS');
  console.log('  ' + '-'.repeat(60));
  for (const l of data ?? []) {
    console.log(
      '  ' +
        String(l.nombre).slice(0, 24).padEnd(26) +
        String(l.estado).padEnd(17) +
        String(l.urgencia ?? '—').padEnd(10) +
        String(l.puntuacion),
    );
  }
  console.log();
}

main();
