'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { normalizarTelefono } from '@/lib/telefonos';
import { desdeDatetimeLocal } from '@/lib/fechas';
import { centroDeAtribucion, reabrirCaso, ultimoCasoPorTelefono } from '@/lib/casos';
import { createAdminClient } from '@/lib/supabase/admin';
import { asignarmeLead, moverLeadDeEtapa } from '../actions';

type TipoActividad = 'llamada' | 'whatsapp' | 'email' | 'nota';
const TIPOS_CONTACTO_SALIENTE: TipoActividad[] = ['llamada', 'whatsapp', 'email'];

function volver(leadId: string, aviso?: { error?: string; aviso?: string }): never {
  const q = aviso?.error
    ? `?error=${encodeURIComponent(aviso.error)}`
    : aviso?.aviso
      ? `?aviso=${encodeURIComponent(aviso.aviso)}`
      : '';
  revalidatePath('/leads');
  revalidatePath(`/leads/${leadId}`);
  redirect(`/leads/${leadId}${q}`);
}

async function registrarEnHistorial(leadId: string, tipo: string, contenido: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase.from('actividades').insert({
    lead_id: leadId,
    tipo: tipo as TipoActividad | 'cambio_estado' | 'reapertura',
    contenido,
    usuario_id: user?.id ?? null,
  });
}

export async function registrarActividad(leadId: string, formData: FormData) {
  const tipo = String(formData.get('tipo') ?? 'nota') as TipoActividad;
  const contenido = String(formData.get('contenido') ?? '').trim();
  if (!contenido) volver(leadId, { error: 'Escribe el contenido de la actividad.' });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('actividades')
    .insert({ lead_id: leadId, tipo, contenido, usuario_id: user?.id ?? null });
  if (error) volver(leadId, { error: `No se pudo registrar: ${error.message}` });

  if (TIPOS_CONTACTO_SALIENTE.includes(tipo)) {
    await supabase
      .from('leads')
      .update({ primera_respuesta_at: new Date().toISOString() })
      .eq('id', leadId)
      .is('primera_respuesta_at', null);
  }
  volver(leadId);
}

export async function crearTarea(leadId: string, formData: FormData) {
  const titulo = String(formData.get('titulo') ?? '').trim();
  // El <input datetime-local> no lleva zona: se interpreta en Europe/Madrid,
  // no en la del servidor (que en producción es UTC).
  const vence = desdeDatetimeLocal(String(formData.get('vence') ?? ''));
  if (!titulo || !vence) volver(leadId, { error: 'La tarea necesita título y fecha.' });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from('tareas').insert({
    lead_id: leadId,
    titulo,
    vence_at: vence,
    responsable_id: user?.id ?? null,
  });
  if (error) volver(leadId, { error: `No se pudo crear la tarea: ${error.message}` });
  volver(leadId);
}

export async function completarTarea(leadId: string, tareaId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('tareas')
    .update({ completada_at: new Date().toISOString() })
    .eq('id', tareaId);
  if (error) volver(leadId, { error: `No se pudo completar: ${error.message}` });
  volver(leadId);
}

