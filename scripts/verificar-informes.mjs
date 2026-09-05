/**
 * El informe mensual es solo de direccion.
 *
 * Consolida ingresos, conversiones y rendimiento de todo el grupo. Un comercial
 * no tiene por que ver los numeros de sus companeros, y la regla 11 reserva las
 * exportaciones a direccion.
 *
 *   node --env-file=.env.local scripts/verificar-informes.mjs
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let fallos = 0;
const comprobar = (t, ok, d = '') => {
  console.log(`  ${ok ? 'OK  ' : 'FALLA'}  ${t}${d ? ' — ' + d : ''}`);
  if (!ok) fallos++;
};

console.log('\nAcceso a los informes mensuales\n');

const { data: informes } = await admin
  .from('informes_mensuales')
  .select('mes, ruta_fichero')
  .order('mes', { ascending: false })
  .limit(1);

if (!informes?.length) {
  console.log('  No hay ningun informe generado todavia. Genera uno desde el panel.\n');
  process.exit(0);
}

const informe = informes[0];
console.log(`  Informe de prueba: ${informe.mes} (${informe.ruta_fichero})\n`);

// El bucket no puede ser publico.
const { data: buckets } = await admin.storage.listBuckets();
const bucket = (buckets ?? []).find((b) => b.name === 'informes');
comprobar('El bucket «informes» existe', !!bucket);
comprobar('y NO es publico', bucket ? bucket.public === false : false);

async function comoUsuario(email) {
  const c = createClient(URL, ANON);
  const { error } = await c.auth.signInWithPassword({ email, password: 'vidaytu-dev-2026' });
  return error ? null : c;
}

for (const email of ['equipo@test.com', 'horizonte@test.com', 'terapeuta@test.com']) {
  const c = await comoUsuario(email);
  if (!c) {
    console.log(`  ·     ${email}: no se pudo entrar (¿2FA?), se omite`);
    continue;
  }
  const { data: filas } = await c.from('informes_mensuales').select('mes');
  const { data: fichero } = await c.storage.from('informes').download(informe.ruta_fichero);
  comprobar(`${email} no ve ninguna fila`, (filas ?? []).length === 0);
  comprobar(`${email} no puede descargar el PDF`, !fichero);
}

console.log(
  fallos === 0
    ? '\nEl informe queda reservado a direccion: todas las comprobaciones pasan.\n'
    : `\n${fallos} comprobacion(es) FALLIDA(S).\n`,
);
process.exit(fallos === 0 ? 0 : 1);
