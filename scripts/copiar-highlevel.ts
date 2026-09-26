/**
 * Trae la copia de HighLevel ahora, sin esperar al motor.
 *
 * El motor la hace sola una vez al día. Esto existe para tres momentos: la
 * primera vez, cuando se quiere comprobar que sigue funcionando, y el día que
 * haya que asegurarse de tenerlo todo antes de tocar la suscripción.
 *
 *   npx tsx --env-file=.env.local scripts/copiar-highlevel.ts
 */
import { createClient } from '@supabase/supabase-js';
import { copiarDeHighLevel } from '../src/lib/espejo';
import type { Database } from '../src/lib/database.types';

const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function main() {
  console.log('\nCopiando de HighLevel…\n');
  const t0 = Date.now();
  const r = await copiarDeHighLevel(admin);

  if (r.saltada) {
    console.log('  Saltada: faltan HIGHLEVEL_TOKEN o HIGHLEVEL_LOCATION_ID.\n');
    process.exit(1);
  }

  for (const [tipo, n] of Object.entries(r.recuentos ?? {})) {
    console.log(`  ${String(n).padStart(5)}  ${tipo}`);
  }
  console.log(`\n  en ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  if (r.truncado) {
    console.log(
      '\n  AVISO: alguna lista vino completa y no se pudo seguir paginando.\n' +
        '  La copia NO está entera. Queda marcado en canal_copias.truncado.',
    );
  }

  // Lo que hay guardado en total, que es lo que de verdad importa.
  const { data: total } = await admin.from('canal_espejo').select('tipo');
  const porTipo: Record<string, number> = {};
  for (const f of total ?? []) porTipo[f.tipo] = (porTipo[f.tipo] ?? 0) + 1;
  console.log(`\n  En el espejo: ${JSON.stringify(porTipo)}\n`);

  process.exit(r.truncado ? 1 : 0);
}

main().catch((e) => {
  console.error('\n  FALLÓ:', e instanceof Error ? e.message : e, '\n');
  process.exit(1);
});
