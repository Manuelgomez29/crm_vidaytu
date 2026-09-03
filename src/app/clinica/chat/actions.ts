'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { exigirAccesoClinico } from '../guard';

/**
 * Chat interno clínico. Existe para sacar la comunicación sobre pacientes del
 * WhatsApp personal de los terapeutas, que hoy está fuera de todo control
 * RGPD: mensajes con nombres y situaciones en teléfonos particulares, sin
 * cifrado gestionado, sin borrado, sin saber quién los ha leído.
 *
 * Aquí queda registrada, dentro del muro y solo entre participantes.
 */

function volver(ruta: string, aviso?: { error?: string }): never {
  const q = aviso?.error ? `?error=${encodeURIComponent(aviso.error)}` : '';
  revalidatePath(ruta);
  redirect(`${ruta}${q}`);
}

export async function crearConversacion(formData: FormData) {
  const { supabase, perfil } = await exigirAccesoClinico();

  const titulo = String(formData.get('titulo') ?? '').trim();
  const pacienteId = String(formData.get('paciente') ?? '') || null;
  const participantes = formData.getAll('participantes').map(String).filter(Boolean);

  if (!titulo) volver('/clinica/chat', { error: 'Ponle un título a la conversación.' });
  if (participantes.length === 0) {
    volver('/clinica/chat', { error: 'Elige con quién quieres hablar.' });
  }

  const { data: conversacion, error } = await supabase
    .from('conversaciones')
    .insert({ titulo, paciente_id: pacienteId, created_by: perfil.id })
    .select('id')
    .single();

  if (error || !conversacion) {
    volver('/clinica/chat', { error: `No se pudo crear: ${error?.message}` });
  }

  // Quien la crea entra siempre: si no, no podría ni abrirla.
  const todos = Array.from(new Set([perfil.id, ...participantes]));
  const { error: errorParticipantes } = await supabase
    .from('conversacion_participantes')
    .insert(todos.map((id) => ({ conversacion_id: conversacion.id, perfil_id: id })));

  if (errorParticipantes) {
    volver('/clinica/chat', { error: `No se pudieron añadir participantes: ${errorParticipantes.message}` });
  }

  redirect(`/clinica/chat/${conversacion.id}`);
}

export async function enviarMensaje(conversacionId: string, formData: FormData) {
  const { supabase, perfil } = await exigirAccesoClinico();
  const ruta = `/clinica/chat/${conversacionId}`;

  const cuerpo = String(formData.get('cuerpo') ?? '').trim();
  if (!cuerpo) redirect(ruta);

  const { error } = await supabase.from('mensajes').insert({
    conversacion_id: conversacionId,
    autor_id: perfil.id,
    cuerpo,
  });
  if (error) volver(ruta, { error: `No se pudo enviar: ${error.message}` });

  // Mueve la conversación arriba en la lista de todos.
  await supabase
    .from('conversaciones')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversacionId);

  const { data: participantes } = await supabase
    .from('conversacion_participantes')
    .select('perfil_id')
    .eq('conversacion_id', conversacionId)
    .neq('perfil_id', perfil.id);

  if (participantes && participantes.length > 0) {
    await supabase.from('notificaciones').insert(
      participantes.map((p) => ({
        usuario_id: p.perfil_id,
        tipo: 'mensaje_chat' as const,
        mensaje: `${perfil.nombre} ha escrito en el chat clínico`,
      })),
    );
  }

  revalidatePath(ruta);
  redirect(ruta);
}

export async function marcarLeida(conversacionId: string) {
  const { supabase, perfil } = await exigirAccesoClinico();
  await supabase
    .from('conversacion_participantes')
    .update({ leido_at: new Date().toISOString() })
    .eq('conversacion_id', conversacionId)
    .eq('perfil_id', perfil.id);
  revalidatePath(`/clinica/chat/${conversacionId}`);
}
