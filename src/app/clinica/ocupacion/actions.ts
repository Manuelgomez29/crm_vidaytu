'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { exigirAccesoClinico } from '../guard';

function volver(aviso?: { error?: string; aviso?: string }): never {
  const q = aviso?.error
    ? `?error=${encodeURIComponent(aviso.error)}`
    : aviso?.aviso
      ? `?aviso=${encodeURIComponent(aviso.aviso)}`
      : '';
  revalidatePath('/clinica/ocupacion');
  redirect(`/clinica/ocupacion${q}`);
}

export async function asignarPlaza(habitacionId: string, formData: FormData) {
  const { supabase, perfil } = await exigirAccesoClinico();

  const pacienteId = String(formData.get('paciente') ?? '');
  const desde = String(formData.get('desde') ?? '');
  if (!pacienteId || !desde) volver({ error: 'Faltan datos para asignar la plaza.' });

  // Nadie ocupa dos camas: si ya esta ingresado en otra habitacion, se avisa
  // en lugar de duplicar la ocupacion.
  const { data: yaDentro } = await supabase
    .from('ocupaciones')
    .select('id')
    .eq('paciente_id', pacienteId)
    .is('hasta', null)
    .maybeSingle();
  if (yaDentro) volver({ error: 'Ese paciente ya tiene una plaza asignada. Dale el alta primero.' });

  const { data: habitacion } = await supabase
    .from('habitaciones')
    .select('plazas')
    .eq('id', habitacionId)
    .maybeSingle();
  if (!habitacion) volver({ error: 'Habitacion no encontrada.' });

  const { count } = await supabase
    .from('ocupaciones')
    .select('id', { count: 'exact', head: true })
    .eq('habitacion_id', habitacionId)
    .is('hasta', null);

  if ((count ?? 0) >= habitacion.plazas) {
    volver({ error: 'Esa habitacion esta completa.' });
  }

  const { error } = await supabase.from('ocupaciones').insert({
    habitacion_id: habitacionId,
    paciente_id: pacienteId,
    desde,
    created_by: perfil.id,
  });
  if (error) volver({ error: `No se pudo asignar: ${error.message}` });

  volver({ aviso: 'Plaza asignada.' });
}

export async function liberarPlaza(ocupacionId: string) {
  const { supabase } = await exigirAccesoClinico();
  const { error } = await supabase
    .from('ocupaciones')
    .update({ hasta: new Date().toISOString().slice(0, 10) })
    .eq('id', ocupacionId);
  if (error) volver({ error: `No se pudo liberar: ${error.message}` });
  volver({ aviso: 'Plaza liberada.' });
}
