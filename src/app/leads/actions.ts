'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function cerrarSesion() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

/** Mueve un lead a otra etapa. Movimiento LIBRE: el trigger sincroniza el estado. */
export async function moverLeadDeEtapa(leadId: string, etapaId: string) {
  const supabase = await createClient();

  const { data: etapa } = await supabase
    .from('pipeline_etapas')
    .select('nombre')
    .eq('id', etapaId)
    .single();

  const { error } = await supabase.from('leads').update({ etapa_id: etapaId }).eq('id', leadId);
  if (error) {
    return { error: `No se pudo mover el lead: ${error.message}` };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase.from('actividades').insert({
    lead_id: leadId,
    tipo: 'cambio_estado',
    contenido: `Movido a la etapa «${etapa?.nombre ?? '—'}»`,
    usuario_id: user?.id ?? null,
  });

  revalidatePath('/leads');
  revalidatePath(`/leads/${leadId}`);
  return { error: null };
}

/** Autoasignación: solo leads sin propietario, y a uno mismo (lo impone la BD). */
export async function asignarmeLead(leadId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sesión caducada' };

  const { error } = await supabase
    .from('leads')
    .update({ propietario_id: user.id })
    .eq('id', leadId)
    .is('propietario_id', null);
  if (error) {
    return { error: `No se pudo asignar: ${error.message}` };
  }

  await supabase.from('actividades').insert({
    lead_id: leadId,
    tipo: 'cambio_estado',
    contenido: 'Autoasignación del lead',
    usuario_id: user.id,
  });

  revalidatePath('/leads');
  revalidatePath(`/leads/${leadId}`);
  return { error: null };
}
