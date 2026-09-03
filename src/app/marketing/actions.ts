'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { desdeDatetimeLocal } from '@/lib/fechas';
import { enviarCorreo, emailConfigurado } from '@/lib/email';
import {
  prepararDestinatarios,
  terminosConfigurados,
  terminosProhibidosEn,
} from '@/lib/campanas';

/**
 * Acciones de email marketing. Todas vuelven a comprobar el rol en el
 * servidor: la barra lateral esconde la sección a quien no es dirección, pero
 * esconder no es impedir.
 */

async function soloDireccion() {
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
  if (perfil?.rol !== 'direccion') redirect('/leads');

  return { supabase, userId: user.id };
}

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
// Plantillas
// ---------------------------------------------------------------------------

export async function crearPlantilla(formData: FormData) {
  const { supabase, userId } = await soloDireccion();

  const nombre = String(formData.get('nombre') ?? '').trim();
  const asunto = String(formData.get('asunto') ?? '').trim();
  const cuerpoTexto = String(formData.get('cuerpo_texto') ?? '').trim();
  const cuerpoHtml = String(formData.get('cuerpo_html') ?? '').trim() || null;

  if (!nombre || !asunto || !cuerpoTexto) {
    volver('/marketing/plantillas', { error: 'Nombre, asunto y cuerpo en texto son obligatorios.' });
  }

  const { error } = await supabase.from('plantillas_email').insert({
    nombre,
    asunto,
    cuerpo_texto: cuerpoTexto,
    cuerpo_html: cuerpoHtml,
    created_by: userId,
  });
  if (error) volver('/marketing/plantillas', { error: `No se pudo guardar: ${error.message}` });
  volver('/marketing/plantillas', { aviso: 'Plantilla guardada.' });
}

export async function borrarPlantilla(id: string) {
  const { supabase } = await soloDireccion();
  const { error } = await supabase.from('plantillas_email').delete().eq('id', id);
  if (error) volver('/marketing/plantillas', { error: `No se pudo borrar: ${error.message}` });
  volver('/marketing/plantillas');
}

// ---------------------------------------------------------------------------
// Campañas
// ---------------------------------------------------------------------------

export async function crearCampana(formData: FormData) {
  const { supabase, userId } = await soloDireccion();

  const nombre = String(formData.get('nombre') ?? '').trim();
  const plantillaId = String(formData.get('plantilla') ?? '');

  if (!nombre) volver('/marketing', { error: 'La campaña necesita un nombre.' });

  let asunto = 'Sin asunto';
  let cuerpoTexto = '';
  let cuerpoHtml: string | null = null;

  if (plantillaId) {
    const { data: plantilla } = await supabase
      .from('plantillas_email')
      .select('asunto, cuerpo_texto, cuerpo_html')
      .eq('id', plantillaId)
      .maybeSingle();
    if (plantilla) {
      asunto = plantilla.asunto;
      cuerpoTexto = plantilla.cuerpo_texto;
      cuerpoHtml = plantilla.cuerpo_html;
    }
  }

  const { data, error } = await supabase
    .from('campanas_email')
    .insert({
      nombre,
      asunto,
      cuerpo_texto: cuerpoTexto,
      cuerpo_html: cuerpoHtml,
      created_by: userId,
    })
    .select('id')
    .single();

  if (error || !data) volver('/marketing', { error: `No se pudo crear: ${error?.message}` });
  redirect(`/marketing/${data.id}`);
}

export async function guardarCampana(id: string, formData: FormData) {
  const { supabase } = await soloDireccion();
  const ruta = `/marketing/${id}`;

  const nombre = String(formData.get('nombre') ?? '').trim();
  const asunto = String(formData.get('asunto') ?? '').trim();
  const cuerpoTexto = String(formData.get('cuerpo_texto') ?? '').trim();
  const cuerpoHtml = String(formData.get('cuerpo_html') ?? '').trim() || null;
  const listaId = String(formData.get('lista') ?? '') || null;

  if (!nombre || !asunto || !cuerpoTexto) {
    volver(ruta, { error: 'Nombre, asunto y cuerpo en texto son obligatorios.' });
  }

  const { data: campana } = await supabase
    .from('campanas_email')
    .select('estado')
    .eq('id', id)
    .maybeSingle();
  if (campana && campana.estado !== 'borrador' && campana.estado !== 'programada') {
    volver(ruta, { error: 'Una campaña que ya se está enviando no se puede editar.' });
  }

  const { error } = await supabase
    .from('campanas_email')
    .update({
      nombre,
      asunto,
      cuerpo_texto: cuerpoTexto,
      cuerpo_html: cuerpoHtml,
      lista_id: listaId,
    })
    .eq('id', id);

  if (error) volver(ruta, { error: `No se pudo guardar: ${error.message}` });
  volver(ruta, { aviso: 'Cambios guardados.' });
}

