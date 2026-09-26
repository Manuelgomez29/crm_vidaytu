import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

/**
 * La conversación de una persona, sacada de la copia de HighLevel.
 *
 * La ficha de alguien que llegó por Instagram estaba casi vacía: sin teléfono,
 * sin casos y sin etiquetas, porque todo lo que se sabe de esa persona está en
 * lo que escribió. Y eso ya lo teníamos copiado cada noche, sin usar.
 *
 * NO SALE DE ZEROCHATS. Su webhook manda el ciclo de vida del lead —nace,
 * cambia de etapa, recibe etiquetas— pero no los mensajes, y su API tampoco
 * los expone. El contenido de las conversaciones vive en HighLevel, y de ahí
 * lo trae la copia nocturna.
 *
 * Es información de un día antes, como mucho. Para saber quién es alguien y
 * qué pidió, sobra; para contestarle, se va a HighLevel, que es donde se
 * atiende durante el piloto.
 */

/** Entradas que HighLevel mete en el hilo y no son mensajes de nadie. */
const NO_SON_MENSAJES = ['TYPE_ACTIVITY_OPPORTUNITY', 'TYPE_ACTIVITY_APPOINTMENT'];

const CANAL: Record<string, string> = {
  TYPE_INSTAGRAM: 'Instagram',
  TYPE_EMAIL: 'Email',
  TYPE_SMS: 'SMS',
  TYPE_WHATSAPP: 'WhatsApp',
  TYPE_FACEBOOK: 'Facebook',
};

export type MensajeCopiado = {
  id: string;
  /** `true` si lo escribió la persona; `false` si se lo escribimos nosotros. */
  suyo: boolean;
  texto: string;
  cuando: string;
  canal: string;
  adjuntos: number;
};

export type ConversacionCopiada = {
  mensajes: MensajeCopiado[];
  total: number;
  ultimaAt: string | null;
  canales: string[];
  /** Etiquetas que esa persona tiene en HighLevel, que no son las del CRM. */
  etiquetas: string[];
};

type ContenidoMensaje = {
  id?: string;
  body?: string | null;
  direction?: string;
  dateAdded?: string;
  messageType?: string;
  attachments?: unknown[];
};

/**
 * Todo lo que sabemos de lo que esa persona ha hablado con nosotros.
 *
 * Devuelve `null` si no viene de un sistema externo: la mayoría de las
 * personas del directorio llegaron por un formulario o por teléfono y no
 * tienen nada de esto, y la ficha no debe enseñar una sección vacía.
 */
export async function conversacionDeContacto(
  supabase: SupabaseClient<Database>,
  contactoId: string,
  tope = 20,
): Promise<ConversacionCopiada | null> {
  const { data: identidad } = await supabase
    .from('canal_identidades')
    .select('ref_sistema')
    .eq('contacto_id', contactoId)
    .eq('sistema', 'highlevel')
    .maybeSingle();

  if (!identidad?.ref_sistema) return null;

  /*
   * Se filtra por el identificador del contacto DENTRO del contenido copiado,
   * no por la conversación. Una persona puede tener varios hilos —uno de
   * Instagram y otro de email— y lo que interesa es lo que ha dicho, no en
   * qué hilo lo dijo.
   */
  const { data: filas } = await supabase
    .from('canal_espejo')
    .select('contenido')
    .eq('tipo', 'mensaje')
    .eq('contenido->>contactId', identidad.ref_sistema);

  const { data: ficha } = await supabase
    .from('canal_espejo')
    .select('contenido')
    .eq('tipo', 'contacto')
    .eq('ref', identidad.ref_sistema)
    .maybeSingle();

  const etiquetas = (((ficha?.contenido as { tags?: unknown })?.tags ?? []) as unknown[])
    .filter((t): t is string => typeof t === 'string')
    .slice(0, 12);

  /*
   * En orden, del primero al último. Se guardan los ÚLTIMOS `tope`, no los
   * primeros: interesa el final de la conversación. Pero se leen hacia
   * abajo, como una conversación — enseñarlos del más nuevo al más viejo
   * obliga a leerla al revés para entenderla.
   */
  const todos = (filas ?? [])
    .map((f) => f.contenido as ContenidoMensaje)
    .filter((m) => m.messageType && !NO_SON_MENSAJES.includes(m.messageType))
    .sort((a, b) => Date.parse(a.dateAdded ?? '') - Date.parse(b.dateAdded ?? ''));

  if (todos.length === 0 && etiquetas.length === 0) return null;

  const mensajes: MensajeCopiado[] = todos.slice(-tope).map((m) => ({
    id: m.id ?? Math.random().toString(36),
    suyo: m.direction === 'inbound',
    texto: (m.body ?? '').trim(),
    cuando: m.dateAdded ?? '',
    canal: CANAL[m.messageType ?? ''] ?? 'Otro',
    adjuntos: Array.isArray(m.attachments) ? m.attachments.length : 0,
  }));

  return {
    mensajes,
    total: todos.length,
    ultimaAt: todos.at(-1)?.dateAdded ?? null,
    canales: [...new Set(mensajes.map((m) => m.canal))],
    etiquetas,
  };
}
