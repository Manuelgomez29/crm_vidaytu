import type { Database } from '@/lib/database.types';

export type EstadoLead = Database['public']['Enums']['estado_lead'];

export const ETIQUETA_ESTADO: Record<EstadoLead, { texto: string; clases: string }> = {
  nuevo: { texto: 'Nuevo', clases: 'bg-blue-50 text-blue-700 ring-blue-200' },
  contactado: { texto: 'Contactado', clases: 'bg-sky-50 text-sky-700 ring-sky-200' },
  cita_agendada: { texto: 'Cita agendada', clases: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
  cita_realizada: { texto: 'Cita realizada', clases: 'bg-violet-50 text-violet-700 ring-violet-200' },
  en_valoracion: { texto: 'En valoración', clases: 'bg-amber-50 text-amber-700 ring-amber-200' },
  convertido: { texto: 'Convertido', clases: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  derivado: { texto: 'Derivado', clases: 'bg-cyan-50 text-cyan-700 ring-cyan-200' },
  perdido: { texto: 'Perdido', clases: 'bg-red-50 text-red-700 ring-red-200' },
  no_valido: { texto: 'No válido', clases: 'bg-slate-100 text-slate-600 ring-slate-200' },
  reabierto: { texto: 'Reabierto', clases: 'bg-orange-50 text-orange-700 ring-orange-200' },
};

// Estados en los que el caso se considera cerrado a efectos de trabajo comercial.
export const ESTADOS_CERRADOS: EstadoLead[] = ['perdido', 'no_valido'];

export function etiquetaEstado(estado: string) {
  return (
    ETIQUETA_ESTADO[estado as EstadoLead] ?? {
      texto: estado,
      clases: 'bg-slate-100 text-slate-600 ring-slate-200',
    }
  );
}
