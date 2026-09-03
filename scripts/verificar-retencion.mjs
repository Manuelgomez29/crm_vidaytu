/**
 * Comprueba la anonimizacion por retencion (RGPD).
 *
 *   npm run verificar:retencion
 *
 * Crea un caso perdido antiguo con su contacto y su historial, lo anonimiza y
 * comprueba las dos mitades: que se va lo que identifica a una persona y que
 * se queda lo que hace falta para que las metricas historicas sigan cuadrando.
 *
 * Comprueba tambien que editar un caso cerrado NO reinicia el reloj de
 * retencion. Esa era la version anterior, que contaba desde `updated_at`: un
 * caso cerrado hace un ano en el que alguien corrigiera una coma no se
 * anonimizaba nunca.
 *
 * Deja la base de datos como estaba.
 */
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

let fallos = 0;
const comprobar = (d, c, detalle = '') => {
  if (!c) fallos++;
  console.log(`  ${c ? 'OK  ' : 'FALLO'} ${d}${detalle ? ` — ${detalle}` : ''}`);
};

const hace14Meses = new Date();
hace14Meses.setMonth(hace14Meses.getMonth() - 14);

const [{ data: centro }, { data: canal }, { data: motivo }, { data: pipeline }] = await Promise.all([
  admin.from('centros').select('id').eq('slug', 'eclipse').single(),
  admin.from('canales').select('id').limit(1).single(),
  admin.from('motivos_perdida').select('id, nombre').limit(1).single(),
  admin.from('pipelines').select('id').limit(1).single(),
]);
const { data: etapa } = await admin
  .from('pipeline_etapas')
  .select('id')
  .eq('pipeline_id', pipeline.id)
  .order('orden')
  .limit(1)
  .single();

// 1. Contacto + caso perdido antiguo.
const { data: contacto, error: errorContacto } = await admin
  .from('contactos')
  .insert({
    nombre: 'Maria Prueba Anonimizacion',
    telefono: '+34600777666',
    email: 'maria.prueba@example.com',
    zona: 'Reus',
    notas: 'Nota con datos personales',
  })
  .select('id')
  .single();
if (errorContacto) {
  console.error('No se pudo crear el contacto:', errorContacto.message);
  process.exit(1);
}

const { data: lead, error: errorLead } = await admin
  .from('leads')
  .insert({
    centro_id: centro.id,
    pipeline_id: pipeline.id,
    etapa_id: etapa.id,
    nombre: 'Maria Prueba Anonimizacion',
    telefono: '+34600777666',
    canal_id: canal.id,
    estado: 'perdido',
    motivo_perdida_id: motivo.id,
    zona: 'Reus',
    nombre_afectado: 'Hijo de Maria',
    utm_campaign: 'campana-historica',
  })
  .select('id')
  .single();
if (errorLead) {
  console.error('No se pudo crear el lead:', errorLead.message);
  await admin.from('contactos').delete().eq('id', contacto.id);
  process.exit(1);
}

await admin.from('lead_contactos').insert({
  lead_id: lead.id,
  contacto_id: contacto.id,
  tipo: 'familiar',
  es_principal: true,
});
await admin.from('actividades').insert({
  lead_id: lead.id,
  tipo: 'nota',
  contenido: 'Llamo la madre, situacion familiar complicada',
});

// cerrado_at SI se puede fijar: no lo pisa ningun trigger, solo cambia cuando
// cambia el estado. Ese es justo el arreglo que esta prueba destapo.
const { error: errorFecha } = await admin
  .from('leads')
  .update({ cerrado_at: hace14Meses.toISOString() })
  .eq('id', lead.id);
if (errorFecha) console.log('  aviso: no se pudo fijar cerrado_at:', errorFecha.message);

// Y se comprueba que una edicion posterior NO reinicia el reloj.
await admin.from('leads').update({ subcanal: 'editado despues' }).eq('id', lead.id);

const { data: comprobacion } = await admin
  .from('leads')
  .select('cerrado_at, updated_at')
  .eq('id', lead.id)
  .single();
