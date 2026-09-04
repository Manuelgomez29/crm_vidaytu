/**
 * Email marketing: preparación y envío de campañas.
 *
 * Tres barreras que no se pueden saltar desde la interfaz:
 *
 *   1. CONSENTIMIENTO. Solo entran contactos con `consentimiento_marketing`
 *      registrado. No es un filtro de la pantalla: es esta función la que
 *      construye la lista de destinatarios, y no hay otra forma de crearla.
 *   2. DISCRECIÓN (regla 12). El asunto y el cuerpo se revisan contra un
 *      catálogo de términos clínicos. Si aparece uno, la campaña no sale.
 *      Un correo se reenvía, se lee en una pantalla compartida o lo abre
 *      quien no debe: nunca puede delatar por qué esa persona está en la
 *      lista.
 *   3. BAJA EN UN CLIC. El pie con el enlace de baja se añade aquí, no lo
 *      escribe el redactor, así que ninguna campaña puede salir sin él.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { enviarCorreo, emailConfigurado } from '@/lib/email';
import { contactosDelSegmento, type FiltroSegmento } from '@/lib/segmentos';
import { firmarDestino } from '@/lib/enlaces';

type Cliente = SupabaseClient<Database>;

export type ResultadoCampanas = {
  campanasProcesadas: number;
  enviados: number;
  fallidos: number;
};

const TERMINOS_POR_DEFECTO = [
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

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Términos clínicos encontrados en el contenido. Devuelve la lista, no un
 * booleano: quien redacta necesita saber QUÉ palabra bloqueó el envío.
 */
export function terminosProhibidosEn(
  contenido: string,
  prohibidos: string[] = TERMINOS_POR_DEFECTO,
): string[] {
  const texto = normalizar(contenido);
  return prohibidos.filter((termino) => {
    const t = normalizar(termino);
    // Límite de palabra, para que "consumo" no salte dentro de "consumidor"
    // y, sobre todo, para no bloquear palabras que lo contienen por azar.
    return new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(texto);
  });
}

export async function terminosConfigurados(admin: Cliente): Promise<string[]> {
  const { data } = await admin
    .from('configuracion')
    .select('valor')
    .eq('clave', 'marketing_terminos_prohibidos')
    .maybeSingle();
  return Array.isArray(data?.valor) ? (data.valor as string[]) : TERMINOS_POR_DEFECTO;
}

/** URL pública de la aplicación, sin barra final. */
function urlApp(): string {
  return (process.env.NEXT_PUBLIC_URL_APP ?? 'http://localhost:3000').replace(/\/$/, '');
}

/**
 * Construye la lista de destinatarios de una campaña.
 *
 * Solo contactos con consentimiento y con email. Si la lista es un segmento
 * dinámico, se resuelve en este momento: el envío usa quien cumple los
 * criterios HOY, no quien los cumplía cuando se redactó.
 */
export async function prepararDestinatarios(
  admin: Cliente,
  campanaId: string,
): Promise<{ total: number; error?: string }> {
  const { data: campana } = await admin
    .from('campanas_email')
    .select('id, lista_id, lista:listas (id, tipo, filtro)')
    .eq('id', campanaId)
    .maybeSingle();

  if (!campana) return { total: 0, error: 'Campaña no encontrada.' };
  if (!campana.lista_id || !campana.lista) {
    return { total: 0, error: 'La campaña no tiene lista ni segmento de destino.' };
  }

  let candidatos: string[];
  if (campana.lista.tipo === 'dinamica') {
    candidatos = await contactosDelSegmento(admin, (campana.lista.filtro ?? {}) as FiltroSegmento);
  } else {
    const { data: miembros } = await admin
      .from('lista_contactos')
      .select('contacto_id')
      .eq('lista_id', campana.lista_id);
    candidatos = (miembros ?? []).map((m) => m.contacto_id);
  }

  if (candidatos.length === 0) return { total: 0, error: 'La lista no tiene a nadie.' };

  // El filtro que importa. Aunque el segmento no lo pidiera, aquí se exige.
  const { data: elegibles } = await admin
    .from('contactos')
    .select('id, email')
    .in('id', candidatos)
    .eq('consentimiento_marketing', true)
    .not('email', 'is', null);

  const filas = (elegibles ?? [])
    .filter((c) => c.email)
    .map((c) => ({ campana_id: campanaId, contacto_id: c.id, email: c.email as string }));

  if (filas.length === 0) {
    return { total: 0, error: 'Nadie de esa lista tiene consentimiento de marketing y email.' };
  }

  const { error } = await admin
    .from('campana_destinatarios')
    .upsert(filas, { onConflict: 'campana_id,contacto_id', ignoreDuplicates: true });
  if (error) return { total: 0, error: `No se pudieron preparar los destinatarios: ${error.message}` };

  const { count } = await admin
    .from('campana_destinatarios')
    .select('id', { count: 'exact', head: true })
    .eq('campana_id', campanaId);

  await admin
    .from('campanas_email')
    .update({ total_destinatarios: count ?? filas.length })
    .eq('id', campanaId);

  return { total: count ?? filas.length };
}

