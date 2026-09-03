'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { desdeDatetimeLocal } from '@/lib/fechas';
import { normalizarTelefono } from '@/lib/telefonos';
import { exigirAccesoClinico } from './guard';

function volver(ruta: string, aviso?: { error?: string; aviso?: string }): never {
  const q = aviso?.error
    ? `?error=${encodeURIComponent(aviso.error)}`
    : aviso?.aviso
      ? `?aviso=${encodeURIComponent(aviso.aviso)}`
      : '';
  revalidatePath(ruta);
  redirect(`${ruta}${q}`);
}

// ---------------------------------------------------------------------------
// Ficha del paciente
// ---------------------------------------------------------------------------

export async function guardarPaciente(pacienteId: string, formData: FormData) {
  const { supabase } = await exigirAccesoClinico();
  const ruta = `/clinica/${pacienteId}`;

  const nombre = String(formData.get('nombre') ?? '').trim();
  if (!nombre) volver(ruta, { error: 'El nombre no puede quedarse vacío.' });

  const telefonoCrudo = String(formData.get('telefono') ?? '').trim();
  const telefono = telefonoCrudo ? normalizarTelefono(telefonoCrudo) : null;
  if (telefonoCrudo && !telefono) {
    volver(ruta, { error: 'El teléfono debe ir en formato internacional (+34…).' });
  }

  const { error } = await supabase
    .from('pacientes')
    .update({
      nombre,
      telefono,
      email: String(formData.get('email') ?? '').trim() || null,
      fecha_nacimiento: String(formData.get('fecha_nacimiento') ?? '') || null,
      fase_id: String(formData.get('fase') ?? '') || null,
      modalidad_id: String(formData.get('modalidad') ?? '') || null,
      adiccion_id: String(formData.get('adiccion') ?? '') || null,
      estado: String(formData.get('estado') ?? 'activo') as
        | 'activo'
        | 'alta'
        | 'abandono'
        | 'derivado_externo',
      fecha_ingreso: String(formData.get('fecha_ingreso') ?? '') || undefined,
      fecha_alta: String(formData.get('fecha_alta') ?? '') || null,
      notas: String(formData.get('notas') ?? '').trim() || null,
    })
    .eq('id', pacienteId);

  if (error) volver(ruta, { error: `No se pudo guardar: ${error.message}` });
  volver(ruta, { aviso: 'Ficha actualizada.' });
}

/** Cambiar el terapeuta referente. Solo dirección (regla de sustituciones). */
export async function asignarTerapeuta(pacienteId: string, formData: FormData) {
  const { supabase, esDireccion } = await exigirAccesoClinico();
  const ruta = `/clinica/${pacienteId}`;

  if (!esDireccion) {
    volver(ruta, { error: 'Solo dirección puede cambiar el terapeuta referente.' });
  }

  const terapeutaId = String(formData.get('terapeuta') ?? '') || null;
  const { error } = await supabase
    .from('pacientes')
    .update({ terapeuta_id: terapeutaId })
    .eq('id', pacienteId);

  if (error) volver(ruta, { error: `No se pudo asignar: ${error.message}` });

  if (terapeutaId) {
    await supabase.from('notificaciones').insert({
      usuario_id: terapeutaId,
      tipo: 'lead_asignado',
      mensaje: 'Te han asignado un paciente nuevo como referente',
    });
  }

  volver(ruta, { aviso: 'Terapeuta referente actualizado.' });
}

// ---------------------------------------------------------------------------
// Sesiones
// ---------------------------------------------------------------------------

export async function crearSesion(pacienteId: string, formData: FormData) {
  const { supabase, perfil } = await exigirAccesoClinico();
  const ruta = `/clinica/${pacienteId}`;

  const inicio = desdeDatetimeLocal(String(formData.get('inicio') ?? ''));
  if (!inicio) volver(ruta, { error: 'Indica la fecha y la hora de la sesión.' });

  const duracion = Number(formData.get('duracion') ?? 60);
  const fin = new Date(new Date(inicio).getTime() + duracion * 60_000).toISOString();

  const { error } = await supabase.from('sesiones').insert({
    paciente_id: pacienteId,
    terapeuta_id: perfil.id,
    tipo: String(formData.get('tipo') ?? 'individual') as 'individual' | 'grupal' | 'familiar',
    estado: String(formData.get('estado') ?? 'programada') as
      | 'programada'
      | 'realizada'
      | 'no_show'
      | 'cancelada',
    inicio,
    fin,
    notas_clinicas: String(formData.get('notas') ?? '').trim() || null,
    created_by: perfil.id,
  });

  if (error) volver(ruta, { error: `No se pudo crear la sesión: ${error.message}` });
  volver(ruta, { aviso: 'Sesión registrada.' });
}

