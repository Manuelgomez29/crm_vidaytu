/**
 * Un flujo hace lo que dice, con quien debe, una sola vez.
 *
 * El motor de flujos es lo primero de la plataforma que ACTÚA sobre una persona
 * sin que nadie pulse nada: le encola un correo, le pone una etiqueta, le crea
 * una tarea al comercial. Por eso lo que se comprueba aquí no es que funcione
 * en el caso bonito, sino que respete sus límites:
 *
 *   1. Activar un flujo NO inscribe al histórico: la marca de agua empieza en
 *      «ahora». Quien cumplía el disparador antes de activarlo no entra.
 *   2. Quien cumple el disparador después, entra UNA vez. Repetir la pasada no
 *      lo inscribe ni le envía nada dos veces.
 *   3. Las barreras del email marketing mandan: sin consentimiento, fuera del
 *      flujo; con consentimiento pero sin correo real (los sintéticos
 *      @instagram.com), el correo se omite y el flujo SIGUE —puede que el
 *      siguiente paso sea una tarea al comercial, que es justo lo que toca—.
 *   4. El correo no lo manda el flujo: lo encola como destinatario de la
 *      campaña perpetua del paso, que hereda pie de baja, píxeles y cinturón
 *      de centro.
 *   5. Una condición ramifica de verdad: el mismo flujo lleva a una persona
 *      por el «sí» y a otra por el «no».
 *   6. Cada cosa que pasa queda escrita en los eventos de la inscripción.
 *
 *   npx tsx --env-file=.env.staging scripts/verificar-flujos.ts
 */
import { createClient } from '@supabase/supabase-js';
import { ejecutarFlujos } from '../src/lib/flujos';
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

const MARCA = 'flujo-' + Date.now();
const TEL = (n: number) => `+3460077${String(Date.now()).slice(-4)}${n}`;

