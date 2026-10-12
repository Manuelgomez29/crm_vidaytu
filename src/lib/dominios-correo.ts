import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/database.types';

/**
 * Dominios de envío: el CRM habla con Resend por API.
 *
 * Dar de alta un dominio, enseñar sus registros DNS, pedir la verificación y
 * leer el resultado. Lo que sigue fuera del CRM es una sola cosa: pegar los
 * registros en el DNS del dominio, que no hay forma de hacer desde aquí.
 *
 * Todo pasa por la clave del servidor (`RESEND_API_KEY`). Sin ella, estas
 * funciones devuelven un error legible en vez de fingir: la pantalla lo enseña
 * y explica qué falta.
 *
 * Los estados se guardan tal cual los dice Resend (`not_started`, `pending`,
 * `verified`, `failed`, `temporary_failure`) y se traducen al pintar, para que
 * un valor nuevo no rompa nada.
 */

type Cliente = SupabaseClient<Database>;

const BASE = 'https://api.resend.com';

/** Siempre la UE para datos de aquí (regla 11). */
export const REGION_POR_DEFECTO = 'eu-west-1';

export type RegistroDns = {
  registro: string;
  tipo: string;
  nombre: string;
  valor: string;
  prioridad?: number;
  estado: string;
};

type DominioResend = {
  id: string;
  name: string;
  status: string;
  region?: string;
  records?: {
    record?: string;
    name?: string;
    type?: string;
    value?: string;
    priority?: number;
    status?: string;
  }[];
};

