/**
 * El reloj del SLA cuenta horas de atención, no horas de reloj.
 *
 * La regla 9 pide «60 min en horario del centro». Se contaba a reloj, asi que
 * un caso de las 02:00 salia fuera de plazo a las 03:00 y «cumplimiento del
 * SLA» era un objetivo imposible: los casos de madrugada lo incumplian siempre,
 * hiciera el equipo lo que hiciera.
 *
 * Esto se prueba con instantes fijos y a mano —no contra la base— porque lo que
 * puede estar mal es la aritmetica: el cambio de hora, el dia cerrado en medio,
 * el minuto exacto del cierre. Son los casos que uno no reproduce por
 * casualidad usando la aplicacion.
 *
 *   npx tsx scripts/verificar-horarios.ts
 */
import { createClient } from '@supabase/supabase-js';
import {
  estaAbierto,
  horarioDe,
  minutosDeAtencion,
  resumenHorario,
  type HorarioCentro,
} from '../src/lib/horarios';
import { ejecutarAlertas } from '../src/lib/alertas';
import type { Database } from '../src/lib/database.types';

let fallos = 0;
const comprobar = (t: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK  ' : 'FALLA'}  ${t}${d ? ' — ' + d : ''}`);
  if (!ok) fallos++;
};

/** Un instante de Madrid escrito como se piensa, no en UTC. */
const madrid = (texto: string) => new Date(`${texto}:00.000+02:00`);

// Horizonte: de lunes a viernes hasta las 21:00, y abre sabados por la manana.
const HORIZONTE: HorarioCentro = {
  dias: {
    '1': ['09:00', '21:00'],
    '2': ['09:00', '21:00'],
    '3': ['09:00', '21:00'],
    '4': ['09:00', '21:00'],
    '5': ['09:00', '21:00'],
    '6': ['10:00', '14:00'],
    '0': null,
  },
};

