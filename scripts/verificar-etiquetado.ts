/**
 * El etiquetado automático pone la etiqueta a quien toca, y solo a quien toca.
 *
 * El motor estaba escrito y sin usar: cero reglas. Al sembrar las de salida se
 * le han añadido dos campos, y uno de ellos cambia la forma del bucle, que es
 * donde está el fallo fácil:
 *
 *   · `modalidad` mira al CASO, como canal, centro o estado. Lo que cumple el
 *     caso vale para todos sus contactos.
 *
 *   · `tipo_contacto` mira a CADA PERSONA dentro del caso. En «Prueba Cuatro»
 *     están la madre (familiar) y el hijo (afectado): una implementación
 *     ingenua —filtrar por caso y luego etiquetar a todos sus contactos— les
 *     pondría las DOS etiquetas a los DOS. Y eso no se ve mirando la pantalla,
 *     porque una etiqueta de más parece una etiqueta más.
 *
 * Lo que se comprueba es justo eso, contra datos reales, mas la invariante que
 * el propio motor promete en su cabecera: que solo AÑADE.
 *
 *   npx tsx --env-file=.env.staging scripts/verificar-etiquetado.ts
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { ejecutarEtiquetado } from '../src/lib/etiquetado';
import { CAMPOS_REGLA } from '../src/lib/reglas';
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

/** Las etiquetas de una persona, por su nombre. */
async function etiquetasDe(nombre: string): Promise<string[]> {
  const { data } = await admin
    .from('contacto_etiquetas')
    .select('etiqueta:etiquetas (nombre), contacto:contactos!inner (nombre)')
    .eq('contacto.nombre', nombre);
  return (data ?? []).map((x) => x.etiqueta?.nombre ?? '?').sort();
}

