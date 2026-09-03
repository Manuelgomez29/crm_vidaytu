/**
 * Lead scoring: cuánto «calor» tiene un caso, de 0 a 100.
 *
 * Sirve para priorizar la cola cuando entran veinte leads a la vez, no para
 * decidir a quién se atiende: un 12 se llama igual que un 90, solo que más
 * tarde. Por eso la puntuación nunca oculta ni cierra nada.
 *
 * Los pesos viven en `configuracion.scoring_pesos` (regla 13). La primera
 * versión es por reglas; cuando haya suficientes conversiones reales se podrán
 * recalibrar mirando qué señales predijeron de verdad.
 */
import type { EstadoLead } from '@/lib/estados';

export type PesosScoring = {
  urgencia_alta: number;
  urgencia_media: number;
  cita_agendada: number;
  presupuesto: number;
  respondio: number;
  canal_prescriptor: number;
  canal_recomendacion: number;
  afectado_contacta: number;
  penalizacion_por_dia_sin_actividad: number;
  penalizacion_maxima: number;
};

export const PESOS_POR_DEFECTO: PesosScoring = {
  urgencia_alta: 25,
  urgencia_media: 10,
  cita_agendada: 25,
  presupuesto: 15,
  respondio: 15,
  canal_prescriptor: 10,
  canal_recomendacion: 10,
  afectado_contacta: 5,
  penalizacion_por_dia_sin_actividad: -2,
  penalizacion_maxima: -30,
};

export type SenalesLead = {
  estado: EstadoLead;
  urgencia: 'alta' | 'media' | 'baja' | null;
  quienContacta: string | null;
  canalSlug: string | null;
  respondido: boolean;
  tienePresupuesto: boolean;
  diasSinActividad: number;
};

/** Motivos legibles, para poder explicar por qué un caso puntúa lo que puntúa. */
export type DesglosePuntuacion = { motivo: string; puntos: number }[];

export function pesosDesdeConfig(valor: unknown): PesosScoring {
  if (!valor || typeof valor !== 'object') return PESOS_POR_DEFECTO;
  const crudo = valor as Record<string, unknown>;
  const salida = { ...PESOS_POR_DEFECTO };
  for (const clave of Object.keys(PESOS_POR_DEFECTO) as (keyof PesosScoring)[]) {
    const n = Number(crudo[clave]);
    if (Number.isFinite(n)) salida[clave] = n;
  }
  return salida;
}

/**
 * Puntuación y desglose. Los casos cerrados puntúan 0: no compiten por la
 * atención de nadie.
 */
export function puntuar(
  senales: SenalesLead,
  pesos: PesosScoring = PESOS_POR_DEFECTO,
): { puntuacion: number; desglose: DesglosePuntuacion } {
  const cerrados: EstadoLead[] = ['convertido', 'perdido', 'no_valido', 'derivado'];
  if (cerrados.includes(senales.estado)) return { puntuacion: 0, desglose: [] };

  const desglose: DesglosePuntuacion = [];
  const sumar = (motivo: string, puntos: number) => {
    if (puntos !== 0) desglose.push({ motivo, puntos });
  };

  if (senales.urgencia === 'alta') sumar('Urgencia alta', pesos.urgencia_alta);
  else if (senales.urgencia === 'media') sumar('Urgencia media', pesos.urgencia_media);

  if (senales.estado === 'cita_agendada' || senales.estado === 'cita_realizada') {
    sumar('Tiene cita', pesos.cita_agendada);
  }
  if (senales.tienePresupuesto) sumar('Presupuesto enviado', pesos.presupuesto);
  if (senales.respondido) sumar('Ya hubo primera respuesta', pesos.respondio);

  if (senales.canalSlug === 'prescriptor') sumar('Llega por prescriptor', pesos.canal_prescriptor);
  if (senales.canalSlug === 'recomendacion') sumar('Llega por recomendación', pesos.canal_recomendacion);

  // Que llame la propia persona afectada es señal de disposición al cambio.
  if (senales.quienContacta === 'afectado') sumar('Contacta la persona afectada', pesos.afectado_contacta);

  if (senales.diasSinActividad > 0 && pesos.penalizacion_por_dia_sin_actividad !== 0) {
    const bruta = senales.diasSinActividad * pesos.penalizacion_por_dia_sin_actividad;
    const penalizacion = Math.max(bruta, pesos.penalizacion_maxima);
    sumar(`${senales.diasSinActividad} día(s) sin actividad`, Math.round(penalizacion));
  }

  const total = desglose.reduce((suma, d) => suma + d.puntos, 0);
  return { puntuacion: Math.max(0, Math.min(100, Math.round(total))), desglose };
}

/** Etiqueta visual de la puntuación. */
export function nivelDeCalor(puntuacion: number): { texto: string; clase: string } {
  if (puntuacion >= 60) return { texto: 'Caliente', clase: 'chip-danger' };
  if (puntuacion >= 35) return { texto: 'Templado', clase: 'chip-warn' };
  if (puntuacion > 0) return { texto: 'Frío', clase: 'chip-mut' };
  return { texto: 'Sin puntuar', clase: 'chip-mut' };
}
