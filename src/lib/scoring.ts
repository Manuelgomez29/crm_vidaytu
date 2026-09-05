/**
 * Lead scoring: cuánto «calor» tiene un caso, de 0 a 100.
 *
 * Sirve para priorizar la cola cuando entran veinte leads a la vez, no para
 * decidir a quién se atiende: un 12 se llama igual que un 90, solo que más
 * tarde. Por eso la puntuación nunca oculta ni cierra nada.
 *
 * Las reglas viven en la tabla `scoring_reglas` y las ajusta dirección desde
 * administración (regla 13). Cada regla nombra una SEÑAL de este catálogo: no
 * son condiciones libres, y eso es deliberado — una condición mal escrita no
 * encaja nunca y falla en silencio, bajando la puntuación sin que nadie se
 * entere. Con un catálogo cerrado, una regla mal puesta se ve al guardarla.
 *
 * Añadir una señal nueva sigue siendo trabajo de código. Cambiar cuánto pesa,
 * activarla o apagarla, no.
 */
import type { EstadoLead } from '@/lib/estados';

/** Catálogo cerrado de señales. Añadir una implica calcularla más abajo. */
export const SENALES = [
  'urgencia_alta',
  'urgencia_media',
  'cita_agendada',
  'presupuesto',
  'respondio',
  'respondio_rapido',
  'canal_prescriptor',
  'canal_recomendacion',
  'afectado_contacta',
  'familiar_directo',
  'reabierto',
  'sin_respuesta_7d',
  'segundo_no_show',
] as const;

export type Senal = (typeof SENALES)[number];

/** Qué mide cada señal, para poder explicarla en el panel sin abrir el código. */
export const QUE_MIDE: Record<Senal, string> = {
  urgencia_alta: 'Quien atendió marcó el caso como urgente',
  urgencia_media: 'Urgencia media',
  cita_agendada: 'El caso tiene cita agendada o ya realizada',
  presupuesto: 'Se le ha enviado un presupuesto',
  respondio: 'Hubo primera respuesta en algún momento',
  respondio_rapido: 'Se le respondió en menos de una hora desde que entró',
  canal_prescriptor: 'Llega derivado por un prescriptor',
  canal_recomendacion: 'Llega recomendado por alguien que ya pasó por el centro',
  afectado_contacta: 'Contacta la propia persona afectada, no un tercero',
  familiar_directo: 'Quien contacta es padre, madre, pareja o hijo',
  reabierto: 'Ya nos conocía: el caso se reabrió',
  sin_respuesta_7d: 'Más de siete días sin que el contacto conteste',
  segundo_no_show: 'Dos citas seguidas a las que no acudió',
};

export type Regla = {
  nombre: string;
  senal: Senal;
  puntos: number;
  activa: boolean;
};

export type SenalesLead = {
  estado: EstadoLead;
  urgencia: 'alta' | 'media' | 'baja' | null;
  quienContacta: string | null;
  relacionContacto: string | null;
  canalSlug: string | null;
  respondido: boolean;
  /** Minutos entre la entrada del caso y la primera respuesta, si la hubo. */
  minutosHastaRespuesta: number | null;
  tienePresupuesto: boolean;
  fueReabierto: boolean;
  diasSinActividad: number;
  citasNoAsistidas: number;
};

/** Motivos legibles, para poder explicar por qué un caso puntúa lo que puntúa. */
export type DesglosePuntuacion = { motivo: string; puntos: number }[];

/** Convierte una fila de `scoring_reglas` en algo utilizable, o la descarta. */
export function reglaDesdeFila(fila: {
  nombre: string;
  condicion: unknown;
  puntos: number;
  activa: boolean;
}): Regla | null {
  const cond = fila.condicion as { senal?: string } | null;
  const senal = cond?.senal;
  if (!senal || !SENALES.includes(senal as Senal)) return null;
  return { nombre: fila.nombre, senal: senal as Senal, puntos: fila.puntos, activa: fila.activa };
}

/** ¿Se cumple la señal en este caso? */
function cumple(senal: Senal, s: SenalesLead): boolean {
  switch (senal) {
    case 'urgencia_alta':
      return s.urgencia === 'alta';
    case 'urgencia_media':
      return s.urgencia === 'media';
    case 'cita_agendada':
      return s.estado === 'cita_agendada' || s.estado === 'cita_realizada';
    case 'presupuesto':
      return s.tienePresupuesto;
    case 'respondio':
      return s.respondido;
    case 'respondio_rapido':
      return s.minutosHastaRespuesta !== null && s.minutosHastaRespuesta <= 60;
    case 'canal_prescriptor':
      return s.canalSlug === 'prescriptor';
    case 'canal_recomendacion':
      return s.canalSlug === 'recomendacion';
    case 'afectado_contacta':
      return s.quienContacta === 'afectado';
    case 'familiar_directo': {
      const cercanos = ['madre', 'padre', 'pareja', 'hijo', 'hija'];
      const r = (s.relacionContacto ?? '').toLowerCase();
      return cercanos.some((c) => r.includes(c));
    }
    case 'reabierto':
      return s.fueReabierto || s.estado === 'reabierto';
    case 'sin_respuesta_7d':
      return s.diasSinActividad > 7;
    case 'segundo_no_show':
      return s.citasNoAsistidas >= 2;
  }
}

/**
 * Puntuación y desglose. Los casos cerrados puntúan 0: no compiten por la
 * atención de nadie.
 */
export function puntuar(
  senales: SenalesLead,
  reglas: Regla[],
): { puntuacion: number; desglose: DesglosePuntuacion } {
  const cerrados: EstadoLead[] = ['convertido', 'perdido', 'no_valido', 'derivado'];
  if (cerrados.includes(senales.estado)) return { puntuacion: 0, desglose: [] };

  const desglose: DesglosePuntuacion = [];
  for (const regla of reglas) {
    if (!regla.activa || regla.puntos === 0) continue;
    if (cumple(regla.senal, senales)) desglose.push({ motivo: regla.nombre, puntos: regla.puntos });
  }

  const total = desglose.reduce((suma, d) => suma + d.puntos, 0);
  return { puntuacion: Math.max(0, Math.min(100, Math.round(total))), desglose };
}

/**
 * Etiqueta visual. Los cortes son 70 y 40: por debajo de 40 un caso no es
 * «frío» en el sentido de descartable, solo es uno más de la cola.
 */
export function nivelDeCalor(puntuacion: number): { texto: string; clase: string } {
  if (puntuacion >= 70) return { texto: 'Caliente', clase: 'chip-danger' };
  if (puntuacion >= 40) return { texto: 'Templado', clase: 'chip-warn' };
  if (puntuacion > 0) return { texto: 'Frío', clase: 'chip-mut' };
  return { texto: 'Sin puntuar', clase: 'chip-mut' };
}
