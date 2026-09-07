/**
 * La puntuación hace lo que dicen las reglas.
 *
 * Usa la función real (`puntuar`) con las reglas reales de la base, no una
 * copia: si alguien cambia el cálculo y se olvida de esto, salta.
 *
 *   npx tsx --env-file=.env.staging scripts/verificar-scoring.ts
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import {
  puntuar,
  puntuarSenales,
  reglaDesdeFila,
  nivelDeCalor,
  senalesQueCumple,
  umbralesDesde,
  UMBRALES_POR_DEFECTO,
  type Regla,
  type SenalesLead,
} from '../src/lib/scoring';
import { senalesDeCasosAbiertos } from '../src/lib/automatizacion';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICIO = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(URL, SERVICIO, { auth: { persistSession: false } });

let fallos = 0;
const comprobar = (titulo: string, ok: boolean, detalle = '') => {
  console.log(`  ${ok ? 'OK  ' : 'FALLA'}  ${titulo}${detalle ? ' — ' + detalle : ''}`);
  if (!ok) fallos++;
};

async function reglas(): Promise<Regla[]> {
  const { data } = await admin.from('scoring_reglas').select('nombre, condicion, puntos, activa');
  return (data ?? []).map(reglaDesdeFila).filter((r): r is Regla => r !== null);
}

/** Un caso base al que ir encendiendo señales. */
const BASE: SenalesLead = {
  estado: 'nuevo',
  urgencia: null,
  quienContacta: null,
  relacionContacto: null,
  canalSlug: null,
  respondido: false,
  minutosHastaRespuesta: null,
  tienePresupuesto: false,
  fueReabierto: false,
  diasSinActividad: 0,
  citasNoAsistidas: 0,
};

