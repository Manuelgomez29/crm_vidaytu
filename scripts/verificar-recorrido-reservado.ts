/**
 * Un recorrido reservado no lo ve el equipo de los centros.
 *
 * Ochenta y cinco familiares que consultaron por el Método HOME estaban a la
 * vista de todo el equipo comercial, que ni los atiende ni tiene por qué
 * conocerlos. Son datos de categoría especial (regla 11).
 *
 * Esto se prueba con SESIONES DE VERDAD contra la base, no leyendo el código:
 * lo que protege es la política de fila, y una pantalla que oculta filas no
 * protege nada — basta una llamada a la API para saltársela.
 *
 * Las tres preguntas que importan:
 *
 *   1. ¿Lo ve la dirección de grupo? Tiene que verlo.
 *   2. ¿Lo ve un comercial de centros? No puede.
 *   3. Y la excepción que evita el desastre: si esa persona acaba con un caso
 *      en SU centro, el comercial que lo lleva tiene que poder verla. Si no,
 *      trabajaría a ciegas sobre un caso suyo.
 *
 *   npx tsx --env-file=.env.staging scripts/verificar-recorrido-reservado.ts
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/database.types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

let fallos = 0;
const comprobar = (t: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK  ' : 'FALLA'}  ${t}${d ? ' — ' + d : ''}`);
  if (!ok) fallos++;
};

async function sesion(email: string, password: string) {
  const c = createClient<Database>(url, anon, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) {
    console.log(`  —     sin sesión de ${email}: ${error.message}`);
    return null;
  }
  return c;
}

const MARCA = 'RESERVADO ' + Date.now();

async function main() {
  console.log('\nUn recorrido reservado\n');

  const { data: home } = await admin
    .from('recorridos')
    .select('id, restringido')
    .eq('slug', 'metodo-home')
    .single();
  comprobar('«Método HOME» está marcado como reservado', home?.restringido === true);

  // Una persona de HOME, inventada, sin teléfono — como las de verdad.
  const { data: persona } = await admin
    .from('contactos')
    .insert({ nombre: MARCA, origen: 'highlevel', recorrido_id: home!.id })
    .select('id')
    .single();

  // Y una de un centro, para comprobar que lo demás se sigue viendo.
  const { data: abierta } = await admin
    .from('contactos')
    .insert({ nombre: MARCA + ' abierta', telefono: '+34600999111' })
    .select('id')
    .single();

  // ---------------------------------------------------------------------------
  console.log('\nQuién la ve:');

  const direccion = await sesion('repaso@test.com', 'vidaytu-repaso-2026');
  if (direccion) {
    const { data } = await direccion.from('contactos').select('id').eq('id', persona!.id);
    comprobar('la dirección de grupo sí', (data ?? []).length === 1);
  }

  const comercial = await sesion('equipo@test.com', 'vidaytu-dev-2026');
  if (comercial) {
    const { data: reservada } = await comercial.from('contactos').select('id').eq('id', persona!.id);
    comprobar(
      'un comercial de centros NO',
      (reservada ?? []).length === 0,
      'es lo que se pidió, y lo aplica la base, no la pantalla',
    );

    const { data: normal } = await comercial.from('contactos').select('id').eq('id', abierta!.id);
    comprobar(
      'pero sigue viendo el resto del directorio',
      (normal ?? []).length === 1,
      'restringir de más sería tan malo como no restringir',
    );

    // ------------------------------------------------------------------------
    console.log('\nLa excepción, que es la que evita el desastre:');

    /*
     * Esa misma persona acaba con un caso en Bellamar, que es un centro suyo.
     * A partir de ahí tiene que verla: si no, llevaría un caso sin poder abrir
     * la ficha de la persona del caso.
     */
    const [{ data: centro }, { data: pipe }, { data: canal }] = await Promise.all([
      admin.from('centros').select('id').eq('slug', 'bellamar').single(),
      admin.from('pipelines').select('id').limit(1).single(),
      admin.from('canales').select('id').eq('slug', 'otro').single(),
    ]);
    const { data: etapa } = await admin
      .from('pipeline_etapas')
      .select('id')
      .eq('pipeline_id', pipe!.id)
      .order('orden')
      .limit(1)
      .single();

    const { data: caso } = await admin
      .from('leads')
      .insert({
        centro_id: centro!.id,
        pipeline_id: pipe!.id,
        etapa_id: etapa!.id,
        nombre: MARCA,
        telefono: '+34600999112',
        canal_id: canal!.id,
      })
      .select('id')
      .single();
    await admin
      .from('lead_contactos')
      .insert({ lead_id: caso!.id, contacto_id: persona!.id, tipo: 'familiar' });

    const { data: ahora } = await comercial.from('contactos').select('id').eq('id', persona!.id);
    comprobar(
      'con un caso suyo en su centro, ahora SÍ la ve',
      (ahora ?? []).length === 1,
      'sin esto, llevaría un caso sin poder abrir la ficha de su protagonista',
    );

    await admin.from('leads').delete().eq('id', caso!.id);

    const { data: despues } = await comercial.from('contactos').select('id').eq('id', persona!.id);
    comprobar('y al irse el caso, vuelve a no verla', (despues ?? []).length === 0);
  }

  // ---------------------------------------------------------------------------
  await admin.from('contactos').delete().like('nombre', `${MARCA}%`);
  console.log('\n  (datos de prueba retirados)');

  console.log(
    fallos === 0
      ? '\nLo reservado está reservado, y lo demás se sigue viendo.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nFALLÓ:', e instanceof Error ? e.message : e, '\n');
  process.exit(1);
});
