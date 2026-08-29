/**
 * Dominio de casos (leads): identidad por teléfono, reapertura y alta.
 *
 * ÚNICA autoridad de estas reglas — la usan tanto la ingesta de formularios
 * (cliente admin) como el alta manual (cliente de sesión). Si cambian las
 * reglas, cambian aquí y valen para todas las vías de entrada.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { ESTADOS_CERRADOS, type EstadoLead } from '@/lib/estados';

type Cliente = SupabaseClient<Database>;

export type CasoDelTelefono = {
  leadId: string;
  estado: EstadoLead;
  propietarioId: string | null;
  centroId: string;
  contactoId: string;
  cerrado: boolean;
};

/**
 * Último caso asociado a un teléfono, mirando TODO el directorio.
 * Requiere un cliente con visibilidad global (admin): la deduplicación debe
 * cruzar centros aunque quien pregunta no pueda ver el otro centro.
 */
export async function ultimoCasoPorTelefono(
  admin: Cliente,
  telefono: string,
): Promise<CasoDelTelefono | null> {
  const { data: contacto } = await admin
    .from('contactos')
    .select('id')
    .eq('telefono', telefono)
    .maybeSingle();
  if (!contacto) return null;

  const { data: vinculos } = await admin
    .from('lead_contactos')
    .select('lead:leads (id, estado, propietario_id, centro_id, created_at)')
    .eq('contacto_id', contacto.id);

  const casos = (vinculos ?? [])
    .map((v) => v.lead)
    .filter((l): l is NonNullable<typeof l> => Boolean(l))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const ultimo = casos[0];
  if (!ultimo) return null;

  return {
    leadId: ultimo.id,
    estado: ultimo.estado,
    propietarioId: ultimo.propietario_id,
    centroId: ultimo.centro_id,
    contactoId: contacto.id,
    cerrado: ESTADOS_CERRADOS.includes(ultimo.estado),
  };
}

/** Minutos de SLA de primera respuesta, leídos de `configuracion`. */
export async function slaMinutos(cliente: Cliente): Promise<number> {
  const { data } = await cliente
    .from('configuracion')
    .select('valor')
    .eq('clave', 'sla_primera_respuesta_minutos')
    .maybeSingle();
  const valor = Number(data?.valor);
  return Number.isFinite(valor) && valor > 0 ? valor : 60;
}

/** Vencimiento de la próxima acción a partir de ahora, según el SLA. */
export function venceSegunSla(minutos: number): string {
  return new Date(Date.now() + minutos * 60_000).toISOString();
}

/**
 * Propietario que debe hacerse cargo de un caso reabierto: el anterior si
 * sigue activo; si no, el administrador general (dirección más antigua).
 */
export async function propietarioParaReapertura(
  admin: Cliente,
  propietarioAnterior: string | null,
): Promise<string | null> {
  if (propietarioAnterior) {
    const { data: perfil } = await admin
      .from('perfiles')
      .select('activo')
      .eq('id', propietarioAnterior)
      .maybeSingle();
    if (perfil?.activo) return propietarioAnterior;
  }
  const { data: adminGeneral } = await admin
    .from('perfiles')
    .select('id')
    .eq('rol', 'direccion')
    .eq('activo', true)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  return adminGeneral?.id ?? null;
}

/**
 * Reabre un caso cerrado: estado `reabierto`, propietario resuelto, actividad
 * de reapertura, próxima acción según SLA y aviso al propietario.
 * Requiere cliente admin (reasignar propietario lo controla un trigger).
 */
export async function reabrirCaso(
  admin: Cliente,
  opciones: {
    caso: CasoDelTelefono;
    motivo: string;
    notaExtra?: string | null;
    usuarioId?: string | null;
  },
): Promise<void> {
  const { caso, motivo, notaExtra, usuarioId } = opciones;
  const propietarioId = await propietarioParaReapertura(admin, caso.propietarioId);

  await admin
    .from('leads')
    .update({ estado: 'reabierto', motivo_perdida_id: null, propietario_id: propietarioId })
    .eq('id', caso.leadId);

  await admin.from('actividades').insert([
    { lead_id: caso.leadId, tipo: 'reapertura', contenido: motivo, usuario_id: usuarioId ?? null },
    ...(notaExtra
      ? [{ lead_id: caso.leadId, tipo: 'nota' as const, contenido: notaExtra, usuario_id: usuarioId ?? null }]
      : []),
  ]);

  await admin.from('tareas').insert({
    lead_id: caso.leadId,
    titulo: 'Contactar: caso reabierto',
    vence_at: venceSegunSla(await slaMinutos(admin)),
    responsable_id: propietarioId,
  });

  if (propietarioId) {
    await admin.from('notificaciones').insert({
      usuario_id: propietarioId,
      tipo: 'lead_asignado',
      lead_id: caso.leadId,
      mensaje: 'Caso reabierto: el contacto ha vuelto a escribir',
    });
  }
}

/**
 * Un caso YA ABIERTO que recibe un contacto nuevo no cambia de estado: solo
 * suma la nota al historial y avisa a su propietario.
 */
export async function anotarEnCasoAbierto(
  admin: Cliente,
  opciones: { caso: CasoDelTelefono; nota: string; usuarioId?: string | null },
): Promise<void> {
  const { caso, nota, usuarioId } = opciones;
  await admin
    .from('actividades')
    .insert({ lead_id: caso.leadId, tipo: 'nota', contenido: nota, usuario_id: usuarioId ?? null });

  if (caso.propietarioId) {
    await admin.from('notificaciones').insert({
      usuario_id: caso.propietarioId,
      tipo: 'lead_asignado',
      lead_id: caso.leadId,
      mensaje: 'Nuevo contacto entrante en un caso tuyo ya abierto',
    });
  }
}

/** Pipeline aplicable a un centro (el suyo si lo tiene, si no el global) y su primera etapa. */
export async function pipelineYPrimeraEtapa(
  cliente: Cliente,
  centroId: string,
): Promise<{ pipelineId: string; etapaId: string } | { error: string }> {
  const { data: pipelines } = await cliente
    .from('pipelines')
    .select('id, centro_id, created_at')
    .eq('activo', true)
    .or(`centro_id.eq.${centroId},centro_id.is.null`)
    .order('created_at');

  const pipeline = pipelines?.find((p) => p.centro_id === centroId) ?? pipelines?.[0];
  if (!pipeline) return { error: 'No hay ningún pipeline activo.' };

  const { data: etapa } = await cliente
    .from('pipeline_etapas')
    .select('id')
    .eq('pipeline_id', pipeline.id)
    .order('orden')
    .limit(1)
    .maybeSingle();
  if (!etapa) return { error: 'El pipeline aplicable no tiene etapas configuradas.' };

  return { pipelineId: pipeline.id, etapaId: etapa.id };
}

/**
 * Centro al que se atribuye una conversión: el de ORIGEN de la primera
 * derivación si el caso fue derivado (regla 3), o el centro actual del lead.
 */
export async function centroDeAtribucion(cliente: Cliente, leadId: string): Promise<string | null> {
  const { data: derivacion } = await cliente
    .from('derivaciones')
    .select('centro_origen_id')
    .eq('lead_id', leadId)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (derivacion) return derivacion.centro_origen_id;

  const { data: lead } = await cliente
    .from('leads')
    .select('centro_id')
    .eq('id', leadId)
    .maybeSingle();
  return lead?.centro_id ?? null;
}
