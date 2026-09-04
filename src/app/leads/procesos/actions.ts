'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { EstadoLead } from '@/lib/estados';

/**
 * Procesos de venta (regla 6).
 *
 * Los crean dirección Y los comerciales. Cada uno maneja los suyos; los de
 * otros los ve, para poder mover casos a ellos, pero no los toca. Eso lo
 * decide la base de datos, no estas funciones: aquí solo se comprueba que
 * quien entra es del área comercial.
 *
 * Lo único reservado a dirección es marcar cuál recibe los casos nuevos de un
 * centro. Crear procesos es libre; redirigir la entrada de todo un centro, no.
 */

async function exigirComercial() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .maybeSingle();

  if (perfil?.rol !== 'direccion' && perfil?.rol !== 'admisiones') {
    redirect(perfil?.rol === 'terapeuta' ? '/agenda' : '/leads');
  }

  return { supabase, user, esDireccion: perfil.rol === 'direccion' };
}

function volver(aviso?: { error?: string; aviso?: string }): never {
  const q = aviso?.error
    ? `?error=${encodeURIComponent(aviso.error)}`
    : aviso?.aviso
      ? `?aviso=${encodeURIComponent(aviso.aviso)}`
      : '';
  revalidatePath('/leads/procesos');
  revalidatePath('/leads');
  redirect(`/leads/procesos${q}`);
}

/** El recorrido con el que nace un proceso en blanco. */
const ETAPAS_ESTANDAR: { nombre: string; estado: EstadoLead }[] = [
  { nombre: 'Nuevo', estado: 'nuevo' },
  { nombre: 'Contactado', estado: 'contactado' },
  { nombre: 'Cita agendada', estado: 'cita_agendada' },
  { nombre: 'Cita realizada', estado: 'cita_realizada' },
  { nombre: 'En valoración', estado: 'en_valoracion' },
  { nombre: 'Convertido', estado: 'convertido' },
];

export async function crearProceso(formData: FormData) {
  const { supabase, user } = await exigirComercial();

  const nombre = String(formData.get('nombre') ?? '').trim();
  const centroId = String(formData.get('centro') ?? '') || null;
  const copiarDe = String(formData.get('copiar_de') ?? '') || null;

  if (!nombre) volver({ error: 'El proceso necesita un nombre.' });

  const { data: proceso, error } = await supabase
    .from('pipelines')
    .insert({ nombre, centro_id: centroId, activo: true, created_by: user.id })
    .select('id')
    .single();

  if (error || !proceso) volver({ error: `No se pudo crear: ${error?.message}` });

  /**
   * Un proceso sin etapas es inservible, así que nace con recorrido. Copiar
   * uno existente es lo que se hace casi siempre: «como el estándar, pero con
   * una etapa más antes de la cita».
   */
  let etapas: { pipeline_id: string; nombre: string; orden: number; estado_sistema: EstadoLead }[];

  if (copiarDe) {
    const { data: origen } = await supabase
      .from('pipeline_etapas')
      .select('nombre, orden, estado_sistema')
      .eq('pipeline_id', copiarDe)
      .order('orden');

    etapas = (origen ?? []).map((e) => ({
      pipeline_id: proceso.id,
      nombre: e.nombre,
      orden: e.orden,
      estado_sistema: e.estado_sistema,
    }));
  } else {
    etapas = ETAPAS_ESTANDAR.map((e, i) => ({
      pipeline_id: proceso.id,
      nombre: e.nombre,
      orden: i + 1,
      estado_sistema: e.estado,
    }));
  }

  if (etapas.length === 0) {
    volver({ error: 'El proceso que querías copiar no tiene etapas.' });
  }

  const { error: errorEtapas } = await supabase.from('pipeline_etapas').insert(etapas);
  if (errorEtapas) {
    volver({ error: `Proceso creado pero sin etapas: ${errorEtapas.message}` });
  }

  volver({ aviso: `«${nombre}» creado con ${etapas.length} etapas. Renómbralas a tu gusto.` });
}

export async function renombrarProceso(procesoId: string, formData: FormData) {
  const { supabase } = await exigirComercial();

  const nombre = String(formData.get('nombre') ?? '').trim();
  if (!nombre) volver({ error: 'El proceso necesita un nombre.' });

  const { data: actualizados, error } = await supabase
    .from('pipelines')
    .update({ nombre, activo: formData.get('activo') === 'on' })
    .eq('id', procesoId)
    .select('id');

  if (error) volver({ error: `No se pudo guardar: ${error.message}` });
  if (!actualizados || actualizados.length === 0) {
    volver({ error: 'Solo puedes editar los procesos que has creado tú.' });
  }
  volver({ aviso: 'Proceso actualizado.' });
}

