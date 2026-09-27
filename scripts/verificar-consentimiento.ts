/**
 * El consentimiento se recoge en la puerta, o se pierde para siempre.
 *
 * Las webs YA preguntan «¿acepta recibir información?» y hasta ahora esa
 * respuesta se tiraba: todo el mundo entraba con `false`. Es el lado seguro,
 * pero es irrecuperable —un consentimiento no se reconstruye después— y sin él
 * el email marketing nacería sin nadie a quien escribir legalmente.
 *
 * Lo que se comprueba, que son cuatro cosas distintas:
 *
 *   1. Un sí explícito queda con su FECHA y su ORIGEN (regla 5). Sin poder decir
 *      dónde lo aceptó, el consentimiento no demuestra nada.
 *   2. Sin campo, o con un «no», NO consiente. Ausencia no es permiso.
 *   3. A quien ya existía sin consentimiento y ahora dice sí, se le concede.
 *   4. Y a quien ya lo tenía, un formulario posterior sin la casilla NO se lo
 *      quita: para darse de baja está el enlace de baja, no un formulario.
 *
 * Y de paso el fallo que esto destapó: si la persona ya estaba en el directorio
 * con teléfono y sin caso, la ingesta respondía 500 —el teléfono es único— y la
 * web habría reintentado en bucle contra un error que no se arregla solo.
 *
 *   npx tsx --env-file=.env.staging scripts/verificar-consentimiento.ts
 *   (con el servidor levantado contra staging; BASE para otra dirección)
 */
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/database.types';

const BASE = (process.env.BASE ?? 'http://localhost:3000').replace(/\/+$/, '');
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

const MARCA = Date.now().toString().slice(-7);
const TEL = (n: number) => `+3460055${MARCA.slice(-2)}${n}`;
const huella = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

let token = '';
let fuenteId = '';