export async function anadirContacto(leadId: string, formData: FormData) {
  const nombre = String(formData.get('nombre') ?? '').trim();
  const telefono = normalizarTelefono(String(formData.get('telefono') ?? ''));
  const tipo = String(formData.get('tipo') ?? 'otro');
  const relacion = String(formData.get('relacion') ?? '').trim() || null;
  const principal = formData.get('principal') === 'on';

  if (!nombre || !telefono) {
    volver(leadId, { error: 'Nombre y teléfono válido (formato +34…) son obligatorios.' });
  }

  const supabase = await createClient();

  // La persona es GLOBAL: se deduplica por teléfono contra todo el directorio.
  const { data: existente } = await supabase
    .from('contactos')
    .select('id')
    .eq('telefono', telefono)
    .maybeSingle();

  let contactoId = existente?.id;
  if (!contactoId) {
    const { data: nuevo, error } = await supabase
      .from('contactos')
      .insert({ nombre, telefono })
      .select('id')
      .single();
    if (error) volver(leadId, { error: `No se pudo crear el contacto: ${error.message}` });
    contactoId = nuevo.id;
  }

  // Aviso de duplicado: ¿este teléfono ya está en otros casos?
  const { data: otrosCasos } = await supabase
    .from('lead_contactos')
    .select('lead_id')
    .eq('contacto_id', contactoId)
    .neq('lead_id', leadId);

  if (principal) {
    await supabase.from('lead_contactos').update({ es_principal: false }).eq('lead_id', leadId);
  }

  const { error: errorVinculo } = await supabase.from('lead_contactos').insert({
    lead_id: leadId,
    contacto_id: contactoId,
    tipo: tipo as 'familiar' | 'afectado' | 'prescriptor' | 'otro',
    relacion,
    es_principal: principal,
  });
  if (errorVinculo) {
    volver(leadId, { error: `No se pudo vincular el contacto: ${errorVinculo.message}` });
  }

  if (otrosCasos && otrosCasos.length > 0) {
    volver(leadId, {
      aviso: `Contacto vinculado. Atención: este teléfono ya aparece en ${otrosCasos.length} caso(s) más — puede ser un duplicado o una reapertura.`,
    });
  }
  volver(leadId);
}

export async function asignarmeDesdeFicha(leadId: string) {
  const r = await asignarmeLead(leadId);
  if (r?.error) volver(leadId, { error: r.error });
  volver(leadId);
}

export async function cambiarEtapa(leadId: string, formData: FormData) {
  const etapaId = String(formData.get('etapa') ?? '');
  if (!etapaId) volver(leadId);
  const r = await moverLeadDeEtapa(leadId, etapaId);
  if (r?.error) volver(leadId, { error: r.error });
  volver(leadId);
}

export async function asignarPropietario(leadId: string, formData: FormData) {
  const perfilId = String(formData.get('propietario') ?? '') || null;
  const supabase = await createClient();

  const { error } = await supabase
    .from('leads')
    .update({ propietario_id: perfilId })
    .eq('id', leadId);
  if (error) volver(leadId, { error: `No se pudo cambiar el propietario: ${error.message}` });

  const { data: perfil } = perfilId
    ? await supabase.from('perfiles').select('nombre').eq('id', perfilId).single()
    : { data: null };
  await registrarEnHistorial(
    leadId,
    'cambio_estado',
    perfil ? `Propietario cambiado a ${perfil.nombre}` : 'Lead dejado sin propietario',
  );
  volver(leadId);
}

export async function marcarPerdido(leadId: string, formData: FormData) {
  const motivoId = String(formData.get('motivo') ?? '');
  if (!motivoId) volver(leadId, { error: 'Marcar un lead como perdido exige motivo del catálogo.' });

  const supabase = await createClient();
  const { error } = await supabase
    .from('leads')
    .update({ estado: 'perdido', motivo_perdida_id: motivoId })
    .eq('id', leadId);
  if (error) volver(leadId, { error: `No se pudo marcar como perdido: ${error.message}` });

  const { data: motivo } = await supabase
    .from('motivos_perdida')
    .select('nombre')
    .eq('id', motivoId)
    .single();
  await registrarEnHistorial(leadId, 'cambio_estado', `Marcado como perdido: ${motivo?.nombre}`);
  volver(leadId);
}

export async function marcarNoValido(leadId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('leads').update({ estado: 'no_valido' }).eq('id', leadId);
  if (error) volver(leadId, { error: `No se pudo marcar: ${error.message}` });
  await registrarEnHistorial(leadId, 'cambio_estado', 'Marcado como no válido');
  volver(leadId);
}

export async function reabrirLead(leadId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: lead } = await supabase
    .from('leads')
    .select('id, estado, propietario_id, centro_id')
    .eq('id', leadId)
    .maybeSingle();
  if (!lead) volver(leadId, { error: 'Lead no encontrado.' });

  // Misma autoridad que la reapertura automática: propietario anterior (o
  // administrador general si ya no está activo), próxima acción y aviso.
  await reabrirCaso(createAdminClient(), {
    caso: {
      leadId: lead.id,
      estado: lead.estado,
      propietarioId: lead.propietario_id,
      centroId: lead.centro_id,
      contactoId: '',
      cerrado: true,
    },
    motivo: 'Caso reabierto con todo su historial',
    usuarioId: user?.id ?? null,
  });
  volver(leadId);
}

