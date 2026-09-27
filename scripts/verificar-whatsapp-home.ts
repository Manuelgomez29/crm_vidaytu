/**
 * El embudo de HOME desemboca en un WhatsApp, y el CRM lo reconoce por su número.
 *
 * El plan es llevar Instagram, TikTok y Facebook a un único WhatsApp de Método
 * HOME. Eso cambia cuál es la identidad de la persona: ya no es un usuario de
 * Instagram, es el teléfono. Y en un canal de WhatsApp ZeroChats manda los
 * dígitos del número en `externalId`, sin prefijo; `lead.phone` es solo lo que
 * la persona haya dicho en la conversación y puede venir vacío.
 *
 * Sin esto, cada persona del embudo entraba con el teléfono en blanco y su
 * número guardado como texto suelto, sin emparejar nunca con su ficha del
 * directorio —que vive en E.164—. Con 235 conversaciones al mes, en un mes son
 * doscientas identidades sueltas.
 *
 * Se comprueba:
 *
 *   1. Que los dígitos de un canal se convierten en E.164, incluidos los
 *      números de fuera de España: el público de estas cuentas es internacional.
 *   2. Que un lead de WhatsApp SIN `phone` entra con su teléfono puesto.
 *   3. Que el puente lo enlaza con la persona del directorio por el número,
 *      SIN pasar por HighLevel.
 *   4. Y que si ese número no está en el directorio, la identidad se queda
 *      suelta: aquí no se inventa a nadie.
 *
 *   npx tsx --env-file=.env.staging scripts/verificar-whatsapp-home.ts
 */
import { createClient } from '@supabase/supabase-js';
import { identidadDesdeEvento, ingerirEvento } from '../src/lib/canal';
import { enlazarIdentidadesSociales } from '../src/lib/puente-identidades';
import { telefonoDeCanal } from '../src/lib/telefonos';
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

const MARCA = 'wa-' + Date.now();
/** Un número uruguayo, como los que de verdad escriben a estas cuentas. */
const DIGITOS_FUERA = '59891' + String(Date.now()).slice(-6);
const DIGITOS_ES = '6' + String(Date.now()).slice(-8);

function evento(id: string, digitos: string, conPhone: string | null) {
  return {
    id,
    event: 'lead.created',
    createdAt: new Date().toISOString(),
    businessId: 'negocio-prueba',
    data: {
      lead: {
        id: 'lead-' + id,
        name: 'Quien escribe por WhatsApp',
        username: null as string | null,
        platform: 'WHATSAPP',
        externalId: digitos,
        email: null as string | null,
        phone: conPhone,
        state: 'IN_PROGRESS',
        tags: [],
        createdAt: new Date().toISOString(),
      },
    },
  };
}

async function main() {
  console.log('\nEl WhatsApp de HOME, reconocido por su número\n');

  // ---------------------------------------------------------------------------
  console.log('Los dígitos de un canal se vuelven E.164:');

  comprobar('nueve cifras españolas llevan +34', telefonoDeCanal('600111222') === '+34600111222');
  comprobar(
    'un número de fuera se respeta tal cual',
    telefonoDeCanal('59891234567') === '+59891234567',
    'sin esto se perdía todo el público de fuera de España',
  );
  comprobar('el 00 de marcar se quita', telefonoDeCanal('0034600111222') === '+34600111222');
  comprobar('y lo que no es un número, no pasa', telefonoDeCanal('12') === null);

  // ---------------------------------------------------------------------------
  console.log('\nUn lead de WhatsApp sin «phone» entra con su teléfono:');

  const e1 = evento(MARCA + '-1', DIGITOS_FUERA, null);
  const i1 = identidadDesdeEvento(e1);
  comprobar(
    'el teléfono sale del externalId',
    i1?.telefono === '+' + DIGITOS_FUERA,
    String(i1?.telefono),
  );
  comprobar('y la plataforma queda anotada', i1?.plataforma === 'whatsapp');

  await ingerirEvento(admin, {
    sistema: 'zerochats',
    evento: 'lead.created',
    entregaRef: MARCA + '-1',
    payload: e1,
    identidad: i1,
  });

  const leer = async (ref: string) => {
    const { data, error } = await admin
      .from('canal_identidades')
      .select('telefono, contacto_id, plataforma')
      .eq('ref_sistema', 'lead-' + ref)
      .single();
    if (error) throw new Error('leyendo la identidad: ' + error.message);
    return data;
  };

  const guardada = await leer(MARCA + '-1');
  comprobar('y se guarda en E.164', guardada.telefono === '+' + DIGITOS_FUERA, String(guardada.telefono));

  // ---------------------------------------------------------------------------
  console.log('\nEl puente lo une con su persona por el número, sin HighLevel:');

  comprobar('antes del puente, suelta', guardada.contacto_id === null);

  /*
   * La persona ya está en el directorio con ese número, y NO hay ninguna ficha
   * de HighLevel en el espejo para ella: si se enlaza, es por el teléfono.
   */
  const { data: persona, error: eP } = await admin
    .from('contactos')
    .insert({
      nombre: 'PRUEBA WhatsApp ' + MARCA,
      telefono: '+' + DIGITOS_FUERA,
      origen: 'highlevel',
    })
    .select('id')
    .single();
  if (eP) throw new Error('sembrando la persona: ' + eP.message);

  const r = await enlazarIdentidadesSociales(admin);
  const tras = await leer(MARCA + '-1');
  comprobar(
    'el puente la enlaza por teléfono',
    tras.contacto_id === persona.id,
    JSON.stringify(r),
  );

  // ---------------------------------------------------------------------------
  console.log('\nY si ese número no está en el directorio, se queda suelta:');

  const e2 = evento(MARCA + '-2', DIGITOS_ES, null);
  await ingerirEvento(admin, {
    sistema: 'zerochats',
    evento: 'lead.created',
    entregaRef: MARCA + '-2',
    payload: e2,
    identidad: identidadDesdeEvento(e2),
  });
  await enlazarIdentidadesSociales(admin);
  const sola = await leer(MARCA + '-2');
  comprobar(
    'sin persona que cuadre, sigue suelta',
    sola.contacto_id === null,
    'el directorio tiene un solo responsable de escribir en él, y no es el puente',
  );
  comprobar(
    'pero con su número ya puesto, para la próxima pasada',
    sola.telefono === '+34' + DIGITOS_ES.slice(0),
    String(sola.telefono),
  );

  // ---------------------------------------------------------------------------
  await admin.from('canal_eventos').delete().like('entrega_ref', `${MARCA}%`);
  await admin.from('canal_identidades').delete().like('ref_sistema', `%${MARCA}%`);
  await admin.from('contactos').delete().like('nombre', `PRUEBA WhatsApp ${MARCA}`);
  console.log('\n  (datos de prueba retirados)');

  console.log(
    fallos === 0
      ? '\nQuien escribe al WhatsApp de HOME llega a su ficha.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nFALLÓ:', e instanceof Error ? e.message : e, '\n');
  process.exit(1);
});
