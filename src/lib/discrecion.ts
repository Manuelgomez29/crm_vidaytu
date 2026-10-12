/**
 * Discreción (regla 12): nada de lo que sale hacia un paciente o su familia
 * puede dejar adivinar por qué nos escribe.
 *
 * El contenido ya se revisaba (`terminosProhibidosEn`, en campañas y flujos).
 * Faltaba el REMITENTE, que se lee antes que nada: en la bandeja de entrada,
 * en la notificación del móvil, en la pantalla bloqueada que ve quien esté al
 * lado. «Bellamar <hola@bellamaradicciones.com>» cuenta el motivo sin abrir el
 * correo.
 *
 * Y en un dominio las palabras van pegadas: «centrodeadiccionesentarragona»
 * no tiene ninguna «adicciones» suelta, así que la búsqueda por palabras del
 * contenido no la ve. Para el remitente se busca el término DENTRO del texto.
 */

/** Los términos que no pueden aparecer en lo que recibe un paciente. */
export const TERMINOS_CLINICOS = [
  'adiccion',
  'adicciones',
  'adicto',
  'adicta',
  'drogodependencia',
  'desintoxicacion',
  'rehabilitacion',
  'recaida',
  'alcoholismo',
  'alcoholico',
  'cocaina',
  'heroina',
  'ludopatia',
  'consumo',
  'abstinencia',
];

export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Los términos clínicos que asoman en un remitente —nombre o dirección—,
 * aunque vayan pegados a otras palabras. Lista vacía: es discreto.
 */
export function remitenteRevela(
  remitente: string | null | undefined,
  terminos: string[] = TERMINOS_CLINICOS,
): string[] {
  if (!remitente) return [];
  const texto = normalizar(remitente).replace(/[^a-z0-9]/g, '');
  return terminos.filter((t) => texto.includes(normalizar(t).replace(/[^a-z0-9]/g, '')));
}

/** El mensaje para quien configura: qué palabra y por qué no vale. */
export function avisoRemitente(remitente: string, terminos: string[]): string {
  return `El remitente «${remitente}» deja ver «${terminos.join('», «')}». Lo leen pacientes y familias antes de abrir el correo (regla de discreción): usa un dominio neutro, como el del nombre del centro.`;
}