async function enviar(cuerpo: Record<string, unknown>) {
  const r = await fetch(`${BASE}/api/formularios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-fuente-token': token },
    body: JSON.stringify(cuerpo),
  });
  return { estado: r.status, cuerpo: (await r.json()) as { accion?: string; error?: string } };
}

async function persona(telefono: string) {
  const { data, error } = await admin
    .from('contactos')
    .select(
      'id, nombre, consentimiento_marketing, consentimiento_marketing_at, consentimiento_marketing_origen',
    )
    .eq('telefono', telefono)
    .maybeSingle();
  if (error) throw new Error('leyendo la persona: ' + error.message);
  return data;
}

async function main() {
  console.log(`\nEl consentimiento se recoge en la puerta  (${BASE})\n`);

  const [{ data: centro }, { data: canal }] = await Promise.all([
    admin.from('centros').select('id').eq('es_bandeja_grupo', false).limit(1).single(),
    admin.from('canales').select('id').eq('slug', 'formulario_web').single(),
  ]);

  token = 'vft_' + crypto.randomBytes(24).toString('base64url');
  const { data: fuente, error: eF } = await admin
    .from('fuentes_captacion')
    .insert({
      slug: `prueba-consent-${MARCA}`,
      nombre: `PRUEBA consentimiento ${MARCA}`,
      token_hash: huella(token),
      centro_id: centro!.id,
      canal_id: canal!.id,
    })
    .select('id, slug')
    .single();
  if (eF) throw new Error('creando la fuente: ' + eF.message);
  fuenteId = fuente.id;

  // ---------------------------------------------------------------------------
  console.log('Un sí explícito queda con fecha y origen:');

  const r1 = await enviar({
    nombre: `PRUEBA Consiente ${MARCA}`,
    telefono: TEL(1),
    email: `consiente-${MARCA}@example.com`,
    consentimiento_marketing: '1',
    landing_url: 'https://bellamaradicciones.com/contacto',
    origen_ref: `c-${MARCA}-1`,
  });
  comprobar('la ingesta lo acepta', r1.estado < 300, r1.estado + ' ' + JSON.stringify(r1.cuerpo));

  const p1 = await persona(TEL(1));
  comprobar('consiente', p1?.consentimiento_marketing === true);
  comprobar('con fecha', !!p1?.consentimiento_marketing_at);
  comprobar(
    'y diciendo DÓNDE lo aceptó',
    (p1?.consentimiento_marketing_origen ?? '').includes(fuente.slug) &&
      (p1?.consentimiento_marketing_origen ?? '').includes('bellamaradicciones.com'),
    p1?.consentimiento_marketing_origen ?? '(vacío)',
  );

  // ---------------------------------------------------------------------------
  console.log('\nLa ausencia no es permiso:');

  await enviar({ nombre: `PRUEBA Calla ${MARCA}`, telefono: TEL(2), origen_ref: `c-${MARCA}-2` });
  const p2 = await persona(TEL(2));
  comprobar('sin la casilla, no consiente', p2?.consentimiento_marketing === false);
  comprobar('y no se inventa una fecha', p2?.consentimiento_marketing_at === null);

  await enviar({
    nombre: `PRUEBA Dice no ${MARCA}`,
    telefono: TEL(3),
    consentimiento_marketing: 'no',
    origen_ref: `c-${MARCA}-3`,
  });
  const p3 = await persona(TEL(3));
  comprobar('y un «no» tampoco', p3?.consentimiento_marketing === false);

  // ---------------------------------------------------------------------------
  console.log('\nQuien ya estaba en el directorio, sin caso:');

  /*
   * Este es el 500 que había: la persona existe con teléfono y sin caso —como la
   * gente traída de HighLevel— y el insert chocaba contra el teléfono único.
   */
  const { data: yaEstaba, error: eY } = await admin
    .from('contactos')
    .insert({ nombre: `PRUEBA Ya estaba ${MARCA}`, telefono: TEL(4), origen: 'highlevel' })
    .select('id')
    .single();
  if (eY) throw new Error('sembrando la persona: ' + eY.message);

  const r4 = await enviar({
    nombre: `PRUEBA Ya estaba ${MARCA}`,
    telefono: TEL(4),
    consentimiento_marketing: 'si',
    origen_ref: `c-${MARCA}-4`,
  });
  comprobar(
    'la ingesta NO revienta',
    r4.estado < 300,
    `${r4.estado} ${JSON.stringify(r4.cuerpo)} · antes: 500, y la web reintentando en bucle`,
  );

  const p4 = await persona(TEL(4));
  comprobar('y reutiliza a la misma persona', p4?.id === yaEstaba.id, 'la persona es global (regla 5)');
  comprobar('a la que ahora se le concede el consentimiento', p4?.consentimiento_marketing === true);

  // ---------------------------------------------------------------------------
  console.log('\nY lo concedido no se quita por un formulario:');

  await enviar({
    nombre: `PRUEBA Ya estaba ${MARCA}`,
    telefono: TEL(4),
    origen_ref: `c-${MARCA}-5`,
  });
  const p5 = await persona(TEL(4));
  comprobar(
    'sigue consintiendo',
    p5?.consentimiento_marketing === true,
    'para darse de baja está el enlace de baja, no la ausencia de una casilla',
  );
  comprobar(
    'y conserva la fecha original',
    p5?.consentimiento_marketing_at === p4?.consentimiento_marketing_at,
    'si se reescribiera se perdería cuándo lo dijo de verdad',
  );

  // ---------------------------------------------------------------------------
  const { data: leads } = await admin.from('leads').select('id').like('nombre', `PRUEBA %${MARCA}`);
  for (const l of leads ?? []) {
    for (const t of ['tareas', 'actividades', 'lead_contactos'] as const) {
      await admin.from(t).delete().eq('lead_id', l.id);
    }
    await admin.from('leads').delete().eq('id', l.id);
  }
  await admin.from('contactos').delete().like('nombre', `PRUEBA %${MARCA}`);
  await admin.from('fuentes_captacion').delete().eq('id', fuenteId);
  console.log('\n  (datos de prueba retirados)');

  console.log(
    fallos === 0
      ? '\nLo que la gente acepta queda escrito, con fecha y con origen.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  if (fuenteId) await admin.from('fuentes_captacion').delete().eq('id', fuenteId);
  console.error('\nFALLÓ:', e instanceof Error ? e.message : e, '\n');
  process.exit(1);
});
