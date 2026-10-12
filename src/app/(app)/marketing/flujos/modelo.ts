/**
 * El vocabulario de los flujos: tipos de paso, de condición y estados del caso.
 *
 * Va en un módulo normal porque lo necesitan tanto las acciones de servidor
 * como el constructor en el navegador, y un fichero `'use server'` solo puede
 * exportar funciones: cualquier constante exportada desde allí rompe la página.
 */

export const TIPOS_PASO = [
  'email',
  'esperar',
  'etiqueta',
  'tarea',
  'aviso',
  'lista',
  'condicion',
  'fin',
] as const;
export type TipoPaso = (typeof TIPOS_PASO)[number];

export const TIPOS_CONDICION = [
  'abrio_email',
  'hizo_clic',
  'tiene_etiqueta',
  'tiene_consentimiento',
  'estado_lead',
] as const;

export const ESTADOS_LEAD = [
  'nuevo',
  'contactado',
  'cita_agendada',
  'cita_realizada',
  'en_valoracion',
  'convertido',
  'derivado',
  'perdido',
  'no_valido',
  'reabierto',
] as const;

/** Lo que manda el constructor por cada paso. `id` solo si ya existía. */
export type PasoEnviado = {
  id?: string;
  clave: string;
  tipo: TipoPaso;
  config: Record<string, unknown>;
  es_inicio: boolean;
  orden: number;
  siguiente: string | null;
  siguiente_si: string | null;
  siguiente_no: string | null;
};
