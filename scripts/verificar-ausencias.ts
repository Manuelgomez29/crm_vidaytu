/**
 * Quién se hace cargo: ausencias (regla 10) y reapertura (regla 4).
 *
 * Dos reglas que estaban escritas y NUNCA se habian ejecutado. `ausencias` no
 * tenia una sola fila, ni en produccion ni en pruebas, y ningun script las
 * tocaba — pero se leen en tres sitios: el reparto automatico, las alertas y el
 * kanban. La primera vez que importan es en agosto o el dia que alguien coge la
 * baja, que es el peor momento para descubrir que no funcionaban.
 *
 * Lo que se comprueba:
 *
 *   · Un comercial ausente NO recibe casos del reparto automatico, y el que
 *     esta si los recibe. Sin la segunda mitad, un reparto roto que no asignara
 *     a nadie pasaria por bueno.
 *   · Sus casos salen marcados «propietario ausente» en el tablero.
 *   · Un caso reabierto vuelve a su propietario de siempre.
 *   · Y si ese ya no esta en el equipo, va a alguien QUE PUEDA VERLO. Esto es
 *     lo que no miraba: cogia la direccion activa mas antigua sin comprobar su
 *     alcance, asi que un caso de Bellamar podia acabar en la direccion de
 *     Horizonte — con propietario, y con un propietario que no lo abre nunca.
 *
 *   npx tsx --env-file=.env.staging scripts/verificar-ausencias.ts
 */
import { createClient } from '@supabase/supabase-js';
import { propietarioParaReapertura } from '../src/lib/casos';
import { repartirLeadsSinPropietario } from '../src/lib/reparto';
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

const hoy = new Date().toISOString().slice(0, 10);

/** Lo que haya que deshacer pase lo que pase, en orden inverso. */
const limpieza: (() => PromiseLike<unknown>)[] = [];