/**
 * Revisión previa: destinatarios reales y términos prohibidos. Es lo que se
 * mira ANTES de programar, para no descubrir en el último momento que la
 * lista está vacía o que el texto delata el motivo de consulta.
 */
export async function revisarCampana(id: string) {
  const { supabase } = await soloDireccion();
  const ruta = `/marketing/${id}`;

  const { data: campana } = await supabase
    .from('campanas_email')
    .select('asunto, cuerpo_texto, cuerpo_html')
    .eq('id', id)
    .maybeSingle();
  if (!campana) volver(ruta, { error: 'Campaña no encontrada.' });

  const admin = createAdminClient();
  const prohibidos = await terminosConfigurados(admin);
  const encontrados = terminosProhibidosEn(
    [campana.asunto, campana.cuerpo_texto, campana.cuerpo_html ?? ''].join(' '),
    prohibidos,
  );

  if (encontrados.length > 0) {
    volver(ruta, {
      error: `El contenido menciona: ${encontrados.join(', ')}. Ningún correo puede revelar el motivo de consulta (regla 12).`,
    });
  }

  const resultado = await prepararDestinatarios(admin, id);
  if (resultado.error) volver(ruta, { error: resultado.error });

  volver(ruta, {
    aviso: `Revisión superada. ${resultado.total} destinatario(s) con consentimiento y email.`,
  });
}

/** Envío de prueba a una dirección propia, sin tocar los contadores. */
export async function enviarPrueba(id: string, formData: FormData) {
  await soloDireccion();
  const ruta = `/marketing/${id}`;
  const destino = String(formData.get('email_prueba') ?? '').trim();

  if (!destino.includes('@')) volver(ruta, { error: 'Escribe una dirección de correo válida.' });
  if (!emailConfigurado()) {
    volver(ruta, { error: 'No hay proveedor de correo configurado (RESEND_API_KEY y EMAIL_REMITENTE).' });
  }

  const admin = createAdminClient();
  const { data: campana } = await admin
    .from('campanas_email')
    .select('asunto, cuerpo_texto, cuerpo_html')
    .eq('id', id)
    .maybeSingle();
  if (!campana) volver(ruta, { error: 'Campaña no encontrada.' });

  const marca = (t: string) => t.replaceAll('{nombre}', 'Nombre de ejemplo');
  const resultado = await enviarCorreo({
    para: destino,
    asunto: `[PRUEBA] ${campana.asunto}`,
    cuerpo: `${marca(campana.cuerpo_texto)}\n\n—\nEnvío de prueba desde Vida y Tu DATA. El correo real llevará el pie con el enlace de baja.`,
    html: campana.cuerpo_html ? marca(campana.cuerpo_html) : undefined,
  });

  if (!resultado.enviado) volver(ruta, { error: `No salió: ${resultado.error}` });
  volver(ruta, { aviso: `Prueba enviada a ${destino}.` });
}

export async function programarCampana(id: string, formData: FormData) {
  const { supabase } = await soloDireccion();
  const ruta = `/marketing/${id}`;

  const cuando = desdeDatetimeLocal(String(formData.get('cuando') ?? ''));
  if (!cuando) volver(ruta, { error: 'Indica cuándo debe salir.' });

  // La revisión de discreción se repite aquí: entre revisar y programar el
  // texto ha podido cambiar, y esta es la última puerta antes del envío.
  const admin = createAdminClient();
  const { data: campana } = await admin
    .from('campanas_email')
    .select('asunto, cuerpo_texto, cuerpo_html, lista_id')
    .eq('id', id)
    .maybeSingle();
  if (!campana) volver(ruta, { error: 'Campaña no encontrada.' });
  if (!campana.lista_id) volver(ruta, { error: 'Elige a quién se envía antes de programarla.' });

  const encontrados = terminosProhibidosEn(
    [campana.asunto, campana.cuerpo_texto, campana.cuerpo_html ?? ''].join(' '),
    await terminosConfigurados(admin),
  );
  if (encontrados.length > 0) {
    volver(ruta, {
      error: `No se puede programar: el contenido menciona ${encontrados.join(', ')} (regla 12).`,
    });
  }

  const { error } = await supabase
    .from('campanas_email')
    .update({ estado: 'programada', programada_para: cuando })
    .eq('id', id);
  if (error) volver(ruta, { error: `No se pudo programar: ${error.message}` });

  volver(ruta, { aviso: 'Campaña programada. El motor la enviará por lotes a esa hora.' });
}

export async function cancelarCampana(id: string) {
  const { supabase } = await soloDireccion();
  const { error } = await supabase
    .from('campanas_email')
    .update({ estado: 'cancelada' })
    .eq('id', id)
    .in('estado', ['borrador', 'programada', 'enviando']);
  if (error) volver(`/marketing/${id}`, { error: `No se pudo cancelar: ${error.message}` });
  volver(`/marketing/${id}`, { aviso: 'Campaña cancelada.' });
}
