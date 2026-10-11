/**
 * El espejo de HighLevel caduca: lo que lleva demasiado sin verse, se borra.
 *
 * La auditoría encontró el plazo (`canal_espejo_retencion_dias`) en
 * configuración desde el primer día y ninguna función que lo aplicara. El
 * espejo guarda conversaciones sobre consumo —datos de categoría especial
 * (regla 11)— y crecía sin tope.
 *
 * Se comprueba exactamente lo que hace y lo que NO hace:
 *
 *   1. Un mensaje y una conversación que no se ven desde hace más del plazo se
 *      borran.
 *   2. Un mensaje visto ayer se queda: el espejo es una copia viva.
 *   3. Un CONTACTO igual de antiguo se queda: el directorio no caduca, solo el
 *      contenido. Es lo que mantiene los enlaces de cada persona.
 *
 *   npx tsx --env-file=.env.staging scripts/verificar-espejo-retencion.ts
 */
import { createClient } from '@supabase/supabase-js';
import { purgarEspejoVencido } from '../src/lib/espejo';
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

const MARCA = 'ret-' + Date.now();

async function main() {
  console.log('\nEl espejo de HighLevel caduca\n');

  const { data: cfg } = await admin
    .from('configuracion')
    .select('valor')
    .eq('clave', 'canal_espejo_retencion_dias')
    .maybeSingle();
  const dias = Number(cfg?.valor) || 180;
  console.log(`  (plazo configurado: ${dias} días)\n`);

  const viejo = new Date(Date.now() - (dias + 5) * 86_400_000).toISOString();
  const reciente = new Date(Date.now() - 86_400_000).toISOString();

  const { error } = await admin.from('canal_espejo').insert([
    { sistema: 'prueba', tipo: 'mensaje', ref: `${MARCA}-msg-viejo`, contenido: { p: 1 }, visto_at: viejo, primera_copia_at: viejo },
    { sistema: 'prueba', tipo: 'conversacion', ref: `${MARCA}-conv-vieja`, contenido: { p: 1 }, visto_at: viejo, primera_copia_at: viejo },
    { sistema: 'prueba', tipo: 'mensaje', ref: `${MARCA}-msg-reciente`, contenido: { p: 1 }, visto_at: reciente, primera_copia_at: viejo },
    { sistema: 'prueba', tipo: 'contacto', ref: `${MARCA}-contacto-viejo`, contenido: { p: 1 }, visto_at: viejo, primera_copia_at: viejo },
  ]);
  if (error) throw new Error('sembrando: ' + error.message);

  const borrados = await purgarEspejoVencido(admin);
  console.log(`  purga ejecutada: ${borrados} fila(s) retiradas en total\n`);

  const queda = async (ref: string) =>
    (await admin.from('canal_espejo').select('id').eq('ref', ref).maybeSingle()).data !== null;

  comprobar('el mensaje viejo se borra', !(await queda(`${MARCA}-msg-viejo`)));
  comprobar('la conversación vieja se borra', !(await queda(`${MARCA}-conv-vieja`)));
  comprobar('el mensaje visto ayer se queda', await queda(`${MARCA}-msg-reciente`), 'el espejo es una copia viva, no un archivo');
  comprobar('el contacto viejo se queda', await queda(`${MARCA}-contacto-viejo`), 'el directorio no caduca; solo el contenido');

  await admin.from('canal_espejo').delete().like('ref', `${MARCA}-%`);
  console.log('\n  (datos de prueba retirados)');

  console.log(
    fallos === 0
      ? '\nLo que lleva demasiado sin verse, se va; el directorio se queda.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nFALLÓ:', e instanceof Error ? e.message : e, '\n');
  process.exit(1);
});
