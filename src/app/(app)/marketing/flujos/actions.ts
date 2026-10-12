'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { terminosConfigurados, terminosProhibidosEn } from '@/lib/campanas';
import { inscribir } from '@/lib/flujos';
import { normalizarTelefono } from '@/lib/telefonos';
import type { Json } from '@/lib/database.types';
import { ESTADOS_LEAD, TIPOS_CONDICION, TIPOS_PASO, type PasoEnviado } from './modelo';

/**
 * Acciones de los flujos de seguimiento. Todas vuelven a comprobar el rol en el
 * servidor: la barra lateral esconde la sección a quien no es dirección, pero
 * esconder no es impedir. Y lo que llega del constructor se valida entero aquí
 * —tipos, aristas, plantillas, términos clínicos—: el constructor es una
 * comodidad, no una barrera.
 *
 * Este fichero es `'use server'`: solo puede exportar funciones. El vocabulario
 * (tipos de paso, estados) vive en `modelo.ts`.
 */

async function soloDireccion() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol, alcance')
    .eq('id', user.id)
    .maybeSingle();
  if (perfil?.rol !== 'direccion') redirect('/leads');

  return { supabase, userId: user.id, esDeGrupo: perfil.alcance === 'grupo' };
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

/**
 * De qué centro es el flujo. La dirección de grupo elige (o ninguno = grupo);
 * la de un centro no elige: es del suyo. Se decide aquí, no en el formulario.
 */
async function centroDelFlujo(formData: FormData): Promise<string | null> {
  const { supabase, userId, esDeGrupo } = await soloDireccion();
  if (esDeGrupo) return String(formData.get('centro') ?? '') || null;

  const { data } = await supabase
    .from('perfil_centros')
    .select('centro_id')
    .eq('perfil_id', userId)
    .limit(1)
    .maybeSingle();
  if (!data) volver('/marketing/flujos', { error: 'No tienes ningún centro asignado.' });
  return data.centro_id;
}

/** El disparador, leído del formulario y comprobado. */
function disparadorDesde(formData: FormData): Record<string, unknown> {
  const tipo = String(formData.get('disparador_tipo') ?? '');
  switch (tipo) {
    case 'etiqueta_aplicada': {
      const etiqueta = String(formData.get('disparador_etiqueta') ?? '');
      if (!etiqueta) volver('/marketing/flujos', { error: 'Elige qué etiqueta dispara el flujo.' });
      return { tipo, etiqueta_id: etiqueta };
    }
    case 'lead_creado': {
      const d: Record<string, unknown> = { tipo };
      const canal = String(formData.get('disparador_canal') ?? '');
      const fuente = String(formData.get('disparador_fuente') ?? '');
      if (canal) d.canal_id = canal;
      if (fuente) d.fuente_id = fuente;
      return d;
    }
    case 'estado_lead': {
      const estado = String(formData.get('disparador_estado') ?? '');
      if (!(ESTADOS_LEAD as readonly string[]).includes(estado)) {
        volver('/marketing/flujos', { error: 'Elige a qué estado tiene que pasar el caso.' });
      }
      return { tipo, estado };
    }
    case 'consentimiento':
    case 'manual':
      return { tipo };
    default:
      volver('/marketing/flujos', { error: 'Elige qué dispara el flujo.' });
  }
}

// ---------------------------------------------------------------------------
// El flujo
// ---------------------------------------------------------------------------

export async function crearFlujo(formData: FormData) {
  const { userId } = await soloDireccion();
  const nombre = String(formData.get('nombre') ?? '').trim();
  if (!nombre) volver('/marketing/flujos', { error: 'El flujo necesita un nombre.' });

  const centroId = await centroDelFlujo(formData);
  const disparador = disparadorDesde(formData);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('flujos')
    .insert({
      nombre,
      centro_id: centroId,
      disparador: disparador as Json,
      created_by: userId,
    })
    .select('id')
    .single();
  if (error || !data) volver('/marketing/flujos', { error: `No se pudo crear: ${error?.message}` });

  revalidatePath('/marketing/flujos');
  redirect(
    `/marketing/flujos/${data.id}?aviso=${encodeURIComponent('Flujo creado. Ahora añade los pasos.')}`,
  );
}

