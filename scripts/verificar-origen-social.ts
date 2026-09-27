/**
 * Quien va a llamar sabe por qué escribió esa persona.
 *
 * El agujero era concreto: un comercial recibía a alguien llegado de Instagram
 * y solo veía un nombre y una etapa. La conversación no la tenemos para todo
 * el mundo —ZeroChats no expone los mensajes— pero sí sabemos a qué
 * publicación respondió y qué le puso el bot, y eso no llegaba a ninguna
 * pantalla.
 *
 * Se comprueba el camino entero, que es donde se rompen estas cosas:
 *
 *   1. El evento trae la publicación y se guarda.
 *   2. Un evento posterior sin publicación NO borra la que ya sabíamos.
 *   3. El puente une la identidad de ZeroChats con la persona del directorio,
 *      por su usuario de Instagram y nunca por el nombre.
 *   4. Y un comercial lo ve — que era el punto de todo esto.
 *
 *   npx tsx --env-file=.env.staging scripts/verificar-origen-social.ts
 */
import { createClient } from '@supabase/supabase-js';
import { identidadDesdeEvento, ingerirEvento } from '../src/lib/canal';
import { enlazarIdentidadesSociales } from '../src/lib/puente-identidades';
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

const MARCA = 'origen-' + Date.now();
const USUARIO = 'carmen_' + Date.now();
const REF_HL = 'HL-' + MARCA;

function evento(extra: Record<string, unknown>, id: string) {
  return {
    id,
    event: extra.media ? 'lead.media_replied' : 'lead.tagged',
    createdAt: new Date().toISOString(),
    businessId: 'negocio-prueba',
    data: {
      lead: {
        id: 'lead-' + MARCA,
        name: 'Carmen de prueba',
        username: USUARIO,
        platform: 'INSTAGRAM',
        externalId: '17841400000009999',
        email: null as string | null,
        phone: null as string | null,
        state: 'QUALIFYING',
        tags: ['familiar', 'interesado'],
        createdAt: new Date().toISOString(),
      },
      ...extra,
    },
  };
}

