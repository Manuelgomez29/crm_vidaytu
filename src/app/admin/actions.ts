'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

  if (!nombre || !email || !rol) volver('equipo', { error: 'Nombre, email y rol son obligatorios.' });
  if (password.length < 8) {
    volver('equipo', { error: 'La contraseña inicial debe tener al menos 8 caracteres.' });
  }

  const admin = createAdminClient();
  const { data: creado, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !creado.user) {
    volver('equipo', { error: `No se pudo crear el acceso: ${error?.message}` });
  }

  const { error: errorPerfil } = await admin
    .from('perfiles')
    .upsert({ id: creado.user.id, nombre, email, rol: rol as 'direccion' | 'admisiones' | 'terapeuta', activo: true });
  if (errorPerfil) volver('equipo', { error: `No se pudo crear el perfil: ${errorPerfil.message}` });

  if (centros.length > 0) {
    await admin
      .from('perfil_centros')
      .insert(centros.map((centro_id) => ({ perfil_id: creado.user.id, centro_id })));
  }

  volver('equipo', {
    aviso: `Usuario creado. Dale la contraseña inicial a ${nombre} y que la cambie al entrar.`,
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
    .update({ nombre, rol: rol as 'direccion' | 'admisiones' | 'terapeuta', activo })
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
  if (!nombre) volver('centros', { error: 'El centro necesita un nombre.' });

  const admin = createAdminClient();
  const { error } = await admin.from('centros').update({ nombre, ciudad, activo }).eq('id', centroId);
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

  const filas = [
    { clave: 'sla_primera_respuesta_minutos', valor: sla },
    { clave: 'alerta_presupuesto_dias', valor: alerta },
    { clave: 'cadencia_dias', valor: cadencia },
    { clave: 'plantilla_recordatorio_cita', valor: plantilla },
  ];

  for (const fila of filas) {
    const { error } = await admin
      .from('configuracion')
      .update({ valor: fila.valor })
      .eq('clave', fila.clave);
    if (error) volver('parametros', { error: `No se pudo guardar ${fila.clave}: ${error.message}` });
  }

  volver('parametros', { aviso: 'Parámetros guardados. Se aplican de inmediato en toda la plataforma.' });
}