async function main() {
  console.log('\nUn flujo hace lo que dice, con quien debe, una sola vez\n');

  // --- Catálogos ---------------------------------------------------------
  const [{ data: centro }, { data: canal }, { data: pipe }] = await Promise.all([
    admin.from('centros').select('id').eq('slug', 'bellamar').single(),
    admin.from('canales').select('id').eq('slug', 'otro').single(),
    admin.from('pipelines').select('id').eq('es_predeterminado', true).limit(1).single(),
  ]);
  const { data: etapa } = await admin
    .from('pipeline_etapas')
    .select('id')
    .eq('pipeline_id', pipe!.id)
    .order('orden')
    .limit(1)
    .single();

  // --- Etiquetas: la que dispara, la que marca «seguida», la «vip» de la condición
  const { data: etiquetas, error: eE } = await admin
    .from('etiquetas')
    .insert([
      { nombre: `dispara ${MARCA}`, color: '#384B71' },
      { nombre: `seguida ${MARCA}`, color: '#2F9160' },
      { nombre: `vip ${MARCA}`, color: '#C08427' },
    ])
    .select('id, nombre');
  if (eE) throw new Error('etiquetas: ' + eE.message);
  const et = (q: string) => etiquetas!.find((e) => e.nombre.startsWith(q))!.id;

  // --- Una plantilla limpia (sin términos clínicos) ------------------------
  const { data: plantilla, error: eP } = await admin
    .from('plantillas_email')
    .insert({
      nombre: `Guía ${MARCA}`,
      asunto: 'Una guía que te puede ayudar',
      cuerpo_texto: 'Hola {nombre}, te mandamos la guía que comentamos. Un saludo.',
    })
    .select('id')
    .single();
  if (eP) throw new Error('plantilla: ' + eP.message);

  // --- Cuatro personas, cada una con un caso en Bellamar (el cinturón) -----
  const personas = [
    { clave: 'A', nombre: `PRUEBA A ${MARCA}`, email: `a-${MARCA}@example.com`, consiente: true, vip: true },
    { clave: 'B', nombre: `PRUEBA B ${MARCA}`, email: `b_${MARCA}@instagram.com`, consiente: true, vip: false },
    { clave: 'C', nombre: `PRUEBA C ${MARCA}`, email: `c-${MARCA}@example.com`, consiente: false, vip: false },
    { clave: 'F', nombre: `PRUEBA F ${MARCA}`, email: `f-${MARCA}@example.com`, consiente: true, vip: false },
    { clave: 'D', nombre: `PRUEBA D ${MARCA}`, email: `d-${MARCA}@example.com`, consiente: true, vip: false },
  ];
  const ids: Record<string, string> = {};
  for (const [i, p] of personas.entries()) {
    const { data: c, error } = await admin
      .from('contactos')
      .insert({
        nombre: p.nombre,
        telefono: TEL(i),
        email: p.email,
        consentimiento_marketing: p.consiente,
        consentimiento_marketing_at: p.consiente ? new Date().toISOString() : null,
        consentimiento_marketing_origen: p.consiente ? 'prueba' : null,
      })
      .select('id')
      .single();
    if (error) throw new Error(`persona ${p.clave}: ` + error.message);
    ids[p.clave] = c.id;

    const { data: lead } = await admin
      .from('leads')
      .insert({
        centro_id: centro!.id,
        pipeline_id: pipe!.id,
        etapa_id: etapa!.id,
        nombre: p.nombre,
        telefono: TEL(i),
        canal_id: canal!.id,
      })
      .select('id')
      .single();
    await admin
      .from('lead_contactos')
      .insert({ lead_id: lead!.id, contacto_id: c.id, tipo: 'afectado', es_principal: true });
    if (p.vip) await admin.from('contacto_etiquetas').insert({ contacto_id: c.id, etiqueta_id: et('vip') });
  }

  // D cumple el disparador ANTES de que el flujo se active.
  await admin.from('contacto_etiquetas').insert({ contacto_id: ids.D, etiqueta_id: et('dispara') });

  // --- El flujo: email → espera 0 h → ¿vip? sí: tarea · no: fin -----------
  const { data: flujo, error: eF } = await admin
    .from('flujos')
    .insert({
      nombre: `Seguimiento ${MARCA}`,
      centro_id: centro!.id,
      activo: true,
      disparador: { tipo: 'etiqueta_aplicada', etiqueta_id: et('dispara') },
    })
    .select('id')
    .single();
  if (eF) throw new Error('flujo: ' + eF.message);

  const { data: pasos, error: ePa } = await admin
    .from('flujo_pasos')
    .insert([
      /*
       * `es_inicio` va explícito en TODAS las filas: en un insert múltiple,
       * Supabase rellena con null las claves que falten en alguna fila, y
       * null no es false para un `not null`.
       */
      { flujo_id: flujo.id, tipo: 'email', orden: 0, es_inicio: true, config: { plantilla_id: plantilla.id } },
      { flujo_id: flujo.id, tipo: 'esperar', orden: 1, es_inicio: false, config: { cantidad: 0, unidad: 'horas' } },
      { flujo_id: flujo.id, tipo: 'etiqueta', orden: 2, es_inicio: false, config: { etiqueta_id: et('seguida'), accion: 'anadir' } },
      { flujo_id: flujo.id, tipo: 'condicion', orden: 3, es_inicio: false, config: { tipo: 'tiene_etiqueta', etiqueta_id: et('vip') } },
      { flujo_id: flujo.id, tipo: 'tarea', orden: 4, es_inicio: false, config: { titulo: `Llamar (${MARCA})`, vence_en_horas: 24 } },
      { flujo_id: flujo.id, tipo: 'fin', orden: 5, es_inicio: false, config: {} },
    ])
    .select('id, orden');
  if (ePa) throw new Error('pasos: ' + ePa.message);
  const paso = (o: number) => pasos!.find((p) => p.orden === o)!.id;
  await admin.from('flujo_pasos').update({ siguiente_id: paso(1) }).eq('id', paso(0));
  await admin.from('flujo_pasos').update({ siguiente_id: paso(2) }).eq('id', paso(1));
  await admin.from('flujo_pasos').update({ siguiente_id: paso(3) }).eq('id', paso(2));
  await admin
    .from('flujo_pasos')
    .update({ siguiente_si_id: paso(4), siguiente_no_id: paso(5) })
    .eq('id', paso(3));
  await admin.from('flujo_pasos').update({ siguiente_id: paso(5) }).eq('id', paso(4));

  const inscripcionDe = async (clave: string) =>
    (
      await admin
        .from('flujo_inscripciones')
        .select('id, estado, motivo, paso_actual_id')
        .eq('flujo_id', flujo.id)
        .eq('contacto_id', ids[clave])
        .maybeSingle()
    ).data;

  // ---------------------------------------------------------------------------
  console.log('Activar no inscribe al histórico:');

  const r1 = await ejecutarFlujos(admin);
  comprobar('la primera pasada solo deja la marca de agua', r1.inscritos === 0, JSON.stringify(r1));
  comprobar('D, que ya tenía la etiqueta, NO entra', (await inscripcionDe('D')) === null);

  // ---------------------------------------------------------------------------
  console.log('\nQuien cumple el disparador después, entra una vez:');

  for (const k of ['A', 'B', 'C', 'F']) {
    await admin.from('contacto_etiquetas').insert({ contacto_id: ids[k], etiqueta_id: et('dispara') });
  }
  const r2 = await ejecutarFlujos(admin);
  comprobar('entran A, B, C y F', r2.inscritos === 4, JSON.stringify(r2));

  const r3 = await ejecutarFlujos(admin); // pasa la espera de 0 h
  const r4 = await ejecutarFlujos(admin); // y ya no debería quedar nada
  comprobar('repetir la pasada no inscribe a nadie más', r3.inscritos === 0 && r4.inscritos === 0);
  comprobar(
    'y la última pasada no mueve nada',
    r4.avanzados === 0 && r4.emailsEncolados === 0,
    JSON.stringify(r4),
  );

  // ---------------------------------------------------------------------------
  console.log('\nLas barreras del email mandan:');

  const { data: campana } = await admin
    .from('campanas_email')
    .select('id, estado, centro_id')
    .eq('flujo_paso_id', paso(0))
    .maybeSingle();
  comprobar('el paso de email tiene su campaña perpetua', campana?.estado === 'flujo' && campana.centro_id === centro!.id);

  const destinatarios = campana
    ? (await admin.from('campana_destinatarios').select('contacto_id, estado').eq('campana_id', campana.id)).data ?? []
    : [];
  const esDest = (k: string) => destinatarios.some((d) => d.contacto_id === ids[k]);

  comprobar('A (consiente, correo real) queda encolada', esDest('A'));
  comprobar('F también', esDest('F'));
  comprobar('B (correo @instagram.com) NO: se omite el correo', !esDest('B'));
  comprobar('C (sin consentimiento) NO', !esDest('C'));

  const c = await inscripcionDe('C');
  comprobar('y C sale del flujo, con el motivo escrito', c?.estado === 'salida' && /consentimiento/.test(c.motivo ?? ''), c?.motivo ?? '');

  const b = await inscripcionDe('B');
  comprobar('mientras que B SIGUE: el flujo no se para por un correo omitido', b?.estado === 'completada', b?.estado ?? '');

  // ---------------------------------------------------------------------------
  console.log('\nLos pasos actúan y la condición ramifica:');

  const { data: seguidas } = await admin
    .from('contacto_etiquetas')
    .select('contacto_id')
    .eq('etiqueta_id', et('seguida'));
  const seguida = (k: string) => (seguidas ?? []).some((s) => s.contacto_id === ids[k]);
  comprobar('A, B y F llevan la etiqueta «seguida»; C no', seguida('A') && seguida('B') && seguida('F') && !seguida('C'));

  const { data: tareas } = await admin.from('tareas').select('lead_id, titulo').like('titulo', `%${MARCA}%`);
  const { data: leadA } = await admin.from('lead_contactos').select('lead_id').eq('contacto_id', ids.A).single();
  const { data: leadF } = await admin.from('lead_contactos').select('lead_id').eq('contacto_id', ids.F).single();
  comprobar('A (vip) va por el «sí»: tiene tarea', (tareas ?? []).some((t) => t.lead_id === leadA!.lead_id));
  comprobar('F (no vip) va por el «no»: sin tarea', !(tareas ?? []).some((t) => t.lead_id === leadF!.lead_id));
  comprobar('las dos terminan completadas', (await inscripcionDe('A'))?.estado === 'completada' && (await inscripcionDe('F'))?.estado === 'completada');

  // ---------------------------------------------------------------------------
  console.log('\nTodo queda escrito:');

  const a = await inscripcionDe('A');
  const { data: eventos } = await admin
    .from('flujo_eventos')
    .select('tipo')
    .eq('inscripcion_id', a!.id)
    .order('created_at');
  const tipos = (eventos ?? []).map((e) => e.tipo);
  comprobar(
    'A: inscrita → email encolado → espera → pasos → completada',
    tipos[0] === 'inscrita' && tipos.includes('email_encolado') && tipos.includes('espera') && tipos[tipos.length - 1] === 'completada',
    tipos.join(' → '),
  );

  // ---------------------------------------------------------------------------
  await admin.from('flujos').delete().eq('id', flujo.id); // cascada: pasos, inscripciones, eventos, campaña
  await admin.from('tareas').delete().like('titulo', `%${MARCA}%`);
  await admin.from('leads').delete().like('nombre', `PRUEBA % ${MARCA}`);
  await admin.from('contactos').delete().like('nombre', `PRUEBA % ${MARCA}`);
  await admin.from('plantillas_email').delete().eq('id', plantilla.id);
  await admin.from('etiquetas').delete().like('nombre', `% ${MARCA}`);
  console.log('\n  (datos de prueba retirados)');

  console.log(
    fallos === 0
      ? '\nEl flujo hace lo que dice, con quien debe, una sola vez.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nFALLÓ:', e instanceof Error ? e.message : e, '\n');
  process.exit(1);
});
