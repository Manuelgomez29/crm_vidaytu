/**
 * El resumen de IA no se escapa del centro, y caduca cuando debe.
 *
 * Dos garantías distintas, y las dos se rompen en silencio:
 *
 * 1. El resumen de un caso lleva dentro el nombre de la persona, su situación y
 *    lo que se ha hablado con ella. Si la caché lo dejara leer a quien no puede
 *    ver el caso, habríamos abierto por la puerta de atrás justo lo que el muro
 *    cierra por delante. Y se leería sin dejar rastro: no hay que pedir nada,
 *    basta con consultar la tabla.
 *
 * 2. Si la huella de actividad no cambiara al anotar algo, el resumen se
 *    quedaría congelado: quien retoma el caso leería la foto de la semana
 *    pasada creyendo que está al día. Un resumen viejo presentado como actual
 *    es peor que no tener resumen.
 *
 * Nada de esto llama al modelo: se comprueban la caché y los permisos, que es
 * donde están los dos riesgos. Por eso funciona con la IA apagada.
 *
 *   npx tsx --env-file=.env.staging scripts/verificar-resumen.ts
 */
import { createClient } from '@supabase/supabase-js';
import { huellaDelCaso, resumenGuardado } from '../src/lib/resumen-caso';
import type { Database } from '../src/lib/database.types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PASSWORD = 'vidaytu-dev-2026';

const admin = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

let fallos = 0;
const comprobar = (t: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK  ' : 'FALLA'}  ${t}${d ? ' — ' + d : ''}`);
  if (!ok) fallos++;
};

async function sesion(email: string) {
  const cliente = createClient<Database>(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await cliente.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) {
    comprobar(`sesión de ${email}`, false, error.message);
    return null;
  }
  return cliente;
}

