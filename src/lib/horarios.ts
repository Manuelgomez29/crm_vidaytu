import { ZONA } from '@/lib/fechas';

/**
 * El horario de atención de cada centro, y el reloj del SLA.
 *
 * La regla 9 dice «60 min de primera respuesta EN HORARIO DEL CENTRO». Se
 * estaba contando a reloj, 24 horas al día, y con dos landings de Meta eso
 * tiene una consecuencia diaria: un caso que entra a las 02:00 sale marcado
 * fuera de plazo a las 03:00, y el equipo abre a las nueve con la pantalla en
 * rojo por algo que nadie podía contestar.
 *
 * Lo grave no es el ruido. Es que «cumplimiento del SLA» pasa a ser un objetivo
 * IMPOSIBLE: por bien que trabajen, los casos de madrugada lo incumplen
 * siempre. Un indicador inalcanzable no mide, y una alarma que nadie se cree
 * deja de ser una alarma.
 *
 * La columna `centros.horario_atencion` ya existía en la base. No la leía
 * nadie.
 *
 * FORMA DEL DATO. `null` —o `{ siempre: true }`— significa 24/7, que es lo que
 * corresponde a Bellamar (admisiones 24/7/365) y también lo que hacía la
 * plataforma hasta ahora: así, mientras nadie configure nada, NO cambia el
 * comportamiento de golpe. Lo demás va por día de la semana, 0 = domingo, con
 * la franja en hora de Madrid:
 *
 *   { "1": ["09:00", "21:00"], "6": ["10:00", "14:00"], "0": null }
 *
 * Un día ausente o a `null` es un día cerrado.
 */
export type HorarioCentro = {
  siempre?: boolean;
  dias?: Record<string, [string, string] | null>;
};

export const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Lee lo que venga de la base sin fiarse: cualquier cosa rara es 24/7. */
export function horarioDe(valor: unknown): HorarioCentro {
  if (!valor || typeof valor !== 'object') return { siempre: true };
  const h = valor as HorarioCentro;
  if (h.siempre) return { siempre: true };
  if (!h.dias || typeof h.dias !== 'object') return { siempre: true };
  return { dias: h.dias };
}

export function esVeinticuatroSiete(h: HorarioCentro): boolean {
  return !!h.siempre || !h.dias;
}

/** Día de la semana y minuto del día, en Madrid, para un instante cualquiera. */
function enMadrid(ts: number): { dia: number; minuto: number } {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ts));
  const trozo = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  const dias: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  // `hour: '2-digit'` con hour12:false da «24» a medianoche en algunos motores.
  const hora = Number(trozo('hour')) % 24;
  return { dia: dias[trozo('weekday')] ?? 0, minuto: hora * 60 + Number(trozo('minute')) };
}

const aMinutos = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** ¿Está abierto el centro en ese instante? */
export function estaAbierto(h: HorarioCentro, cuando: Date | string | number): boolean {
  if (esVeinticuatroSiete(h)) return true;
  const { dia, minuto } = enMadrid(new Date(cuando).getTime());
  const franja = h.dias?.[String(dia)];
  if (!franja) return false;
  return minuto >= aMinutos(franja[0]) && minuto < aMinutos(franja[1]);
}

const MINUTO = 60_000;

/**
 * Minutos de ATENCIÓN transcurridos entre dos instantes.
 *
 * Es la pieza que sostiene todo lo demás: con ella, «lleva 70 minutos sin
 * respuesta» quiere decir setenta minutos en los que había alguien para
 * contestar, no setenta minutos de madrugada.
 *
 * Va minuto a minuto a propósito. Se puede calcular con aritmética de franjas y
 * es más rápido, pero es de las cosas que se escriben mal una vez y luego nadie
 * revisa: hay cambios de hora, franjas que cruzan la medianoche, días cerrados
 * en medio. A un caso se le miran horas, como mucho días; el tope corta lo
 * demás y evita que un `created_at` absurdo cuelgue una pasada del motor.
 */
export function minutosDeAtencion(
  h: HorarioCentro,
  desde: Date | string | number,
  hasta: Date | string | number,
  topeDias = 30,
): number {
  const a = new Date(desde).getTime();
  const b = new Date(hasta).getTime();
  if (!(b > a)) return 0;

  const brutos = Math.floor((b - a) / MINUTO);
  if (esVeinticuatroSiete(h)) return brutos;

  const tope = topeDias * 24 * 60;
  let abiertos = 0;
  for (let i = 0; i < Math.min(brutos, tope); i++) {
    if (estaAbierto(h, a + i * MINUTO)) abiertos++;
  }
  return abiertos;
}

/** Texto corto para la pantalla: «L-V 9:00-21:00 · S 10:00-14:00» o «24/7». */
export function resumenHorario(h: HorarioCentro): string {
  if (esVeinticuatroSiete(h)) return 'Abierto siempre (24/7)';
  const abiertos = [1, 2, 3, 4, 5, 6, 0]
    .map((d) => ({ d, franja: h.dias?.[String(d)] }))
    .filter((x) => x.franja);
  if (abiertos.length === 0) return 'Sin horario: nunca se considera abierto';
  return abiertos
    .map((x) => `${DIAS[x.d].slice(0, 3)} ${x.franja![0]}-${x.franja![1]}`)
    .join(' · ');
}
