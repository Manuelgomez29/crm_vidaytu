'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { desdeDatetimeLocal } from '@/lib/fechas';

type Destino = { agenda?: string; lead?: string };

function volver(destino: Destino, aviso?: { error?: string; aviso?: string }): never {
  const q = aviso?.error
    ? `?error=${encodeURIComponent(aviso.error)}`
    : aviso?.aviso
      ? `?aviso=${encodeURIComponent(aviso.aviso)}`
      : '';
  revalidatePath('/agenda');
  if (destino.lead) {
    revalidatePath(`/leads/${destino.lead}`);
    redirect(`/leads/${destino.lead}${q}`);
  }
  redirect(`/agenda${destino.agenda ? `?semana=${destino.agenda}` : ''}${q ? q.replace('?', destino.agenda ? '&' : '?') : ''}`);
}

export async function crearCita(leadId: string, formData: FormData) {
  const destino: Destino = { lead: leadId };

  const inicio = desdeDatetimeLocal(String(formData.get('inicio') ?? ''));
  const duracion = Number(formData.get('duracion') ?? 60);
  const profesionalId = String(formData.get('profesional') ?? '');
  const tipo = String(formData.get('tipo') ?? 'primera_cita');
  const modalidad = String(formData.get('modalidad') ?? 'presencial');
  const contactoId = String(formData.get('contacto') ?? '') || null;
  const notas = String(formData.get('notas') ?? '').trim() || null;

  if (!inicio) volver(destino, { error: 'Indica la fecha y la hora de la cita.' });
  if (!profesionalId) volver(destino, { error: 'Elige el profesional que atiende la cita.' });

  const supabase = await createClient();
  const { data: lead } = await supabase
    .from('leads')
    .select('centro_id')
    .eq('id', leadId)
    .maybeSingle();
  if (!lead) volver(destino, { error: 'Lead no encontrado.' });

  const fin = new Date(new Date(inicio).getTime() + duracion * 60_000).toISOString();

  // Aviso, nunca bloqueo (regla 6): se agenda igual y se informa.
  const { data: avisoDisponibilidad } = await supabase.rpc('aviso_disponibilidad', {
    p_profesional: profesionalId,
    p_inicio: inicio,
    p_fin: fin,
  });

  const { data: cita, error } = await supabase
    .from('citas')
    .insert({
      lead_id: leadId,
      centro_id: lead.centro_id,
      profesional_id: profesionalId,
      tipo: tipo as 'primera_llamada' | 'primera_cita' | 'valoracion' | 'seguimiento' | 'visita_centro' | 'otro',
      modalidad_cita: modalidad as 'presencial' | 'videollamada' | 'telefonica',
      inicio,
      fin,
      contacto_id: contactoId,
      notas,
    })
    .select('id')
    .single();
  if (error || !cita) volver(destino, { error: `No se pudo crear la cita: ${error?.message}` });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase.from('actividades').insert({
    lead_id: leadId,
    tipo: 'cambio_estado',
    contenido: 'Cita agendada',
    usuario_id: user?.id ?? null,
  });

  // Avisar al profesional que atiende, si no es quien la agenda.
  if (profesionalId !== user?.id) {
    await supabase.from('notificaciones').insert({
      usuario_id: profesionalId,
      tipo: 'cita_proxima',
      lead_id: leadId,
      mensaje: 'Tienes una cita nueva en tu agenda',
    });
  }

  volver(destino, avisoDisponibilidad ? { aviso: `Cita creada. Aviso: ${avisoDisponibilidad}` } : undefined);
}

export async function cambiarEstadoCita(citaId: string, estado: string, destino: Destino) {
  const supabase = await createClient();
  const { data: actualizadas, error } = await supabase
    .from('citas')
    .update({ estado: estado as 'programada' | 'realizada' | 'no_show' | 'cancelada' })
    .eq('id', citaId)
    .select('id, lead_id');
  if (error) volver(destino, { error: `No se pudo actualizar la cita: ${error.message}` });
  if (!actualizadas || actualizadas.length === 0) {
    volver(destino, { error: 'No tienes permiso para cambiar esta cita.' });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const textos: Record<string, string> = {
    realizada: 'Cita marcada como realizada',
    no_show: 'El paciente no se presentó a la cita',
    cancelada: 'Cita cancelada',
    programada: 'Cita reactivada',
  };
  // El terapeuta no tiene acceso a `actividades`: su cambio se refleja en la cita.
  await supabase.from('actividades').insert({
    lead_id: actualizadas[0].lead_id,
    tipo: 'cambio_estado',
    contenido: textos[estado] ?? 'Cita actualizada',
    usuario_id: user?.id ?? null,
  });

  volver(destino);
}