export function claveConfigurada(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

async function pedir(ruta: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const clave = process.env.RESEND_API_KEY;
  if (!clave) throw new Error('Falta RESEND_API_KEY en el servidor.');

  const r = await fetch(`${BASE}${ruta}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${clave}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const texto = await r.text();
  if (!r.ok) {
    let mensaje = texto.slice(0, 200);
    try {
      const j = JSON.parse(texto) as { message?: string; name?: string };
      mensaje = j.message ?? j.name ?? mensaje;
    } catch {
      /* el texto crudo ya vale */
    }
    throw new Error(`Resend respondió ${r.status}: ${mensaje}`);
  }
  return texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
}

/** Lo que devuelve Resend, en nuestras palabras y sin nada que no haga falta. */
export function normalizarRegistros(d: DominioResend): RegistroDns[] {
  return (d.records ?? []).map((r) => ({
    registro: String(r.record ?? ''),
    tipo: String(r.type ?? ''),
    nombre: String(r.name ?? ''),
    valor: String(r.value ?? ''),
    ...(typeof r.priority === 'number' ? { prioridad: r.priority } : {}),
    estado: String(r.status ?? 'not_started'),
  }));
}

/**
 * El dominio tal como lo escribe una persona, convertido en lo que Resend
 * acepta: minúsculas, sin protocolo, sin barras, sin espacios. Devuelve null si
 * no tiene pinta de dominio.
 */
export function normalizarDominio(entrada: string): string | null {
  const d = entrada
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '');
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d) ? d : null;
}

// ---------------------------------------------------------------------------
// Resend
// ---------------------------------------------------------------------------

export async function crearEnResend(dominio: string, region = REGION_POR_DEFECTO): Promise<DominioResend> {
  const r = await pedir('/domains', { method: 'POST', body: JSON.stringify({ name: dominio, region }) });
  return r as unknown as DominioResend;
}

export async function leerDeResend(resendId: string): Promise<DominioResend> {
  const r = await pedir(`/domains/${encodeURIComponent(resendId)}`);
  return r as unknown as DominioResend;
}

export async function pedirVerificacion(resendId: string): Promise<void> {
  await pedir(`/domains/${encodeURIComponent(resendId)}/verify`, { method: 'POST' });
}

export async function borrarDeResend(resendId: string): Promise<void> {
  await pedir(`/domains/${encodeURIComponent(resendId)}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Nuestra tabla
// ---------------------------------------------------------------------------

/**
 * Vuelve a leer un dominio en Resend y guarda lo que diga. Devuelve el estado.
 * Un fallo de red no cambia el estado: queda apuntado en `ultimo_error` y se
 * vuelve a intentar en la siguiente pasada.
 */
export async function sincronizarDominio(
  admin: Cliente,
  fila: { id: string; resend_id: string | null; estado: string },
): Promise<string> {
  if (!fila.resend_id) return fila.estado;
  const ahora = new Date().toISOString();
  try {
    const d = await leerDeResend(fila.resend_id);
    const estado = String(d.status ?? fila.estado);
    await admin
      .from('dominios_correo')
      .update({
        estado,
        registros: normalizarRegistros(d) as unknown as Json,
        ultimo_chequeo_at: ahora,
        ultimo_error: null,
        ...(estado === 'verified' ? { verificado_at: ahora } : {}),
      })
      .eq('id', fila.id);
    return estado;
  } catch (e) {
    await admin
      .from('dominios_correo')
      .update({ ultimo_chequeo_at: ahora, ultimo_error: e instanceof Error ? e.message : String(e) })
      .eq('id', fila.id);
    return fila.estado;
  }
}

/**
 * Fase del motor: cada pasada vuelve a mirar los dominios que aún no están
 * verificados, y avisa a dirección cuando uno lo consigue. Lo pendiente de la
 * verificación es el DNS, que tarda entre minutos y horas: nadie tiene que
 * quedarse pulsando «comprobar».
 */
export async function refrescarDominiosPendientes(
  admin: Cliente,
): Promise<{ comprobados: number; verificadosAhora: number }> {
  const r = { comprobados: 0, verificadosAhora: 0 };
  if (!claveConfigurada()) return r;

  const { data: pendientes } = await admin
    .from('dominios_correo')
    .select('id, dominio, resend_id, estado')
    .neq('estado', 'verified')
    .not('resend_id', 'is', null);

  for (const d of pendientes ?? []) {
    const antes = d.estado;
    const despues = await sincronizarDominio(admin, d);
    r.comprobados++;
    if (despues === 'verified' && antes !== 'verified') {
      r.verificadosAhora++;
      const { data: direccion } = await admin
        .from('perfiles')
        .select('id')
        .eq('rol', 'direccion')
        .eq('alcance', 'grupo')
        .eq('activo', true);
      await admin.from('notificaciones').upsert(
        (direccion ?? []).map((p) => ({
          usuario_id: p.id,
          tipo: 'campana_finalizada' as Database['public']['Enums']['tipo_notificacion'],
          lead_id: null,
          mensaje: `El dominio ${d.dominio} ya está verificado: se puede enviar correo desde él`,
          clave: `dominio:${d.id}:verificado:${p.id}`,
        })),
        { onConflict: 'clave', ignoreDuplicates: true },
      );
    }
  }
  return r;
}

/**
 * ¿El dominio de este remitente está verificado? Para no guardar lo que
 * fallaría al enviar.
 *
 * Coincidencia EXACTA: para Resend un subdominio es otro dominio, con su propia
 * verificación. Un dominio verificado cubre cualquier dirección en él
 * —«hola@lolodrago.com», «equipo@lolodrago.com»— pero no
 * «hola@send.lolodrago.com»: ese «send» es el subdominio del Return-Path que
 * Resend usa por dentro, no un dominio desde el que se envía. La primera versión
 * aceptaba subdominios y habría dejado guardar un remitente que Resend rechaza.
 */
export async function dominioDelRemitenteVerificado(
  admin: Cliente,
  remitente: string,
): Promise<{ ok: true } | { ok: false; dominio: string; motivo: string }> {
  const correo = remitente.match(/<([^>]+)>/)?.[1] ?? remitente;
  const dominioCompleto = correo.split('@')[1]?.trim().toLowerCase() ?? '';
  if (!dominioCompleto) return { ok: false, dominio: '', motivo: 'no tiene dominio' };

  const { data: dominios } = await admin.from('dominios_correo').select('dominio, estado');
  const propio = (dominios ?? []).find((d) => dominioCompleto === d.dominio);
  if (!propio) {
    return (dominios ?? []).length === 0
      ? { ok: true } // Sin dominios dados de alta aún no se bloquea a nadie.
      : { ok: false, dominio: dominioCompleto, motivo: 'no está dado de alta en Dominios de correo' };
  }
  if (propio.estado !== 'verified') {
    return { ok: false, dominio: propio.dominio, motivo: 'todavía no está verificado' };
  }
  return { ok: true };
}
