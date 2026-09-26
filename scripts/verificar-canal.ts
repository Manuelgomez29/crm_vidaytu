/**
 * El anexo de canales sociales: que entre lo que debe y no entre lo demás.
 *
 * Este endpoint es una URL pública que escribe en la base de datos a partir de
 * lo que le manden. Eso son tres riesgos a la vez —cualquiera puede inventarse
 * un lead, repetir uno viejo, o inundarnos— y los tres se comprueban aquí
 * contra la función de verdad, no leyendo el código:
 *
 *   1. La firma: válida pasa, manipulada no, vieja no, ausente no.
 *   2. La idempotencia: el mismo envío dos veces deja una fila, no dos.
 *   3. La identidad: el segundo evento actualiza al mismo, no duplica.
 *   4. La conservación: al vencer el plazo se vacía el CONTENIDO y queda la traza.
 *   5. El muro: un comercial no ve nada de esto.
 *
 *   npx tsx --env-file=.env.staging scripts/verificar-canal.ts
 */
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  firmaZeroChatsValida,
  identidadDesdeEvento,
  ingerirEvento,
  purgarContenidoVencido,
} from '../src/lib/canal';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

let fallos = 0;
const comprobar = (t: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK  ' : 'FALLA'}  ${t}${d ? ' — ' + d : ''}`);
  if (!ok) fallos++;
};

const SECRETO = 'clave-de-prueba-no-es-la-de-verdad';
const REF = 'verificacion-' + Date.now();

/** Un evento con la forma exacta que documenta ZeroChats. */
function eventoDePrueba(extra: Record<string, unknown> = {}) {
  return {
    id: REF,
    event: 'lead.created',
    createdAt: new Date().toISOString(),
    businessId: 'negocio-de-prueba',
    data: {
      lead: {
        id: `lead-${REF}`,
        name: 'Ada Lovelace',
        username: 'ada',
        platform: 'INSTAGRAM',
        externalId: '17841400000000000',
        email: null as string | null,
        phone: null as string | null,
        state: 'IN_PROGRESS',
        tags: ['interesado'],
        createdAt: new Date().toISOString(),
      },
      ...extra,
    },
  };
}

function cabecerasFirmadas(cuerpo: string, segundos = Math.floor(Date.now() / 1000)) {
  const firma = crypto
    .createHmac('sha256', SECRETO)
    .update(`${segundos}.${cuerpo}`, 'utf8')
    .digest('hex');
  return new Headers({
    'x-zerochats-timestamp': String(segundos),
    'x-zerochats-signature': `sha256=${firma}`,
    'x-zerochats-event': 'lead.created',
    'x-zerochats-delivery': REF,
  });
}

