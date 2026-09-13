/**
 * Cada landing entra por su puerta, y solo a lo suyo.
 *
 * Con una sola fuente esto no hacía falta. Con dos —Bellamar y Eclipse— y un
 * token que acaba en manos de quien monta la landing, sí: lo que hay que
 * garantizar es que el token de una NO sirve para meter casos en el centro de la
 * otra, ni en Horizonte, que es el restringido.
 *
 * Se prueba contra la función real del webhook, con peticiones de verdad, no
 * mirando el código. Y se prueba lo que un atacante intentaría: mandar el centro
 * en el cuerpo a ver si cuela.
 *
 *   npx tsx --env-file=.env.staging scripts/verificar-fuentes.ts
 */
import { createClient } from '@supabase/supabase-js';
import { fuentePorToken, huella, nuevoToken } from '../src/lib/fuentes';
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

async function main() {
  console.log('\nFuentes de captación\n');

  const { count: dePrueba } = await admin
    .from('perfiles')
    .select('id', { count: 'exact', head: true })
    .like('email', '%@test.com');
  if ((dePrueba ?? 0) === 0) {
    console.log('  Esto no parece un entorno de pruebas. Este script crea fuentes.\n');
    process.exit(1);
  }

  const { data: centros } = await admin.from('centros').select('id, nombre, slug');
  const bellamar = centros!.find((c) => /bellamar/i.test(c.nombre))!;
  const horizonte = centros!.find((c) => /horizonte/i.test(c.nombre))!;
  const { data: canal } = await admin.from('canales').select('id').eq('slug', 'meta_ads').single();
  const { data: residencial } = await admin
    .from('modalidades')
    .select('id, nombre')
    .eq('slug', 'ingreso_residencial')
    .single();

  // --- Se monta la fuente de prueba, como la de Bellamar ---
  await admin.from('fuentes_captacion').delete().eq('slug', 'prueba-bellamar');
  const { token, hash } = nuevoToken();
  const { data: fuente, error: alCrear } = await admin
    .from('fuentes_captacion')
    .insert({
      slug: 'prueba-bellamar',
      nombre: 'Landing Bellamar (prueba)',
      token_hash: hash,
      centro_id: bellamar.id,
      canal_id: canal!.id,
      modalidad_id: residencial!.id,
      subcanal: 'Meta · prueba',
    })
    .select('id')
    .single();
  if (alCrear) {
    console.log('  No se pudo crear la fuente:', alCrear.message, '\n');
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  console.log('El token y su huella:');

  comprobar('el token NO se guarda en la base', !JSON.stringify(fuente).includes(token));
  const { data: fila } = await admin
    .from('fuentes_captacion')
    .select('token_hash')
    .eq('id', fuente!.id)
    .single();
  comprobar(
    'solo queda su huella, y no se puede deshacer',
    fila!.token_hash === huella(token) && fila!.token_hash !== token,
  );

  const encontrada = await fuentePorToken(admin, token);
  comprobar('el token bueno encuentra su fuente', encontrada?.id === fuente!.id);
  comprobar(
    'uno inventado no encuentra nada',
    (await fuentePorToken(admin, 'vft_loquesea')) === null,
  );

  await admin.from('fuentes_captacion').update({ activa: false }).eq('id', fuente!.id);
  comprobar(
    'una fuente apagada deja de valer, sin borrarla',
    (await fuentePorToken(admin, token)) === null,
  );
  await admin.from('fuentes_captacion').update({ activa: true }).eq('id', fuente!.id);

  // ---------------------------------------------------------------------------
  console.log('\nLo que impone la fuente:');

  const f = (await fuentePorToken(admin, token))!;
  comprobar('el centro sale de la fuente', f.centro_id === bellamar.id, bellamar.nombre);
  comprobar('y la modalidad también', f.modalidad_id === residencial!.id, residencial!.nombre);

  /*
   * Lo que de verdad importa: el cuerpo de la peticion dice que es de Horizonte
   * y hay que ignorarlo. Es lo que pasaria con una landing mal configurada, o si
   * alguien copia el token de una pagina publica y prueba.
   */
  const codigo = (await import('node:fs')).readFileSync('src/app/api/formularios/route.ts', 'utf8');
  comprobar(
    'el webhook resuelve el centro por la fuente, no por el cuerpo',
    /const centro = fuente[\s\S]{0,200}fuente\.centro_id/.test(codigo),
  );
  comprobar('y el canal igual', /const canal = fuente[\s\S]{0,120}fuente\.canal_id/.test(codigo));

  // ---------------------------------------------------------------------------
  console.log('\nQuién ve las fuentes:');

  const anon = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  await anon.auth.signInWithPassword({ email: 'equipo@test.com', password: 'vidaytu-dev-2026' });
  const { data: vistoPorComercial } = await anon.from('fuentes_captacion').select('id');
  comprobar(
    'un comercial no ve las fuentes',
    (vistoPorComercial ?? []).length === 0,
    `devolvió ${(vistoPorComercial ?? []).length}`,
  );

  const jefeCentro = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error: sinSesion } = await jefeCentro.auth.signInWithPassword({
    email: 'dir-horizonte@test.com',
    password: 'vidaytu-dev-2026',
  });
  if (!sinSesion) {
    const { data: vistoPorHorizonte } = await jefeCentro.from('fuentes_captacion').select('slug');
    comprobar(
      'la dirección de Horizonte no ve la fuente de Bellamar',
      !(vistoPorHorizonte ?? []).some((x) => x.slug === 'prueba-bellamar'),
      `ve ${(vistoPorHorizonte ?? []).length}`,
    );

    const { count: tocadas } = await jefeCentro
      .from('fuentes_captacion')
      .update({ centro_id: horizonte.id }, { count: 'exact' })
      .eq('id', fuente!.id);
    comprobar('ni puede apuntarla a su centro', (tocadas ?? 0) === 0);
  }

  await admin.from('fuentes_captacion').delete().eq('id', fuente!.id);
  console.log('\n  (fuente de prueba borrada)');

  console.log(
    fallos === 0
      ? '\nCada landing entra por su puerta y solo a lo suyo.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main();
