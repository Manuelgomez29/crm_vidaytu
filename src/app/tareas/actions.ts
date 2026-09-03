'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/** Completar una tarea desde la bandeja personal, sin salir de la lista. */
export async function completarTareaDesdeLista(tareaId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('tareas')
    .update({ completada_at: new Date().toISOString() })
    .eq('id', tareaId);

  revalidatePath('/tareas');
  revalidatePath('/leads');
  redirect(error ? `/tareas?error=${encodeURIComponent(error.message)}` : '/tareas');
}