async function main() {
  console.log('\nEtiquetado automático\n');

  const { count: dePrueba } = await admin
    .from('perfiles')
    .select('id', { count: 'exact', head: true })
    .like('email', '%@test.com');
  if ((dePrueba ?? 0) === 0) {
    console.log('  Esto no parece un entorno de pruebas: el motor escribe etiquetas.\n');
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  console.log('Hay reglas con las que empezar:');

  const { count: activas } = await admin
    .from('reglas_etiquetado')
    .select('id', { count: 'exact', head: true })
    .eq('activa', true);
  comprobar('el directorio no nace en blanco', (activas ?? 0) > 0, `${activas} regla(s) activa(s)`);

  // ---------------------------------------------------------------------------
  console.log('\nEl motor corre y aplica:');

  const primera = await ejecutarEtiquetado(admin);
  comprobar(
    'la pasada termina sin reventar',
    primera.reglas > 0,
    `${primera.reglas} reglas · ${primera.etiquetasAplicadas} etiquetas puestas`,
  );

  /*
   * Correrlo dos veces seguidas no puede aplicar nada nuevo. El motor corre
   * cada quince minutos con el resto de automatismos: si duplicara, en un dia
   * habria noventa y seis copias de cada etiqueta.
   */
  const segunda = await ejecutarEtiquetado(admin);
  comprobar(
    'la segunda pasada no duplica nada',
    segunda.etiquetasAplicadas === 0,
    `aplicó ${segunda.etiquetasAplicadas}`,
  );

  // ---------------------------------------------------------------------------
  console.log('\nLa persona correcta dentro del caso:');

  /*
   * «Prueba Cuatro» es el caso que lo distingue: la madre y el hijo, juntos.
   * Si esto pasa con las dos etiquetas cruzadas, el motor esta mirando al caso
   * cuando deberia mirar a la persona.
   */
  const madre = await etiquetasDe('Prueba Cuatro');
  const hijo = await etiquetasDe('Prueba Cuatro Bis');

  comprobar(
    'quien consulta por otro sale como Familiar',
    madre.includes('Familiar'),
    madre.join(', '),
  );
  comprobar('y NO como Afectado', !madre.includes('Afectado'), madre.join(', '));
  comprobar(
    'quien consulta por sí mismo sale como Afectado',
    hijo.includes('Afectado'),
    hijo.join(', '),
  );
  comprobar('y NO como Familiar', !hijo.includes('Familiar'), hijo.join(', '));

  // ---------------------------------------------------------------------------
  console.log('\nLas del caso alcanzan a todos sus contactos:');

  const prescriptor = await etiquetasDe('Prueba Seis');
  comprobar(
    'un caso de canal prescriptor etiqueta a su contacto',
    prescriptor.includes('Vía prescriptor'),
    prescriptor.join(', '),
  );

  const convertido = await etiquetasDe('Prueba Cinco');
  comprobar(
    'un caso convertido deja «Ha sido paciente»',
    convertido.includes('Ha sido paciente'),
    convertido.join(', '),
  );

  // ---------------------------------------------------------------------------
  console.log('\nLa modalidad, que ningun caso de prueba trae puesta:');

  /*
   * Sin esto, el campo `modalidad` quedaria SIN PROBAR: ninguno de los casos
   * sembrados tiene modalidad de interes, asi que la regla no etiqueta a nadie
   * y el script daria verde igual aunque el motor no supiera leer el campo.
   *
   * Se pone una, se corre, se comprueba y se deja como estaba. Un camino que
   * solo se recorre en produccion es un camino sin probar.
   */
  const { data: residencial } = await admin
    .from('modalidades')
    .select('id')
    .eq('slug', 'ingreso_residencial')
    .maybeSingle();
  const { data: conejillo } = await admin
    .from('leads')
    .select('id, nombre, modalidad_interes_id')
    .is('modalidad_interes_id', null)
    .limit(1)
    .maybeSingle();

  if (residencial && conejillo) {
    await admin
      .from('leads')
      .update({ modalidad_interes_id: residencial.id })
      .eq('id', conejillo.id);
    await ejecutarEtiquetado(admin);

    const suyas = await etiquetasDe(conejillo.nombre);
    comprobar(
      'un caso con modalidad residencial etiqueta a su gente',
      suyas.includes('Interés: ingreso residencial'),
      `${conejillo.nombre}: ${suyas.join(', ')}`,
    );

    // Se deshace: la modalidad y la etiqueta que provoco.
    await admin.from('leads').update({ modalidad_interes_id: null }).eq('id', conejillo.id);
    const { data: etiquetaResidencial } = await admin
      .from('etiquetas')
      .select('id')
      .eq('nombre', 'Interés: ingreso residencial')
      .maybeSingle();
    if (etiquetaResidencial) {
      await admin.from('contacto_etiquetas').delete().eq('etiqueta_id', etiquetaResidencial.id);
    }
  } else {
    comprobar('hay con que probar la modalidad', false, 'falta la modalidad o un caso sin ella');
  }

  // ---------------------------------------------------------------------------
  console.log('\nEl motor solo AÑADE, nunca retira:');

  /*
   * Es lo que promete su cabecera y lo que hace que una etiqueta puesta a mano
   * sobreviva. Se prueba poniendo una que ninguna regla pondria y volviendo a
   * correr: si el motor «sincronizara» en vez de añadir, se la llevaria.
   */
  const { data: unaPersona } = await admin.from('contactos').select('id, nombre').limit(1).single();
  const { data: etiquetaSuelta } = await admin
    .from('etiquetas')
    .insert({ nombre: `Puesta a mano ${Date.now()}`, activa: true })
    .select('id, nombre')
    .single();

  if (unaPersona && etiquetaSuelta) {
    await admin
      .from('contacto_etiquetas')
      .insert({ contacto_id: unaPersona.id, etiqueta_id: etiquetaSuelta.id });

    await ejecutarEtiquetado(admin);

    const { count: sobrevive } = await admin
      .from('contacto_etiquetas')
      .select('id', { count: 'exact', head: true })
      .eq('contacto_id', unaPersona.id)
      .eq('etiqueta_id', etiquetaSuelta.id);
    comprobar(
      'una etiqueta puesta a mano sigue ahí tras pasar el motor',
      (sobrevive ?? 0) === 1,
      `sobre ${unaPersona.nombre}`,
    );

    await admin.from('contacto_etiquetas').delete().eq('etiqueta_id', etiquetaSuelta.id);
    await admin.from('etiquetas').delete().eq('id', etiquetaSuelta.id);
  }

  // ---------------------------------------------------------------------------
  console.log('\nNinguna regla marca a una persona con una categoría de salud:');

  /*
   * Regla 11. Una etiqueta vive en el CONTACTO y alimenta los segmentos del
   * email marketing, asi que etiquetar por adiccion seria pegarle a alguien su
   * motivo de consulta y dejarlo disponible para filtrar campañas. Se vigila en
   * los dos sitios: que el vocabulario no lo ofrezca y que nadie lo haya
   * colado a mano en una regla.
   */
  comprobar(
    'el vocabulario de reglas no ofrece «adicción»',
    !Object.keys(CAMPOS_REGLA).includes('adiccion'),
    Object.keys(CAMPOS_REGLA).join(', '),
  );

  const { data: todas } = await admin.from('reglas_etiquetado').select('nombre, condicion');
  const porAdiccion = (todas ?? []).filter((r) => /adicc/i.test(JSON.stringify(r.condicion)));
  comprobar(
    'ninguna regla condiciona por adicción',
    porAdiccion.length === 0,
    porAdiccion.map((r) => r.nombre).join(', '),
  );

  const reglasTs = readFileSync('src/lib/reglas.ts', 'utf8');
  comprobar(
    'y queda escrito por qué, para que nadie lo añada sin saberlo',
    /ADICCION|ADICCIÓN/.test(reglasTs),
  );

  // ---------------------------------------------------------------------------
  console.log('\nCómo queda el directorio:');
  const { data: todo } = await admin
    .from('contacto_etiquetas')
    .select('contacto:contactos (nombre), etiqueta:etiquetas (nombre)');
  const porPersona = new Map<string, string[]>();
  for (const x of todo ?? []) {
    const n = x.contacto?.nombre ?? '?';
    porPersona.set(n, [...(porPersona.get(n) ?? []), x.etiqueta?.nombre ?? '?']);
  }
  for (const [persona, etiquetas] of [...porPersona].sort()) {
    console.log(`    ${persona.padEnd(20)} ${etiquetas.sort().join(' · ')}`);
  }

  console.log(
    fallos === 0
      ? '\nCada etiqueta, en la persona que le toca.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main();