async function main() {
  console.log('\nAusencias y reapertura\n');

  const { count: dePrueba } = await admin
    .from('perfiles')
    .select('id', { count: 'exact', head: true })
    .like('email', '%@test.com');
  if ((dePrueba ?? 0) === 0) {
    console.log('  Esto no parece un entorno de pruebas: este script crea casos.\n');
    process.exit(1);
  }

  const { data: centros } = await admin.from('centros').select('id, nombre');
  const horizonte = (centros ?? []).find((c) => /horizonte/i.test(c.nombre))!;
  const { data: perfiles } = await admin.from('perfiles').select('id, email, rol, alcance, activo');
  const comercialHorizonte = (perfiles ?? []).find((p) => p.email === 'horizonte@test.com');
  if (!comercialHorizonte) {
    console.log('  Falta horizonte@test.com.\n');
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

  /** Un caso de Horizonte sin propietario, que es lo que el reparto busca. */
  async function casoHuerfano(nombre: string) {
    const { data } = await admin
      .from('leads')
      .insert({
        nombre,
        telefono: '+3460000' + Math.floor(1000 + Math.random() * 8999),
        centro_id: horizonte.id,
        canal_id: canal!.id,
        pipeline_id: pipeline!.id,
        etapa_id: etapa!.id,
        quien_contacta: 'afectado',
      })
      .select('id')
      .single();
    limpieza.push(() => admin.from('leads').delete().eq('id', data!.id));
    return data!.id;
  }

  // ---------------------------------------------------------------------------
  console.log('El reparto automático y quien no está:');

  /*
   * El reparto solo corre si esta encendido y solo mira a quien tiene franja
   * horaria AHORA. Se encienden las dos cosas para esta prueba y se dejan como
   * estaban al final: si no, el script diria «no asigno a nadie» y pareceria
   * que respeta la ausencia cuando en realidad no estaba haciendo nada.
   */
  const { data: antes } = await admin
    .from('configuracion')
    .select('valor')
    .eq('clave', 'reparto_automatico')
    .maybeSingle();
  await admin.from('configuracion').update({ valor: true }).eq('clave', 'reparto_automatico');
  limpieza.push(() =>
    admin
      .from('configuracion')
      .update({ valor: antes?.valor ?? false })
      .eq('clave', 'reparto_automatico'),
  );

  const ahora = new Date();
  const { data: franja } = await admin
    .from('disponibilidad')
    .insert({
      perfil_id: comercialHorizonte.id,
      dia_semana: ahora.getDay(),
      hora_inicio: '00:00',
      hora_fin: '23:59',
    })
    .select('id')
    .single();
  if (franja) limpieza.push(() => admin.from('disponibilidad').delete().eq('id', franja.id));

  // --- Primero SIN ausencia: tiene que asignarle el caso ---
  const casoA = await casoHuerfano('Ausencia de prueba A');
  await repartirLeadsSinPropietario(admin);
  const { data: conDuenio } = await admin
    .from('leads')
    .select('propietario_id')
    .eq('id', casoA)
    .single();
  comprobar(
    'estando disponible, el reparto le da el caso',
    conDuenio?.propietario_id === comercialHorizonte.id,
    conDuenio?.propietario_id ? 'se lo dio a otro' : 'no se lo dio a nadie',
  );

  // --- Ahora CON ausencia: no puede tocarle ---
  const { data: ausencia } = await admin
    .from('ausencias')
    .insert({
      perfil_id: comercialHorizonte.id,
      desde: hoy,
      hasta: hoy,
      motivo: 'Prueba automática',
    })
    .select('id')
    .single();
  if (ausencia) limpieza.push(() => admin.from('ausencias').delete().eq('id', ausencia.id));

  const casoB = await casoHuerfano('Ausencia de prueba B');
  await repartirLeadsSinPropietario(admin);
  const { data: sigueHuerfano } = await admin
    .from('leads')
    .select('propietario_id')
    .eq('id', casoB)
    .single();
  comprobar(
    'estando ausente, NO le cae ningún caso',
    sigueHuerfano?.propietario_id !== comercialHorizonte.id,
    sigueHuerfano?.propietario_id ? 'se lo han dado igual' : 'se queda sin asignar, correcto',
  );

  // ---------------------------------------------------------------------------
  console.log('\nSus casos avisan de que no está:');

  /*
   * Es lo que ve el tablero: `propietarioAusente`. Se reproduce la misma cuenta
   * que hace la pantalla, porque lo que importa es que el dato exista y sea
   * cierto hoy.
   */
  const { data: ausenciasHoy } = await admin
    .from('ausencias')
    .select('perfil_id')
    .lte('desde', hoy)
    .gte('hasta', hoy);
  const ausentes = new Set((ausenciasHoy ?? []).map((a) => a.perfil_id));
  comprobar(
    'hoy consta como ausente',
    ausentes.has(comercialHorizonte.id),
    `${ausentes.size} ausencia(s) vigentes`,
  );

  await admin.from('leads').update({ propietario_id: comercialHorizonte.id }).eq('id', casoA);
  const { data: suyo } = await admin
    .from('leads')
    .select('propietario_id')
    .eq('id', casoA)
    .single();
  comprobar(
    'y un caso suyo se marcaría «propietario ausente»',
    !!suyo?.propietario_id && ausentes.has(suyo.propietario_id),
  );

  // ---------------------------------------------------------------------------
  console.log('\nA quién vuelve un caso reabierto:');

  const deCentro = (perfiles ?? []).find(
    (p) => p.rol === 'direccion' && p.alcance === 'centros' && p.activo,
  );

  const vuelveAlSuyo = await propietarioParaReapertura(admin, comercialHorizonte.id, horizonte.id);
  comprobar(
    'vuelve a quien lo llevaba, aunque esté de vacaciones',
    vuelveAlSuyo === comercialHorizonte.id,
    'la regla 4 manda: quien conoce el caso lo retoma',
  );

  /*
   * Se comprueba que cae en UNA direccion de grupo, no en una concreta.
   *
   * La primera version comparaba contra `deGrupo`, que era la primera que
   * devolvia una consulta SIN ORDENAR. En staging hay dos direcciones de grupo,
   * asi que el test pasaba o fallaba segun lo que le apeteciera a Postgres ese
   * dia — y un test inestable acaba ignorandose, que es peor que no tenerlo.
   * Lo que la regla promete es el «administrador general», no una persona.
   */
  const idsDeGrupo = new Set(
    (perfiles ?? [])
      .filter((p) => p.rol === 'direccion' && p.alcance === 'grupo' && p.activo)
      .map((p) => p.id),
  );
  const sinAnterior = await propietarioParaReapertura(admin, null, horizonte.id);
  comprobar(
    'si no queda nadie, va a una dirección de grupo',
    !!sinAnterior && idsDeGrupo.has(sinAnterior),
    `${idsDeGrupo.size} dirección(es) de grupo activas`,
  );

  /*
   * LA TRAMPA. Un caso de BELLAMAR sin propietario anterior: la direccion de
   * centro que hay es la de Horizonte, y no puede verlo. Antes se elegia «la
   * direccion activa mas antigua» sin mirar alcance, asi que podia salir ella.
   * Se comprueba desactivando temporalmente la de grupo, que es la unica
   * situacion en la que la trampa se dispara.
   */
  const bellamar = (centros ?? []).find((c) => /bellamar/i.test(c.nombre))!;

  /*
   * Se apagan TODAS las direcciones de grupo, no una.
   *
   * La primera version de esto apagaba solo la primera que encontraba. En
   * staging hay dos, asi que quedaba otra de grupo viva, la funcion la elegia
   * —correctamente— y la comprobacion de Bellamar pasaba... por el motivo
   * equivocado: no porque se descartara a la de Horizonte, sino porque nunca
   * llego a considerarla. Un test que pasa por el motivo equivocado no protege
   * nada, y encima da confianza.
   */
  const todasLasDeGrupo = (perfiles ?? []).filter(
    (p) => p.rol === 'direccion' && p.alcance === 'grupo' && p.activo,
  );
  if (todasLasDeGrupo.length > 0 && deCentro) {
    for (const g of todasLasDeGrupo) {
      await admin.from('perfiles').update({ activo: false }).eq('id', g.id);
      limpieza.push(() => admin.from('perfiles').update({ activo: true }).eq('id', g.id));
    }

    const elegido = await propietarioParaReapertura(admin, null, bellamar.id);
    comprobar(
      'un caso de Bellamar NO cae en la dirección de Horizonte',
      elegido !== deCentro.id,
      elegido === deCentro.id
        ? 'le ha caído a quien no puede abrirlo'
        : elegido
          ? 'va a alguien que sí lo ve'
          : 'se queda sin propietario, que es preferible a uno ciego',
    );

    const suPropioCentro = await propietarioParaReapertura(admin, null, horizonte.id);
    comprobar(
      'pero un caso de Horizonte sí puede caerle a ella',
      suPropioCentro === deCentro.id,
      'si no, la regla estaría descartando a todo el mundo',
    );

    for (const g of todasLasDeGrupo) {
      await admin.from('perfiles').update({ activo: true }).eq('id', g.id);
    }
  } else {
    comprobar('hay una dirección de grupo y una de centro para comprobarlo', false);
  }

  console.log(
    fallos === 0
      ? '\nQuien no está no recibe trabajo, y lo que vuelve cae en quien puede verlo.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
}

main()
  .catch((e) => {
    console.error('\nEl script ha fallado:', e);
    fallos++;
  })
  .finally(async () => {
    // Siempre, aunque algo haya reventado por el camino: este script apaga a
    // gente y enciende el reparto, y dejarlo a medias seria peor que no correrlo.
    for (const deshacer of limpieza.reverse()) await deshacer();
    console.log('  (todo lo de prueba, deshecho)');
    process.exit(fallos === 0 ? 0 : 1);
  });
