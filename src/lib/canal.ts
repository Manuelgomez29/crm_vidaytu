import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { normalizarTelefono, telefonoDeCanal } from '@/lib/telefonos';

/**
 * El anexo de canales sociales.
 *
 * Durante el piloto, los contactos de Instagram y del resto de redes se
 * atienden en HighLevel. Aquí no se trabajan: se REGISTRAN, para que en enero
 * se pueda volver sin haber perdido nada.
 *
 * Lo que entra NO crea contactos ni casos. Es deliberado: la unión con el
 * modelo es la decisión de enero, y hacerla ahora obligaría a una cirugía
 * —teléfono opcional, otra clave de deduplicado— que no se deshace.
 */

/** Cinco minutos: una petición más vieja que eso se rechaza aunque venga firmada. */
export const TOLERANCIA_FIRMA_SEGUNDOS = 300;

/**
 * ¿Viene de verdad de ZeroChats?
 *
 * Firman con HMAC-SHA256 sobre `marca-de-tiempo.cuerpo`. Que la marca de
 * tiempo entre en la firma es lo que permite rechazar una petición vieja que
 * alguien haya capturado y esté reenviando: sin ella, una copia válida lo
 * sería para siempre.
 *
 * El cuerpo tiene que ser el CRUDO, tal y como llegó. Si se parsea el JSON y
 * se vuelve a serializar para firmarlo, basta un espacio o un orden distinto
 * para que los bytes no coincidan y la verificación falle sin motivo aparente.
 * Es el error que se comete siempre, y por eso la función pide el texto.
 */
