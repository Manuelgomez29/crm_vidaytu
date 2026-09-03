import type { Database } from '@/lib/database.types';

export type CitaAgenda = Database['public']['Functions']['agenda_citas']['Returns'][number];

export const TIPO_CITA: Record<string, string> = {
  primera_llamada: 'Primera llamada',
  primera_cita: 'Primera cita',
  valoracion: 'Valoración',
  seguimiento: 'Seguimiento',
  visita_centro: 'Visita al centro',
  otro: 'Otro',
};

export const MODALIDAD_CITA: Record<string, string> = {
  presencial: 'Presencial',
  videollamada: 'Videollamada',
  telefonica: 'Telefónica',
};

export const ESTADO_CITA: Record<string, { texto: string; clases: string }> = {
  programada: { texto: 'Programada', clases: 'bg-primary-soft text-primary ring-primary/25' },
  realizada: { texto: 'Realizada', clases: 'bg-ok-soft text-ok ring-ok/25' },
  no_show: { texto: 'No se presentó', clases: 'bg-warn-soft text-warn ring-warn/25' },
  cancelada: { texto: 'Cancelada', clases: 'bg-surface2 text-ink2 ring-line' },
};

/**
 * Recordatorio DISCRETO (regla 12): la plantilla vive en `configuracion` y
 * jamás menciona adicciones ni motivos clínicos. Va al contacto CON QUIEN se
 * agendó la cita, no necesariamente al afectado.
 */
export function componerRecordatorio(
  plantilla: string,
  datos: { nombre: string; dia: string; hora: string; lugar: string; profesional: string },
): string {
  return plantilla
    .replaceAll('{nombre}', datos.nombre)
    .replaceAll('{dia}', datos.dia)
    .replaceAll('{hora}', datos.hora)
    .replaceAll('{lugar}', datos.lugar)
    .replaceAll('{profesional}', datos.profesional);
}

/** Nombre de pila, para firmar el recordatorio sin dar el apellido completo. */
export function nombreDePila(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? nombre;
}