async function main() {
  console.log('\nResumen de IA: permisos y caducidad\n');

  const { data: centros } = await admin.from('centros').select('id, nombre');
  const horizonte = (centros ?? []).find((c) => /horizonte/i.test(c.nombre));
  const eclipse = (centros ?? []).find((c) => /eclipse/i.test(c.nombre));
  if (!horizonte || !eclipse) {
    console.log('  No encuentro los centros de prueba.\n');
    process.exit(1);
  }

  const { data: deHorizonte } = await admin
    .from('leads')
    .select('id, nombre')
    .eq('centro_id', horizonte.id)
    .limit(1)
    .maybeSingle();
  const { data: deEclipse } = await admin
    .from('leads')
    .select('id, nombre')
    .eq('centro_id', eclipse.id)
    .limit(1)
    .maybeSingle();
  if (!deHorizonte || !deEclipse) {
    console.log('  Faltan casos de prueba en Horizonte o Eclipse.\n');
    process.exit(1);
  }

  const equipo = await sesion('equipo@test.com'); // Eclipse, Bellamar y grupo — NO Horizonte
  const jefe = await sesion('direccion@test.com');
  if (!equipo || !jefe) process.exit(1);

  // ---------------------------------------------------------------------------
  console.log(`\nUn caso de Horizonte («${deHorizonte.nombre}») ante quien no tiene Horizonte:`);

  // Se siembra un resumen como si ya se hubiera generado.
  await admin.from('resumenes_ia').upsert(
    {
      lead_id: deHorizonte.id,
      resumen: 'RESUMEN DE PRUEBA — no debería verlo nadie de fuera de Horizonte.',
      hash_actividad: 'prueba',
      generado_at: new Date().toISOString(),
    },
    { onConflict: 'lead_id' },
  );

  /*
   * Lo primero que hace `resumirCaso` con el caso es leerlo con la sesión de
   * quien pregunta. Esta es esa misma consulta: si devuelve nada, no hay
   * contexto que mandar al modelo y la función contesta «no tienes acceso».
   */
  const { data: leidoPorEquipo } = await equipo
    .from('leads')
    .select('id')
    .eq('id', deHorizonte.id)
    .maybeSingle();
  comprobar('no puede leer el caso, así que no hay resumen que pedir', leidoPorEquipo === null);

  const { data: cacheAjena } = await equipo
    .from('resumenes_ia')
    .select('resumen')
    .eq('lead_id', deHorizonte.id);
  comprobar(
    'no puede leer el resumen ya guardado',
    (cacheAjena ?? []).length === 0,
    `devolvió ${(cacheAjena ?? []).length}`,
  );

  const { error: alEscribir } = await equipo
    .from('resumenes_ia')
    .upsert(
      { lead_id: deHorizonte.id, resumen: 'intrusión', hash_actividad: 'x' },
      { onConflict: 'lead_id' },
    );
  comprobar(
    'tampoco puede sobrescribirlo',
    alEscribir !== null,
    alEscribir ? 'rechazado por la base' : 'LA BASE LO ACEPTÓ',
  );

  const { data: cachePropia } = await jefe
    .from('resumenes_ia')
    .select('resumen')
    .eq('lead_id', deHorizonte.id);
  comprobar(
    'dirección sí lo ve (si no, la prueba pasaría por estar todo roto)',
    (cachePropia ?? []).length === 1,
  );

  await admin.from('resumenes_ia').delete().eq('lead_id', deHorizonte.id);

  // ---------------------------------------------------------------------------
  console.log(`\nCaducidad en un caso de Eclipse («${deEclipse.nombre}»):`);

  const aLimpiar = { actividades: [] as string[], presupuestos: [] as string[], tareas: [] as string[] };
  const { data: zonaPrevia } = await admin
    .from('leads')
    .select('zona')
    .eq('id', deEclipse.id)
    .single();
  const zonaOriginal = zonaPrevia?.zona ?? null;

  /** Deja la caché marcada como al día, para poder ver si algo la caduca. */
  const guardarAlDia = async () => {
    await admin.from('resumenes_ia').upsert(
      {
        lead_id: deEclipse.id,
        resumen: 'RESUMEN DE PRUEBA — se borra al terminar.',
        hash_actividad: await huellaDelCaso(admin, deEclipse.id),
        generado_at: new Date().toISOString(),
      },
      { onConflict: 'lead_id' },
    );
    const estado = await resumenGuardado(admin, deEclipse.id);
    if (estado?.vigente !== true) comprobar('la caché parte marcada como al día', false);
  };

  /*
   * Cada una de estas cosas SALE ESCRITA en el resumen. Si alguna no caduca la
   * caché, quien retome el caso leerá un texto que se presenta como actual y
   * dice algo que ya no es verdad.
   */
  const caducaCon = async (nombre: string, cambiar: () => Promise<void>) => {
    await guardarAlDia();
    await cambiar();
    const despues = await resumenGuardado(equipo, deEclipse.id);
    comprobar(nombre, despues?.vigente === false);
    return despues;
  };

  const tras = await caducaCon('una anotación nueva lo caduca', async () => {
    const { data } = await admin
      .from('actividades')
      .insert({
        lead_id: deEclipse.id,
        tipo: 'nota',
        contenido: 'Verificación automática — se borra al terminar.',
      })
      .select('id')
      .single();
    if (data) aLimpiar.actividades.push(data.id);
  });
  comprobar('y aun así se sigue enseñando el viejo, no un hueco', Boolean(tras?.texto));

  await caducaCon('un presupuesto nuevo lo caduca', async () => {
    const { data } = await admin
      .from('presupuestos')
      .insert({ lead_id: deEclipse.id, importe: 1234, estado: 'propuesto', descripcion: 'Prueba' })
      .select('id')
      .single();
    if (data) aLimpiar.presupuestos.push(data.id);
  });

  await caducaCon('aceptar ese presupuesto lo caduca otra vez', async () => {
    await admin
      .from('presupuestos')
      .update({ estado: 'aceptado' })
      .eq('id', aLimpiar.presupuestos[0]);
  });

  await caducaCon('una tarea nueva lo caduca', async () => {
    const { data } = await admin
      .from('tareas')
      .insert({
        lead_id: deEclipse.id,
        titulo: 'Verificación automática — se borra',
        vence_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select('id')
      .single();
    if (data) aLimpiar.tareas.push(data.id);
  });

  await caducaCon('completar esa tarea lo caduca', async () => {
    await admin
      .from('tareas')
      .update({ completada_at: new Date().toISOString() })
      .eq('id', aLimpiar.tareas[0]);
  });

  /*
   * Y lo contrario: tocar el caso sin cambiar nada de lo que el resumen cuenta
   * NO debe caducarlo. Si lo hiciera, cada roce pagaría una llamada al modelo.
   */
  await guardarAlDia();
  await admin.from('leads').update({ zona: 'Zona de prueba' }).eq('id', deEclipse.id);
  const trasRoce = await resumenGuardado(equipo, deEclipse.id);
  comprobar('un cambio que el resumen no cuenta NO lo caduca', trasRoce?.vigente === true);

  /*
   * Dos personas que ven el mismo caso tienen que calcular la MISMA huella. Si
   * no, la caché se rehace cada vez que cambia quien mira, y cada rehacer es una
   * llamada al modelo que se paga.
   */
  const huellaEquipo = await huellaDelCaso(equipo, deEclipse.id);
  const huellaJefe = await huellaDelCaso(jefe, deEclipse.id);
  comprobar(
    'dos personas con acceso calculan la misma huella',
    huellaEquipo === huellaJefe,
    `${huellaEquipo} · ${huellaJefe}`,
  );

  for (const id of aLimpiar.actividades) await admin.from('actividades').delete().eq('id', id);
  for (const id of aLimpiar.presupuestos) await admin.from('presupuestos').delete().eq('id', id);
  for (const id of aLimpiar.tareas) await admin.from('tareas').delete().eq('id', id);
  await admin.from('leads').update({ zona: zonaOriginal }).eq('id', deEclipse.id);
  await admin.from('resumenes_ia').delete().eq('lead_id', deEclipse.id);

  // ---------------------------------------------------------------------------
  console.log('\nEl texto que viaja por la URL:');

  /*
   * La ficha lee el resumen recién pedido de `ia_consultas` por su id, y ese id
   * va en el query string. Un id ajeno pegado a mano no puede devolver texto.
   */
  const { data: consultaAjena } = await admin
    .from('ia_consultas')
    .insert({
      usuario_id: null,
      ambito: 'clinica',
      pregunta: 'Verificación automática',
      respuesta: 'TEXTO DE PRUEBA — no debería salir por la URL de otro.',
    })
    .select('id')
    .single();

  if (consultaAjena) {
    const { data: robada } = await equipo
      .from('ia_consultas')
      .select('respuesta')
      .eq('id', consultaAjena.id)
      .maybeSingle();
    comprobar('un id de consulta ajeno pegado en la URL no devuelve nada', robada === null);
    await admin.from('ia_consultas').delete().eq('id', consultaAjena.id);
  }

  console.log('\n  (datos de prueba borrados)');
  console.log(
    fallos === 0
      ? '\nEl resumen respeta el muro y caduca cuando toca.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main();