type Personalizacion = { nombre: string; token: string };

/**
 * Reescribe los enlaces del cuerpo HTML para que pasen por el redirector y se
 * pueda contar el clic.
 *
 * Cada destino viaja FIRMADO. Sin firma, el redirector aceptaría cualquier
 * URL y el dominio desde el que el grupo envía correo se convertiría en una
 * redirección abierta: un regalo para quien quiera montar un phishing con el
 * dominio de confianza delante.
 *
 * No se tocan los `mailto:`, los `tel:` ni el propio enlace de baja: contar
 * clics en «darme de baja» sería absurdo, y meterle un salto por el medio a
 * quien quiere irse es justo lo que el RGPD llama poner obstáculos.
 */
function reescribirEnlaces(html: string, token: string): string {
  const base = urlApp();
  return html.replace(/href\s*=\s*"(https?:\/\/[^"]+)"/gi, (entero, destino: string) => {
    if (destino.startsWith(`${base}/baja/`)) return entero;
    const firma = firmarDestino(destino);
    if (!firma) return entero; // Sin secreto configurado, se deja el enlace tal cual.
    return `href="${base}/api/marketing/clic/${token}?a=${encodeURIComponent(destino)}&f=${firma}"`;
  });
}

/** Sustituye los marcadores del cuerpo y añade el pie obligatorio. */
function componer(
  cuerpo: string,
  pie: string,
  persona: Personalizacion,
  comoHtml: boolean,
): string {
  const enlaceBaja = `${urlApp()}/baja/${persona.token}`;
  const pieResuelto = pie.replaceAll(
    '{baja}',
    comoHtml ? `<a href="${enlaceBaja}">darme de baja</a>` : enlaceBaja,
  );
  const texto = cuerpo.replaceAll('{nombre}', persona.nombre);

  if (!comoHtml) return `${texto}\n\n—\n${pieResuelto}`;

  const pixel = `<img src="${urlApp()}/api/marketing/abierto/${persona.token}" width="1" height="1" alt="" style="display:none">`;
  const conSeguimiento = reescribirEnlaces(texto, persona.token);
  return `${conSeguimiento}<hr style="border:none;border-top:1px solid #E2DFD6;margin:24px 0"><p style="font:12px/1.5 system-ui,sans-serif;color:#8A8FA0">${pieResuelto}</p>${pixel}`;
}

/**
 * Envía un lote de la campaña. Devuelve cuántos salieron y cuántos fallaron.
 * Se llama repetidamente desde el motor hasta que no quedan pendientes: así
 * un envío de 3.000 personas no depende de que una sola petición aguante.
 */