export async function derivarLead(leadId: string, formData: FormData) {
  const centroDestinoId = String(formData.get('centro_destino') ?? '');
  const motivo = String(formData.get('motivo') ?? '').trim() || null;
  if (!centroDestinoId) volver(leadId, { error: 'Elige el centro de destino.' });

  const supabase = await createClient();
  const { data: lead } = await supabase
    .from('leads')
    .select('centro_id, centro:centros(nombre)')
    .eq('id', leadId)
    .single();
  if (!lead) volver(leadId, { error: 'Lead no encontrado.' });
  if (lead.centro_id === centroDestinoId) {
    volver(leadId, { error: 'El centro de destino es el actual.' });
  }

  // La derivación NO duplica el lead: mismo registro, historial y atribución al origen.
  const { error: errorDerivacion } = await supabase.from('derivaciones').insert({
    lead_id: leadId,
    centro_origen_id: lead.centro_id,
    centro_destino_id: centroDestinoId,
    motivo,
  });
  if (errorDerivacion) {
    volver(leadId, { error: `No se pudo derivar: ${errorDerivacion.message}` });
  }

  const { error } = await supabase
    .from('leads')
    .update({ centro_id: centroDestinoId, estado: 'derivado' })
    .eq('id', leadId);
  if (error) volver(leadId, { error: `No se pudo derivar: ${error.message}` });

  const { data: destino } = await supabase
    .from('centros')
    .select('nombre')
    .eq('id', centroDestinoId)
    .single();
  await registrarEnHistorial(leadId, 'cambio_estado', `Derivado a ${destino?.nombre}`);
  volver(leadId);
}

/** Sacar un lead de la bandeja de grupo NO es una derivación: es un cambio de centro auditado. */
export async function asignarCentro(leadId: string, formData: FormData) {
  const centroId = String(formData.get('centro') ?? '');
  if (!centroId) volver(leadId, { error: 'Elige el centro.' });

  const supabase = await createClient();
  const { error } = await supabase.from('leads').update({ centro_id: centroId }).eq('id', leadId);
  if (error) volver(leadId, { error: `No se pudo asignar el centro: ${error.message}` });

  const { data: centro } = await supabase
    .from('centros')
    .select('nombre')
    .eq('id', centroId)
    .single();
  await registrarEnHistorial(
    leadId,
    'cambio_estado',
    `Asignado al centro ${centro?.nombre} desde la bandeja de grupo`,
  );
  volver(leadId);
}

// ---------------------------------------------------------------------------
// Adjuntos del caso (capturas de WhatsApp, justificantes, informes)
// ---------------------------------------------------------------------------

const MAX_BYTES = 10 * 1024 * 1024;
const TIPOS_PERMITIDOS = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
];

