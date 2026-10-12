'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { desdeDatetimeLocal } from '@/lib/fechas';

function volver(aviso?: { error?: string; aviso?: string }): never {
  const q = aviso?.error
    ? `?error=${encodeURIComponent(aviso.error)}`
    : aviso?.aviso
      ? `?aviso=${encodeURIComponent(aviso.aviso)}`
      : '';
  revalidatePath('/tareas');
  revalidatePath('/leads');
  redirect(`/tareas${q}`);
}

/**
 * Crear una tarea a mano desde la bandeja.
 *
 * El caso es OPCIONAL. Un comercial tiene trabajo que no cuelga de ningún
 * caso —llamar a un prescriptor, preparar la reunión del lunes— y sin sitio
 * donde apuntarlo acaba en un post-it, que no aparece en ninguna métrica ni lo
 * cubre nadie cuando esa persona está de baja.
 */
export async function crearTareaManual(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const titulo = String(formData.get('titulo') ?? '').trim();
  if (!titulo) volver({ error: 'La tarea necesita un título.' });

  // La fecha se interpreta en Madrid, no en la zona del servidor.
  const vence = desdeDatetimeLocal(String(formData.get('vence') ?? ''));
  if (!vence) volver({ error: 'Toda tarea lleva fecha: es lo que la hace aparecer a tiempo.' });

  const leadId = String(formData.get('lead') ?? '') || null;
  const responsableId = String(formData.get('responsable') ?? '') || user.id;

  const { error } = await supabase.from('tareas').insert({
    lead_id: leadId,
    titulo,
    vence_at: vence,
    responsable_id: responsableId,
    created_by: user.id,
  });

  if (error) {
    volver({
      error: error.message.includes('policy')
        ? 'Solo puedes crear tareas para ti, o sobre un caso que puedas ver.'
        : `No se pudo crear: ${error.message}`,
    });
  }

  // Si se la encargas a otra persona, se entera.
  if (responsableId !== user.id) {
    await supabase.from('notificaciones').insert({
      usuario_id: responsableId,
      tipo: 'tarea_asignada',
      lead_id: leadId,
      mensaje: `Nueva tarea para ti: ${titulo}`,
    });
  }

  volver({ aviso: 'Tarea creada.' });
}

/** Completar una tarea desde la bandeja personal, sin salir de la lista. */
export async function completarTareaDesdeLista(tareaId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('tareas')
    .update({ completada_at: new Date().toISOString(), completada_por: user?.id ?? null })
    .eq('id', tareaId);

  if (error) volver({ error: `No se pudo completar: ${error.message}` });
  volver();
}

/**
 * Devolver una tarea a pendientes. Cerrar por error es habitual (un clic de
 * más en el móvil) y sin esto la única salida era crear otra tarea distinta,
 * que rompe el rastro de lo que realmente pasó.
 */
export async function reabrirTarea(tareaId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('tareas')
    .update({ completada_at: null, completada_por: null })
    .eq('id', tareaId);

  revalidatePath('/tareas');
  revalidatePath('/leads');
  redirect(
    error
      ? `/tareas?ver=hechas&error=${encodeURIComponent(error.message)}`
      : '/tareas?ver=hechas&aviso=La+tarea+vuelve+a+estar+pendiente',
  );
}

/** Aplazar sin tener que abrir nada: es lo que más se hace con una tarea. */
export async function aplazarTarea(tareaId: string, dias: number) {
  const supabase = await createClient();

  const { data: tarea } = await supabase
    .from('tareas')
    .select('vence_at')
    .eq('id', tareaId)
    .maybeSingle();
  if (!tarea) volver({ error: 'Tarea no encontrada.' });

  /**
   * Desde hoy o desde su vencimiento, lo que sea más tarde. Aplazar «3 días»
   * una tarea que venció hace dos semanas tiene que ponerla dentro de tres
   * días, no dejarla igual de vencida; y aplazar una que vence el viernes la
   * lleva al lunes, no a pasado mañana.
   */
  const base = new Date(Math.max(Date.now(), Date.parse(tarea.vence_at)));
  base.setDate(base.getDate() + dias);

  const { error } = await supabase
    .from('tareas')
    .update({ vence_at: base.toISOString() })
    .eq('id', tareaId);

  if (error) volver({ error: `No se pudo aplazar: ${error.message}` });
  volver();
}

export async function borrarTarea(tareaId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('tareas').delete().eq('id', tareaId);
  if (error) volver({ error: `No se pudo borrar: ${error.message}` });
  volver({ aviso: 'Tarea borrada.' });
}