async function main() {
  console.log('\nPuntuación de casos, con las reglas que hay en la base\n');

  const rs = await reglas();
  comprobar('Hay reglas cargadas', rs.length > 0, `${rs.length} regla(s)`);

  // 1. El caso del enunciado: urgencia alta + canal recomendación.
  const caliente = puntuar({ ...BASE, urgencia: 'alta', canalSlug: 'recomendacion' }, rs);
  comprobar(
    'Urgencia alta + canal recomendación puntúa 40 o más',
    caliente.puntuacion >= 40,
    `${caliente.puntuacion} puntos — ${caliente.desglose.map((d) => d.motivo + ' ' + d.puntos).join(', ')}`,
  );
  comprobar(
    'y le corresponde badge de calor',
    nivelDeCalor(caliente.puntuacion).texto !== 'Frío',
    nivelDeCalor(caliente.puntuacion).texto,
  );

  // 2. Un caso pelado no debe puntuar por arte de magia.
  const frio = puntuar(BASE, rs);
  comprobar('Un caso sin ninguna señal puntúa 0', frio.puntuacion === 0, `${frio.puntuacion}`);

  // 3. Los cerrados no compiten por la atención de nadie.
  const cerrado = puntuar({ ...BASE, estado: 'perdido', urgencia: 'alta' }, rs);
  comprobar('Un caso perdido puntúa 0 aunque sea urgente', cerrado.puntuacion === 0);

  // 4. Las penalizaciones restan de verdad.
  const enfriado = puntuar({ ...BASE, urgencia: 'alta', diasSinActividad: 10 }, rs);
  comprobar(
    'Más de 7 días sin respuesta resta',
    enfriado.puntuacion < puntuar({ ...BASE, urgencia: 'alta' }, rs).puntuacion,
    `${enfriado.puntuacion} frente a ${puntuar({ ...BASE, urgencia: 'alta' }, rs).puntuacion}`,
  );

  // 5. Cambiar una regla desde administración cambia el resultado.
  const antes = puntuar({ ...BASE, urgencia: 'alta' }, rs).puntuacion;
  const { data: regla } = await admin
    .from('scoring_reglas')
    .select('id, puntos')
    .eq('nombre', 'Urgencia alta')
    .maybeSingle();

  if (regla) {
    await admin.from('scoring_reglas').update({ puntos: 5 }).eq('id', regla.id);
    const despues = puntuar({ ...BASE, urgencia: 'alta' }, await reglas()).puntuacion;
    comprobar(
      'Bajar los puntos de una regla baja la puntuación',
      despues < antes,
      `${antes} -> ${despues}`,
    );

    await admin.from('scoring_reglas').update({ activa: false }).eq('id', regla.id);
    const apagada = puntuar({ ...BASE, urgencia: 'alta' }, await reglas()).puntuacion;
    comprobar('Apagar la regla la deja sin efecto', apagada === 0, `${apagada}`);

    // Dejarla como estaba.
    await admin
      .from('scoring_reglas')
      .update({ puntos: regla.puntos, activa: true })
      .eq('id', regla.id);
    console.log('\n  (regla «Urgencia alta» restaurada)');
  } else {
    comprobar('Existe la regla «Urgencia alta» para poder probar el cambio', false);
  }

  // 6. Una regla con una señal inventada no cuenta, en vez de romper el cálculo.
  const inventada = reglaDesdeFila({
    nombre: 'Inventada',
    condicion: { senal: 'no_existe' },
    puntos: 99,
    activa: true,
  });
  comprobar('Una regla con una señal desconocida se descarta', inventada === null);

  // ---------------------------------------------------------------------------
  console.log('\nEl simulador enseña lo que el motor va a guardar:');

  /*
   * La pantalla de lead scoring calcula en el NAVEGADOR, con las señales que le
   * manda el servidor; el motor calcula en el servidor con el caso entero. Si
   * las dos cuentas se separaran, dirección movería unos controles viendo un
   * resultado y la aplicación acabaría enseñando otro — la misma clase de
   * divergencia que tuvieron el panel y el informe de previsión.
   */
  // Las reglas ya cargadas arriba, las mismas que usa el motor.
  const abiertos = await senalesDeCasosAbiertos(admin as never);
  let discrepancias = 0;
  for (const caso of abiertos) {
    const delMotor = puntuar(caso.senales, rs).puntuacion;
    const delSimulador = puntuarSenales(senalesQueCumple(caso.senales), rs);
    if (delMotor !== delSimulador) discrepancias++;
  }
  comprobar(
    `las dos cuentas coinciden en los ${abiertos.length} casos abiertos`,
    discrepancias === 0,
    discrepancias ? `${discrepancias} discrepancia(s)` : 'ni una diferencia',
  );

  comprobar(
    'y el desglose suma exactamente la cifra que acompaña',
    abiertos.every((c) => {
      const { desglose, puntuacion } = puntuar(c.senales, rs);
      const suma = desglose.reduce((t, d) => t + d.puntos, 0);
      return puntuacion === Math.max(0, Math.min(100, suma));
    }),
    'un desglose que no cuadra con su número es peor que no tenerlo',
  );

  // ---------------------------------------------------------------------------
  console.log('\nLos cortes de calor, en un solo sitio:');

  const { data: cfgUmbrales } = await admin
    .from('configuracion')
    .select('valor')
    .eq('clave', 'scoring_umbrales')
    .maybeSingle();
  const umbrales = umbralesDesde(cfgUmbrales?.valor);
  comprobar(
    'están en configuración, no en el código',
    cfgUmbrales !== null,
    `caliente ${umbrales.caliente}, templado ${umbrales.templado}`,
  );

  comprobar(
    'un valor absurdo no rompe la pantalla, cae en los de fábrica',
    umbralesDesde({ caliente: 10, templado: 90 }).caliente === UMBRALES_POR_DEFECTO.caliente &&
      umbralesDesde('cualquier cosa').templado === UMBRALES_POR_DEFECTO.templado,
  );

  comprobar(
    'nivelDeCalor respeta el corte que se le pase',
    nivelDeCalor(50, { caliente: 45, templado: 20 }).texto === 'Caliente' &&
      nivelDeCalor(50, { caliente: 80, templado: 20 }).texto === 'Templado',
  );

  /*
   * Los cortes estaban escritos a mano en el kanban y en el filtro de «solo
   * calientes», con un comentario que juraba que vivían solo en `nivelDeCalor`.
   * Se mira en el código porque es donde estaban y donde pueden volver.
   */
  const kanban = readFileSync('src/app/leads/kanban.tsx', 'utf8');
  const listado = readFileSync('src/app/leads/page.tsx', 'utf8');
  comprobar(
    'el kanban ya no lleva los cortes escritos a mano',
    !/puntuacion >= 70|puntuacion >= 40/.test(kanban) && kanban.includes('umbrales.caliente'),
  );
  comprobar(
    'y el filtro «solo calientes» usa el mismo corte que el distintivo',
    listado.includes("consulta.gte('puntuacion', umbrales.caliente)"),
  );

  // ---------------------------------------------------------------------------
  console.log('\nEl editor viejo ya no existe:');

  const { data: pesosMuertos } = await admin
    .from('configuracion')
    .select('clave')
    .eq('clave', 'scoring_pesos')
    .maybeSingle();
  comprobar(
    'la clave `scoring_pesos` está borrada',
    pesosMuertos === null,
    'era un JSON editable que ya no leía nadie',
  );

  const parametros = readFileSync('src/app/admin/parametros/page.tsx', 'utf8');
  comprobar(
    'y Parámetros ya no ofrece editarla',
    !parametros.includes('scoring_pesos'),
    'un control que no controla nada es peor que no tenerlo',
  );

  console.log(
    fallos === 0
      ? '\nLa puntuación responde a las reglas: todas las comprobaciones pasan.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main();