export function firmaZeroChatsValida(
  cuerpoCrudo: string,
  cabeceras: Headers,
  secreto: string,
  ahoraSegundos = Math.floor(Date.now() / 1000),
): boolean {
  const marca = Number(cabeceras.get('x-zerochats-timestamp'));
  const firma = cabeceras.get('x-zerochats-signature') ?? '';

  if (!marca || !Number.isFinite(marca)) return false;
  if (Math.abs(ahoraSegundos - marca) > TOLERANCIA_FIRMA_SEGUNDOS) return false;
  if (!firma.startsWith('sha256=')) return false;

  const esperada = crypto
    .createHmac('sha256', secreto)
    .update(`${marca}.${cuerpoCrudo}`, 'utf8')
    .digest('hex');

  // En tiempo constante: comparar con === filtra por longitud y deja un canal
  // lateral de temporización.
  const a = Buffer.from(esperada, 'hex');
  const b = Buffer.from(firma.slice(7), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

type LeadZeroChats = {
  id?: string;
  name?: string | null;
  username?: string | null;
  platform?: string | null;
  externalId?: string | null;
  email?: string | null;
  phone?: string | null;
  state?: string | null;
  tags?: string[] | null;
};

export type EventoZeroChats = {
  id?: string;
  event?: string;
  createdAt?: string;
  businessId?: string;
  data?: { lead?: LeadZeroChats } & Record<string, unknown>;
};

/** La publicación a la que respondió, cuando el evento la trae. */
export type PublicacionDeOrigen = {
  id: string | null;
  tipo: string | null;
  enlace: string | null;
  via: string | null;
  cuando: string | null;
};

export type IdentidadNormalizada = {
  sistema: string;
  plataforma: string;
  cuenta: string | null;
  ref_sistema: string;
  ref_plataforma: string | null;
  usuario: string | null;
  nombre: string | null;
  telefono: string | null;
  email: string | null;
  estado: string | null;
  etiquetas: string[];
  publicacion: PublicacionDeOrigen | null;
};

/**
 * Del evento a la identidad, sin interpretar de más.
 *
 * Devuelve `null` si el evento no trae un identificador de lead: sin eso no
 * hay a quién apuntarlo, y es mejor guardarlo en crudo sin identidad que
 * inventarse una.
 *
 * DOS DECISIONES QUE PARECEN DETALLES:
 *
 * El teléfono se normaliza a E.164 si se puede, y si no se guarda tal cual.
 * Aquí no hay restricción de formato —que falte es el caso normal— pero el día
 * que estas filas se vuelquen al directorio, un teléfono ya normalizado casa
 * con el de un caso existente y uno con espacios no.
 *
 * El estado se toma de `lead.state`, que viaja en todos los eventos con el
 * mismo identificador interno. En `lead.state_changed` hay además un `state`
 * de primer nivel con el nombre legible; se queda en el crudo. Mezclar los dos
 * daría «BOOKED» unas veces y «Booked» otras para la misma etapa.
 */
export function identidadDesdeEvento(
  evento: EventoZeroChats,
  sistema = 'zerochats',
): IdentidadNormalizada | null {
  const lead = evento.data?.lead;
  if (!lead?.id) return null;

  /*
   * A qué publicación respondió. Solo viene en `lead.media_replied`, y es la
   * mejor pista que tenemos de POR QUÉ escribió esa persona: quien contesta a
   * un reel sobre familias no pregunta lo mismo que quien contesta a un
   * anuncio de ingreso. El enlace puede llegar vacío —Instagram deja de
   * exponer una historia a las 24 horas— y eso es normal, no un fallo.
   */
  const media = evento.data?.media as
    | { id?: string; type?: string; permalink?: string | null }
    | undefined;
  const publicacion: PublicacionDeOrigen | null = media?.id
    ? {
        id: media.id,
        tipo: media.type ?? null,
        enlace: media.permalink ?? null,
        via: typeof evento.data?.source === 'string' ? evento.data.source : null,
        cuando: evento.createdAt ?? null,
      }
    : null;

  /*
   * EL TELÉFONO, QUE EN WHATSAPP ES LA IDENTIDAD.
   *
   * `lead.phone` es lo que la persona haya dicho en la conversación, y puede
   * venir vacío incluso en WhatsApp. Lo que siempre viene en un canal de
   * WhatsApp es `externalId`: los dígitos del número, sin prefijo.
   *
   * Sin esto, un lead de WhatsApp entraba con el teléfono en blanco y su número
   * guardado como texto suelto en `ref_plataforma`. Nunca habría emparejado con
   * la persona del directorio, que vive en E.164, así que el embudo de HOME
   * —Instagram, TikTok y Facebook desembocando en un WhatsApp— habría llenado la
   * base de identidades sueltas.
   */
  const plataforma = (lead.platform ?? 'desconocida').toLowerCase();
  const esWhatsApp = plataforma.includes('whats') || plataforma.includes('wasender');

  const telefonoDicho = (lead.phone ?? '').trim();
  const telefono =
    (telefonoDicho ? normalizarTelefono(telefonoDicho) : null) ??
    (esWhatsApp ? telefonoDeCanal(lead.externalId ?? '') : null) ??
    (telefonoDicho || null);

  return {
    sistema,
    plataforma,
    /*
     * El evento NO dice por qué cuenta receptora entró: solo de qué negocio de
     * ZeroChats viene. Con dos Instagram en el grupo esto importará, así que
     * se guarda el negocio y se deja anotado el hueco.
     */
    cuenta: evento.businessId ?? null,
    ref_sistema: lead.id,
    ref_plataforma: lead.externalId ?? null,
    usuario: lead.username ?? null,
    nombre: lead.name ?? null,
    telefono,
    email: lead.email ?? null,
    estado: lead.state ?? null,
    etiquetas: lead.tags ?? [],
    publicacion,
  };
}

export type ResultadoIngesta =
  | { estado: 'duplicado'; eventoId: number | null }
  | { estado: 'guardado'; eventoId: number; identidadId: string | null };

/**
 * Guarda el evento y actualiza la identidad.
 *
 * EL ORDEN IMPORTA. Primero se guarda el crudo, y solo después se interpreta:
 * si la interpretación falla, el evento sigue estando y se puede reprocesar.
 * Al revés se perdería justo lo que hacía falta para entender el fallo.
 *
 * La idempotencia la da el índice único sobre `(sistema, entrega_ref)`.
 * ZeroChats entrega «al menos una vez»: si nuestro servidor procesa el evento
 * pero tarda en contestar, llega el reintento con el MISMO identificador de
 * envío. El índice lo rechaza y aquí se devuelve «duplicado», que no es un
 * error: es el sistema funcionando.
 */
export async function ingerirEvento(
  admin: SupabaseClient<Database>,
  datos: {
    sistema: string;
    evento: string;
    entregaRef: string | null;
    payload: unknown;
    ip?: string | null;
    identidad: IdentidadNormalizada | null;
  },
): Promise<ResultadoIngesta> {
  const { data: fila, error } = await admin
    .from('canal_eventos')
    .insert({
      sistema: datos.sistema,
      evento: datos.evento,
      entrega_ref: datos.entregaRef,
      payload: datos.payload as Database['public']['Tables']['canal_eventos']['Insert']['payload'],
      ip: datos.ip ?? null,
    })
    .select('id')
    .single();

  // 23505 = clave duplicada. Es el reintento de un envío ya guardado.
  if (error?.code === '23505') return { estado: 'duplicado', eventoId: null };
  if (error || !fila) throw new Error(`No se pudo guardar el evento: ${error?.message}`);

  if (!datos.identidad) {
    await admin
      .from('canal_eventos')
      .update({ procesado_at: new Date().toISOString(), error: 'El evento no trae lead' })
      .eq('id', fila.id);
    return { estado: 'guardado', eventoId: fila.id, identidadId: null };
  }

  const i = datos.identidad;
  const ahora = new Date().toISOString();

  /*
   * `upsert` sobre (sistema, ref_sistema): la primera vez crea, las siguientes
   * actualizan. Lo que llega siempre es el estado ACTUAL del lead —ellos
   * mandan la lista completa de etiquetas en cada evento, no el incremento—,
   * así que pisar es lo correcto.
   */
  const { data: identidad, error: errorIdentidad } = await admin
    .from('canal_identidades')
    .upsert(
      {
        sistema: i.sistema,
        plataforma: i.plataforma,
        cuenta: i.cuenta,
        ref_sistema: i.ref_sistema,
        ref_plataforma: i.ref_plataforma,
        usuario: i.usuario,
        nombre: i.nombre,
        telefono: i.telefono,
        email: i.email,
        estado: i.estado,
        etiquetas: i.etiquetas,
        ...(i.publicacion ? { publicacion: i.publicacion } : {}),
        ultimo_evento_at: ahora,
      },
      { onConflict: 'sistema,ref_sistema' },
    )
    .select('id')
    .single();

  if (errorIdentidad || !identidad) {
    await admin
      .from('canal_eventos')
      .update({ error: `Identidad: ${errorIdentidad?.message ?? 'sin resultado'}` })
      .eq('id', fila.id);
    return { estado: 'guardado', eventoId: fila.id, identidadId: null };
  }

  await admin
    .from('canal_eventos')
    .update({ identidad_id: identidad.id, procesado_at: ahora, error: null })
    .eq('id', fila.id);

  return { estado: 'guardado', eventoId: fila.id, identidadId: identidad.id };
}

/**
 * Vacía el CONTENIDO de los eventos vencidos y conserva la traza.
 *
 * No se borra la fila: se borra lo que dice. Así se mantiene de dónde vino
 * cada persona y qué se entregó —que es lo que hace falta para responder por
 * la captación— sin guardar indefinidamente conversaciones sobre consumo, que
 * son datos de categoría especial (regla 11).
 *
 * El plazo sale de `configuracion`, no de aquí (regla 13).
 */
export async function purgarContenidoVencido(admin: SupabaseClient<Database>): Promise<number> {
  const { data: cfg } = await admin
    .from('configuracion')
    .select('valor')
    .eq('clave', 'canal_retencion_dias')
    .maybeSingle();

  const dias = Number(cfg?.valor) || 90;
  const limite = new Date(Date.now() - dias * 86_400_000).toISOString();

  const { data } = await admin
    .from('canal_eventos')
    .update({ payload: null, payload_purgado_at: new Date().toISOString() })
    .lt('recibido_at', limite)
    .is('payload_purgado_at', null)
    .select('id');

  return (data ?? []).length;
}
