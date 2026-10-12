/**
 * Textos de los flujos que comparten la lista y la ficha. Van aparte porque una
 * página de Next solo puede exportar su componente: cualquier otra exportación
 * rompe la compilación.
 */

export const ETIQUETA_ESTADO: Record<string, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  cita_agendada: 'Cita agendada',
  cita_realizada: 'Cita realizada',
  en_valoracion: 'En valoración',
  convertido: 'Convertido',
  derivado: 'Derivado',
  perdido: 'Perdido',
  no_valido: 'No válido',
  reabierto: 'Reabierto',
};

export type Disparador = {
  tipo: string;
  etiqueta_id?: string;
  canal_id?: string;
  fuente_id?: string;
  estado?: string;
};

export type Nombres = {
  etiquetas: Map<string, string>;
  canales: Map<string, string>;
  fuentes: Map<string, string>;
};

export function describirDisparador(d: Disparador, nombres: Nombres): string {
  switch (d.tipo) {
    case 'etiqueta_aplicada':
      return `Cuando se le pone la etiqueta «${nombres.etiquetas.get(d.etiqueta_id ?? '') ?? '?'}»`;
    case 'lead_creado': {
      const partes = [];
      if (d.canal_id) partes.push(`por ${nombres.canales.get(d.canal_id) ?? 'ese canal'}`);
      if (d.fuente_id) partes.push(`desde «${nombres.fuentes.get(d.fuente_id) ?? 'esa fuente'}»`);
      return `Cuando entra un caso nuevo${partes.length ? ' ' + partes.join(' ') : ''}`;
    }
    case 'estado_lead':
      return `Cuando su caso pasa a «${ETIQUETA_ESTADO[d.estado ?? ''] ?? d.estado}»`;
    case 'consentimiento':
      return 'Cuando da su consentimiento de marketing';
    case 'manual':
      return 'Solo a mano, desde la pantalla del flujo';
    default:
      return d.tipo;
  }
}

export const NOMBRE_PASO: Record<string, string> = {
  email: 'Enviar correo',
  esperar: 'Esperar',
  etiqueta: 'Etiqueta',
  tarea: 'Tarea al comercial',
  aviso: 'Aviso al equipo',
  lista: 'Añadir a lista',
  condicion: 'Condición',
  fin: 'Fin',
};

export const CHIP_INSCRIPCION: Record<string, { texto: string; clase: string }> = {
  activa: { texto: 'En curso', clase: 'chip-primary' },
  completada: { texto: 'Terminó', clase: 'chip-ok' },
  salida: { texto: 'Salió', clase: 'chip-mut' },
  pausada: { texto: 'Pausada', clase: 'chip-warn' },
  error: { texto: 'Error', clase: 'chip-danger' },
};
