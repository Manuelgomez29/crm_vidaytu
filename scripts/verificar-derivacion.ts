/**
 * La derivación Eclipse → Bellamar: el flujo estructural del grupo.
 *
 * Eclipse no tiene ingreso residencial; cuando un caso suyo lo necesita, va a
 * Bellamar. Es la regla 3, y hasta hoy no se habia ejecutado NUNCA: cero filas
 * en `derivaciones`, ni en produccion ni en pruebas. El codigo estaba escrito y
 * sin estrenar, que es la peor combinacion: parece hecho.
 *
 * Lo que promete la regla, y que es lo que se comprueba aqui:
 *
 *   · NO se duplica el caso. Un caso, un registro. Si se duplicara, el mismo
 *     paciente contaria dos veces en el embudo y en los ingresos.
 *   · Queda historial de la derivacion, con origen y destino.
 *   · La ATRIBUCION es del centro de ORIGEN. Eclipse hizo el trabajo comercial
 *     aunque el tratamiento lo dé Bellamar; si el ingreso se le apuntara a
 *     Bellamar, el panel diria que Eclipse no vende y Eclipse dejaria de
 *     derivar. Es la comprobacion importante de todo este fichero.
 *
 * Se hace con un caso creado para esto y se borra al final, en staging.
 *
 *   npx tsx --env-file=.env.staging scripts/verificar-derivacion.ts
 */