async function main() {
  console.log('\nAnexo de canales sociales\n');

  // ---------------------------------------------------------------------------
  console.log('La firma distingue lo suyo de lo ajeno:');

  const cuerpo = JSON.stringify(eventoDePrueba());
  comprobar('una firma correcta pasa', firmaZeroChatsValida(cuerpo, cabecerasFirmadas(cuerpo), SECRETO));

  comprobar(
    'el cuerpo manipulado NO pasa',
    !firmaZeroChatsValida(cuerpo.replace('Ada', 'Eva'), cabecerasFirmadas(cuerpo), SECRETO),
    'es el caso que justifica la firma: alguien que adivina la URL',
  );

  comprobar(
    'otra clave NO pasa',
    !firmaZeroChatsValida(cuerpo, cabecerasFirmadas(cuerpo), 'otra-clave'),
  );

  /*
   * La marca de tiempo entra en la firma justo para esto: sin ella, una copia
   * válida capturada hoy seguiría valiendo dentro de un año.
   */
  const vieja = Math.floor(Date.now() / 1000) - 3600;
  comprobar(
    'una petición de hace una hora NO pasa, aunque venga bien firmada',
    !firmaZeroChatsValida(cuerpo, cabecerasFirmadas(cuerpo, vieja), SECRETO),
  );

  const sinFirma = new Headers({ 'x-zerochats-timestamp': String(Math.floor(Date.now() / 1000)) });
  comprobar('sin cabecera de firma NO pasa', !firmaZeroChatsValida(cuerpo, sinFirma, SECRETO));

  // ---------------------------------------------------------------------------
  console.log('\nLo que entra, entra una vez:');

  const evento = eventoDePrueba();
  const identidad = identidadDesdeEvento(evento);
  comprobar('del evento sale una identidad', !!identidad, identidad?.ref_sistema ?? '');
  comprobar(
    'sin teléfono, que es el caso normal',
    identidad?.telefono === null,
    'el CRM lo exige; aquí no puede exigirse',
  );
  comprobar(
    'el identificador de Instagram se guarda como texto',
    typeof identidad?.ref_plataforma === 'string',
    'no cabe en un número de JSON sin perder precisión',
  );

  const primera = await ingerirEvento(admin, {
    sistema: 'zerochats',
    evento: 'lead.created',
    entregaRef: REF,
    payload: evento,
    identidad,
  });
  comprobar('el primer envío se guarda', primera.estado === 'guardado');

  const repetida = await ingerirEvento(admin, {
    sistema: 'zerochats',
    evento: 'lead.created',
    entregaRef: REF,
    payload: evento,
    identidad,
  });
  comprobar(
    'el reintento del MISMO envío no crea otra fila',
    repetida.estado === 'duplicado',
    'ellos entregan «al menos una vez»: esto pasa de verdad',
  );

  const { count: filas } = await admin
    .from('canal_eventos')
    .select('id', { count: 'exact', head: true })
    .eq('entrega_ref', REF);
  comprobar('hay exactamente un evento con esa referencia', filas === 1, `${filas}`);

  // ---------------------------------------------------------------------------
  console.log('\nLa identidad se actualiza, no se duplica:');

  const segundo = {
    ...eventoDePrueba({ addedTags: ['precio'] }),
    id: REF + '-b',
    event: 'lead.tagged',
  };
  segundo.data.lead.tags = ['interesado', 'precio'];
  segundo.data.lead.state = 'LEAD';
  segundo.data.lead.phone = '+34600111222';

  await ingerirEvento(admin, {
    sistema: 'zerochats',
    evento: 'lead.tagged',
    entregaRef: REF + '-b',
    payload: segundo,
    identidad: identidadDesdeEvento(segundo),
  });

  const { data: identidades } = await admin
    .from('canal_identidades')
    .select('id, estado, etiquetas, telefono')
    .eq('ref_sistema', `lead-${REF}`);

  comprobar('sigue habiendo una sola identidad', (identidades ?? []).length === 1);
  comprobar('con la etapa nueva', identidades?.[0]?.estado === 'LEAD', identidades?.[0]?.estado ?? '');
  comprobar(
    'y la lista completa de etiquetas, no solo la añadida',
    (identidades?.[0]?.etiquetas ?? []).length === 2,
    (identidades?.[0]?.etiquetas ?? []).join(', '),
  );
  comprobar(
    'el teléfono que llega tarde se guarda normalizado',
    identidades?.[0]?.telefono === '+34600111222',
    'así casará con el directorio el día del volcado',
  );

  // ---------------------------------------------------------------------------
  console.log('\nAl vencer el plazo se vacía el contenido, no la traza:');

  const hace200dias = new Date(Date.now() - 200 * 86_400_000).toISOString();
  await admin.from('canal_eventos').update({ recibido_at: hace200dias }).eq('entrega_ref', REF);

  const purgados = await purgarContenidoVencido(admin);
  comprobar('la purga alcanza al evento vencido', purgados >= 1, `${purgados} evento(s)`);

  const { data: purgado } = await admin
    .from('canal_eventos')
    .select('payload, payload_purgado_at, sistema, evento, entrega_ref, identidad_id')
    .eq('entrega_ref', REF)
    .maybeSingle();

  comprobar('el contenido se ha ido', purgado?.payload === null);
  comprobar('y la traza se queda', !!purgado?.identidad_id && !!purgado?.evento);
  comprobar('con la fecha en que se vació', !!purgado?.payload_purgado_at);

  const { data: reciente } = await admin
    .from('canal_eventos')
    .select('payload')
    .eq('entrega_ref', REF + '-b')
    .maybeSingle();
  comprobar('lo reciente no se toca', reciente?.payload !== null);

  // ---------------------------------------------------------------------------
  console.log('\nEl muro:');

  /*
   * Sin sesión, primero: es el caso que vale en cualquier entorno y el que de
   * verdad importa, porque la clave pública viaja en el navegador de todo el
   * mundo. Las políticas son para `authenticated`; quien no lo esté no tiene
   * ninguna, y sin política no se ve nada.
   */
  const deLaCalle = createClient(url, anon, { auth: { persistSession: false } });
  const { data: se } = await deLaCalle.from('canal_eventos').select('id').limit(5);
  const { data: si } = await deLaCalle.from('canal_identidades').select('id').limit(5);
  comprobar(
    'sin sesión no se ve un solo evento',
    (se ?? []).length === 0,
    'la clave pública está en el navegador de cualquiera',
  );
  comprobar('ni una sola identidad', (si ?? []).length === 0);

  /*
   * Y con una sesión de comercial, si este entorno tiene una. En producción no
   * la hay —las cuentas de prueba se borraron antes del lanzamiento— y eso no
   * es un fallo: la comprobación se salta y se dice.
   */
  const comercial = createClient(url, anon, { auth: { persistSession: false } });
  const { error: eLogin } = await comercial.auth.signInWithPassword({
    email: 'equipo@test.com',
    password: 'vidaytu-dev-2026',
  });
  if (eLogin) {
    console.log('  —     sin cuenta de comercial en este entorno: esa parte no se prueba aquí');
  } else {
    const { data: ve } = await comercial.from('canal_eventos').select('id').limit(5);
    const { data: vi } = await comercial.from('canal_identidades').select('id').limit(5);
    comprobar(
      'un comercial tampoco ve los eventos',
      (ve ?? []).length === 0,
      'son conversaciones sobre consumo: categoría especial',
    );
    comprobar('ni las identidades', (vi ?? []).length === 0);
  }

  // ---------------------------------------------------------------------------
  await admin.from('canal_eventos').delete().like('entrega_ref', `${REF}%`);
  await admin.from('canal_identidades').delete().eq('ref_sistema', `lead-${REF}`);
  console.log('\n  (datos de prueba retirados)');

  console.log(
    fallos === 0
      ? '\nEntra lo suyo, una sola vez, y no lo ve quien no debe.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main();