export async function cambiarEstadoSesion(pacienteId: string, sesionId: string, estado: string) {
  const { supabase } = await exigirAccesoClinico();
  const { error } = await supabase
    .from('sesiones')
    .update({ estado: estado as 'programada' | 'realizada' | 'no_show' | 'cancelada' })
    .eq('id', sesionId);
  if (error) {
    volver(`/clinica/${pacienteId}`, { error: `No se pudo actualizar: ${error.message}` });
  }
  volver(`/clinica/${pacienteId}`);
}

export async function guardarNotasSesion(
  pacienteId: string,
  sesionId: string,
  formData: FormData,
) {
  const { supabase } = await exigirAccesoClinico();
  const { error } = await supabase
    .from('sesiones')
    .update({ notas_clinicas: String(formData.get('notas') ?? '').trim() || null })
    .eq('id', sesionId);
  if (error) {
    volver(`/clinica/${pacienteId}`, { error: `No se pudieron guardar las notas: ${error.message}` });
  }
  volver(`/clinica/${pacienteId}`, { aviso: 'Notas guardadas.' });
}

// ---------------------------------------------------------------------------
// Familia
// ---------------------------------------------------------------------------

export async function anadirFamiliar(pacienteId: string, formData: FormData) {
  const { supabase } = await exigirAccesoClinico();
  const ruta = `/clinica/${pacienteId}`;

  const nombre = String(formData.get('nombre') ?? '').trim();
  if (!nombre) volver(ruta, { error: 'El familiar necesita al menos un nombre.' });

  const telefonoCrudo = String(formData.get('telefono') ?? '').trim();
  const telefono = telefonoCrudo ? normalizarTelefono(telefonoCrudo) : null;
  if (telefonoCrudo && !telefono) {
    volver(ruta, { error: 'El teléfono debe ir en formato internacional (+34…).' });
  }

  const { error } = await supabase.from('familiares').insert({
    paciente_id: pacienteId,
    nombre,
    telefono,
    email: String(formData.get('email') ?? '').trim() || null,
    relacion: String(formData.get('relacion') ?? '').trim() || null,
    es_contacto_emergencia: formData.get('emergencia') === 'on',
    notas: String(formData.get('notas') ?? '').trim() || null,
  });

  if (error) volver(ruta, { error: `No se pudo añadir: ${error.message}` });
  volver(ruta, { aviso: 'Familiar añadido.' });
}

export async function borrarFamiliar(pacienteId: string, familiarId: string) {
  const { supabase } = await exigirAccesoClinico();
  const { error } = await supabase.from('familiares').delete().eq('id', familiarId);
  if (error) {
    volver(`/clinica/${pacienteId}`, { error: `No se pudo borrar: ${error.message}` });
  }
  volver(`/clinica/${pacienteId}`);
}

// ---------------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------------