import { createClient } from '@supabase/supabase-js';
import { centroDeAtribucion } from '../src/lib/casos';
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
  console.log('\nDerivación entre centros (regla 3)\n');

  const { count: dePrueba } = await admin
    .from('perfiles')
    .select('id', { count: 'exact', head: true })
    .like('email', '%@test.com');
  if ((dePrueba ?? 0) === 0) {
    console.log('  Esto no parece un entorno de pruebas: este script crea un caso.\n');
    process.exit(1);
  }

  const { data: centros } = await admin.from('centros').select('id, nombre, slug');
  const eclipse = (centros ?? []).find((c) => /eclipse/i.test(c.nombre));
  const bellamar = (centros ?? []).find((c) => /bellamar/i.test(c.nombre));
  if (!eclipse || !bellamar) {
    console.log('  Faltan Eclipse o Bellamar.\n');
    process.exit(1);
  }

  const { data: canal } = await admin.from('canales').select('id').limit(1).single();
  const { data: pipeline } = await admin
    .from('pipelines')
    .select('id')
    .eq('activo', true)
    .limit(1)
    .single();
  const { data: etapa } = await admin
    .from('pipeline_etapas')
    .select('id')
    .eq('pipeline_id', pipeline!.id)
    .order('orden')
    .limit(1)
    .single();

  if (!canal || !pipeline || !etapa) {
    console.log('  Falta el catálogo mínimo (canal, proceso o etapas).\n');
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  console.log('Se monta un caso de Eclipse:');

  await admin.from('leads').delete().eq('nombre', 'Derivacion de prueba');
  const { data: caso, error: alCrear } = await admin
    .from('leads')
    .insert({
      nombre: 'Derivacion de prueba',
      telefono: '+34600009999',
      centro_id: eclipse.id,
      canal_id: canal.id,
      pipeline_id: pipeline.id,
      etapa_id: etapa.id,
      estado: 'en_valoracion',
      quien_contacta: 'afectado',
    })
    .select('id, centro_id, estado')
    .single();
  if (alCrear || !caso) {
    console.log('  No se pudo crear el caso:', alCrear?.message, '\n');
    process.exit(1);
  }
  comprobar('el caso nace en Eclipse', caso.centro_id === eclipse.id);

  // ---------------------------------------------------------------------------
  console.log('\nSe deriva a Bellamar:');

  /*
   * Se hace lo mismo que hace la accion del servidor: apuntar la derivacion y
   * mover el caso. Si algun dia la accion cambiara, esto seguiria pasando y no
   * serviria de nada — por eso ademas se comprueba mas abajo que la accion de
   * verdad sigue haciendo estos dos pasos y en este orden.
   */
  await admin.from('derivaciones').insert({
    lead_id: caso.id,
    centro_origen_id: eclipse.id,
    centro_destino_id: bellamar.id,
    motivo: 'Necesita ingreso residencial',
  });
  await admin
    .from('leads')
    .update({ centro_id: bellamar.id, estado: 'derivado' })
    .eq('id', caso.id);

  const { count: cuantosCasos } = await admin
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('nombre', 'Derivacion de prueba');
  comprobar(
    'NO se ha duplicado el caso: sigue habiendo uno',
    cuantosCasos === 1,
    `hay ${cuantosCasos}`,
  );

  const { data: despues } = await admin
    .from('leads')
    .select('centro_id, estado')
    .eq('id', caso.id)
    .single();
  comprobar('el caso pasa a Bellamar', despues!.centro_id === bellamar.id);
  comprobar('y queda en estado «derivado»', despues!.estado === 'derivado');

  const { data: rastro } = await admin
    .from('derivaciones')
    .select('centro_origen_id, centro_destino_id, motivo')
    .eq('lead_id', caso.id)
    .single();
  comprobar(
    'queda el rastro de dónde salió y a dónde fue',
    rastro?.centro_origen_id === eclipse.id && rastro?.centro_destino_id === bellamar.id,
    rastro?.motivo ?? '',
  );

  // ---------------------------------------------------------------------------
  console.log('\nLa atribución, que es lo que sostiene el acuerdo:');

  const atribuido = await centroDeAtribucion(admin, caso.id);
  comprobar(
    'la conversión se atribuye a ECLIPSE, que lo trabajó',
    atribuido === eclipse.id,
    atribuido === bellamar.id
      ? 'se la está llevando Bellamar'
      : `centro ${(centros ?? []).find((c) => c.id === atribuido)?.nombre}`,
  );

  // Y de verdad, no solo el ayudante: se registra la conversion y se mira la fila.
  const { data: conversion } = await admin
    .from('conversiones')
    .insert({
      lead_id: caso.id,
      centro_id: atribuido!,
      importe_primer_pago: 3000,
      estado: 'validada',
    })
    .select('id, centro_id')
    .single();
  comprobar(
    'y la fila de la conversión lleva Eclipse dentro',
    conversion?.centro_id === eclipse.id,
  );

  /*
   * El contraste. Sin esto, un `centroDeAtribucion` que devolviera siempre el
   * primer centro de la lista pasaria la comprobacion de arriba.
   */
  const { data: sinDerivar } = await admin
    .from('leads')
    .insert({
      nombre: 'Derivacion de prueba (sin derivar)',
      telefono: '+34600009998',
      centro_id: bellamar.id,
      canal_id: canal.id,
      pipeline_id: pipeline.id,
      etapa_id: etapa.id,
      quien_contacta: 'afectado',
    })
    .select('id')
    .single();
  if (sinDerivar) {
    const suyo = await centroDeAtribucion(admin, sinDerivar.id);
    comprobar(
      'un caso SIN derivar se atribuye a su propio centro',
      suyo === bellamar.id,
      'si no, la regla estaría devolviendo siempre lo mismo',
    );
    await admin.from('leads').delete().eq('id', sinDerivar.id);
  }

  // ---------------------------------------------------------------------------
  console.log('\nQuién sigue viendo el caso después de derivarlo:');

  /*
   * Importa porque la derivacion CAMBIA el centro del caso. Quien tenia acceso
   * por ser de Eclipse y no de Bellamar deja de verlo, y eso no es un fallo:
   * es el muro funcionando. Lo que hay que confirmar es que quien SI tiene
   * Bellamar lo recibe, porque si no, el caso derivado no lo trabajaria nadie.
   */
  const comercial = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error: sinSesion } = await comercial.auth.signInWithPassword({
    email: 'equipo@test.com',
    password: 'vidaytu-dev-2026',
  });
  if (!sinSesion) {
    const { data: loVe } = await comercial
      .from('leads')
      .select('id')
      .eq('id', caso.id)
      .maybeSingle();
    comprobar('un comercial con Bellamar lo recibe y puede trabajarlo', !!loVe);
  } else {
    comprobar('hay sesión de comercial para comprobarlo', false, sinSesion.message);
  }

  const jefeHorizonte = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error: sinJefe } = await jefeHorizonte.auth.signInWithPassword({
    email: 'dir-horizonte@test.com',
    password: 'vidaytu-dev-2026',
  });
  if (!sinJefe) {
    const { data: loVe } = await jefeHorizonte
      .from('leads')
      .select('id')
      .eq('id', caso.id)
      .maybeSingle();
    comprobar('y la dirección de Horizonte sigue sin verlo, como antes', !loVe);
  }

  // ---------------------------------------------------------------------------
  console.log('\nLa acción del servidor hace lo mismo que se ha probado:');

  const codigo = (await import('node:fs')).readFileSync('src/app/leads/[id]/actions.ts', 'utf8');
  const cuerpo = codigo.split('export async function derivarLead')[1]?.split('\nexport ')[0] ?? '';
  comprobar(
    'apunta la derivación con origen y destino',
    /centro_origen_id[\s\S]{0,200}centro_destino_id/.test(cuerpo),
  );
  comprobar('mueve el caso y lo deja en «derivado»', /estado: 'derivado'/.test(cuerpo));
  comprobar(
    'no inserta un lead nuevo en ningún momento',
    !/from\('leads'\)[\s\S]{0,40}\.insert/.test(cuerpo),
  );
  comprobar(
    'y la conversión pregunta por el centro de atribución',
    /centroDeAtribucion\(supabase, leadId\)/.test(codigo),
  );

  // ---------------------------------------------------------------------------
  await admin.from('conversiones').delete().eq('lead_id', caso.id);
  await admin.from('derivaciones').delete().eq('lead_id', caso.id);
  await admin.from('leads').delete().eq('id', caso.id);
  console.log('\n  (el caso de prueba y su rastro, borrados)');

  console.log(
    fallos === 0
      ? '\nSe deriva sin duplicar, y el ingreso se le apunta a quien lo trabajó.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main();