export async function guardarFlujo(id: string, formData: FormData) {
  await soloDireccion();
  const ruta = `/marketing/flujos/${id}`;
  const nombre = String(formData.get('nombre') ?? '').trim();
  if (!nombre) volver(ruta, { error: 'El flujo necesita un nombre.' });

  const disparador = disparadorDesde(formData);
  const salida: Record<string, unknown> = {
    al_convertir: formData.get('salida_convertir') === 'on',
    sin_consentimiento: formData.get('salida_consentimiento') === 'on',
  };
  const etiquetaSalida = String(formData.get('salida_etiqueta') ?? '');
  if (etiquetaSalida) salida.etiqueta_id = etiquetaSalida;

  const admin = createAdminClient();
  const { error } = await admin
    .from('flujos')
    .update({
      nombre,
      descripcion: String(formData.get('descripcion') ?? '').trim() || null,
      disparador: disparador as Json,
      salida: salida as Json,
    })
    .eq('id', id);
  if (error) volver(ruta, { error: `No se pudo guardar: ${error.message}` });
  volver(ruta, { aviso: 'Guardado.' });
}

/**
 * Encender o apagar. Al encender se comprueba que el flujo tenga pasos y un
 * primer paso, y se deja la marca de agua en «ahora» del servidor: activar no
 * inscribe al histórico. Al apagar, las personas inscritas se quedan donde
 * están —el motor no las mueve— y siguen cuando se vuelve a encender.
 */
export async function alternarFlujo(id: string, activar: boolean) {
  await soloDireccion();
  const ruta = `/marketing/flujos/${id}`;
  const admin = createAdminClient();

  if (activar) {
    const { data: pasos } = await admin
      .from('flujo_pasos')
      .select('id, es_inicio')
      .eq('flujo_id', id);
    if (!pasos || pasos.length === 0)
      volver(ruta, { error: 'Un flujo sin pasos no se puede activar.' });
    if (!pasos.some((p) => p.es_inicio))
      volver(ruta, { error: 'Falta marcar cuál es el primer paso.' });

    const { data: ahora } = await admin.rpc('hora_del_servidor');
    const { error } = await admin
      .from('flujos')
      .update({
        activo: true,
        ultimo_barrido_at: (ahora as string | null) ?? new Date().toISOString(),
      })
      .eq('id', id);
    if (error) volver(ruta, { error: `No se pudo activar: ${error.message}` });
    volver(ruta, {
      aviso: 'Flujo activo. Empieza a inscribir a quien cumpla el disparador a partir de ahora.',
    });
  }

  const { error } = await admin.from('flujos').update({ activo: false }).eq('id', id);
  if (error) volver(ruta, { error: `No se pudo pausar: ${error.message}` });
  volver(ruta, { aviso: 'Flujo en pausa. Nadie avanza hasta que lo vuelvas a activar.' });
}

export async function borrarFlujo(id: string) {
  await soloDireccion();
  const admin = createAdminClient();
  const { count } = await admin
    .from('flujo_inscripciones')
    .select('id', { count: 'exact', head: true })
    .eq('flujo_id', id)
    .eq('estado', 'activa');
  if ((count ?? 0) > 0) {
    volver(`/marketing/flujos/${id}`, {
      error: `Hay ${count} persona(s) recorriéndolo ahora mismo. Páusalo y sácalas antes de borrarlo.`,
    });
  }
  const { error } = await admin.from('flujos').delete().eq('id', id);
  if (error) volver(`/marketing/flujos/${id}`, { error: `No se pudo borrar: ${error.message}` });
  volver('/marketing/flujos', { aviso: 'Flujo borrado.' });
}

// ---------------------------------------------------------------------------
// Los pasos: el grafo entero de una vez
// ---------------------------------------------------------------------------

function esUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
}

/**
 * Comprueba cada paso. Devuelve el texto del problema o null. Lo que se
 * comprueba es lo que haría fallar al motor a las tres de la mañana, que es el
 * peor momento para enterarse.
 */