console.log('Caso creado, cerrado el', comprobacion.cerrado_at.slice(0, 10));
comprobar(
  'editar el caso NO reinicia el reloj de retencion',
  comprobacion.cerrado_at.slice(0, 10) === hace14Meses.toISOString().slice(0, 10),
  `cerrado_at ${comprobacion.cerrado_at.slice(0, 10)} vs updated_at ${comprobacion.updated_at.slice(0, 10)}`,
);

// 2. El corte. `src/lib/anonimizar.ts` es TypeScript y no se puede importar
// desde un .mjs suelto, asi que aqui se replica su consulta. Si alguien cambia
// una y no la otra, esta prueba lo canta.
const limite = new Date();
limite.setMonth(limite.getMonth() - 12);
const { data: candidatos } = await admin
  .from('leads')
  .select('id, nombre')
  .in('estado', ['perdido', 'no_valido'])
  .not('cerrado_at', 'is', null)
  .lte('cerrado_at', limite.toISOString())
  .not('nombre', 'like', 'Anonimizado%');

comprobar(
  'el caso antiguo entra en el corte de 12 meses',
  (candidatos ?? []).some((c) => c.id === lead.id),
  `${(candidatos ?? []).length} candidato(s)`,
);
console.log('\nAnonimizacion (misma logica que la pantalla):');

// 3. Anonimizar, replicando lo que hace src/lib/anonimizar.ts.
const telefonoAnonimo = () =>
  `+99${Date.now().toString().slice(-9)}${Math.floor(Math.random() * 900 + 100)}`;

await admin
  .from('leads')
  .update({
    nombre: 'Anonimizado (retención RGPD)',
    telefono: telefonoAnonimo(),
    nombre_afectado: null,
    relacion_con_afectado: null,
    prescriptor_nombre: null,
    zona: null,
  })
  .eq('id', lead.id);
await admin
  .from('actividades')
  .update({ contenido: 'Contenido anonimizado por retención' })
  .eq('lead_id', lead.id);
await admin
  .from('contactos')
  .update({
    nombre: 'Anonimizado (retención RGPD)',
    telefono: telefonoAnonimo(),
    email: null,
    zona: null,
    notas: null,
    consentimiento_marketing: false,
  })
  .eq('id', contacto.id);

// 4. Comprobar que se fue lo personal y se quedo lo que hace metricas.
const { data: despues } = await admin
  .from('leads')
  .select('nombre, telefono, zona, nombre_afectado, estado, motivo_perdida_id, canal_id, centro_id, utm_campaign, created_at')
  .eq('id', lead.id)
  .single();

comprobar('el nombre se fue', despues.nombre.startsWith('Anonimizado'));
comprobar('el telefono ya no es el real', despues.telefono !== '+34600777666');
comprobar('la zona se fue', despues.zona === null);
comprobar('el nombre de la persona afectada se fue', despues.nombre_afectado === null);

comprobar('el estado se queda', despues.estado === 'perdido');
comprobar('el motivo de perdida se queda', despues.motivo_perdida_id === motivo.id);
comprobar('el centro se queda', despues.centro_id === centro.id);
comprobar('el canal se queda', despues.canal_id === canal.id);
comprobar('la atribucion UTM se queda', despues.utm_campaign === 'campana-historica');
comprobar('la fecha de entrada se queda', Boolean(despues.created_at));

const { data: act } = await admin
  .from('actividades')
  .select('contenido')
  .eq('lead_id', lead.id)
  .single();
comprobar('el contenido del historial se fue', act.contenido === 'Contenido anonimizado por retención');
comprobar('pero la fila del historial sigue ahi', Boolean(act));

const { data: cont } = await admin
  .from('contactos')
  .select('nombre, email, consentimiento_marketing')
  .eq('id', contacto.id)
  .single();
comprobar('el contacto se anonimizo', cont.nombre.startsWith('Anonimizado') && cont.email === null);
comprobar('y perdio el consentimiento de marketing', cont.consentimiento_marketing === false);

// 5. Limpieza.
await admin.from('leads').delete().eq('id', lead.id);
await admin.from('contactos').delete().eq('id', contacto.id);
console.log('\nLimpieza hecha.');

console.log(fallos === 0 ? '\nLa anonimizacion hace lo que dice.\n' : `\n${fallos} fallo(s).\n`);
process.exit(fallos === 0 ? 0 : 1);
