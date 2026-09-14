'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizarTelefono } from '@/lib/telefonos';
import type { FiltroSegmento } from '@/lib/segmentos';
import { CAMPOS_REGLA, type CampoRegla } from '@/lib/reglas';

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
// Reglas de etiquetado automático
//
// Aquí se DEFINEN; quien las ejecuta es el motor de la fase 2. La condición se
// guarda como {campo, valor} para que el motor no tenga que interpretar texto
// libre.
// ---------------------------------------------------------------------------

export async function crearRegla(formData: FormData) {
  const nombre = String(formData.get('nombre') ?? '').trim();
  const campo = String(formData.get('campo') ?? '') as CampoRegla;
  const valor = String(formData.get('valor') ?? '').trim();
  const etiquetaId = String(formData.get('etiqueta') ?? '');

  if (!nombre || !campo || !valor || !etiquetaId) {
    volverAEtiquetas('La regla necesita nombre, condición y etiqueta.');
  }
  if (!(campo in CAMPOS_REGLA)) volverAEtiquetas('Campo de condición no válido.');

  const supabase = await createClient();
  const { error } = await supabase.from('reglas_etiquetado').insert({
    nombre,
    condicion: { campo, valor },
    etiqueta_id: etiquetaId,
    activa: true,
  });
  if (error) volverAEtiquetas(`No se pudo crear la regla: ${error.message}`);
  volverAEtiquetas();
}

export async function cambiarEstadoRegla(reglaId: string, activa: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from('reglas_etiquetado').update({ activa }).eq('id', reglaId);
  if (error) volverAEtiquetas(`No se pudo actualizar: ${error.message}`);
  volverAEtiquetas();
}

/**
 * Retira las etiquetas que puso una regla, sin tocar la regla.
 *
 * Es la vuelta atras que faltaba. El motor solo AÑADE —a proposito: quien
 * llego una vez por Instagram llego por Instagram, y borrarlo reescribiria la
 * historia— pero eso significa que una regla mal escrita deja rastro
 * permanente. Si etiqueto a cuatrocientas personas y estaba mal, apagarla no
 * arregla nada: las cuatrocientas siguen etiquetadas.
 *
 * Esto no rompe el principio de que retirar una etiqueta es una decision
 * humana: la decision humana es este boton. Lo que hace es que una persona
 * pueda deshacer de una vez lo que una regla hizo de una vez.
 *
 * Solo se lleva lo que puso ESA regla (`regla_id`). Lo que alguien puso a mano
 * —`regla_id` nulo— no se toca.
 */
export async function retirarEtiquetasDeRegla(reglaId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('contacto_etiquetas').delete().eq('regla_id', reglaId);
  if (error) volverAEtiquetas(`No se pudieron retirar: ${error.message}`);
  volverAEtiquetas();
}

/**
 * Borra la regla Y lo que puso.
 *
 * Antes solo borraba la regla. Como `contacto_etiquetas.regla_id` es
 * `on delete set null`, sus etiquetas no solo sobrevivian: PERDIAN EL RASTRO.
 * A partir de ese momento eran indistinguibles de las puestas a mano, asi que
 * ya no habia forma de deshacerlas en bloque ni de saber de donde salieron.
 *
 * Se retiran primero, mientras todavia se sabe cuales son.
 */
export async function borrarRegla(reglaId: string) {
  const supabase = await createClient();

  const { error: errorEtiquetas } = await supabase
    .from('contacto_etiquetas')
    .delete()
    .eq('regla_id', reglaId);
  if (errorEtiquetas) {
    volverAEtiquetas(`No se pudieron retirar sus etiquetas: ${errorEtiquetas.message}`);
  }

  const { error } = await supabase.from('reglas_etiquetado').delete().eq('id', reglaId);
  if (error) volverAEtiquetas(`No se pudo borrar: ${error.message}`);
  volverAEtiquetas();
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
  if (!nombre)
    redirect('/contactos/listas?error=' + encodeURIComponent('La lista necesita nombre.'));

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
    redirect(
      '/contactos/listas?error=' + encodeURIComponent(`No se pudo guardar: ${error.message}`),
    );
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
    redirect(
      '/contactos/listas?error=' + encodeURIComponent(`No se pudo borrar: ${error.message}`),
    );
  }
  revalidatePath('/contactos/listas');
  redirect('/contactos/listas');
}

/**
 * Borrar a una persona del directorio.
 *
 * Se le pide MÁS que a un caso, no menos, y por dos razones: la persona es
 * global (regla 5) —puede estar en varios casos, también en centros que quien
 * pulsa no ve— y su ficha es la que arrastra consentimientos, etiquetas y
 * listas de marketing.
 *
 * Por eso NO se borra en cascada nada suyo: si le queda algún caso, se para y
 * lo dice. Borrar aquí un caso ajeno de rebote —uno de Bellamar que este
 * usuario ni siquiera puede ver— sería un agujero con forma de atajo.
 *
 * Lo normal para una persona que pide que la olviden NO es esto: es la
 * anonimización, que conserva que hubo un caso sin conservar quién era. Esto
 * es para lo que nunca fue nadie.
 */
export async function borrarContacto(contactoId: string, formData: FormData) {
  const motivo = String(formData.get('motivo') ?? '').trim();
  if (formData.get('confirmo') !== 'on') {
    volver(contactoId, { error: 'Marca la casilla: el borrado no se puede deshacer.' });
  }
  if (motivo.length < 5) {
    volver(contactoId, { error: 'Escribe por qué se borra. Es lo único que quedará escrito.' });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) volver(contactoId, { error: 'Sesión caducada.' });

  const { data: mandaEnGrupo } = await supabase.rpc('manda_en_grupo');
  if (!mandaEnGrupo) {
    volver(contactoId, { error: 'Solo la dirección de grupo puede borrar a una persona.' });
  }

  /*
   * Se cuenta con la clave de servicio A PROPÓSITO. Con la sesión de quien
   * pulsa, un caso en un centro que no ve devolvería cero y la comprobación
   * diría «no le queda ninguno» justo cuando más importa que diga lo
   * contrario. Aquí no se enseña nada de ese caso: solo si lo hay.
   */
  const admin = createAdminClient();
  const { count: casos } = await admin
    .from('lead_contactos')
    .select('id', { count: 'exact', head: true })
    .eq('contacto_id', contactoId);

  if ((casos ?? 0) > 0) {
    volver(contactoId, {
      error: `No se puede: esta persona sigue en ${casos} caso(s). Borra o cierra antes esos casos. Si alguno no te aparece, es de un centro que tu usuario no ve.`,
    });
  }

  const { data: persona } = await supabase
    .from('contactos')
    .select('nombre, telefono')
    .eq('id', contactoId)
    .maybeSingle();

  await admin.from('auditoria').insert({
    tabla: 'contactos',
    registro_id: contactoId,
    accion: 'BORRADO_MANUAL',
    usuario_id: user.id,
    datos_nuevos: { motivo, persona: persona?.nombre ?? null },
  });

  const { data: fuera, error } = await supabase
    .from('contactos')
    .delete()
    .eq('id', contactoId)
    .select('id');
  if (error) volver(contactoId, { error: `No se pudo borrar: ${error.message}` });
  if ((fuera ?? []).length === 0) {
    volver(contactoId, { error: 'No se pudo borrar: tu usuario no tiene permiso.' });
  }

  revalidatePath('/contactos');
  redirect(
    `/contactos?aviso=${encodeURIComponent(
      `Borrada «${persona?.nombre ?? 'la persona'}». Queda registrado en la auditoría.`,
    )}`,
  );
}
