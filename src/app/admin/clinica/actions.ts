'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { exigirDireccion } from '../guard';

function volver(aviso?: { error?: string; aviso?: string }): never {
  const q = aviso?.error
    ? `?error=${encodeURIComponent(aviso.error)}`
    : aviso?.aviso
      ? `?aviso=${encodeURIComponent(aviso.aviso)}`
      : '';
  revalidatePath('/admin/clinica');
  redirect(`/admin/clinica${q}`);
}

// ---------------------------------------------------------------------------
// Fases del método
// ---------------------------------------------------------------------------

/**
 * Las 7 fases vienen creadas con nombres genéricos porque la plataforma no
 * inventa el método clínico del grupo. Aquí se les pone el nombre real.
 */
export async function renombrarFase(faseId: string, formData: FormData) {
  const { supabase } = await exigirDireccion();

  const nombre = String(formData.get('nombre') ?? '').trim();
  if (!nombre) volver({ error: 'La fase necesita un nombre.' });

  const { error } = await supabase
    .from('fases_metodo')
    .update({
      nombre,
      descripcion: String(formData.get('descripcion') ?? '').trim() || null,
    })
    .eq('id', faseId);

  if (error) volver({ error: `No se pudo guardar: ${error.message}` });
  volver({ aviso: 'Fase actualizada.' });
}

export async function crearFase(formData: FormData) {
  const { supabase } = await exigirDireccion();

  const nombre = String(formData.get('nombre') ?? '').trim();
  if (!nombre) volver({ error: 'La fase necesita un nombre.' });

  const { data: ultima } = await supabase
    .from('fases_metodo')
    .select('orden')
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from('fases_metodo').insert({
    nombre,
    descripcion: String(formData.get('descripcion') ?? '').trim() || null,
    orden: (ultima?.orden ?? 0) + 1,
  });

  if (error) volver({ error: `No se pudo crear: ${error.message}` });
  volver({ aviso: 'Fase añadida.' });
}

export async function cambiarEstadoFase(faseId: string, activa: boolean) {
  const { supabase } = await exigirDireccion();
  // Se desactiva, no se borra: los pacientes que estén en ella la conservan.
  const { error } = await supabase.from('fases_metodo').update({ activa }).eq('id', faseId);
  if (error) volver({ error: `No se pudo actualizar: ${error.message}` });
  volver();
}

// ---------------------------------------------------------------------------
// Habitaciones
// ---------------------------------------------------------------------------

export async function crearHabitacion(formData: FormData) {
  const { supabase } = await exigirDireccion();

  const centroId = String(formData.get('centro') ?? '');
  const nombre = String(formData.get('nombre') ?? '').trim();
  const plazas = Number(formData.get('plazas') ?? 1);

  if (!centroId || !nombre) volver({ error: 'Indica centro y nombre de la habitación.' });
  if (!(plazas > 0)) volver({ error: 'Una habitación tiene al menos una plaza.' });

  const { error } = await supabase
    .from('habitaciones')
    .insert({ centro_id: centroId, nombre, plazas });

  if (error) {
    volver({
      error: error.message.includes('duplicate')
        ? 'Ese centro ya tiene una habitación con ese nombre.'
        : `No se pudo crear: ${error.message}`,
    });
  }
  volver({ aviso: 'Habitación creada.' });
}

export async function editarHabitacion(habitacionId: string, formData: FormData) {
  const { supabase } = await exigirDireccion();

  const plazas = Number(formData.get('plazas') ?? 1);
  if (!(plazas > 0)) volver({ error: 'Una habitación tiene al menos una plaza.' });

  // Reducir plazas por debajo de lo que ya hay ocupado dejaría el mapa
  // mintiendo, así que se comprueba antes.
  const { count } = await supabase
    .from('ocupaciones')
    .select('id', { count: 'exact', head: true })
    .eq('habitacion_id', habitacionId)
    .is('hasta', null);

  if ((count ?? 0) > plazas) {
    volver({ error: `Ahora mismo hay ${count} personas dentro: no puedes dejarla en ${plazas}.` });
  }

  const { error } = await supabase
    .from('habitaciones')
    .update({
      nombre: String(formData.get('nombre') ?? '').trim(),
      plazas,
      activa: formData.get('activa') === 'on',
    })
    .eq('id', habitacionId);

  if (error) volver({ error: `No se pudo guardar: ${error.message}` });
  volver({ aviso: 'Habitación actualizada.' });
}

// ---------------------------------------------------------------------------
// Cuestionarios
// ---------------------------------------------------------------------------

export async function crearCuestionario(formData: FormData) {
  const { supabase } = await exigirDireccion();

  const nombre = String(formData.get('nombre') ?? '').trim();
  if (!nombre) volver({ error: 'El cuestionario necesita un nombre.' });

  const { error } = await supabase.from('cuestionarios').insert({
    nombre,
    descripcion: String(formData.get('descripcion') ?? '').trim() || null,
  });

  if (error) volver({ error: `No se pudo crear: ${error.message}` });
  volver({ aviso: 'Cuestionario creado. Añádele preguntas.' });
}

export async function anadirPregunta(cuestionarioId: string, formData: FormData) {
  const { supabase } = await exigirDireccion();

  const texto = String(formData.get('texto') ?? '').trim();
  if (!texto) volver({ error: 'La pregunta necesita un texto.' });

  const min = Number(formData.get('min') ?? 0);
  const max = Number(formData.get('max') ?? 10);
  if (max <= min) volver({ error: 'El máximo tiene que ser mayor que el mínimo.' });

  const { count } = await supabase
    .from('cuestionario_preguntas')
    .select('id', { count: 'exact', head: true })
    .eq('cuestionario_id', cuestionarioId);

  const { error } = await supabase.from('cuestionario_preguntas').insert({
    cuestionario_id: cuestionarioId,
    texto,
    orden: (count ?? 0) + 1,
    valor_min: min,
    valor_max: max,
  });

  if (error) volver({ error: `No se pudo añadir: ${error.message}` });
  volver();
}

export async function borrarPregunta(preguntaId: string) {
  const { supabase } = await exigirDireccion();
  const { error } = await supabase.from('cuestionario_preguntas').delete().eq('id', preguntaId);
  if (error) volver({ error: `No se pudo borrar: ${error.message}` });
  volver();
}

export async function cambiarEstadoCuestionario(cuestionarioId: string, activo: boolean) {
  const { supabase } = await exigirDireccion();
  const { error } = await supabase.from('cuestionarios').update({ activo }).eq('id', cuestionarioId);
  if (error) volver({ error: `No se pudo actualizar: ${error.message}` });
  volver();
}
