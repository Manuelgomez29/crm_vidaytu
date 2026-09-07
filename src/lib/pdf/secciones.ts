/**
 * Qué secciones puede llevar el informe.
 *
 * Vive aparte del documento a propósito. La pantalla del panel necesita esta
 * lista para pintar las casillas, y si la importara del módulo de maquetación
 * arrastraría toda la librería de PDF —y su registro de fuentes— a una página
 * que solo quiere cinco etiquetas de texto. Eso tumbó el panel en producción:
 * las fuentes no viajan en el paquete de la función, así que el módulo fallaba
 * al cargarse y con él toda la pantalla.
 */
export const SECCIONES = {
  centros: 'Desglose por centro',
  canales: 'De dónde llegan los casos',
  perdidas: 'Motivos de pérdida',
  prevision: 'Previsión del mes entrante',
  clinica: 'Altas del área clínica',
} as const;

export type SeccionInforme = keyof typeof SECCIONES;
export const TODAS: SeccionInforme[] = Object.keys(SECCIONES) as SeccionInforme[];