async function main() {
  console.log('\nHorario de atención y reloj del SLA\n');

  // ---------------------------------------------------------------------------
  console.log('Lo que llega de la base, sin fiarse:');

  comprobar('sin horario = 24/7, que es lo que hacía antes', horarioDe(null).siempre === true);
  comprobar('una cadena suelta tampoco rompe', horarioDe('lunes a viernes').siempre === true);
  comprobar('y un objeto sin días, igual', horarioDe({ vale: 1 }).siempre === true);

  // ---------------------------------------------------------------------------
  console.log('\n¿Está abierto?');

  // 2026-09-14 es LUNES; 2026-09-19, sabado; 2026-09-20, domingo.
  comprobar('lunes a las 10:00, sí', estaAbierto(HORIZONTE, madrid('2026-09-14T10:00')));
  comprobar('lunes a las 02:00, no', !estaAbierto(HORIZONTE, madrid('2026-09-14T02:00')));
  comprobar(
    'lunes a las 21:00 en punto, ya no',
    !estaAbierto(HORIZONTE, madrid('2026-09-14T21:00')),
  );
  comprobar('lunes a las 20:59, todavía sí', estaAbierto(HORIZONTE, madrid('2026-09-14T20:59')));
  comprobar(
    'sábado a las 11:00, sí — Horizonte abre',
    estaAbierto(HORIZONTE, madrid('2026-09-19T11:00')),
  );
  comprobar('sábado a las 16:00, no', !estaAbierto(HORIZONTE, madrid('2026-09-19T16:00')));
  comprobar('domingo, cerrado', !estaAbierto(HORIZONTE, madrid('2026-09-20T12:00')));
  comprobar(
    'y 24/7 está abierto de madrugada',
    estaAbierto({ siempre: true }, madrid('2026-09-20T04:00')),
  );

  // ---------------------------------------------------------------------------
  console.log('\nEl caso que motivó todo esto:');

  /*
   * Entra a las 02:00 de un lunes. A las 03:00 el reloj dice que lleva una hora
   * —fuera de plazo— y el horario dice que lleva CERO minutos de atencion,
   * porque el centro abre a las nueve.
   */
  const entrada = madrid('2026-09-14T02:00');
  const aLasTres = madrid('2026-09-14T03:00');
  comprobar(
    'a las 03:00 lleva 0 minutos de atención, no 60',
    minutosDeAtencion(HORIZONTE, entrada, aLasTres) === 0,
    `${minutosDeAtencion(HORIZONTE, entrada, aLasTres)} min`,
  );
  comprobar(
    'y a reloj habrían sido 60, que es lo que marcaba en rojo',
    minutosDeAtencion({ siempre: true }, entrada, aLasTres) === 60,
  );

  const aLasNueveTreinta = madrid('2026-09-14T09:30');
  comprobar(
    'a las 09:30 lleva 30 minutos: el plazo empieza al abrir',
    minutosDeAtencion(HORIZONTE, entrada, aLasNueveTreinta) === 30,
    `${minutosDeAtencion(HORIZONTE, entrada, aLasNueveTreinta)} min`,
  );
  comprobar(
    'a las 10:05 ya se ha pasado de 60',
    minutosDeAtencion(HORIZONTE, entrada, madrid('2026-09-14T10:05')) > 60,
  );

  // ---------------------------------------------------------------------------
  console.log('\nLo que cruza días cerrados:');

  /*
   * Viernes a las 20:30. El sabado abre cuatro horas y el domingo esta cerrado.
   * De viernes 20:30 al lunes 09:30 hay 30 min del viernes + 240 del sabado +
   * 30 del lunes = 300.
   */
  const viernesTarde = madrid('2026-09-18T20:30');
  const lunesSiguiente = madrid('2026-09-21T09:30');
  const cruzando = minutosDeAtencion(HORIZONTE, viernesTarde, lunesSiguiente);
  comprobar(
    'viernes 20:30 → lunes 09:30 son 300 minutos de atención',
    cruzando === 300,
    `${cruzando} min (30 del viernes + 240 del sábado + 30 del lunes)`,
  );
  // 61 horas de reloj contra 5 de atencion: la diferencia no es un matiz.
  const aReloj = minutosDeAtencion({ siempre: true }, viernesTarde, lunesSiguiente);
  comprobar('y a reloj habrían sido 3.660', aReloj === 3660, `${aReloj} min, o sea 61 horas`);

  // ---------------------------------------------------------------------------
  console.log('\nDetalles que se escriben mal una vez:');

  comprobar(
    'el orden no importa: al revés da cero, no un número negativo',
    minutosDeAtencion(HORIZONTE, aLasTres, entrada) === 0,
  );
  comprobar(
    'un centro sin ningún día abierto nunca suma',
    minutosDeAtencion({ dias: { '0': null } }, viernesTarde, lunesSiguiente) === 0,
  );
  comprobar(
    'el tope corta una fecha absurda en vez de colgarse',
    minutosDeAtencion(HORIZONTE, madrid('2020-01-01T00:00'), lunesSiguiente) > 0,
  );

  /*
   * Cambio de hora: la madrugada del 25 de octubre de 2026, Espana atrasa el
   * reloj y las 03:00 vuelven a ser las 02:00. Con el centro cerrado a esa
   * hora, la hora repetida no puede sumar minutos de atencion.
   */
  const cambioHora = minutosDeAtencion(
    HORIZONTE,
    new Date('2026-10-25T00:00:00.000+02:00'),
    new Date('2026-10-25T06:00:00.000+01:00'),
  );
  comprobar(
    'la noche del cambio de hora no inventa minutos',
    cambioHora === 0,
    `${cambioHora} min`,
  );

  // ---------------------------------------------------------------------------
  console.log('\nCómo se lee en pantalla:');
  comprobar('24/7 se dice claro', resumenHorario({ siempre: true }).includes('24/7'));
  comprobar(
    'y un horario se lee de un vistazo',
    resumenHorario(HORIZONTE).includes('Sáb 10:00-14:00'),
    resumenHorario(HORIZONTE),
  );

  // ---------------------------------------------------------------------------
  // Y ahora de verdad: contra la base y pasando por la alerta real.
  // ---------------------------------------------------------------------------
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) await contraLaBase();

  console.log(
    fallos === 0
      ? '\nEl SLA cuenta solo el tiempo en el que había alguien para contestar.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

/**
 * La comprobacion que importa: que la ALERTA no salta.
 *
 * Lo de arriba prueba la aritmetica. Esto prueba que esa aritmetica esta en el
 * camino que se recorre de verdad — que es donde fallan las cosas: una funcion
 * correcta que nadie llama no arregla nada.
 */
async function contraLaBase() {
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  console.log('\nLa alerta de SLA, contra la base:');

  const { count: dePrueba } = await admin
    .from('perfiles')
    .select('id', { count: 'exact', head: true })
    .like('email', '%@test.com');
  if ((dePrueba ?? 0) === 0) {
    comprobar('entorno de pruebas', false, 'esto crea un caso; no se hace fuera de pruebas');
    return;
  }

  /*
   * DETERMINISTA, y por eso no se usa el horario que haya configurado nadie.
   *
   * La primera version creaba un caso a las 02:00 en Horizonte y esperaba que
   * NO saltara la alarma. Fallaba — con razon: el script corria a las 13:00,
   * Horizonte abre a las 9, y ese caso llevaba ya cuatro horas de atencion. La
   * comprobacion dependia de la hora a la que se lanzara el script, que es una
   * forma elegante de no comprobar nada.
   *
   * Asi que se monta la situacion: a un centro se le pone un horario que lo
   * deja CERRADO HOY, sea hoy el dia que sea, y se le devuelve el suyo al
   * acabar.
   */
  const { data: centros } = await admin.from('centros').select('id, nombre, horario_atencion');
  const cerrado = (centros ?? []).find((c) => !/bandeja/i.test(c.nombre));
  const abierto = (centros ?? []).find((c) => c.id !== cerrado?.id && !/bandeja/i.test(c.nombre));
  if (!cerrado || !abierto) {
    comprobar('hay dos centros con los que comparar', false);
    return;
  }

  const horarioOriginalCerrado = cerrado.horario_atencion;
  const horarioOriginalAbierto = abierto.horario_atencion;

  // Abierto solo MAÑANA: hoy, sea la hora que sea, esta cerrado.
  const hoyDia = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', weekday: 'short' })
      .formatToParts(new Date())
      .map((p) => ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 })[p.value])
      .find((v) => v !== undefined) ?? 1,
  );
  const otroDia = String((hoyDia + 1) % 7);

  await admin
    .from('centros')
    .update({ horario_atencion: { dias: { [otroDia]: ['09:00', '17:00'] } } })
    .eq('id', cerrado.id);
  await admin
    .from('centros')
    .update({ horario_atencion: { siempre: true } })
    .eq('id', abierto.id);

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

  // Hace tres horas: a reloj, muy pasado de los 60 minutos.
  const haceTresHoras = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

  const crear = async (centroId: string, nombre: string) => {
    await admin.from('leads').delete().eq('nombre', nombre);
    const { data } = await admin
      .from('leads')
      .insert({
        nombre,
        telefono: '+3460009' + Math.floor(1000 + Math.random() * 8999),
        centro_id: centroId,
        canal_id: canal!.id,
        pipeline_id: pipeline!.id,
        etapa_id: etapa!.id,
        estado: 'nuevo',
        quien_contacta: 'afectado',
        created_at: haceTresHoras,
      })
      .select('id')
      .single();
    return data!.id;
  };

  const enCerrado = await crear(cerrado.id, 'SLA con el centro cerrado (prueba)');
  const enAbierto = await crear(abierto.id, 'SLA con el centro abierto (prueba)');

  await ejecutarAlertas(admin);

  /*
   * Se mira la CLAVE, no el tipo. `lead_sin_atender` lo emiten tres sitios: el
   * SLA y las dos alertas de cadencia. Un caso nuevo del dia 0 dispara la de
   * cadencia con toda la razon —toca el primer intento—, asi que filtrar por
   * tipo daria por «fuera de plazo» algo que no lo esta. La clave `sla:` es la
   * unica que sale del bloque que nos ocupa.
   */
  const fueraDePlazo = async (leadId: string) => {
    const { count } = await admin
      .from('notificaciones')
      .select('id', { count: 'exact', head: true })
      .eq('lead_id', leadId)
      .like('clave', 'sla:%');
    return (count ?? 0) > 0;
  };

  comprobar(
    'un caso de hace 3 horas con el centro CERRADO no se marca fuera de plazo',
    !(await fueraDePlazo(enCerrado)),
    'nadie podía contestarlo: el plazo no había empezado a correr',
  );
  comprobar(
    'y el mismo caso en un centro 24/7 SÍ se marca',
    await fueraDePlazo(enAbierto),
    'sin esto, lo de arriba lo aprobaría una alerta que no salta nunca',
  );

  await admin.from('notificaciones').delete().in('lead_id', [enCerrado, enAbierto]);
  await admin.from('leads').delete().in('id', [enCerrado, enAbierto]);
  await admin
    .from('centros')
    .update({ horario_atencion: horarioOriginalCerrado })
    .eq('id', cerrado.id);
  await admin
    .from('centros')
    .update({ horario_atencion: horarioOriginalAbierto })
    .eq('id', abierto.id);
  console.log('  (casos de prueba borrados y horarios devueltos)');
}

main();