/** Marcar cuál recibe los casos nuevos. Solo dirección (lo exige un trigger). */
export async function marcarPredeterminado(procesoId: string) {
  const { supabase, esDireccion } = await exigirComercial();

  if (!esDireccion) {
    volver({ error: 'Solo dirección decide qué proceso recibe los casos nuevos.' });
  }

  const { data: proceso } = await supabase
    .from('pipelines')
    .select('centro_id, nombre')
    .eq('id', procesoId)
    .maybeSingle();
  if (!proceso) volver({ error: 'Proceso no encontrado.' });

  /**
   * Solo puede haber uno por centro: hay que quitárselo al anterior antes,
   * porque el índice único lo rechazaría a mitad de camino.
   */
  const quitar = supabase.from('pipelines').update({ es_predeterminado: false });
  await (proceso.centro_id
    ? quitar.eq('centro_id', proceso.centro_id)
    : quitar.is('centro_id', null));

  const { error } = await supabase
    .from('pipelines')
    .update({ es_predeterminado: true })
    .eq('id', procesoId);

  if (error) volver({ error: `No se pudo marcar: ${error.message}` });
  volver({
    aviso: `Los casos nuevos ${proceso.centro_id ? 'de ese centro' : 'del grupo'} entrarán por «${proceso.nombre}».`,
  });
}

export async function anadirEtapaProceso(procesoId: string, formData: FormData) {
  const { supabase } = await exigirComercial();

  const nombre = String(formData.get('nombre') ?? '').trim();
  const estado = String(formData.get('estado_sistema') ?? '');
  if (!nombre || !estado) volver({ error: 'La etapa necesita nombre y estado de sistema.' });

  const { data: ultima } = await supabase
    .from('pipeline_etapas')
    .select('orden')
    .eq('pipeline_id', procesoId)
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from('pipeline_etapas').insert({
    pipeline_id: procesoId,
    nombre,
    orden: (ultima?.orden ?? 0) + 1,
    estado_sistema: estado as EstadoLead,
  });

  if (error) {
    volver({
      error: error.message.includes('policy')
        ? 'Solo puedes añadir etapas a los procesos que has creado tú.'
        : `No se pudo añadir: ${error.message}`,
    });
  }
  volver();
}

export async function editarEtapaProceso(etapaId: string, formData: FormData) {
  const { supabase } = await exigirComercial();

  const nombre = String(formData.get('nombre') ?? '').trim();
  const estado = String(formData.get('estado_sistema') ?? '');
  const orden = Number(formData.get('orden') ?? 0);
  if (!nombre || !estado) volver({ error: 'La etapa necesita nombre y estado de sistema.' });

  const { data: actualizadas, error } = await supabase
    .from('pipeline_etapas')
    .update({ nombre, estado_sistema: estado as EstadoLead, orden })
    .eq('id', etapaId)
    .select('id');

  if (error) {
    volver({
      error: error.message.includes('duplicate')
        ? 'Ya hay otra etapa en esa posición dentro del proceso.'
        : `No se pudo guardar: ${error.message}`,
    });
  }
  if (!actualizadas || actualizadas.length === 0) {
    volver({ error: 'Solo puedes editar las etapas de los procesos que has creado tú.' });
  }
  volver();
}

export async function borrarEtapaProceso(etapaId: string) {
  const { supabase } = await exigirComercial();

  const { error } = await supabase.from('pipeline_etapas').delete().eq('id', etapaId);

  if (error) {
    // El disparador de la base de datos lo impide si tiene casos dentro.
    volver({
      error: error.message.includes('casos dentro')
        ? 'Esa etapa tiene casos dentro: muévelos a otra antes de borrarla.'
        : `No se pudo borrar: ${error.message}`,
    });
  }
  volver();
}

export async function borrarProceso(procesoId: string) {
  const { supabase } = await exigirComercial();

  const { error } = await supabase.from('pipelines').delete().eq('id', procesoId);

  if (error) {
    volver({
      error: error.message.includes('casos dentro')
        ? 'Ese proceso tiene casos dentro: desactívalo en lugar de borrarlo.'
        : `No se pudo borrar: ${error.message}`,
    });
  }
  volver({ aviso: 'Proceso borrado.' });
}