async function main() {
  console.log('\nPor qué escribió esa persona\n');

  // --- Escenario: la persona ya existe en el directorio, vía HighLevel -----
  const { data: persona } = await admin
    .from('contactos')
    .insert({ nombre: 'Carmen de prueba', origen: 'highlevel' })
    .select('id')
    .single();

  await admin.from('canal_identidades').insert({
    sistema: 'highlevel',
    plataforma: 'highlevel',
    ref_sistema: REF_HL,
    contacto_id: persona!.id,
  });

  // El campo de HighLevel que guarda el usuario de Instagram, y su ficha.
  await admin.from('canal_espejo').insert([
    {
      sistema: 'highlevel',
      tipo: 'campo',
      ref: 'campo-' + MARCA,
      contenido: { id: 'campo-' + MARCA, name: 'ig_username', fieldKey: 'contact.ig_username' },
    },
    {
      sistema: 'highlevel',
      tipo: 'contacto',
      ref: REF_HL,
      contenido: { id: REF_HL, customFields: [{ id: 'campo-' + MARCA, value: USUARIO }] },
    },
  ]);

  // ---------------------------------------------------------------------------
  console.log('La publicación se guarda:');

  const conMedia = evento(
    {
      media: { id: '1790', type: 'REELS', permalink: 'https://instagram.com/p/abc/' },
      source: 'direct_message',
    },
    MARCA + '-1',
  );
  await ingerirEvento(admin, {
    sistema: 'zerochats',
    evento: 'lead.media_replied',
    entregaRef: MARCA + '-1',
    payload: conMedia,
    identidad: identidadDesdeEvento(conMedia),
  });

  const leer = async () =>
    (
      await admin
        .from('canal_identidades')
        .select('publicacion, contacto_id, etiquetas, estado')
        .eq('ref_sistema', 'lead-' + MARCA)
        .single()
    ).data;

  const tras1 = await leer();
  const pub1 = tras1?.publicacion as { tipo?: string; enlace?: string; via?: string } | null;
  comprobar('queda el tipo de publicación', pub1?.tipo === 'REELS', String(pub1?.tipo));
  comprobar('y su enlace', !!pub1?.enlace);
  comprobar('y por dónde respondió', pub1?.via === 'direct_message');

  // ---------------------------------------------------------------------------
  console.log('\nUn evento posterior sin publicación no la borra:');

  const sinMedia = evento({ addedTags: ['precio'] }, MARCA + '-2');
  await ingerirEvento(admin, {
    sistema: 'zerochats',
    evento: 'lead.tagged',
    entregaRef: MARCA + '-2',
    payload: sinMedia,
    identidad: identidadDesdeEvento(sinMedia),
  });

  const tras2 = await leer();
  comprobar(
    'la publicación sigue ahí',
    !!(tras2?.publicacion as { tipo?: string } | null)?.tipo,
    'lo de después no puede borrar lo que ya sabíamos',
  );
  comprobar('y las etiquetas se actualizan igual', (tras2?.etiquetas ?? []).length === 2);

  // ---------------------------------------------------------------------------
  console.log('\nEl puente la une con su persona:');

  comprobar('antes del puente, suelta', tras2?.contacto_id === null);

  const r = await enlazarIdentidadesSociales(admin);
  const tras3 = await leer();
  comprobar('el puente la enlaza', tras3?.contacto_id === persona!.id, JSON.stringify(r));

  // Y no se une por el nombre: una con el mismo nombre y otro usuario, fuera.
  const otro = evento({}, MARCA + '-3');
  otro.data.lead.id = 'lead-otro-' + MARCA;
  otro.data.lead.username = 'otra_cuenta_' + MARCA;
  await ingerirEvento(admin, {
    sistema: 'zerochats',
    evento: 'lead.created',
    entregaRef: MARCA + '-3',
    payload: otro,
    identidad: identidadDesdeEvento(otro),
  });
  await enlazarIdentidadesSociales(admin);
  const { data: elOtro } = await admin
    .from('canal_identidades')
    .select('contacto_id')
    .eq('ref_sistema', 'lead-otro-' + MARCA)
    .single();
  comprobar(
    'mismo nombre y otro usuario: NO se une',
    elOtro?.contacto_id === null,
    'dos «Carmen» no son la misma persona',
  );

  /*
   * Y las dos rutas del correo sintético, que es de donde sale la identidad de
   * verdad: el campo `ig_username` de HighLevel está VACÍO en los 85 contactos
   * de la cuenta real —comprobado también en la ficha de detalle—, así que un
   * puente que dependa de él no enlaza a nadie nunca.
   */
  console.log('\nEl correo sintético de Instagram también enlaza:');

  const rutas = [
    {
      clave: 'usuario',
      correo: `${USUARIO}_b@instagram.com`,
      usuario: `${USUARIO}_b`,
      igsid: '17841400000008881',
    },
    {
      clave: 'IGSID',
      correo: 'ig-17841400000008882@instagram.com',
      usuario: null,
      igsid: '17841400000008882',
    },
  ];

  for (const r of rutas) {
    const { data: p } = await admin
      .from('contactos')
      .insert({ nombre: `Prueba ${r.clave} ${MARCA}`, origen: 'highlevel' })
      .select('id')
      .single();
    const refHL = `HL-${r.clave}-${MARCA}`;
    await admin.from('canal_identidades').insert({
      sistema: 'highlevel',
      plataforma: 'highlevel',
      ref_sistema: refHL,
      contacto_id: p!.id,
    });
    // La ficha de HighLevel: SOLO el correo, sin campo personalizado ninguno.
    await admin.from('canal_espejo').insert({
      sistema: 'highlevel',
      tipo: 'contacto',
      ref: refHL,
      contenido: { id: refHL, email: r.correo, customFields: [] },
    });
    await admin.from('canal_identidades').insert({
      sistema: 'zerochats',
      plataforma: 'instagram',
      ref_sistema: `lead-${r.clave}-${MARCA}`,
      ref_plataforma: r.igsid,
      usuario: r.usuario,
      nombre: 'Quien sea',
    });

    await enlazarIdentidadesSociales(admin);
    const { data: quedo } = await admin
      .from('canal_identidades')
      .select('contacto_id')
      .eq('ref_sistema', `lead-${r.clave}-${MARCA}`)
      .single();
    comprobar(
      `enlaza por ${r.clave} (${r.correo})`,
      quedo?.contacto_id === p!.id,
      'es lo único que trae la cuenta real',
    );
  }

  // Y sin correo que cuadre se queda suelta, aunque el nombre sea el mismo.
  await admin.from('canal_identidades').insert({
    sistema: 'zerochats',
    plataforma: 'instagram',
    ref_sistema: `lead-ajena-${MARCA}`,
    ref_plataforma: '17841400000009999999',
    usuario: `nadie_${MARCA}`,
    nombre: 'Quien sea',
  });
  await enlazarIdentidadesSociales(admin);
  const { data: ajena } = await admin
    .from('canal_identidades')
    .select('contacto_id')
    .eq('ref_sistema', `lead-ajena-${MARCA}`)
    .single();
  comprobar(
    'y sin correo que cuadre, se queda suelta',
    ajena?.contacto_id === null,
    'mismo nombre que las otras dos: el nombre nunca enlaza',
  );

  // ---------------------------------------------------------------------------
  console.log('\nY un comercial lo ve:');

  const comercial = createClient<Database>(url, anon, { auth: { persistSession: false } });
  const { error: eLogin } = await comercial.auth.signInWithPassword({
    email: 'equipo@test.com',
    password: 'vidaytu-dev-2026',
  });
  if (eLogin) {
    console.log('  —     sin cuenta de comercial en este entorno');
  } else {
    const { data: ve } = await comercial
      .from('canal_identidades')
      .select('usuario, publicacion')
      .eq('contacto_id', persona!.id)
      .neq('sistema', 'highlevel');
    comprobar(
      've de dónde viene la persona que puede ver',
      (ve ?? []).length === 1,
      'era el punto de todo esto',
    );

    const { data: espejo } = await comercial.from('canal_espejo').select('id').limit(1);
    comprobar(
      'pero sigue sin ver las conversaciones',
      (espejo ?? []).length === 0,
      'el origen no es el contenido de la charla',
    );
  }

  // ---------------------------------------------------------------------------
  await admin.from('canal_eventos').delete().like('entrega_ref', `${MARCA}%`);
  await admin.from('canal_identidades').delete().like('ref_sistema', `%${MARCA}`);
  await admin.from('canal_espejo').delete().like('ref', `%${MARCA}`);
  await admin.from('contactos').delete().eq('id', persona!.id);
  await admin.from('contactos').delete().like('nombre', `Prueba %${MARCA}`);
  console.log('\n  (datos de prueba retirados)');

  console.log(
    fallos === 0
      ? '\nQuien llama sabe por qué escribió esa persona.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nFALLÓ:', e instanceof Error ? e.message : e, '\n');
  process.exit(1);
});