function problemaDelPaso(p: PasoEnviado, claves: Set<string>): string | null {
  const n = `Paso ${p.orden + 1}`;
  if (!(TIPOS_PASO as readonly string[]).includes(p.tipo)) return `${n}: tipo desconocido.`;

  for (const [nombre, destino] of [
    ['siguiente', p.siguiente],
    ['sí', p.siguiente_si],
    ['no', p.siguiente_no],
  ] as const) {
    if (destino && !claves.has(destino))
      return `${n}: la salida «${nombre}» apunta a un paso que no existe.`;
    if (destino === p.clave) return `${n}: apunta a sí mismo.`;
  }

  const c = p.config ?? {};
  switch (p.tipo) {
    case 'email':
      if (!esUuid(c.plantilla_id)) return `${n}: elige la plantilla del correo.`;
      break;
    case 'esperar': {
      const cantidad = Number(c.cantidad);
      if (!Number.isFinite(cantidad) || cantidad < 0)
        return `${n}: la espera tiene que ser un número de horas o días.`;
      if (c.unidad !== 'horas' && c.unidad !== 'dias')
        return `${n}: la espera va en horas o en días.`;
      break;
    }
    case 'etiqueta':
      if (!esUuid(c.etiqueta_id)) return `${n}: elige la etiqueta.`;
      if (c.accion !== 'anadir' && c.accion !== 'quitar')
        return `${n}: la etiqueta se añade o se quita.`;
      break;
    case 'tarea':
      if (!String(c.titulo ?? '').trim()) return `${n}: la tarea necesita un título.`;
      if (!(Number(c.vence_en_horas) >= 1))
        return `${n}: la tarea tiene que vencer al menos en una hora.`;
      break;
    case 'aviso':
      if (!String(c.mensaje ?? '').trim()) return `${n}: escribe el aviso.`;
      if (c.a !== 'propietario' && c.a !== 'direccion')
        return `${n}: el aviso va al propietario o a dirección.`;
      break;
    case 'lista':
      if (!esUuid(c.lista_id)) return `${n}: elige la lista.`;
      break;
    case 'condicion': {
      if (!(TIPOS_CONDICION as readonly string[]).includes(String(c.tipo)))
        return `${n}: elige qué condición se comprueba.`;
      if ((c.tipo === 'abrio_email' || c.tipo === 'hizo_clic') && !c.paso_id && !c.paso_clave) {
        return `${n}: di de qué correo se mira la apertura o el clic.`;
      }
      if (c.tipo === 'tiene_etiqueta' && !esUuid(c.etiqueta_id))
        return `${n}: elige la etiqueta que se comprueba.`;
      if (
        c.tipo === 'estado_lead' &&
        !(ESTADOS_LEAD as readonly string[]).includes(String(c.estado))
      ) {
        return `${n}: elige el estado del caso que se comprueba.`;
      }
      if (!p.siguiente_si && !p.siguiente_no)
        return `${n}: una condición sin ningún camino no decide nada.`;
      break;
    }
    case 'fin':
      break;
  }
  return null;
}

export async function guardarPasos(id: string, formData: FormData) {
  await soloDireccion();
  const ruta = `/marketing/flujos/${id}`;

  let pasos: PasoEnviado[];
  try {
    pasos = JSON.parse(String(formData.get('pasos') ?? '[]')) as PasoEnviado[];
  } catch {
    volver(ruta, { error: 'No se pudieron leer los pasos.' });
  }
  if (!Array.isArray(pasos)) volver(ruta, { error: 'No se pudieron leer los pasos.' });

  if (pasos.length > 0 && pasos.filter((p) => p.es_inicio).length !== 1) {
    volver(ruta, { error: 'Tiene que haber exactamente un primer paso.' });
  }

  const claves = new Set(pasos.map((p) => p.clave));
  if (claves.size !== pasos.length) volver(ruta, { error: 'Hay pasos repetidos.' });
  for (const p of pasos) {
    const problema = problemaDelPaso(p, claves);
    if (problema) volver(ruta, { error: problema });
  }

  const admin = createAdminClient();

  /*
   * DISCRECIÓN (regla 12): cada plantilla que un paso vaya a enviar pasa por el
   * mismo filtro de términos clínicos que una campaña. Se comprueba al guardar
   * los pasos, que es cuando alguien está delante para arreglarlo.
   */
  const plantillas = [
    ...new Set(pasos.filter((p) => p.tipo === 'email').map((p) => String(p.config.plantilla_id))),
  ];
  if (plantillas.length > 0) {
    const [{ data: filas }, prohibidos] = await Promise.all([
      admin
        .from('plantillas_email')
        .select('id, nombre, asunto, cuerpo_texto, cuerpo_html')
        .in('id', plantillas),
      terminosConfigurados(admin),
    ]);
    for (const pid of plantillas) {
      const pl = (filas ?? []).find((f) => f.id === pid);
      if (!pl) volver(ruta, { error: 'Una de las plantillas elegidas ya no existe.' });
      const hallados = terminosProhibidosEn(
        `${pl.asunto}\n${pl.cuerpo_texto}\n${pl.cuerpo_html ?? ''}`,
        prohibidos,
      );
      if (hallados.length > 0) {
        volver(ruta, {
          error: `La plantilla «${pl.nombre}» contiene términos que no pueden salir en un correo: ${hallados.join(', ')}.`,
        });
      }
    }
  }

  // Lo que había, para actualizar en vez de borrar: borrar un paso de email se
  // lleva su campaña perpetua con sus estadísticas.
  const { data: existentes } = await admin.from('flujo_pasos').select('id').eq('flujo_id', id);
  const idsExistentes = new Set((existentes ?? []).map((e) => e.id));

  // 1. Nodos: actualizar los que tienen id conocido, insertar el resto.
  const idPorClave = new Map<string, string>();
  for (const p of pasos) {
    const base = {
      tipo: p.tipo,
      config: p.config as Json,
      es_inicio: p.es_inicio,
      orden: p.orden,
      // Las aristas se ponen en la segunda pasada, cuando todos los nodos existen.
      siguiente_id: null,
      siguiente_si_id: null,
      siguiente_no_id: null,
    };
    if (p.id && idsExistentes.has(p.id)) {
      const { error } = await admin.from('flujo_pasos').update(base).eq('id', p.id);
      if (error) volver(ruta, { error: `No se pudo guardar un paso: ${error.message}` });
      idPorClave.set(p.clave, p.id);
    } else {
      const { data, error } = await admin
        .from('flujo_pasos')
        .insert({ ...base, flujo_id: id })
        .select('id')
        .single();
      if (error || !data) volver(ruta, { error: `No se pudo crear un paso: ${error?.message}` });
      idPorClave.set(p.clave, data.id);
    }
  }

  // 2. Aristas, y las condiciones que señalan a un paso por su clave.
  for (const p of pasos) {
    const config = { ...p.config };
    if (p.tipo === 'condicion' && typeof config.paso_clave === 'string') {
      const destino = idPorClave.get(config.paso_clave);
      if (destino) config.paso_id = destino;
      delete config.paso_clave;
    }
    const { error } = await admin
      .from('flujo_pasos')
      .update({
        config: config as Json,
        siguiente_id: p.siguiente ? (idPorClave.get(p.siguiente) ?? null) : null,
        siguiente_si_id: p.siguiente_si ? (idPorClave.get(p.siguiente_si) ?? null) : null,
        siguiente_no_id: p.siguiente_no ? (idPorClave.get(p.siguiente_no) ?? null) : null,
      })
      .eq('id', idPorClave.get(p.clave)!);
    if (error) volver(ruta, { error: `No se pudieron enlazar los pasos: ${error.message}` });
  }

  // 3. Los que ya no están.
  const conservados = new Set(idPorClave.values());
  const sobran = [...idsExistentes].filter((e) => !conservados.has(e));
  if (sobran.length > 0) {
    const { error } = await admin.from('flujo_pasos').delete().in('id', sobran);
    if (error)
      volver(ruta, { error: `No se pudieron quitar los pasos sobrantes: ${error.message}` });
  }

  volver(ruta, { aviso: `Pasos guardados (${pasos.length}).` });
}

