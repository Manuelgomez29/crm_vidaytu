import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/database.types';
import { traerTodo } from '@/lib/paginar';
import { esVeinticuatroSiete, estaAbierto, horarioDe } from '@/lib/horarios';

/**
 * El motor de los flujos de seguimiento.
 *
 * Corre en cada pasada de `/api/tareas-programadas` y hace dos cosas, en este
 * orden: BARRE los disparadores de cada flujo activo para inscribir a quien
 * acaba de cumplirlos, y AVANZA a las personas ya inscritas cuyo siguiente paso
 * ya toca.
 *
 * Los mismos dos principios que el resto del motor:
 *
 *   · Idempotente. Una persona se inscribe una vez por flujo (índice único),
 *     cada paso deja un evento, y el barrido usa una marca de agua: ejecutarlo
 *     dos veces seguidas no inscribe ni envía nada dos veces.
 *   · Las tres barreras del email marketing (reglas 5 y 12) no se tocan: un
 *     paso de email mete a la persona como destinataria de una campaña, y es la
 *     maquinaria de campañas —con su consentimiento, su pie de baja y su
 *     cinturón de centro en la base— la que envía. Aquí no se manda nada.
 *
 * Lo que un flujo SÍ hace por su cuenta es etiquetar, crear tareas y avisar al
 * equipo. Eso rompe, a propósito, el «propone, no decide» del resto del motor:
 * es justo lo que se pidió, y por eso cada flujo lo activa dirección y queda
 * registrado paso a paso quién hizo qué y por qué.
 */

type Cliente = SupabaseClient<Database>;

export type ResultadoFlujos = {
  flujosActivos: number;
  inscritos: number;
  avanzados: number;
  emailsEncolados: number;
  emailsOmitidos: number;
  salidas: number;
  completados: number;
  errores: number;
  /** Hasta tres mensajes de error distintos: un contador solo no explica nada. */
  detalles?: string[];
};

type Disparador =
  | { tipo: 'etiqueta_aplicada'; etiqueta_id: string }
  | { tipo: 'lead_creado'; canal_id?: string; fuente_id?: string }
  | { tipo: 'estado_lead'; estado: string }
  | { tipo: 'consentimiento' }
  | { tipo: 'manual' };

type Salida = { al_convertir?: boolean; sin_consentimiento?: boolean; etiqueta_id?: string };

type Paso = {
  id: string;
  flujo_id: string;
  tipo: string;
  config: Record<string, unknown>;
  es_inicio: boolean;
  orden: number;
  siguiente_id: string | null;
  siguiente_si_id: string | null;
  siguiente_no_id: string | null;
};

type Flujo = {
  id: string;
  nombre: string;
  centro_id: string | null;
  activo: boolean;
  disparador: Disparador;
  salida: Salida;
  ultimo_barrido_at: string | null;
  created_by: string | null;
};

type Inscripcion = {
  id: string;
  flujo_id: string;
  contacto_id: string;
  lead_id: string | null;
  paso_actual_id: string | null;
};

type Candidato = { contacto_id: string; lead_id: string | null; por: Record<string, unknown> };

const SUFIJO_SINTETICO = '@instagram.com';

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

async function anotar(
  admin: Cliente,
  inscripcionId: string,
  pasoId: string | null,
  tipo: string,
  detalle?: string,
) {
  await admin
    .from('flujo_eventos')
    .insert({ inscripcion_id: inscripcionId, paso_id: pasoId, tipo, detalle: detalle ?? null });
}

