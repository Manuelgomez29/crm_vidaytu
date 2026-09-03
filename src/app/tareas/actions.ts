'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

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

  revalidatePath('/tareas');
  revalidatePath('/leads');
  redirect(error ? `/tareas?error=${encodeURIComponent(error.message)}` : '/tareas');
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