export async function enviarLote(
  admin: Cliente,
  campanaId: string,
  tamano: number,
): Promise<{ enviados: number; fallidos: number; quedan: number }> {
  const { data: campana } = await admin
    .from('campanas_email')
    .select('id, asunto, cuerpo_texto, cuerpo_html')
    .eq('id', campanaId)
    .maybeSingle();
  if (!campana) return { enviados: 0, fallidos: 0, quedan: 0 };

  const { data: config } = await admin
    .from('configuracion')
    .select('clave, valor')
    .in('clave', ['marketing_pie', 'marketing_remitente']);
  const mapa = new Map((config ?? []).map((c) => [c.clave, c.valor]));
  const pie =
    typeof mapa.get('marketing_pie') === 'string'
      ? (mapa.get('marketing_pie') as string)
      : 'Puedes darte de baja aquí: {baja}';
  const remitente =
    typeof mapa.get('marketing_remitente') === 'string' && mapa.get('marketing_remitente')
      ? (mapa.get('marketing_remitente') as string)
      : undefined;

  const { data: pendientes } = await admin
    .from('campana_destinatarios')
    .select('id, email, token, contacto:contactos (nombre)')
    .eq('campana_id', campanaId)
    .eq('estado', 'pendiente')
    .limit(tamano);

  if (!pendientes || pendientes.length === 0) return { enviados: 0, fallidos: 0, quedan: 0 };

  let enviados = 0;
  let fallidos = 0;

  for (const destinatario of pendientes) {
    const persona: Personalizacion = {
      nombre: destinatario.contacto?.nombre ?? '',
      token: destinatario.token,
    };

    const resultado = await enviarCorreo({
      para: destinatario.email,
      asunto: campana.asunto,
      cuerpo: componer(campana.cuerpo_texto, pie, persona, false),
      html: campana.cuerpo_html
        ? componer(campana.cuerpo_html, pie, persona, true)
        : undefined,
      remitente,
    });

    if (resultado.enviado) {
      enviados++;
      await admin
        .from('campana_destinatarios')
        .update({ estado: 'enviado', enviado_at: new Date().toISOString(), error: null })
        .eq('id', destinatario.id);
    } else {
      fallidos++;
      await admin
        .from('campana_destinatarios')
        .update({ estado: 'fallido', error: resultado.error ?? 'Error desconocido' })
        .eq('id', destinatario.id);
    }
  }

  const { count: quedan } = await admin
    .from('campana_destinatarios')
    .select('id', { count: 'exact', head: true })
    .eq('campana_id', campanaId)
    .eq('estado', 'pendiente');

  // Contadores materializados, recalculados desde la verdad y no incrementados
  // a ciegas: si una pasada se corta a medias, la siguiente los deja bien.
  const [{ count: totalEnviados }, { count: totalFallidos }] = await Promise.all([
    admin
      .from('campana_destinatarios')
      .select('id', { count: 'exact', head: true })
      .eq('campana_id', campanaId)
      .eq('estado', 'enviado'),
    admin
      .from('campana_destinatarios')
      .select('id', { count: 'exact', head: true })
      .eq('campana_id', campanaId)
      .eq('estado', 'fallido'),
  ]);

  await admin
    .from('campanas_email')
    .update({ total_enviados: totalEnviados ?? 0, total_fallidos: totalFallidos ?? 0 })
    .eq('id', campanaId);

  return { enviados, fallidos, quedan: quedan ?? 0 };
}

/**
 * Pasada del motor: arranca las campañas programadas cuya hora ha llegado y
 * empuja un lote de las que están enviando.
 */
export async function procesarCampanas(admin: Cliente): Promise<ResultadoCampanas> {
  if (!emailConfigurado()) return { campanasProcesadas: 0, enviados: 0, fallidos: 0 };

  const { data: config } = await admin
    .from('configuracion')
    .select('valor')
    .eq('clave', 'marketing_lote')
    .maybeSingle();
  const tamano = Number(config?.valor) || 40;

  // Programadas que ya tocan → enviando.
  const { data: aArrancar } = await admin
    .from('campanas_email')
    .select('id')
    .eq('estado', 'programada')
    .lte('programada_para', new Date().toISOString());

  for (const campana of aArrancar ?? []) {
    await prepararDestinatarios(admin, campana.id);
    await admin.from('campanas_email').update({ estado: 'enviando' }).eq('id', campana.id);
  }

  const { data: enCurso } = await admin.from('campanas_email').select('id').eq('estado', 'enviando');

  let enviados = 0;
  let fallidos = 0;

  for (const campana of enCurso ?? []) {
    const lote = await enviarLote(admin, campana.id, tamano);
    enviados += lote.enviados;
    fallidos += lote.fallidos;

    if (lote.quedan === 0) {
      await admin
        .from('campanas_email')
        .update({ estado: 'enviada', enviada_at: new Date().toISOString() })
        .eq('id', campana.id);

      const { data: direccion } = await admin
        .from('perfiles')
        .select('id')
        .eq('rol', 'direccion')
        .eq('activo', true);

      const avisos = (direccion ?? []).map((d) => ({
        usuario_id: d.id,
        tipo: 'campana_finalizada' as const,
        mensaje: 'Una campaña de email ha terminado de enviarse',
        clave: `campana:${campana.id}:${d.id}`,
      }));
      if (avisos.length > 0) {
        await admin
          .from('notificaciones')
          .upsert(avisos, { onConflict: 'clave', ignoreDuplicates: true });
      }
    }
  }

  return {
    campanasProcesadas: (aArrancar ?? []).length + (enCurso ?? []).length,
    enviados,
    fallidos,
  };
}