async function parametro(admin: Cliente, clave: string, porDefecto: number): Promise<number> {
  const { data } = await admin.from('configuracion').select('valor').eq('clave', clave).maybeSingle();
  const n = Number(data?.valor);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

/** El caso abierto más reciente de esa persona, en el centro del flujo si lo hay. */
async function casoDe(
  admin: Cliente,
  contactoId: string,
  centroId: string | null,
): Promise<string | null> {
  let q = admin
    .from('lead_contactos')
    .select('lead_id, lead:leads!inner (id, centro_id, estado, created_at)')
    .eq('contacto_id', contactoId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (centroId) q = q.eq('lead.centro_id', centroId);
  const { data } = await q;
  const abierto = (data ?? []).find((f) => {
    const l = f.lead as unknown as { estado: string } | null;
    return l && !['convertido', 'perdido', 'no_valido', 'derivado'].includes(l.estado);
  });
  return abierto?.lead_id ?? (data ?? [])[0]?.lead_id ?? null;
}

/** La persona principal de un caso. */
async function personaDe(admin: Cliente, leadId: string): Promise<string | null> {
  const { data } = await admin
    .from('lead_contactos')
    .select('contacto_id, es_principal')
    .eq('lead_id', leadId)
    .order('es_principal', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.contacto_id ?? null;
}

// ---------------------------------------------------------------------------
// 1. Barrer disparadores → inscribir
// ---------------------------------------------------------------------------

async function candidatosDe(admin: Cliente, flujo: Flujo, desde: string): Promise<Candidato[]> {
  const d = flujo.disparador;

  if (d.tipo === 'etiqueta_aplicada') {
    const { filas } = await traerTodo((a, b) =>
      admin
        .from('contacto_etiquetas')
        .select('contacto_id, created_at')
        .eq('etiqueta_id', d.etiqueta_id)
        .gt('created_at', desde)
        .order('created_at')
        .range(a, b),
    );
    const salida: Candidato[] = [];
    for (const f of filas) {
      salida.push({
        contacto_id: f.contacto_id,
        lead_id: await casoDe(admin, f.contacto_id, flujo.centro_id),
        por: { tipo: d.tipo, etiqueta_id: d.etiqueta_id, cuando: f.created_at },
      });
    }
    return salida;
  }

  if (d.tipo === 'lead_creado') {
    const { filas } = await traerTodo((a, b) => {
      let q = admin
        .from('leads')
        .select('id, canal_id, fuente_id, centro_id, created_at')
        .gt('created_at', desde)
        .order('created_at')
        .range(a, b);
      if (flujo.centro_id) q = q.eq('centro_id', flujo.centro_id);
      if (d.canal_id) q = q.eq('canal_id', d.canal_id);
      if (d.fuente_id) q = q.eq('fuente_id', d.fuente_id);
      return q;
    });
    const salida: Candidato[] = [];
    for (const l of filas) {
      const contacto = await personaDe(admin, l.id);
      if (contacto) salida.push({ contacto_id: contacto, lead_id: l.id, por: { tipo: d.tipo, lead_id: l.id } });
    }
    return salida;
  }

  if (d.tipo === 'estado_lead') {
    /*
     * El cambio de estado queda en el historial del caso (`actividades`,
     * tipo «cambio_estado»). Se miran los casos con un cambio desde el último
     * barrido y, de ellos, los que HOY están en el estado buscado: así un caso
     * que pasó por «perdido» y volvió no dispara el flujo de perdidos.
     */
    const { filas: cambios } = await traerTodo((a, b) =>
      admin
        .from('actividades')
        .select('lead_id')
        .eq('tipo', 'cambio_estado')
        .gt('created_at', desde)
        .order('created_at')
        .range(a, b),
    );
    const ids = [...new Set(cambios.map((c) => c.lead_id))];
    const salida: Candidato[] = [];
    for (let i = 0; i < ids.length; i += 300) {
      let q = admin
        .from('leads')
        .select('id, estado, centro_id')
        .in('id', ids.slice(i, i + 300))
        .eq('estado', d.estado as Database['public']['Enums']['estado_lead']);
      if (flujo.centro_id) q = q.eq('centro_id', flujo.centro_id);
      const { data } = await q;
      for (const l of data ?? []) {
        const contacto = await personaDe(admin, l.id);
        if (contacto) salida.push({ contacto_id: contacto, lead_id: l.id, por: { tipo: d.tipo, estado: d.estado } });
      }
    }
    return salida;
  }

  if (d.tipo === 'consentimiento') {
    const { filas } = await traerTodo((a, b) =>
      admin
        .from('contactos')
        .select('id, consentimiento_marketing_at')
        .eq('consentimiento_marketing', true)
        .gt('consentimiento_marketing_at', desde)
        .order('consentimiento_marketing_at')
        .range(a, b),
    );
    const salida: Candidato[] = [];
    for (const c of filas) {
      salida.push({
        contacto_id: c.id,
        lead_id: await casoDe(admin, c.id, flujo.centro_id),
        por: { tipo: d.tipo, cuando: c.consentimiento_marketing_at },
      });
    }
    return salida;
  }

  return [];
}

/**
 * Inscribe a una persona en un flujo. Devuelve true si la inscribió, false si
 * ya estaba. Es lo que usa el barrido y también la pantalla («inscribir a
 * mano»).
 */
export async function inscribir(
  admin: Cliente,
  flujo: Pick<Flujo, 'id' | 'centro_id'>,
  contactoId: string,
  leadId: string | null,
  por: Record<string, unknown>,
  inicioId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from('flujo_inscripciones')
    .upsert(
      {
        flujo_id: flujo.id,
        contacto_id: contactoId,
        lead_id: leadId,
        estado: 'activa',
        paso_actual_id: inicioId,
        siguiente_at: new Date().toISOString(),
        disparado_por: por as Json,
      },
      { onConflict: 'flujo_id,contacto_id', ignoreDuplicates: true },
    )
    .select('id');
  if (error) throw new Error(`inscribiendo: ${error.message}`);
  const nueva = (data ?? [])[0];
  if (!nueva) return false;
  await anotar(admin, nueva.id, inicioId, 'inscrita', JSON.stringify(por));
  return true;
}

/**
 * La hora de la BASE, no la de la aplicación.
 *
 * La marca de agua se compara con `created_at`, que lo pone el reloj de la
 * base. Si aquí se usara `new Date()` y la base fuera unos segundos adelantada,
 * una etiqueta puesta ANTES de activar el flujo parecería posterior a la marca
 * y esa persona entraría. Pasó en la prueba. Dos relojes, una sola verdad.
 */
async function horaDelServidor(admin: Cliente): Promise<string> {
  const { data, error } = await admin.rpc('hora_del_servidor');
  if (error || !data) return new Date().toISOString();
  return new Date(data as string).toISOString();
}

async function barrer(admin: Cliente, flujo: Flujo, inicio: Paso): Promise<number> {
  const ahora = await horaDelServidor(admin);

  /*
   * Sin marca de agua no se barre el pasado: se deja la marca en «ahora» y se
   * empieza a mirar desde aquí. Activar un flujo no puede inscribir de golpe a
   * mil personas del histórico sin que nadie lo haya pedido.
   */
  if (!flujo.ultimo_barrido_at) {
    await admin.from('flujos').update({ ultimo_barrido_at: ahora }).eq('id', flujo.id);
    return 0;
  }

  const candidatos = await candidatosDe(admin, flujo, flujo.ultimo_barrido_at);
  let inscritos = 0;
  for (const c of candidatos) {
    if (await inscribir(admin, flujo, c.contacto_id, c.lead_id, c.por, inicio.id)) inscritos++;
  }

  await admin.from('flujos').update({ ultimo_barrido_at: ahora }).eq('id', flujo.id);
  return inscritos;
}

// ---------------------------------------------------------------------------
// 2. Avanzar inscripciones
// ---------------------------------------------------------------------------

/** La campaña perpetua de un paso de email; se crea la primera vez que hace falta. */
async function campanaDelPaso(admin: Cliente, flujo: Flujo, paso: Paso): Promise<string> {
  const { data: existente } = await admin
    .from('campanas_email')
    .select('id')
    .eq('flujo_paso_id', paso.id)
    .maybeSingle();
  if (existente) return existente.id;

  const plantillaId = String(paso.config.plantilla_id ?? '');
  const { data: plantilla } = await admin
    .from('plantillas_email')
    .select('asunto, cuerpo_texto, cuerpo_html')
    .eq('id', plantillaId)
    .maybeSingle();
  if (!plantilla) throw new Error(`el paso ${paso.orden} no tiene plantilla válida`);

  const { data: creada, error } = await admin
    .from('campanas_email')
    .insert({
      nombre: `Flujo · ${flujo.nombre} · paso ${paso.orden + 1}`,
      asunto: plantilla.asunto,
      cuerpo_texto: plantilla.cuerpo_texto,
      cuerpo_html: plantilla.cuerpo_html,
      centro_id: flujo.centro_id,
      estado: 'flujo',
      flujo_paso_id: paso.id,
      created_by: flujo.created_by,
    })
    .select('id')
    .single();
  if (error || !creada) throw new Error(`creando la campaña del paso: ${error?.message}`);
  return creada.id;
}

/**
 * Cuándo toca el paso siguiente. Si la espera es «solo en horario del centro»
 * y a esa hora el centro está cerrado, se desplaza al siguiente hueco abierto
 * —de media en media hora— hasta un tope de días; pasado el tope, sale igual.
 * Un correo a las tres de la mañana no es un problema de entrega, es de
 * impresión: parece una máquina.
 */
async function cuandoToca(
  admin: Cliente,
  flujo: Flujo,
  config: Record<string, unknown>,
  topeDias: number,
): Promise<Date> {
  const cantidad = Math.max(0, Number(config.cantidad) || 0);
  const unidad = config.unidad === 'horas' ? 'horas' : 'dias';
  const t = new Date(Date.now() + cantidad * (unidad === 'horas' ? 3600e3 : 86400e3));

  if (!config.solo_horario_centro || !flujo.centro_id) return t;

  const { data: centro } = await admin
    .from('centros')
    .select('horario_atencion')
    .eq('id', flujo.centro_id)
    .maybeSingle();
  const horario = horarioDe(centro?.horario_atencion);
  if (esVeinticuatroSiete(horario)) return t;

  const limite = t.getTime() + topeDias * 86400e3;
  let cursor = t.getTime();
  while (cursor < limite && !estaAbierto(horario, cursor)) cursor += 30 * 60e3;
  return new Date(cursor < limite ? cursor : t.getTime());
}

async function motivoDeSalida(
  admin: Cliente,
  flujo: Flujo,
  insc: Inscripcion,
): Promise<string | null> {
  const s = flujo.salida ?? {};

  if (s.al_convertir !== false && insc.lead_id) {
    const { data: lead } = await admin.from('leads').select('estado').eq('id', insc.lead_id).maybeSingle();
    if (lead?.estado === 'convertido') return 'el caso convirtió';
  }

  if (s.sin_consentimiento !== false) {
    const { data: c } = await admin
      .from('contactos')
      .select('consentimiento_marketing')
      .eq('id', insc.contacto_id)
      .maybeSingle();
    if (c && c.consentimiento_marketing === false) {
      // Solo cuenta si el flujo manda correos: sin ellos, el consentimiento no pinta nada.
      const { count } = await admin
        .from('flujo_pasos')
        .select('id', { count: 'exact', head: true })
        .eq('flujo_id', flujo.id)
        .eq('tipo', 'email');
      if ((count ?? 0) > 0) return 'retiró el consentimiento';
    }
  }

  if (s.etiqueta_id) {
    const { data } = await admin
      .from('contacto_etiquetas')
      .select('id')
      .eq('contacto_id', insc.contacto_id)
      .eq('etiqueta_id', s.etiqueta_id)
      .maybeSingle();
    if (data) return 'tiene la etiqueta de salida';
  }

  return null;
}

async function evaluarCondicion(
  admin: Cliente,
  insc: Inscripcion,
  config: Record<string, unknown>,
): Promise<boolean> {
  const tipo = String(config.tipo ?? '');

  if (tipo === 'abrio_email' || tipo === 'hizo_clic') {
    const pasoId = String(config.paso_id ?? '');
    if (!pasoId) return false;
    const { data: campana } = await admin
      .from('campanas_email')
      .select('id')
      .eq('flujo_paso_id', pasoId)
      .maybeSingle();
    if (!campana) return false;
    const { data: d } = await admin
      .from('campana_destinatarios')
      .select('abierto_at, clic_at')
      .eq('campana_id', campana.id)
      .eq('contacto_id', insc.contacto_id)
      .maybeSingle();
    return tipo === 'abrio_email' ? !!(d?.abierto_at || d?.clic_at) : !!d?.clic_at;
  }

  if (tipo === 'tiene_etiqueta') {
    const { data } = await admin
      .from('contacto_etiquetas')
      .select('id')
      .eq('contacto_id', insc.contacto_id)
      .eq('etiqueta_id', String(config.etiqueta_id ?? ''))
      .maybeSingle();
    return !!data;
  }

  if (tipo === 'tiene_consentimiento') {
    const { data } = await admin
      .from('contactos')
      .select('consentimiento_marketing')
      .eq('id', insc.contacto_id)
      .maybeSingle();
    return data?.consentimiento_marketing === true;
  }

  if (tipo === 'estado_lead') {
    if (!insc.lead_id) return false;
    const { data } = await admin.from('leads').select('estado').eq('id', insc.lead_id).maybeSingle();
    return data?.estado === String(config.estado ?? '');
  }

  return false;
}

type Contadores = Omit<ResultadoFlujos, 'flujosActivos' | 'detalles'>;

async function avanzar(
  admin: Cliente,
  flujo: Flujo,
  pasos: Map<string, Paso>,
  insc: Inscripcion,
  maxPasos: number,
  topeDiasHorario: number,
  r: Contadores,
): Promise<void> {
  const terminar = async (estado: 'completada' | 'salida', motivo: string | null, pasoId: string | null) => {
    await admin
      .from('flujo_inscripciones')
      .update({ estado, motivo, siguiente_at: null })
      .eq('id', insc.id);
    await anotar(admin, insc.id, pasoId, estado, motivo ?? undefined);
    if (estado === 'completada') r.completados++;
    else r.salidas++;
  };

  let pasoId = insc.paso_actual_id;
  for (let vuelta = 0; vuelta < maxPasos; vuelta++) {
    const paso = pasoId ? pasos.get(pasoId) : undefined;
    if (!paso) return terminar('completada', null, pasoId);

    const motivo = await motivoDeSalida(admin, flujo, insc);
    if (motivo) return terminar('salida', motivo, paso.id);

    let siguiente: string | null = paso.siguiente_id;

    switch (paso.tipo) {
      case 'email': {
        const { data: c } = await admin
          .from('contactos')
          .select('email, consentimiento_marketing')
          .eq('id', insc.contacto_id)
          .maybeSingle();

        if (!c?.consentimiento_marketing) return terminar('salida', 'sin consentimiento de marketing', paso.id);

        const email = (c.email ?? '').trim().toLowerCase();
        if (!email || email.endsWith(SUFIJO_SINTETICO)) {
          /*
           * Sin correo real no hay nada que enviar, pero el flujo sigue: puede
           * que el siguiente paso sea una tarea al comercial, que es justo lo
           * que toca con alguien que no deja email.
           */
          await anotar(admin, insc.id, paso.id, 'email_omitido', email ? 'correo sintético de Instagram' : 'sin correo');
          r.emailsOmitidos++;
          break;
        }

        const campanaId = await campanaDelPaso(admin, flujo, paso);
        const { error } = await admin
          .from('campana_destinatarios')
          .insert({ campana_id: campanaId, contacto_id: insc.contacto_id, email });
        if (error) {
          // 23505 = ya era destinataria de este paso: no se repite, se sigue.
          if (error.code === '23505') {
            await anotar(admin, insc.id, paso.id, 'email_omitido', 'ya había recibido este correo');
            r.emailsOmitidos++;
            break;
          }
          // El cinturón del centro en la base, o cualquier otra cosa: fuera, y dicho.
          return terminar('salida', `no se pudo encolar el correo: ${error.message}`, paso.id);
        }
        await anotar(admin, insc.id, paso.id, 'email_encolado');
        r.emailsEncolados++;
        break;
      }

      case 'esperar': {
        const cuando = await cuandoToca(admin, flujo, paso.config, topeDiasHorario);
        if (!siguiente) return terminar('completada', null, paso.id);
        await admin
          .from('flujo_inscripciones')
          .update({ paso_actual_id: siguiente, siguiente_at: cuando.toISOString() })
          .eq('id', insc.id);
        await anotar(admin, insc.id, paso.id, 'espera', `hasta ${cuando.toISOString()}`);
        r.avanzados++;
        return;
      }

      case 'etiqueta': {
        const etiquetaId = String(paso.config.etiqueta_id ?? '');
        if (paso.config.accion === 'quitar') {
          await admin
            .from('contacto_etiquetas')
            .delete()
            .eq('contacto_id', insc.contacto_id)
            .eq('etiqueta_id', etiquetaId);
        } else {
          await admin
            .from('contacto_etiquetas')
            .upsert(
              { contacto_id: insc.contacto_id, etiqueta_id: etiquetaId },
              { onConflict: 'contacto_id,etiqueta_id', ignoreDuplicates: true },
            );
        }
        await anotar(admin, insc.id, paso.id, 'paso', `etiqueta ${paso.config.accion === 'quitar' ? 'quitada' : 'añadida'}`);
        break;
      }

      case 'tarea': {
        const leadId = insc.lead_id ?? (await casoDe(admin, insc.contacto_id, flujo.centro_id));
        if (!leadId) {
          await anotar(admin, insc.id, paso.id, 'paso', 'sin caso: tarea omitida');
          break;
        }
        const { data: lead } = await admin
          .from('leads')
          .select('propietario_id')
          .eq('id', leadId)
          .maybeSingle();
        const horas = Math.max(1, Number(paso.config.vence_en_horas) || 24);
        await admin.from('tareas').insert({
          lead_id: leadId,
          titulo: String(paso.config.titulo ?? 'Seguimiento del flujo'),
          vence_at: new Date(Date.now() + horas * 3600e3).toISOString(),
          responsable_id: lead?.propietario_id ?? null,
        });
        await anotar(admin, insc.id, paso.id, 'paso', 'tarea creada');
        break;
      }

      case 'aviso': {
        const destinatarios: string[] = [];
        if (paso.config.a === 'direccion') {
          const { data } = await admin
            .from('perfiles')
            .select('id')
            .eq('rol', 'direccion')
            .eq('activo', true);
          destinatarios.push(...(data ?? []).map((p) => p.id));
        } else {
          const leadId = insc.lead_id ?? (await casoDe(admin, insc.contacto_id, flujo.centro_id));
          if (leadId) {
            const { data: lead } = await admin
              .from('leads')
              .select('propietario_id')
              .eq('id', leadId)
              .maybeSingle();
            if (lead?.propietario_id) destinatarios.push(lead.propietario_id);
          }
        }
        if (destinatarios.length > 0) {
          await admin.from('notificaciones').upsert(
            destinatarios.map((usuario_id) => ({
              usuario_id,
              tipo: 'aviso_flujo' as Database['public']['Enums']['tipo_notificacion'],
              lead_id: insc.lead_id,
              mensaje: String(paso.config.mensaje ?? `Flujo «${flujo.nombre}»`),
              clave: `flujo:${insc.id}:${paso.id}:${usuario_id}`,
            })),
            { onConflict: 'clave', ignoreDuplicates: true },
          );
        }
        await anotar(admin, insc.id, paso.id, 'paso', `aviso a ${destinatarios.length}`);
        break;
      }

      case 'lista': {
        await admin
          .from('lista_contactos')
          .upsert(
            { lista_id: String(paso.config.lista_id ?? ''), contacto_id: insc.contacto_id },
            { onConflict: 'lista_id,contacto_id', ignoreDuplicates: true },
          );
        await anotar(admin, insc.id, paso.id, 'paso', 'añadida a la lista');
        break;
      }

      case 'condicion': {
        const si = await evaluarCondicion(admin, insc, paso.config);
        siguiente = si ? paso.siguiente_si_id : paso.siguiente_no_id;
        await anotar(admin, insc.id, paso.id, 'paso', si ? 'condición: sí' : 'condición: no');
        break;
      }

      case 'fin':
        return terminar('completada', null, paso.id);

      default:
        return terminar('salida', `paso de tipo desconocido: ${paso.tipo}`, paso.id);
    }

    r.avanzados++;
    if (!siguiente) return terminar('completada', null, paso.id);
    await admin
      .from('flujo_inscripciones')
      .update({ paso_actual_id: siguiente })
      .eq('id', insc.id);
    pasoId = siguiente;
  }

  /*
   * Se agotó el tope de pasos en una sola pasada. No es un error: es el freno
   * contra un flujo que gira en círculo. Se deja donde está y seguirá en la
   * siguiente pasada; si de verdad es un bucle, se verá en los eventos.
   */
  await anotar(admin, insc.id, pasoId, 'paso', 'tope de pasos por pasada alcanzado');
}

// ---------------------------------------------------------------------------
// 3. La pasada completa
// ---------------------------------------------------------------------------

export async function ejecutarFlujos(admin: Cliente): Promise<ResultadoFlujos> {
  const r: ResultadoFlujos = {
    flujosActivos: 0,
    inscritos: 0,
    avanzados: 0,
    emailsEncolados: 0,
    emailsOmitidos: 0,
    salidas: 0,
    completados: 0,
    errores: 0,
  };
  const detalle = (m: string) => {
    r.errores++;
    r.detalles ??= [];
    if (r.detalles.length < 3 && !r.detalles.includes(m)) r.detalles.push(m);
  };

  const [maxPasos, topeDiasHorario] = await Promise.all([
    parametro(admin, 'flujos_max_pasos_por_pasada', 20),
    parametro(admin, 'flujos_espera_maxima_horario_dias', 7),
  ]);

  const { data: flujos, error } = await admin
    .from('flujos')
    .select('id, nombre, centro_id, activo, disparador, salida, ultimo_barrido_at, created_by')
    .eq('activo', true);
  if (error) throw new Error(`leyendo flujos: ${error.message}`);
  const activos = (flujos ?? []) as unknown as Flujo[];
  r.flujosActivos = activos.length;
  if (activos.length === 0) return r;

  const { filas: todosLosPasos } = await traerTodo((a, b) =>
    admin
      .from('flujo_pasos')
      .select('id, flujo_id, tipo, config, es_inicio, orden, siguiente_id, siguiente_si_id, siguiente_no_id')
      .in('flujo_id', activos.map((f) => f.id))
      .order('orden')
      .range(a, b),
  );
  const pasosPorFlujo = new Map<string, Map<string, Paso>>();
  const inicioDe = new Map<string, Paso>();
  for (const p of todosLosPasos as unknown as Paso[]) {
    if (!pasosPorFlujo.has(p.flujo_id)) pasosPorFlujo.set(p.flujo_id, new Map());
    pasosPorFlujo.get(p.flujo_id)!.set(p.id, p);
    if (p.es_inicio) inicioDe.set(p.flujo_id, p);
  }

  // 1. Disparadores.
  for (const flujo of activos) {
    const inicio = inicioDe.get(flujo.id);
    if (!inicio) continue; // Un flujo sin primer paso no inscribe a nadie.
    try {
      r.inscritos += await barrer(admin, flujo, inicio);
    } catch (e) {
      detalle(`${flujo.nombre}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 2. Inscripciones a las que ya les toca.
  const { filas: pendientes } = await traerTodo((a, b) =>
    admin
      .from('flujo_inscripciones')
      .select('id, flujo_id, contacto_id, lead_id, paso_actual_id')
      .eq('estado', 'activa')
      .lte('siguiente_at', new Date().toISOString())
      .order('siguiente_at')
      .range(a, b),
  );

  const porId = new Map(activos.map((f) => [f.id, f]));
  for (const insc of pendientes as Inscripcion[]) {
    const flujo = porId.get(insc.flujo_id);
    const pasos = pasosPorFlujo.get(insc.flujo_id);
    if (!flujo || !pasos) continue; // Flujo apagado entre medias: se queda donde está.
    try {
      await avanzar(admin, flujo, pasos, insc, maxPasos, topeDiasHorario, r);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      await admin
        .from('flujo_inscripciones')
        .update({ estado: 'error', motivo: m, siguiente_at: null })
        .eq('id', insc.id);
      await anotar(admin, insc.id, insc.paso_actual_id, 'error', m);
      detalle(`${flujo.nombre}: ${m}`);
    }
  }

  return r;
}