export async function subirDocumento(pacienteId: string, formData: FormData) {
  const { supabase, perfil } = await exigirAccesoClinico();
  const ruta = `/clinica/${pacienteId}`;

  const archivo = formData.get('archivo');
  if (!(archivo instanceof File) || archivo.size === 0) {
    volver(ruta, { error: 'Elige un archivo.' });
  }
  if (archivo.size > 20 * 1024 * 1024) {
    volver(ruta, { error: 'El archivo pasa de 20 MB.' });
  }

  // La carpeta es el id del paciente: es lo que leen las políticas del bucket
  // para decidir quién puede descargarlo.
  const limpio = archivo.name.replace(/[^\w.\-]/g, '_').slice(-80);
  const destino = `${pacienteId}/${Date.now()}-${limpio}`;

  const { error: errorSubida } = await supabase.storage
    .from('documentos-clinicos')
    .upload(destino, archivo, { contentType: archivo.type || undefined });
  if (errorSubida) volver(ruta, { error: `No se pudo subir: ${errorSubida.message}` });

  const { error } = await supabase.from('documentos_clinicos').insert({
    paciente_id: pacienteId,
    nombre: archivo.name,
    tipo: String(formData.get('tipo') ?? 'otro') as
      | 'consentimiento'
      | 'informe'
      | 'derivacion'
      | 'otro',
    ruta: destino,
    tamano_bytes: archivo.size,
    subido_por: perfil.id,
  });

  if (error) volver(ruta, { error: `Se subió el archivo pero no se registró: ${error.message}` });
  volver(ruta, { aviso: 'Documento guardado.' });
}

export async function borrarDocumento(pacienteId: string, documentoId: string) {
  const { supabase } = await exigirAccesoClinico();
  const ruta = `/clinica/${pacienteId}`;

  const { data: documento } = await supabase
    .from('documentos_clinicos')
    .select('ruta')
    .eq('id', documentoId)
    .maybeSingle();

  const { error } = await supabase.from('documentos_clinicos').delete().eq('id', documentoId);
  if (error) volver(ruta, { error: `No se pudo borrar: ${error.message}` });

  // El archivo se retira después de la fila: si esto falla, queda un huérfano
  // en el almacén, que es mucho menos grave que una fila apuntando a la nada.
  if (documento) await supabase.storage.from('documentos-clinicos').remove([documento.ruta]);

  volver(ruta, { aviso: 'Documento borrado.' });
}

// ---------------------------------------------------------------------------
// Cuestionarios
// ---------------------------------------------------------------------------

export async function registrarCuestionario(pacienteId: string, formData: FormData) {
  const { supabase, perfil } = await exigirAccesoClinico();
  const ruta = `/clinica/${pacienteId}`;

  const cuestionarioId = String(formData.get('cuestionario') ?? '');
  if (!cuestionarioId) volver(ruta, { error: 'Elige un cuestionario.' });

  const { data: preguntas } = await supabase
    .from('cuestionario_preguntas')
    .select('id')
    .eq('cuestionario_id', cuestionarioId)
    .order('orden');

  const valores = (preguntas ?? [])
    .map((p) => ({ pregunta_id: p.id, valor: Number(formData.get(`p_${p.id}`)) }))
    .filter((v) => Number.isFinite(v.valor));

  if (valores.length === 0) volver(ruta, { error: 'Responde al menos una pregunta.' });

  const total = valores.reduce((suma, v) => suma + v.valor, 0);

  const { data: respuesta, error } = await supabase
    .from('cuestionario_respuestas')
    .insert({
      cuestionario_id: cuestionarioId,
      paciente_id: pacienteId,
      puntuacion_total: total,
      notas: String(formData.get('notas') ?? '').trim() || null,
      registrado_por: perfil.id,
    })
    .select('id')
    .single();

  if (error || !respuesta) volver(ruta, { error: `No se pudo registrar: ${error?.message}` });

  await supabase
    .from('cuestionario_respuesta_items')
    .insert(valores.map((v) => ({ ...v, respuesta_id: respuesta.id })));

  volver(ruta, { aviso: 'Cuestionario registrado.' });
}

// ---------------------------------------------------------------------------
// Seguimiento post-alta
// ---------------------------------------------------------------------------

export async function completarSeguimiento(
  pacienteId: string,
  seguimientoId: string,
  formData: FormData,
) {
  const { supabase } = await exigirAccesoClinico();
  const { error } = await supabase
    .from('seguimientos_post_alta')
    .update({
      completado_at: new Date().toISOString(),
      resultado: String(formData.get('resultado') ?? '').trim() || null,
    })
    .eq('id', seguimientoId);

  if (error) {
    volver(`/clinica/${pacienteId}`, { error: `No se pudo cerrar: ${error.message}` });
  }
  volver(`/clinica/${pacienteId}`, { aviso: 'Seguimiento anotado.' });
}
