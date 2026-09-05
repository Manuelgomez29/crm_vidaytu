'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/database.types';
import type { Database } from '@/lib/database.types';

type Rol = Database['public']['Enums']['rol_usuario'];

/** Toda acción de administración comprueba el rol en el servidor. */
async function exigirDireccion() {
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

  return { supabase, user };
}

function volver(seccion: string, aviso?: { error?: string; aviso?: string }): never {
  const q = aviso?.error
    ? `?error=${encodeURIComponent(aviso.error)}`
    : aviso?.aviso
      ? `?aviso=${encodeURIComponent(aviso.aviso)}`
      : '';
  revalidatePath(`/admin/${seccion}`);
  revalidatePath('/', 'layout');
  redirect(`/admin/${seccion}${q}`);
}

// ---------------------------------------------------------------------------
// Equipo
// ---------------------------------------------------------------------------

export async function crearUsuario(formData: FormData) {
  await exigirDireccion();

  const nombre = String(formData.get('nombre') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const rol = String(formData.get('rol') ?? '');
  const password = String(formData.get('password') ?? '');
  const centros = formData.getAll('centros').map(String).filter(Boolean);

  const porInvitacion = formData.get('invitar') === 'on';

  if (!nombre || !email || !rol) volver('equipo', { error: 'Nombre, email y rol son obligatorios.' });
  if (!porInvitacion && password.length < 10) {
    volver('equipo', { error: 'La contraseña inicial debe tener al menos 10 caracteres.' });
  }

  const admin = createAdminClient();

  /**
   * Dos vías: invitación por email (el usuario elige su contraseña, es la
   * preferible) o alta directa con contraseña inicial, que sirve cuando aún no
   * hay SMTP propio configurado.
   */
  const { data: creado, error } = porInvitacion
    ? await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_URL_APP ?? 'http://localhost:3000'}/auth/confirmar`,
      })
    : await admin.auth.admin.createUser({ email, password, email_confirm: true });

  if (error || !creado.user) {
    volver('equipo', {
      error: porInvitacion
        ? `No se pudo enviar la invitación: ${error?.message}. Sin SMTP propio, Supabase limita mucho los envíos: usa la contraseña inicial.`
        : `No se pudo crear el acceso: ${error?.message}`,
    });
  }

  const { error: errorPerfil } = await admin
    .from('perfiles')
    .upsert({
      id: creado.user.id,
      nombre,
      email,
      rol: rol as Rol,
      activo: true,
      acceso_clinico: rol === 'terapeuta',
    });
  if (errorPerfil) volver('equipo', { error: `No se pudo crear el perfil: ${errorPerfil.message}` });

  if (centros.length > 0) {
    await admin
      .from('perfil_centros')
      .insert(centros.map((centro_id) => ({ perfil_id: creado.user.id, centro_id })));
  }

  volver('equipo', {
    aviso: porInvitacion
      ? `Invitación enviada a ${email}. Al abrir el enlace elegirá su contraseña y activará la verificación en dos pasos.`
      : `Usuario creado. Dale la contraseña inicial a ${nombre} por un canal aparte; al entrar tendrá que activar la verificación en dos pasos.`,
  });
}

export async function editarUsuario(perfilId: string, formData: FormData) {
  const { supabase, user } = await exigirDireccion();

  const nombre = String(formData.get('nombre') ?? '').trim();
  const rol = String(formData.get('rol') ?? '');
  const activo = formData.get('activo') === 'on';
  const centros = formData.getAll('centros').map(String).filter(Boolean);

  if (!nombre || !rol) volver('equipo', { error: 'Nombre y rol son obligatorios.' });

  // Salvaguarda: no dejar la plataforma sin ninguna dirección activa.
  if (perfilId === user.id && (rol !== 'direccion' || !activo)) {
    const { count } = await supabase
      .from('perfiles')
      .select('id', { count: 'exact', head: true })
      .eq('rol', 'direccion')
      .eq('activo', true);
    if ((count ?? 0) <= 1) {
      volver('equipo', {
        error: 'No puedes quitarte el rol de dirección: eres la única cuenta de dirección activa.',
      });
    }
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('perfiles')
    .update({
      nombre,
      rol: rol as Rol,
      activo,
      // Un terapeuta tiene acceso clinico por su rol; el resto, solo si se le
      // marca. Direccion lo tiene siempre por es_direccion().
      acceso_clinico: rol === 'terapeuta' || formData.get('acceso_clinico') === 'on',
    })
    .eq('id', perfilId);
  if (error) volver('equipo', { error: `No se pudo guardar: ${error.message}` });

  await admin.from('perfil_centros').delete().eq('perfil_id', perfilId);
  if (centros.length > 0) {
    await admin
      .from('perfil_centros')
      .insert(centros.map((centro_id) => ({ perfil_id: perfilId, centro_id })));
  }

  volver('equipo');
}

/**
 * Retira el segundo factor de un usuario: la vía cuando alguien pierde o
 * cambia de móvil. En el siguiente acceso tendrá que darlo de alta otra vez,
 * porque sin él no se entra.
 */
export async function retirarSegundoFactor(perfilId: string) {
  await exigirDireccion();
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: perfilId });
  if (error) volver('equipo', { error: `No se pudieron leer sus factores: ${error.message}` });

  const factores = data?.factors ?? [];
  if (factores.length === 0) {
    volver('equipo', { aviso: 'Ese usuario no tiene ningún segundo factor dado de alta.' });
  }

  for (const f of factores) {
    const { error: errorBorrado } = await admin.auth.admin.mfa.deleteFactor({
      userId: perfilId,
      id: f.id,
    });
    if (errorBorrado) volver('equipo', { error: `No se pudo retirar: ${errorBorrado.message}` });
  }

  volver('equipo', {
    aviso: 'Segundo factor retirado. La próxima vez que entre tendrá que darlo de alta de nuevo.',
  });
}

/**
 * Traspaso en bloque de una cartera: vacaciones, bajas o salidas del equipo.
 * Pasa por el CRM y queda auditado caso a caso (regla 8), en vez de repartirse
 * por WhatsApp.
 */
export async function reasignarEnBloque(formData: FormData) {
  const { user } = await exigirDireccion();

  const origen = String(formData.get('origen') ?? '');
  const destino = String(formData.get('destino') ?? '');
  const centroId = String(formData.get('centro') ?? '');
  const soloAbiertos = formData.get('solo_abiertos') === 'on';

  if (!destino) volver('equipo', { error: 'Elige a quién le pasas los casos.' });
  if (origen === destino) volver('equipo', { error: 'El origen y el destino son la misma persona.' });

  const admin = createAdminClient();

  let consulta = admin.from('leads').select('id');
  // «Sin propietario» se pide con el valor especial `sin`.
  if (origen === 'sin') consulta = consulta.is('propietario_id', null);
  else if (origen) consulta = consulta.eq('propietario_id', origen);
  else volver('equipo', { error: 'Elige de quién son los casos.' });

  if (centroId) consulta = consulta.eq('centro_id', centroId);
  if (soloAbiertos) consulta = consulta.not('estado', 'in', '(perdido,no_valido,convertido)');

  const { data: leads, error: errorLectura } = await consulta;
  if (errorLectura) volver('equipo', { error: `No se pudieron leer los casos: ${errorLectura.message}` });
  if (!leads || leads.length === 0) {
    volver('equipo', { aviso: 'No hay casos que encajen con esos criterios.' });
  }

  const ids = leads.map((l) => l.id);
  const { error } = await admin.from('leads').update({ propietario_id: destino }).in('id', ids);
  if (error) volver('equipo', { error: `No se pudo reasignar: ${error.message}` });

  const { data: perfilDestino } = await admin
    .from('perfiles')
    .select('nombre')
    .eq('id', destino)
    .maybeSingle();

  // Una anotación por caso: el historial de cada uno debe contarlo.
  await admin.from('actividades').insert(
    ids.map((lead_id) => ({
      lead_id,
      tipo: 'cambio_estado' as const,
      contenido: `Traspaso en bloque: propietario cambiado a ${perfilDestino?.nombre ?? '—'}`,
      usuario_id: user.id,
    })),
  );

  await admin.from('notificaciones').insert({
    usuario_id: destino,
    tipo: 'lead_asignado',
    mensaje: `Se te han traspasado ${ids.length} caso(s)`,
  });

  volver('equipo', { aviso: `${ids.length} caso(s) reasignados a ${perfilDestino?.nombre ?? '—'}.` });
}

/**
 * Traspaso COMPLETO de todo lo vivo de una persona a otra: lo que hay que hacer
 * ANTES de dar de baja a alguien que se va del equipo.
 *
 * `reasignarEnBloque` mueve solo los casos, y para unas vacaciones vale. Pero
 * al irse alguien se quedaban atrás sus tareas pendientes, sus citas futuras y
 * sus pacientes: trabajo que desaparecía de la vista de todos sin que saltara
 * ningún aviso. El caso extremo es un terapeuta, que no tiene casos: la
 * herramienta anterior no movía absolutamente nada de lo suyo.
 *
 * Se mueve lo VIVO, no lo hecho. Las tareas completadas, las citas pasadas y
 * las sesiones siguen diciendo quién las hizo; reescribir eso falsearía el
 * historial, y la regla 11 exige que la auditoría sea veraz.
 *
 * Las claves foráneas de asignación siguen bloqueando el borrado de un perfil a
 * propósito: son la red que obliga a pasar por aquí en vez de dejar casos
 * huérfanos en silencio.
 */
export async function traspasarTodo(formData: FormData) {
  const { user } = await exigirDireccion();

  const origen = String(formData.get('origen') ?? '');
  const destino = String(formData.get('destino') ?? '');

  if (!origen || !destino) volver('equipo', { error: 'Elige de quién sale el trabajo y quién lo recibe.' });
  if (origen === destino) volver('equipo', { error: 'El origen y el destino son la misma persona.' });

  const admin = createAdminClient();

  const { data: personas } = await admin
    .from('perfiles')
    .select('id, nombre, rol, activo, acceso_clinico')
    .in('id', [origen, destino]);

  const sale = personas?.find((p) => p.id === origen);
  const recibe = personas?.find((p) => p.id === destino);
  if (!sale || !recibe) volver('equipo', { error: 'No encuentro a alguna de las dos personas.' });
  if (!recibe.activo) {
    volver('equipo', { error: `${recibe.nombre} está dada de baja: no puede recibir trabajo.` });
  }

  const [{ data: leads }, { data: tareas }, { data: citas }, { data: pacientes }] = await Promise.all([
    admin.from('leads').select('id').eq('propietario_id', origen),
    admin.from('tareas').select('id').eq('responsable_id', origen).is('completada_at', null),
    admin.from('citas').select('id').eq('profesional_id', origen).gt('inicio', new Date().toISOString()),
    admin.from('pacientes').select('id').eq('terapeuta_id', origen),
  ]);

  const nLeads = leads?.length ?? 0;
  const nTareas = tareas?.length ?? 0;
  const nCitas = citas?.length ?? 0;
  const nPacientes = pacientes?.length ?? 0;

  if (nLeads + nTareas + nCitas + nPacientes === 0) {
    volver('equipo', { aviso: `${sale.nombre} no tiene nada asignado: ya se le puede dar de baja.` });
  }

  /**
   * El muro (regla 14): un paciente asignado a alguien sin acceso clínico no
   * desaparece, pero deja de verlo nadie salvo dirección. Es peor que no mover
   * nada, porque el fallo es silencioso.
   */
  const recibeEsClinico =
    recibe.rol === 'direccion' || recibe.rol === 'terapeuta' || recibe.acceso_clinico;
  if (nPacientes > 0 && !recibeEsClinico) {
    volver('equipo', {
      error: `${sale.nombre} tiene ${nPacientes} paciente(s) y ${recibe.nombre} no tiene acceso clínico: nadie podría verlos. Elige a un terapeuta, o dale acceso clínico antes.`,
    });
  }

  const hecho: string[] = [];

  if (nLeads > 0) {
    const ids = leads!.map((l) => l.id);
    const { error } = await admin.from('leads').update({ propietario_id: destino }).in('id', ids);
    if (error) volver('equipo', { error: `No se pudieron mover los casos: ${error.message}` });

    // Una anotación por caso: el historial de cada uno debe contarlo (regla 8).
    await admin.from('actividades').insert(
      ids.map((lead_id) => ({
        lead_id,
        tipo: 'cambio_estado' as const,
        contenido: `Traspaso por baja de ${sale.nombre}: propietario cambiado a ${recibe.nombre}`,
        usuario_id: user.id,
      })),
    );
    hecho.push(`${nLeads} caso(s)`);
  }

  if (nTareas > 0) {
    const { error } = await admin
      .from('tareas')
      .update({ responsable_id: destino })
      .in('id', tareas!.map((t) => t.id));
    if (error) volver('equipo', { error: `No se pudieron mover las tareas: ${error.message}` });
    hecho.push(`${nTareas} tarea(s) pendiente(s)`);
  }

  if (nCitas > 0) {
    const { error } = await admin
      .from('citas')
      .update({ profesional_id: destino })
      .in('id', citas!.map((c) => c.id));
    if (error) volver('equipo', { error: `No se pudieron mover las citas: ${error.message}` });
    hecho.push(`${nCitas} cita(s) futura(s)`);
  }

  if (nPacientes > 0) {
    const { error } = await admin
      .from('pacientes')
      .update({ terapeuta_id: destino })
      .in('id', pacientes!.map((p) => p.id));
    if (error) volver('equipo', { error: `No se pudieron mover los pacientes: ${error.message}` });
    hecho.push(`${nPacientes} paciente(s)`);
  }

  await admin.from('notificaciones').insert({
    usuario_id: destino,
    tipo: 'lead_asignado',
    mensaje: `Traspaso por la baja de ${sale.nombre}: ${hecho.join(', ')}`,
  });

  volver('equipo', {
    aviso: `Traspasado a ${recibe.nombre}: ${hecho.join(', ')}. Las citas futuras cambian de profesional, así que avisa a quien corresponda.`,
  });
}

export async function guardarObjetivos(perfilId: string, formData: FormData) {
  const { user } = await exigirDireccion();

  const mes = String(formData.get('mes') ?? '');
  if (!mes) volver('equipo', { error: 'Indica el mes de los objetivos.' });

  const numero = (clave: string) => {
    const valor = String(formData.get(clave) ?? '').trim();
    return valor === '' ? null : Number(valor.replace(',', '.'));
  };

  const admin = createAdminClient();
  const { error } = await admin.from('objetivos').upsert(
    {
      perfil_id: perfilId,
      mes: `${mes}-01`,
      meta_citas: numero('meta_citas'),
      meta_conversiones: numero('meta_conversiones'),
      meta_ingresos: numero('meta_ingresos'),
      created_by: user.id,
    },
    { onConflict: 'perfil_id,mes' },
  );
  if (error) volver('equipo', { error: `No se pudieron guardar los objetivos: ${error.message}` });
  volver('equipo', { aviso: 'Objetivos guardados.' });
}

export async function guardarDisponibilidad(perfilId: string, formData: FormData) {
  await exigirDireccion();
  const admin = createAdminClient();

  const franjas: { perfil_id: string; dia_semana: number; hora_inicio: string; hora_fin: string }[] =
    [];
  for (let dia = 0; dia <= 6; dia++) {
    const inicio = String(formData.get(`inicio_${dia}`) ?? '');
    const fin = String(formData.get(`fin_${dia}`) ?? '');
    if (inicio && fin) {
      if (fin <= inicio) {
        volver('equipo', { error: 'La hora de fin debe ser posterior a la de inicio.' });
      }
      franjas.push({ perfil_id: perfilId, dia_semana: dia, hora_inicio: inicio, hora_fin: fin });
    }
  }

  await admin.from('disponibilidad').delete().eq('perfil_id', perfilId);
  if (franjas.length > 0) {
    const { error } = await admin.from('disponibilidad').insert(franjas);
    if (error) volver('equipo', { error: `No se pudo guardar: ${error.message}` });
  }
  volver('equipo', { aviso: 'Disponibilidad actualizada.' });
}

export async function crearAusencia(perfilId: string, formData: FormData) {
  const { user } = await exigirDireccion();
  const desde = String(formData.get('desde') ?? '');
  const hasta = String(formData.get('hasta') ?? '');
  const motivo = String(formData.get('motivo') ?? '').trim() || null;
  if (!desde || !hasta) volver('equipo', { error: 'La ausencia necesita fecha de inicio y fin.' });
  if (hasta < desde) volver('equipo', { error: 'La fecha de fin no puede ser anterior al inicio.' });

  const admin = createAdminClient();
  const { error } = await admin
    .from('ausencias')
    .insert({ perfil_id: perfilId, desde, hasta, motivo, created_by: user.id });
  if (error) volver('equipo', { error: `No se pudo registrar la ausencia: ${error.message}` });
  volver('equipo');
}

export async function borrarAusencia(ausenciaId: string) {
  await exigirDireccion();
  const admin = createAdminClient();
  const { error } = await admin.from('ausencias').delete().eq('id', ausenciaId);
  if (error) volver('equipo', { error: `No se pudo borrar: ${error.message}` });
  volver('equipo');
}

// ---------------------------------------------------------------------------
// Centros
// ---------------------------------------------------------------------------

function aSlug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function crearCentro(formData: FormData) {
  await exigirDireccion();
  const nombre = String(formData.get('nombre') ?? '').trim();
  const ciudad = String(formData.get('ciudad') ?? '').trim() || null;
  if (!nombre) volver('centros', { error: 'El centro necesita un nombre.' });

  const admin = createAdminClient();
  const { error } = await admin
    .from('centros')
    .insert({ nombre, slug: aSlug(nombre), ciudad, activo: true });
  if (error) {
    volver('centros', {
      error: error.message.includes('centros_slug_key')
        ? 'Ya existe un centro con ese nombre.'
        : `No se pudo crear: ${error.message}`,
    });
  }
  volver('centros');
}

export async function editarCentro(centroId: string, formData: FormData) {
  await exigirDireccion();
  const nombre = String(formData.get('nombre') ?? '').trim();
  const ciudad = String(formData.get('ciudad') ?? '').trim() || null;
  const activo = formData.get('activo') === 'on';
  // Sin enlace no se propone pedir resena para los casos de este centro: una
  // tarea de «pedir resena» sin sitio donde dejarla solo hace perder el tiempo.
  const urlResena = String(formData.get('url_resena') ?? '').trim() || null;
  if (!nombre) volver('centros', { error: 'El centro necesita un nombre.' });

  const admin = createAdminClient();
  const { error } = await admin
    .from('centros')
    .update({ nombre, ciudad, activo, url_resena_google: urlResena })
    .eq('id', centroId);
  if (error) volver('centros', { error: `No se pudo guardar: ${error.message}` });
  volver('centros');
}

// ---------------------------------------------------------------------------
// Catálogos (canales, adicciones, modalidades, motivos de pérdida)
// ---------------------------------------------------------------------------

// Cada catálogo tiene su tabla y su columna de activo (`activo` o `activa`),
// así que se escriben explícitamente en vez de con una clave calculada.
export type Catalogo = 'canales' | 'adicciones' | 'modalidades' | 'motivos_perdida';

export async function crearElementoCatalogo(catalogo: Catalogo, formData: FormData) {
  await exigirDireccion();
  const nombre = String(formData.get('nombre') ?? '').trim();
  if (!nombre) volver('catalogos', { error: 'Escribe un nombre.' });

  const admin = createAdminClient();
  const slug = aSlug(nombre);
  const { error } =
    catalogo === 'canales'
      ? await admin.from('canales').insert({ nombre, slug, activo: true })
      : catalogo === 'motivos_perdida'
        ? await admin.from('motivos_perdida').insert({ nombre, slug, activo: true })
        : catalogo === 'adicciones'
          ? await admin.from('adicciones').insert({ nombre, slug, activa: true })
          : await admin.from('modalidades').insert({ nombre, slug, activa: true });

  if (error) {
    volver('catalogos', {
      error: error.message.includes('_slug_key')
        ? `Ya existe «${nombre}» en ese catálogo.`
        : `No se pudo crear: ${error.message}`,
    });
  }
  volver('catalogos');
}

export async function editarElementoCatalogo(
  catalogo: Catalogo,
  elementoId: string,
  formData: FormData,
) {
  await exigirDireccion();
  const nombre = String(formData.get('nombre') ?? '').trim();
  const activo = formData.get('activo') === 'on';
  if (!nombre) volver('catalogos', { error: 'Escribe un nombre.' });

  const admin = createAdminClient();
  const { error } =
    catalogo === 'canales'
      ? await admin.from('canales').update({ nombre, activo }).eq('id', elementoId)
      : catalogo === 'motivos_perdida'
        ? await admin.from('motivos_perdida').update({ nombre, activo }).eq('id', elementoId)
        : catalogo === 'adicciones'
          ? await admin.from('adicciones').update({ nombre, activa: activo }).eq('id', elementoId)
          : await admin.from('modalidades').update({ nombre, activa: activo }).eq('id', elementoId);

  if (error) volver('catalogos', { error: `No se pudo guardar: ${error.message}` });
  volver('catalogos');
}

/** Qué modalidades ofrece cada centro (alimenta los formularios del caso). */
export async function guardarModalidadCentros(modalidadId: string, formData: FormData) {
  await exigirDireccion();
  const centros = formData.getAll('centros').map(String).filter(Boolean);

  const admin = createAdminClient();
  await admin.from('modalidad_centros').delete().eq('modalidad_id', modalidadId);
  if (centros.length > 0) {
    const { error } = await admin
      .from('modalidad_centros')
      .insert(centros.map((centro_id) => ({ modalidad_id: modalidadId, centro_id })));
    if (error) volver('catalogos', { error: `No se pudo guardar: ${error.message}` });
  }
  volver('catalogos');
}

// ---------------------------------------------------------------------------
// Pipelines
// ---------------------------------------------------------------------------

export async function crearPipeline(formData: FormData) {
  const { user } = await exigirDireccion();
  const nombre = String(formData.get('nombre') ?? '').trim();
  const centroId = String(formData.get('centro') ?? '') || null;
  if (!nombre) volver('pipelines', { error: 'El pipeline necesita un nombre.' });

  const admin = createAdminClient();
  const { data: pipeline, error } = await admin
    .from('pipelines')
    .insert({ nombre, centro_id: centroId, activo: true, created_by: user.id })
    .select('id')
    .single();
  if (error || !pipeline) volver('pipelines', { error: `No se pudo crear: ${error?.message}` });

  // Un pipeline sin etapas es inservible: nace con el recorrido estándar.
  const { error: errorEtapas } = await admin.from('pipeline_etapas').insert([
    { pipeline_id: pipeline.id, nombre: 'Nuevo', orden: 1, estado_sistema: 'nuevo' },
    { pipeline_id: pipeline.id, nombre: 'Contactado', orden: 2, estado_sistema: 'contactado' },
    { pipeline_id: pipeline.id, nombre: 'Cita agendada', orden: 3, estado_sistema: 'cita_agendada' },
    { pipeline_id: pipeline.id, nombre: 'Convertido', orden: 4, estado_sistema: 'convertido' },
  ]);
  if (errorEtapas) volver('pipelines', { error: `Pipeline creado sin etapas: ${errorEtapas.message}` });
  volver('pipelines');
}

export async function editarPipeline(pipelineId: string, formData: FormData) {
  await exigirDireccion();
  const nombre = String(formData.get('nombre') ?? '').trim();
  const activo = formData.get('activo') === 'on';
  if (!nombre) volver('pipelines', { error: 'El pipeline necesita un nombre.' });

  const admin = createAdminClient();
  const { error } = await admin.from('pipelines').update({ nombre, activo }).eq('id', pipelineId);
  if (error) volver('pipelines', { error: `No se pudo guardar: ${error.message}` });
  volver('pipelines');
}

export async function anadirEtapa(pipelineId: string, formData: FormData) {
  await exigirDireccion();
  const nombre = String(formData.get('nombre') ?? '').trim();
  const estado = String(formData.get('estado_sistema') ?? '');
  if (!nombre || !estado) volver('pipelines', { error: 'La etapa necesita nombre y estado.' });

  const admin = createAdminClient();
  const { data: ultima } = await admin
    .from('pipeline_etapas')
    .select('orden')
    .eq('pipeline_id', pipelineId)
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await admin.from('pipeline_etapas').insert({
    pipeline_id: pipelineId,
    nombre,
    orden: (ultima?.orden ?? 0) + 1,
    estado_sistema: estado as never,
  });
  if (error) volver('pipelines', { error: `No se pudo añadir la etapa: ${error.message}` });
  volver('pipelines');
}

export async function editarEtapa(etapaId: string, formData: FormData) {
  await exigirDireccion();
  const nombre = String(formData.get('nombre') ?? '').trim();
  const estado = String(formData.get('estado_sistema') ?? '');
  if (!nombre || !estado) volver('pipelines', { error: 'La etapa necesita nombre y estado.' });

  const admin = createAdminClient();
  const { error } = await admin
    .from('pipeline_etapas')
    .update({ nombre, estado_sistema: estado as never })
    .eq('id', etapaId);
  if (error) volver('pipelines', { error: `No se pudo guardar: ${error.message}` });
  volver('pipelines');
}

export async function borrarEtapa(etapaId: string) {
  await exigirDireccion();
  const admin = createAdminClient();

  // Una etapa con leads dentro no se borra: dejaría casos huérfanos.
  const { count } = await admin
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('etapa_id', etapaId);
  if ((count ?? 0) > 0) {
    volver('pipelines', {
      error: `Esa etapa tiene ${count} lead(s). Muévelos antes de borrarla.`,
    });
  }

  const { error } = await admin.from('pipeline_etapas').delete().eq('id', etapaId);
  if (error) volver('pipelines', { error: `No se pudo borrar: ${error.message}` });
  volver('pipelines');
}

// ---------------------------------------------------------------------------
// Parámetros (tabla configuracion)
// ---------------------------------------------------------------------------

export async function guardarParametros(formData: FormData) {
  await exigirDireccion();
  const admin = createAdminClient();

  const sla = Number(String(formData.get('sla_primera_respuesta_minutos') ?? '').trim());
  const alerta = Number(String(formData.get('alerta_presupuesto_dias') ?? '').trim());
  const cadenciaTexto = String(formData.get('cadencia_dias') ?? '').trim();
  const plantilla = String(formData.get('plantilla_recordatorio_cita') ?? '').trim();

  if (!Number.isFinite(sla) || sla <= 0) {
    volver('parametros', { error: 'El SLA debe ser un número de minutos mayor que cero.' });
  }
  if (!Number.isFinite(alerta) || alerta <= 0) {
    volver('parametros', { error: 'La alerta de presupuesto debe ser un número de días.' });
  }

  const cadencia = cadenciaTexto
    .split(',')
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0);
  if (cadencia.length === 0) {
    volver('parametros', { error: 'La cadencia debe ser una lista de días, p. ej. 0, 1, 3, 7, 14.' });
  }

  // Discreción (regla 12): la plantilla no puede delatar el motivo de consulta.
  const prohibidas = ['adicc', 'droga', 'alcohol', 'cocaín', 'cocain', 'ludopat', 'desintox', 'terapia', 'tratamiento'];
  const enMinusculas = plantilla.toLowerCase();
  const encontrada = prohibidas.find((p) => enMinusculas.includes(p));
  if (encontrada) {
    volver('parametros', {
      error: `El recordatorio no puede mencionar el motivo de consulta (contiene «${encontrada}»). Debe ser discreto.`,
    });
  }
  if (!plantilla) volver('parametros', { error: 'La plantilla del recordatorio no puede quedar vacía.' });

  const filas: { clave: string; valor: Json }[] = [
    { clave: 'sla_primera_respuesta_minutos', valor: sla },
    { clave: 'alerta_presupuesto_dias', valor: alerta },
    { clave: 'cadencia_dias', valor: cadencia },
    { clave: 'plantilla_recordatorio_cita', valor: plantilla },
  ];

  /**
   * Parámetros de las fases 2 a 4. Van en el mismo formulario y en la misma
   * tabla, pero cada uno solo se toca si viene en el envío: así este
   * formulario puede crecer sin arriesgarse a borrar lo que no muestra.
   */
  const numero = (campo: string, minimo = 0) => {
    if (!formData.has(campo)) return undefined;
    const n = Number(String(formData.get(campo) ?? '').trim());
    return Number.isFinite(n) && n >= minimo ? n : undefined;
  };
  const texto = (campo: string) =>
    formData.has(campo) ? String(formData.get(campo) ?? '').trim() : undefined;

  const reactivacion = numero('reactivacion_dias', 1);
  if (reactivacion !== undefined) filas.push({ clave: 'reactivacion_dias', valor: reactivacion });

  const faltas = numero('riesgo_recaida_faltas', 1);
  if (faltas !== undefined) filas.push({ clave: 'riesgo_recaida_faltas', valor: faltas });

  const lote = numero('marketing_lote', 1);
  if (lote !== undefined) filas.push({ clave: 'marketing_lote', valor: lote });

  const iva = numero('iva_porcentaje', 0);
  if (iva !== undefined) filas.push({ clave: 'iva_porcentaje', valor: iva });

  /**
   * Los interruptores.
   *
   * Un checkbox DESMARCADO no viaja en el formulario, asi que `formData.has()`
   * no sirve para saber si el campo estaba en pantalla: con esa comprobacion
   * se podria encender algo pero nunca apagarlo. El formulario manda un campo
   * oculto que dice "estos interruptores venian en el envio", y a partir de
   * ahi la ausencia del checkbox significa apagado, que es lo que significa.
   */
  if (formData.get('_interruptores') === '1') {
    for (const clave of [
      'resena_activa',
      'recordatorios_automaticos',
      'reparto_automatico',
      'ia_activa',
    ]) {
      filas.push({ clave, valor: formData.get(clave) === 'on' });
    }
  }

  const resenaUrl = texto('resena_url');
  if (resenaUrl !== undefined) filas.push({ clave: 'resena_url', valor: resenaUrl });

  const remitente = texto('marketing_remitente');
  if (remitente !== undefined) filas.push({ clave: 'marketing_remitente', valor: remitente });

  const pie = texto('marketing_pie');
  if (pie !== undefined) {
    // El pie ES el enlace de baja: sin el marcador, una campaña saldría sin
    // forma de darse de baja, que es una infracción por sí sola.
    if (!pie.includes('{baja}')) {
      volver('parametros', {
        error: 'El pie de las campañas debe contener {baja}: es el enlace para darse de baja.',
      });
    }
    filas.push({ clave: 'marketing_pie', valor: pie });
  }

  const razonSocial = texto('fiscal_razon_social');
  if (razonSocial !== undefined) {
    filas.push({
      clave: 'datos_fiscales',
      valor: {
        razon_social: razonSocial,
        nif: texto('fiscal_nif') ?? '',
        direccion: texto('fiscal_direccion') ?? '',
        email: texto('fiscal_email') ?? '',
      },
    });
  }

  const probabilidadesTexto = texto('prevision_probabilidad');
  if (probabilidadesTexto !== undefined && probabilidadesTexto) {
    try {
      filas.push({ clave: 'prevision_probabilidad', valor: JSON.parse(probabilidadesTexto) });
    } catch {
      volver('parametros', { error: 'Las probabilidades de previsión no son un JSON válido.' });
    }
  }

  const pesosTexto = texto('scoring_pesos');
  if (pesosTexto !== undefined && pesosTexto) {
    try {
      filas.push({ clave: 'scoring_pesos', valor: JSON.parse(pesosTexto) });
    } catch {
      volver('parametros', { error: 'Los pesos del scoring no son un JSON válido.' });
    }
  }

  for (const fila of filas) {
    const { error } = await admin
      .from('configuracion')
      .update({ valor: fila.valor })
      .eq('clave', fila.clave);
    if (error) volver('parametros', { error: `No se pudo guardar ${fila.clave}: ${error.message}` });
  }

  volver('parametros', { aviso: 'Parámetros guardados. Se aplican de inmediato en toda la plataforma.' });
}