export async function subirAdjunto(leadId: string, formData: FormData) {
  const archivo = formData.get('archivo');
  if (!(archivo instanceof File) || archivo.size === 0) {
    volver(leadId, { error: 'Elige un archivo.' });
  }
  if (archivo.size > MAX_BYTES) {
    volver(leadId, { error: 'El archivo supera los 10 MB.' });
  }
  if (!TIPOS_PERMITIDOS.includes(archivo.type)) {
    volver(leadId, { error: 'Solo se admiten imágenes (JPG, PNG, WEBP, HEIC) y PDF.' });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // La ruta empieza por el id del caso: es lo que usa la política de Storage
  // para decidir quién puede leerlo y escribirlo.
  const extension = archivo.name.split('.').pop()?.toLowerCase() ?? 'bin';
  const ruta = `${leadId}/${crypto.randomUUID()}.${extension}`;

  const { error: errorSubida } = await supabase.storage
    .from('adjuntos-casos')
    .upload(ruta, archivo, { contentType: archivo.type, upsert: false });
  if (errorSubida) volver(leadId, { error: `No se pudo subir: ${errorSubida.message}` });

  const { error } = await supabase.from('caso_adjuntos').insert({
    lead_id: leadId,
    nombre_archivo: archivo.name,
    storage_path: ruta,
    mime_type: archivo.type,
    tamano_bytes: archivo.size,
    subido_por: user?.id ?? null,
  });
  if (error) {
    // Si no se puede registrar, no dejamos el archivo huérfano en el bucket.
    await supabase.storage.from('adjuntos-casos').remove([ruta]);
    volver(leadId, { error: `No se pudo registrar el adjunto: ${error.message}` });
  }

  await registrarEnHistorial(leadId, 'nota', `Adjunto añadido: ${archivo.name}`);
  volver(leadId);
}

export async function borrarAdjunto(leadId: string, adjuntoId: string) {
  const supabase = await createClient();

  const { data: adjunto } = await supabase
    .from('caso_adjuntos')
    .select('storage_path, nombre_archivo')
    .eq('id', adjuntoId)
    .maybeSingle();
  if (!adjunto) volver(leadId, { error: 'Ese adjunto ya no existe.' });

  const { error } = await supabase.from('caso_adjuntos').delete().eq('id', adjuntoId);
  if (error) volver(leadId, { error: `No se pudo borrar: ${error.message}` });

  await supabase.storage.from('adjuntos-casos').remove([adjunto.storage_path]);
  await registrarEnHistorial(leadId, 'nota', `Adjunto eliminado: ${adjunto.nombre_archivo}`);
  volver(leadId);
}

export async function crearPresupuesto(leadId: string, formData: FormData) {
  const importe = Number(String(formData.get('importe') ?? '').replace(',', '.'));
  const modalidadId = String(formData.get('modalidad') ?? '') || null;
  const descripcion = String(formData.get('descripcion') ?? '').trim() || null;
  if (!importe || importe <= 0) volver(leadId, { error: 'El presupuesto necesita un importe.' });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from('presupuestos').insert({
    lead_id: leadId,
    importe,
    modalidad_id: modalidadId,
    descripcion,
    creado_por: user?.id ?? null,
  });
  if (error) volver(leadId, { error: `No se pudo guardar el presupuesto: ${error.message}` });
  volver(leadId);
}

/** El comercial registra la conversión; queda pendiente hasta que dirección valida el pago. */
export async function registrarConversion(leadId: string, formData: FormData) {
  const fechaInicio = String(formData.get('fecha_inicio') ?? '') || null;
  const modalidadId = String(formData.get('modalidad') ?? '') || null;
  const importeTexto = String(formData.get('importe') ?? '').replace(',', '.');
  const importe = importeTexto ? Number(importeTexto) : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Regla 3: si el caso fue derivado, la conversión se atribuye al centro de ORIGEN.
  const centroId = await centroDeAtribucion(supabase, leadId);
  if (!centroId) volver(leadId, { error: 'Lead no encontrado.' });

  const { error } = await supabase.from('conversiones').insert({
    lead_id: leadId,
    centro_id: centroId,
    fecha_inicio: fechaInicio,
    modalidad_id: modalidadId,
    importe_primer_pago: importe,
    registrada_por: user?.id ?? null,
  });
  if (error) volver(leadId, { error: `No se pudo registrar la conversión: ${error.message}` });

  await registrarEnHistorial(
    leadId,
    'cambio_estado',
    'Conversión registrada (pendiente de validación por dirección)',
  );
  volver(leadId);
}

export async function validarConversion(leadId: string, conversionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: validadas, error } = await supabase
    .from('conversiones')
    .update({
      estado: 'validada',
      validada_por: user?.id ?? null,
      validada_at: new Date().toISOString(),
    })
    .eq('id', conversionId)
    .select('id');
  if (error) volver(leadId, { error: `No se pudo validar: ${error.message}` });
  // Sin filas afectadas = RLS lo ha impedido. No se registra una validación que no ocurrió.
  if (!validadas || validadas.length === 0) {
    volver(leadId, { error: 'Solo dirección puede validar el pago de una conversión.' });
  }
  await registrarEnHistorial(leadId, 'cambio_estado', 'Conversión validada por dirección');
  volver(leadId);
}
