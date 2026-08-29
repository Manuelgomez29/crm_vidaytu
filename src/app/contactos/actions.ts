'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { normalizarTelefono } from '@/lib/telefonos';
import type { FiltroSegmento } from '@/lib/segmentos';

function volver(contactoId: string, aviso?: { error?: string; aviso?: string }): never {
  const q = aviso?.error
    ? `?error=${encodeURIComponent(aviso.error)}`
    : aviso?.aviso
      ? `?aviso=${encodeURIComponent(aviso.aviso)}`
      : '';
  revalidatePath('/contactos');
  revalidatePath(`/contactos/${contactoId}`);
  redirect(`/contactos/${contactoId}${q}`);
}

export async function guardarContacto(contactoId: string, formData: FormData) {
  const nombre = String(formData.get('nombre') ?? '').trim();
  const telefono = normalizarTelefono(String(formData.get('telefono') ?? ''));
  if (!nombre || !telefono) {
    volver(contactoId, { error: 'Nombre y teléfono válido (+34…) son obligatorios.' });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('contactos')
    .update({
      nombre,
      telefono,
      email: String(formData.get('email') ?? '').trim() || null,
      zona: String(formData.get('zona') ?? '').trim() || null,
      notas: String(formData.get('notas') ?? '').trim() || null,
    })
    .eq('id', contactoId);

  if (error) {
    const mensaje = error.message.includes('contactos_telefono_key')
      ? 'Ese teléfono ya pertenece a otro contacto del directorio.'
      : `No se pudo guardar: ${error.message}`;
    volver(contactoId, { error: mensaje });
  }
  volver(contactoId);
}

/**
 * Consentimiento de marketing (RGPD): se registra SIEMPRE con fecha y origen.
 * Retirarlo limpia la fecha y el origen: no se conserva un consentimiento caduco.
 */
export async function cambiarConsentimiento(contactoId: string, formData: FormData) {
  const conceder = String(formData.get('conceder') ?? '') === 'si';
  const origen = String(formData.get('origen') ?? '').trim();

  if (conceder && !origen) {
    volver(contactoId, {
      error: 'Para registrar el consentimiento hay que indicar su origen (dónde y cómo se dio).',
    });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('contactos')
    .update({
      consentimiento_marketing: conceder,
      consentimiento_marketing_at: conceder ? new Date().toISOString() : null,
      consentimiento_marketing_origen: conceder ? origen : null,
    })
    .eq('id', contactoId);
  if (error) volver(contactoId, { error: `No se pudo actualizar: ${error.message}` });

  volver(contactoId, {
    aviso: conceder
      ? 'Consentimiento registrado con su fecha y origen.'
      : 'Consentimiento retirado. Este contacto queda fuera de cualquier envío.',
  });
}

export async function anadirEtiqueta(contactoId: string, formData: FormData) {
  const etiquetaId = String(formData.get('etiqueta') ?? '');
  const nombreNueva = String(formData.get('nueva') ?? '').trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let id = etiquetaId;
  if (!id && nombreNueva) {
    const { data: existente } = await supabase
      .from('etiquetas')
      .select('id')
      .ilike('nombre', nombreNueva)
      .maybeSingle();
    if (existente) {
      id = existente.id;
    } else {
      const { data: creada, error } = await supabase
        .from('etiquetas')
        .insert({ nombre: nombreNueva, created_by: user?.id ?? null })
        .select('id')
        .single();
      if (error) volver(contactoId, { error: `No se pudo crear la etiqueta: ${error.message}` });
      id = creada.id;
    }
  }
  if (!id) volver(contactoId, { error: 'Elige una etiqueta o escribe el nombre de una nueva.' });

  const { error } = await supabase
    .from('contacto_etiquetas')
    .insert({ contacto_id: contactoId, etiqueta_id: id, aplicada_por: user?.id ?? null });
  if (error && !error.message.includes('duplicate')) {
    volver(contactoId, { error: `No se pudo etiquetar: ${error.message}` });
  }
  volver(contactoId);
}

export async function quitarEtiqueta(contactoId: string, etiquetaId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('contacto_etiquetas')
    .delete()
    .eq('contacto_id', contactoId)
    .eq('etiqueta_id', etiquetaId);
  if (error) volver(contactoId, { error: `No se pudo quitar la etiqueta: ${error.message}` });
  volver(contactoId);
}

export async function anadirAListaEstatica(contactoId: string, formData: FormData) {
  const listaId = String(formData.get('lista') ?? '');
  if (!listaId) volver(contactoId, { error: 'Elige una lista.' });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('lista_contactos')
    .insert({ lista_id: listaId, contacto_id: contactoId, added_by: user?.id ?? null });
  if (error && !error.message.includes('duplicate')) {
    volver(contactoId, { error: `No se pudo añadir a la lista: ${error.message}` });
  }
  volver(contactoId);
}

export async function quitarDeLista(contactoId: string, listaId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('lista_contactos')
    .delete()
    .eq('contacto_id', contactoId)
    .eq('lista_id', listaId);
  if (error) volver(contactoId, { error: `No se pudo quitar de la lista: ${error.message}` });
  volver(contactoId);
}

// ---------------------------------------------------------------------------
// Gestión del catálogo de etiquetas
// ---------------------------------------------------------------------------

function volverAEtiquetas(error?: string): never {
  revalidatePath('/contactos/etiquetas');
  revalidatePath('/contactos');
  redirect(`/contactos/etiquetas${error ? `?error=${encodeURIComponent(error)}` : ''}`);
}

export async function crearEtiqueta(formData: FormData) {
  const nombre = String(formData.get('nombre') ?? '').trim();
  const color = String(formData.get('color') ?? 'gris');
  if (!nombre) volverAEtiquetas('La etiqueta necesita un nombre.');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: existente } = await supabase
    .from('etiquetas')
    .select('id')
    .ilike('nombre', nombre)
    .maybeSingle();
  if (existente) volverAEtiquetas(`Ya existe una etiqueta llamada «${nombre}».`);

  const { error } = await supabase
    .from('etiquetas')
    .insert({ nombre, color, created_by: user?.id ?? null });
  if (error) volverAEtiquetas(`No se pudo crear: ${error.message}`);
  volverAEtiquetas();
}

export async function editarEtiqueta(etiquetaId: string, formData: FormData) {
  const nombre = String(formData.get('nombre') ?? '').trim();
  const color = String(formData.get('color') ?? 'gris');
  const activa = formData.get('activa') === 'on';
  if (!nombre) volverAEtiquetas('La etiqueta necesita un nombre.');

  const supabase = await createClient();
  const { data: actualizadas, error } = await supabase
    .from('etiquetas')
    .update({ nombre, color, activa })
    .eq('id', etiquetaId)
    .select('id');
  if (error) volverAEtiquetas(`No se pudo guardar: ${error.message}`);
  if (!actualizadas || actualizadas.length === 0) {
    volverAEtiquetas('No puedes editar esta etiqueta: solo dirección o quien la creó.');
  }
  volverAEtiquetas();
}

export async function borrarEtiqueta(etiquetaId: string) {
  const supabase = await createClient();
  // La FK de contacto_etiquetas es on delete cascade: al borrar la etiqueta
  // desaparece de todos los contactos que la llevaban.
  const { data: borradas, error } = await supabase
    .from('etiquetas')
    .delete()
    .eq('id', etiquetaId)
    .select('id');
  if (error) volverAEtiquetas(`No se pudo borrar: ${error.message}`);
  if (!borradas || borradas.length === 0) {
    volverAEtiquetas(
      'No puedes borrar esta etiqueta: solo dirección o quien la creó. Puedes desactivarla.',
    );
  }
  volverAEtiquetas();
}

/** Crea una lista estática o un segmento dinámico. */
export async function crearLista(formData: FormData) {
  const nombre = String(formData.get('nombre') ?? '').trim();
  const descripcion = String(formData.get('descripcion') ?? '').trim() || null;
  const tipo = String(formData.get('tipo') ?? 'estatica') as 'estatica' | 'dinamica';
  if (!nombre) redirect('/contactos/listas?error=' + encodeURIComponent('La lista necesita nombre.'));

  const filtro: FiltroSegmento = {};
  if (tipo === 'dinamica') {
    const etiquetas = formData.getAll('etiquetas').map(String).filter(Boolean);
    if (etiquetas.length > 0) filtro.etiquetas = etiquetas;
    const zona = String(formData.get('zona') ?? '').trim();
    if (zona) filtro.zona = zona;
    const consentimiento = String(formData.get('consentimiento') ?? '');
    if (consentimiento === 'si') filtro.consentimiento = true;
    if (consentimiento === 'no') filtro.consentimiento = false;
    if (formData.get('con_email') === 'on') filtro.conEmail = true;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from('listas').insert({
    nombre,
    descripcion,
    tipo,
    filtro: tipo === 'dinamica' ? filtro : null,
    created_by: user?.id ?? null,
  });
  if (error) {
    redirect('/contactos/listas?error=' + encodeURIComponent(`No se pudo crear: ${error.message}`));
  }
  revalidatePath('/contactos/listas');
  redirect('/contactos/listas');
}

/** Edita una lista o los criterios de un segmento. */
export async function editarLista(listaId: string, formData: FormData) {
  const nombre = String(formData.get('nombre') ?? '').trim();
  const descripcion = String(formData.get('descripcion') ?? '').trim() || null;
  const tipo = String(formData.get('tipo') ?? 'estatica') as 'estatica' | 'dinamica';
  if (!nombre) {
    redirect('/contactos/listas?error=' + encodeURIComponent('La lista necesita nombre.'));
  }

  const filtro: FiltroSegmento = {};
  if (tipo === 'dinamica') {
    const etiquetas = formData.getAll('etiquetas').map(String).filter(Boolean);
    if (etiquetas.length > 0) filtro.etiquetas = etiquetas;
    const zona = String(formData.get('zona') ?? '').trim();
    if (zona) filtro.zona = zona;
    const consentimiento = String(formData.get('consentimiento') ?? '');
    if (consentimiento === 'si') filtro.consentimiento = true;
    if (consentimiento === 'no') filtro.consentimiento = false;
    if (formData.get('con_email') === 'on') filtro.conEmail = true;
  }

  const supabase = await createClient();
  const { data: actualizadas, error } = await supabase
    .from('listas')
    .update({ nombre, descripcion, filtro: tipo === 'dinamica' ? filtro : null })
    .eq('id', listaId)
    .select('id');
  if (error) {
    redirect('/contactos/listas?error=' + encodeURIComponent(`No se pudo guardar: ${error.message}`));
  }
  if (!actualizadas || actualizadas.length === 0) {
    redirect(
      '/contactos/listas?error=' +
        encodeURIComponent('No puedes editar esta lista: solo dirección o quien la creó.'),
    );
  }
  revalidatePath('/contactos/listas');
  revalidatePath('/contactos');
  redirect('/contactos/listas');
}

export async function borrarLista(listaId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('listas').delete().eq('id', listaId);
  if (error) {
    redirect('/contactos/listas?error=' + encodeURIComponent(`No se pudo borrar: ${error.message}`));
  }
  revalidatePath('/contactos/listas');
  redirect('/contactos/listas');
}
