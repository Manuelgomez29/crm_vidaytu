/**
 * La puntuación hace lo que dicen las reglas.
 *
 * Usa la función real (`puntuar`) con las reglas reales de la base, no una
 * copia: si alguien cambia el cálculo y se olvida de esto, salta.
 *
 *   npx tsx --env-file=.env.staging scripts/verificar-scoring.ts
 */
import { createClient } from '@supabase/supabase-js';
import { puntuar, reglaDesdeFila, nivelDeCalor, type Regla, type SenalesLead } from '../src/lib/scoring';

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

  console.log(
    fallos === 0
      ? '\nLa puntuación responde a las reglas: todas las comprobaciones pasan.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main();
