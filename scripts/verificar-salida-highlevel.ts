/**
 * Del CRM a HighLevel, sin rebotes y sin contar de más.
 *
 * Durante el piloto el equipo de Método HOME trabaja en HighLevel. Una persona
 * que entre POR AQUÍ —el formulario de la landing de HOME, una llamada, un
 * prescriptor— allí no existe, y si el CRM no la empuja, nadie la llama.
 *
 * Lo peligroso de un envío así son dos cosas, y las dos se comprueban:
 *
 *   · EL REBOTE. La copia nocturna trae personas DE HighLevel. Si el envío no
 *     las excluye, cada noche se devuelven las mismas y se duplican solas.
 *   · EL EXCESO. A HighLevel no se le mandan los leads de los centros, ni un
 *     campo más de los que hacen falta para llamar: es una herramienta de
 *     terceros, de pago y provisional, y esto son datos de salud (regla 11).
 *
 * ESCRIBE EN EL HIGHLEVEL DE VERDAD, porque no hay cuenta de pruebas. Crea un
 * contacto marcado como prueba y LO BORRA al terminar; si el borrado falla, lo
 * dice con su identificador para que se pueda quitar a mano.
 *
 *   HIGHLEVEL_TOKEN=... HIGHLEVEL_LOCATION_ID=... \
 *     npx tsx --env-file=.env.staging scripts/verificar-salida-highlevel.ts
 */
import { createClient } from '@supabase/supabase-js';
import { enviarPendientesAHighLevel } from '../src/lib/highlevel-salida';
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

const MARCA = String(Date.now()).slice(-7);
const NOMBRE = (q: string) => `PRUEBA salida ${q} ${MARCA}`;
const creadosEnHighLevel: string[] = [];

async function borrarDeHighLevel(id: string) {
  const r = await fetch(`https://services.leadconnectorhq.com/contacts/${id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${process.env.HIGHLEVEL_TOKEN}`,
      Version: '2021-07-28',
      Accept: 'application/json',
    },
  });
  return r.ok;
}

