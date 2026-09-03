import type { Database } from '@/lib/database.types';

export type EstadoLead = Database['public']['Enums']['estado_lead'];

export const ETIQUETA_ESTADO: Record<EstadoLead, { texto: string; clases: string }> = {
  nuevo: { texto: 'Nuevo', clases: 'bg-primary-soft text-primary ring-primary/25' },
  contactado: { texto: 'Contactado', clases: 'bg-bm-bg text-bm ring-bm/25' },
  cita_agendada: { texto: 'Cita agendada', clases: 'bg-ec-bg text-ec ring-ec/25' },
  cita_realizada: { texto: 'Cita realizada', clases: 'bg-gr-bg text-gr ring-gr/25' },
  en_valoracion: { texto: 'En valoración', clases: 'bg-warn-soft text-warn ring-warn/25' },
  convertido: { texto: 'Convertido', clases: 'bg-ok-soft text-ok ring-ok/25' },
  derivado: { texto: 'Derivado', clases: 'bg-hz-bg text-hz ring-hz/25' },
  perdido: { texto: 'Perdido', clases: 'bg-danger-soft text-danger ring-danger/25' },
  no_valido: { texto: 'No válido', clases: 'bg-surface2 text-ink2 ring-line' },
  reabierto: { texto: 'Reabierto', clases: 'bg-coral-soft text-coral-ink ring-coral/30' },
};

// Estados en los que el caso se considera cerrado a efectos de trabajo comercial.
export const ESTADOS_CERRADOS: EstadoLead[] = ['perdido', 'no_valido'];

export function etiquetaEstado(estado: string) {
  return (
    ETIQUETA_ESTADO[estado as EstadoLead] ?? {
      texto: estado,
      clases: 'bg-surface2 text-ink2 ring-line',
    }
  );
}