// ---------------------------------------------------------------------------
// Inscripciones a mano
// ---------------------------------------------------------------------------

export async function inscribirPorTelefono(id: string, formData: FormData) {
  const { supabase } = await soloDireccion();
  const ruta = `/marketing/flujos/${id}`;

  const telefono = normalizarTelefono(String(formData.get('telefono') ?? ''));
  if (!telefono) volver(ruta, { error: 'Ese teléfono no es válido.' });

  // Con el cliente del usuario: solo encuentra a quien puede ver (RLS).
  const { data: contacto } = await supabase
    .from('contactos')
    .select('id')
    .eq('telefono', telefono)
    .maybeSingle();
  if (!contacto)
    volver(ruta, { error: 'No hay nadie con ese teléfono entre las personas que puedes ver.' });

  const admin = createAdminClient();
  const [{ data: flujo }, { data: inicio }] = await Promise.all([
    admin.from('flujos').select('id, centro_id').eq('id', id).maybeSingle(),
    admin.from('flujo_pasos').select('id').eq('flujo_id', id).eq('es_inicio', true).maybeSingle(),
  ]);
  if (!flujo) volver(ruta, { error: 'El flujo no existe.' });
  if (!inicio)
    volver(ruta, { error: 'El flujo no tiene primer paso: añádelo antes de inscribir a nadie.' });

  const nueva = await inscribir(admin, flujo, contacto.id, null, { tipo: 'manual' }, inicio.id);
  volver(
    ruta,
    nueva
      ? { aviso: 'Inscrita. Avanza en la siguiente pasada del motor (menos de 15 minutos).' }
      : { aviso: 'Esa persona ya estaba en el flujo.' },
  );
}

export async function sacarInscripcion(flujoId: string, inscripcionId: string) {
  await soloDireccion();
  const ruta = `/marketing/flujos/${flujoId}`;
  const admin = createAdminClient();
  const { error } = await admin
    .from('flujo_inscripciones')
    .update({ estado: 'salida', motivo: 'sacada a mano desde la pantalla', siguiente_at: null })
    .eq('id', inscripcionId)
    .eq('flujo_id', flujoId);
  if (error) volver(ruta, { error: `No se pudo sacar: ${error.message}` });
  await admin
    .from('flujo_eventos')
    .insert({
      inscripcion_id: inscripcionId,
      paso_id: null,
      tipo: 'salida',
      detalle: 'sacada a mano desde la pantalla',
    });
  volver(ruta, { aviso: 'Fuera del flujo.' });
}