async function main() {
  console.log('\nDel CRM a HighLevel\n');

  const { data: home, error: eH } = await admin
    .from('recorridos')
    .select('id')
    .eq('slug', 'metodo-home')
    .maybeSingle();
  if (eH) throw new Error('recorridos: ' + eH.message);
  if (!home) throw new Error('este entorno no tiene el recorrido «metodo-home»');

  // --- Los cuatro casos, sembrados a la vez ---------------------------------
  const { data: sembrados, error: eS } = await admin
    .from('contactos')
    .insert([
      // 1. La que toca enviar: de HOME, con teléfono.
      {
        nombre: NOMBRE('normal'),
        telefono: '+34600' + MARCA.slice(-6),
        recorrido_id: home.id,
        origen: 'formulario',
      },
      // 2. De HOME pero sin forma de contactarla.
      { nombre: NOMBRE('sin datos'), recorrido_id: home.id, origen: 'manual' },
      // 3. De HOME y venida DE HighLevel: no debe volver.
      {
        nombre: NOMBRE('vino de alli'),
        telefono: '+34601' + MARCA.slice(-6),
        recorrido_id: home.id,
        origen: 'highlevel',
      },
      // 4. De un centro: no se mezcla.
      { nombre: NOMBRE('de centro'), telefono: '+34602' + MARCA.slice(-6), origen: 'formulario' },
    ])
    .select('id, nombre');
  if (eS) throw new Error('sembrando: ' + eS.message);

  const de = (q: string) => sembrados.find((c) => c.nombre === NOMBRE(q))!.id;

  // La tercera ya tiene su identidad de HighLevel, como las de la copia nocturna.
  const refFalsa = 'HL-PRUEBA-' + MARCA;
  const { error: eI } = await admin.from('canal_identidades').insert({
    sistema: 'highlevel',
    plataforma: 'highlevel',
    ref_sistema: refFalsa,
    ref_highlevel: refFalsa,
    contacto_id: de('vino de alli'),
  });
  if (eI) throw new Error('sembrando la identidad: ' + eI.message);

  // ---------------------------------------------------------------------------
  console.log('La primera pasada:');

  const r1 = await enviarPendientesAHighLevel(admin);
  if (r1.saltada) throw new Error(`no se pudo enviar: ${r1.saltada}`);
  console.log('    ' + JSON.stringify(r1));

  const recibo = async (contactoId: string) => {
    const { data, error } = await admin
      .from('canal_identidades')
      .select('ref_sistema')
      .eq('sistema', 'highlevel')
      .eq('contacto_id', contactoId)
      .maybeSingle();
    if (error) throw new Error('leyendo el recibo: ' + error.message);
    return data?.ref_sistema ?? null;
  };

  const refNormal = await recibo(de('normal'));
  if (refNormal) creadosEnHighLevel.push(refNormal);
  comprobar('la persona de HOME llega a HighLevel', !!refNormal, String(refNormal));
  comprobar('y queda su recibo, que es lo que evita mandarla dos veces', r1.creados >= 1);

  comprobar(
    'la que no tiene teléfono ni correo se cuenta y se deja',
    r1.sinDatoDeContacto === 1 && (await recibo(de('sin datos'))) === null,
    'sin uno de los dos, HighLevel crearía una ficha imposible de reconciliar',
  );

  comprobar(
    'la que vino DE HighLevel no se devuelve',
    (await recibo(de('vino de alli'))) === refFalsa,
    'si rebotara, cada noche se duplicarían solas',
  );

  comprobar(
    'y la de un centro no se mezcla',
    (await recibo(de('de centro'))) === null,
    'a HighLevel solo van las de Método HOME',
  );

  comprobar('sin errores', r1.errores === 0, JSON.stringify(r1));

  // ---------------------------------------------------------------------------
  console.log('\nY repetirlo no manda nada:');

  const r2 = await enviarPendientesAHighLevel(admin);
  comprobar(
    'segunda pasada en vacío',
    r2.creados === 0 && r2.actualizados === 0,
    JSON.stringify(r2),
  );

  // ---------------------------------------------------------------------------
  for (const id of creadosEnHighLevel) {
    const ok = await borrarDeHighLevel(id);
    console.log(
      ok
        ? `\n  (retirado de HighLevel: ${id})`
        : `\n  AVISO: NO se pudo borrar de HighLevel el contacto ${id} — quítalo a mano`,
    );
    if (!ok) fallos++;
  }
  await admin.from('canal_identidades').delete().like('ref_sistema', `HL-PRUEBA-${MARCA}`);
  for (const id of creadosEnHighLevel) {
    await admin.from('canal_identidades').delete().eq('ref_sistema', id);
  }
  await admin.from('contactos').delete().like('nombre', `PRUEBA salida %${MARCA}`);
  console.log('  (datos de prueba retirados del CRM)');

  /*
   * El fallo más probable aquí no es del código: es que la integración privada
   * de HighLevel se creara solo con permisos de lectura. Decirlo ahorra una
   * tarde de buscar en el sitio equivocado.
   */
  if (fallos > 0 && (r1.detalles ?? []).some((d) => d.includes('not authorized for this scope'))) {
    console.log(
      '\n  LA CAUSA NO ESTÁ EN EL CÓDIGO: al token de HighLevel le falta el permiso\n' +
        '  «contacts.write» (nivel subcuenta). Se añade editando la integración privada\n' +
        '  en HighLevel; si al guardar te da un token nuevo, hay que actualizarlo en Vercel.',
    );
  }

  console.log(
    fallos === 0
      ? '\nEl equipo de HOME ve lo que entra por el CRM, y nada más.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  for (const id of creadosEnHighLevel) {
    const ok = await borrarDeHighLevel(id);
    if (!ok) console.error(`  AVISO: quedó en HighLevel el contacto ${id}`);
  }
  console.error('\nFALLÓ:', e instanceof Error ? e.message : e, '\n');
  process.exit(1);
});
