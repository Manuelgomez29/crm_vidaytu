/**
 * Automatizaciones de las fases 2 y 3. Corre en la misma pasada que el motor
 * de alertas (`/api/tareas-programadas`) y comparte sus dos principios:
 *
 *   · Idempotente. Cada acción deja una marca en la fila (`*_propuesta_at`,
 *     `completado_at`, la clave del aviso), así que ejecutarlo cada quince
 *     minutos no genera trabajo duplicado.
 *   · Propone, no decide. Crea tareas y avisos; jamás cierra un caso, ni
 *     manda nada a un paciente por su cuenta.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { ZONA } from '@/lib/fechas';
import { puntuar, reglaDesdeFila, type Regla, type SenalesLead } from '@/lib/scoring';
import { ejecutarEtiquetado } from '@/lib/etiquetado';
import { calcularInformeMensual, cuerpoInformeMensual, mesAnterior } from '@/lib/informe-mensual';
import { anonimizar } from '@/lib/anonimizar';
import { enviarCorreo, emailConfigurado } from '@/lib/email';
import { fase, type FalloDeFase } from '@/lib/salud-motor';
import { limpiarAccesos } from '@/lib/accesos';

type Cliente = SupabaseClient<Database>;
type TipoNotificacion = Database['public']['Enums']['tipo_notificacion'];

const DIA_MS = 86_400_000;

export type ResultadoAutomatizacion = {
  puntuados: number;
  etiquetasAplicadas: number;
  reactivaciones: number;
  resenas: number;
  riesgosRecaida: number;
  seguimientosProgramados: number;
  seguimientosAvisados: number;
  informeMensual: number;
  anonimizados: number;
  duplicadosDetectados: number;
};

function hoyMadrid(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: ZONA });
}

/** Suma meses a una fecha ISO (YYYY-MM-DD) sin salirse del mes. */
function sumarMeses(fechaIso: string, meses: number): string {
  const [a, m, d] = fechaIso.split('-').map(Number);
  const base = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(d, ultimoDia));
  return base.toISOString().slice(0, 10);
}

async function avisar(
  admin: Cliente,
  avisos: {
    usuario_id: string;
    tipo: TipoNotificacion;
    lead_id?: string | null;
    mensaje: string;
    clave: string;
  }[],
): Promise<number> {
  if (avisos.length === 0) return 0;
  const { data, error } = await admin
    .from('notificaciones')
    .upsert(avisos, { onConflict: 'clave', ignoreDuplicates: true })
    .select('id');
  if (error) throw new Error(`No se pudieron crear avisos: ${error.message}`);
  return (data ?? []).length;
}

// ---------------------------------------------------------------------------
// 1. LEAD SCORING
// ---------------------------------------------------------------------------
/*
 * Exportada para poder lanzarla a mano desde un script. Los cron de Vercel
 * solo corren en produccion, asi que en staging la puntuacion no se recalcula
 * sola nunca — y una puntuacion que siempre vale 0 no se puede ni mirar ni
 * probar.
 */
export async function recalcularPuntuaciones(admin: Cliente): Promise<number> {
  /*
   * Las reglas salen de la tabla, no de una constante. Si direccion apaga una o
   * le cambia los puntos, la siguiente pasada ya lo respeta sin desplegar nada.
   */
  const { data: filas } = await admin
    .from('scoring_reglas')
    .select('nombre, condicion, puntos, activa');
  const reglas: Regla[] = (filas ?? [])
    .map(reglaDesdeFila)
    .filter((r): r is Regla => r !== null);

  if (reglas.length === 0) return 0;

  const { data: casos } = await admin
    .from('leads')
    .select(
      'id, estado, urgencia, quien_contacta, relacion_con_afectado, canal_id, primera_respuesta_at, created_at, puntuacion, updated_at, canal:canales (slug)',
    )
    .not('estado', 'in', '(convertido,perdido,no_valido,derivado)');

  if (!casos || casos.length === 0) return 0;

  const ids = casos.map((c) => c.id);

  /*
   * Todo lo que hace falta en cuatro consultas, no en 4N. Con doscientos casos
   * abiertos la diferencia entre una consulta por caso y una por concepto es la
   * diferencia entre que la pasada de los quince minutos termine o no.
   */
  const [{ data: actividades }, { data: presupuestos }, { data: reaperturas }, { data: citas }] =
    await Promise.all([
      admin.from('actividades').select('lead_id, created_at').in('lead_id', ids),
      admin.from('presupuestos').select('lead_id').in('lead_id', ids),
      admin.from('actividades').select('lead_id').in('lead_id', ids).eq('tipo', 'reapertura'),
      admin.from('citas').select('lead_id, estado').in('lead_id', ids).eq('estado', 'no_show'),
    ]);

  const ultimaActividad = new Map<string, number>();
  for (const a of actividades ?? []) {
    const ts = Date.parse(a.created_at);
    if (ts > (ultimaActividad.get(a.lead_id) ?? 0)) ultimaActividad.set(a.lead_id, ts);
  }
  const conPresupuesto = new Set((presupuestos ?? []).map((p) => p.lead_id));
  const reabiertos = new Set((reaperturas ?? []).map((r) => r.lead_id));

  const noShows = new Map<string, number>();
  for (const c of citas ?? []) noShows.set(c.lead_id, (noShows.get(c.lead_id) ?? 0) + 1);

  const ahora = Date.now();
  let cambiados = 0;

  for (const caso of casos) {
    const referencia = ultimaActividad.get(caso.id) ?? Date.parse(caso.updated_at);
    const senales: SenalesLead = {
      estado: caso.estado,
      urgencia: caso.urgencia,
      quienContacta: caso.quien_contacta,
      relacionContacto: caso.relacion_con_afectado,
      canalSlug: caso.canal?.slug ?? null,
      respondido: caso.primera_respuesta_at !== null,
      minutosHastaRespuesta: caso.primera_respuesta_at
        ? Math.round(
            (Date.parse(caso.primera_respuesta_at) - Date.parse(caso.created_at)) / 60_000,
          )
        : null,
      tienePresupuesto: conPresupuesto.has(caso.id),
      fueReabierto: reabiertos.has(caso.id),
      diasSinActividad: Math.max(0, Math.floor((ahora - referencia) / DIA_MS)),
      citasNoAsistidas: noShows.get(caso.id) ?? 0,
    };

    const { puntuacion } = puntuar(senales, reglas);
    if (puntuacion === caso.puntuacion) continue;

    // Sin `updated_at`: recalcular una puntuación no es tocar el caso, y
    // ensuciaría el "días sin actividad" de la siguiente pasada.
    await admin
      .from('leads')
      .update({ puntuacion, puntuacion_at: new Date().toISOString() })
      .eq('id', caso.id);
    cambiados++;
  }

  return cambiados;
}

// ---------------------------------------------------------------------------
// 2. REACTIVACIÓN DE «NO ES EL MOMENTO»
//
// Un «ahora no» no es un no. A los 90 días (configurable) se genera la tarea
// de retomar el contacto, para el propietario que lo llevaba.
// ---------------------------------------------------------------------------
/* Exportada para poder probarla con la funcion real, no con una copia. */
export async function reactivarPerdidos(admin: Cliente, dias: number): Promise<number> {
  const limite = new Date(Date.now() - dias * DIA_MS).toISOString();

  /*
   * Se aceptan las dos grafias del slug.
   *
   * El codigo buscaba «no-es-el-momento» y en la base es «no_es_el_momento».
   * La consulta no fallaba: devolvia null, la funcion devolvia 0 y la
   * reactivacion no se ejecuto NUNCA sin que nadie se enterara. Un automatismo
   * que no encuentra su configuracion tiene que quejarse, no callarse — por eso
   * ahora avisa por consola en vez de irse de puntillas.
   */
  const { data: motivos } = await admin
    .from('motivos_perdida')
    .select('id')
    .in('slug', ['no_es_el_momento', 'no-es-el-momento'])
    .limit(1);

  const motivo = motivos?.[0];
  if (!motivo) {
    console.warn(
      '[reactivacion] No existe el motivo de perdida «no_es_el_momento». No se reactivara ningun caso.',
    );
    return 0;
  }

  /*
   * El reloj corre sobre `cerrado_at`, NO sobre `updated_at`.
   *
   * `updated_at` lo reescribe el trigger cada vez que alguien toca el caso —
   * un cambio de etiqueta, una nota— y eso reiniciaba la cuenta de los noventa
   * dias sin que nadie se enterara. Es exactamente el mismo fallo que ya
   * costo arreglar en la politica de retencion, y estaba aqui tambien.
   *
   * Para los casos cerrados antes de que existiera la columna se acepta
   * `updated_at` como respaldo: es impreciso, pero mejor que no reactivarlos
   * nunca.
   */
  const { data: casos } = await admin
    .from('leads')
    .select('id, nombre, centro_id, propietario_id, updated_at, cerrado_at')
    .eq('estado', 'perdido')
    .eq('motivo_perdida_id', motivo.id)
    .is('reactivacion_propuesta_at', null)
    .or(`cerrado_at.lte.${limite},and(cerrado_at.is.null,updated_at.lte.${limite})`)
    .limit(100);

  if (!casos || casos.length === 0) return 0;

  const ids = casos.map((c) => c.id);

  /*
   * Quien pidio explicitamente que no le escriban queda fuera.
   *
   * La senal es `bajas_marketing` —una baja activa— y NO
   * `consentimiento_marketing = false`. Esa columna es false por defecto para
   * todo el mundo: filtrar por ella dejaria la reactivacion sin nadie a quien
   * reactivar. Y ademas serian dos cosas distintas: no haber aceptado
   * publicidad no es lo mismo que no querer que te devuelvan la llamada sobre
   * tu propia consulta.
   */
  const { data: vinculos } = await admin
    .from('lead_contactos')
    .select('lead_id, contacto_id')
    .in('lead_id', ids);

  const contactos = [...new Set((vinculos ?? []).map((v) => v.contacto_id))];
  const { data: bajas } = contactos.length
    ? await admin.from('bajas_marketing').select('contacto_id').in('contacto_id', contactos)
    : { data: [] };

  const conBaja = new Set((bajas ?? []).map((b) => b.contacto_id));
  const casosConBaja = new Set(
    (vinculos ?? []).filter((v) => conBaja.has(v.contacto_id)).map((v) => v.lead_id),
  );

  /*
   * Si el propietario ya no esta —de baja en la plataforma o ausente hoy— la
   * tarea va a otra persona activa de ese centro. Sin esto, los casos de quien
   * se fue del equipo no se reactivan nunca: nadie los ve.
   */
  const hoy = hoyMadrid();
  const [{ data: ausentes }, { data: activos }] = await Promise.all([
    admin.from('ausencias').select('perfil_id').lte('desde', hoy).gte('hasta', hoy),
    admin
      .from('perfil_centros')
      .select('perfil_id, centro_id, perfil:perfiles!inner (activo, rol)')
      .eq('perfiles.activo', true),
  ]);

  const fueraDeJuego = new Set((ausentes ?? []).map((a) => a.perfil_id));
  const porCentro = new Map<string, string[]>();
  for (const pc of activos ?? []) {
    if (fueraDeJuego.has(pc.perfil_id)) continue;
    if (!porCentro.has(pc.centro_id)) porCentro.set(pc.centro_id, []);
    porCentro.get(pc.centro_id)!.push(pc.perfil_id);
  }

  let creadas = 0;
  let omitidasPorBaja = 0;

  for (const caso of casos) {
    if (casosConBaja.has(caso.id)) {
      omitidasPorBaja++;
      // Se marca igual: si no, se vuelve a mirar en cada pasada, para siempre.
      await admin
        .from('leads')
        .update({ reactivacion_propuesta_at: new Date().toISOString() })
        .eq('id', caso.id);
      continue;
    }

    const propietarioDisponible =
      caso.propietario_id && !fueraDeJuego.has(caso.propietario_id) ? caso.propietario_id : null;
    const suplente = caso.centro_id ? (porCentro.get(caso.centro_id) ?? [])[0] : undefined;
    const responsable = propietarioDisponible ?? suplente ?? null;

    if (!responsable) continue;

    const { error } = await admin.from('tareas').insert({
      lead_id: caso.id,
      titulo: `Reactivar: «no era el momento» hace ${dias} días`,
      vence_at: new Date(Date.now() + DIA_MS).toISOString(),
      responsable_id: responsable,
    });
    if (error) continue;

    await admin
      .from('leads')
      .update({ reactivacion_propuesta_at: new Date().toISOString() })
      .eq('id', caso.id);

    await avisar(admin, [
      {
        usuario_id: responsable,
        tipo: 'tarea_asignada',
        lead_id: caso.id,
        mensaje: `Toca retomar a ${caso.nombre}: se perdió por «no es el momento» hace ${dias} días`,
        clave: `reactivacion:${caso.id}`,
      },
    ]);
    creadas++;
  }

  if (omitidasPorBaja > 0) {
    console.info(`[reactivacion] ${omitidasPorBaja} caso(s) omitido(s): el contacto pidió la baja.`);
  }

  return creadas;
}

// ---------------------------------------------------------------------------
// 3. PETICIÓN DE RESEÑA
//
// Tras validar una conversión se propone pedir reseña en Google. La propuesta
// es una TAREA, no un envío: quien conoce a la familia decide si procede y
// cuándo. La plataforma nunca escribe sola a un paciente.
// ---------------------------------------------------------------------------
async function proponerResenas(admin: Cliente, activa: boolean): Promise<number> {
  if (!activa) return 0;

  const { data: conversiones } = await admin
    .from('conversiones')
    .select(
      'id, lead_id, lead:leads (nombre, propietario_id, centro:centros (nombre, url_resena_google))',
    )
    .eq('estado', 'validada')
    .is('resena_propuesta_at', null)
    .limit(50);

  if (!conversiones || conversiones.length === 0) return 0;

  let creadas = 0;
  for (const conversion of conversiones) {
    const propietario = conversion.lead?.propietario_id;
    if (!propietario) continue;

    /*
     * Sin enlace del centro no se propone nada. Una tarea de «pedir reseña»
     * sin sitio donde dejarla solo hace perder el tiempo a quien la abre, y
     * la reseña de Bellamar en la ficha de Horizonte no le sirve a nadie.
     */
    const centro = conversion.lead?.centro as
      | { nombre: string; url_resena_google: string | null }
      | null;
    if (!centro?.url_resena_google) continue;

    /*
     * A una PERSONA se le pide una vez, aunque aparezca en varios casos. La
     * marca estaba en la conversión, así que una madre con dos hijos en
     * tratamiento habría recibido dos peticiones — exactamente la clase de
     * detalle que hace quedar mal a un centro.
     */
    const { data: vinculos } = await admin
      .from('lead_contactos')
      .select('contacto_id, es_principal, contacto:contactos (id, resena_pedida_at, consentimiento_marketing)')
      .eq('lead_id', conversion.lead_id)
      .order('es_principal', { ascending: false });

    const destinatario = (vinculos ?? [])
      .map((v) => v.contacto as { id: string; resena_pedida_at: string | null; consentimiento_marketing: boolean | null } | null)
      .find((c) => c && !c.resena_pedida_at && c.consentimiento_marketing !== false);

    if (!destinatario) {
      // Nadie a quien pedírsela: se marca la conversión para no volver a mirarla.
      await admin
        .from('conversiones')
        .update({ resena_propuesta_at: new Date().toISOString() })
        .eq('id', conversion.id);
      continue;
    }

    const { error } = await admin.from('tareas').insert({
      lead_id: conversion.lead_id,
      titulo: `Pedir reseña de ${centro.nombre} (plantilla discreta)`,
      vence_at: new Date(Date.now() + 3 * DIA_MS).toISOString(),
      responsable_id: propietario,
    });
    if (error) continue;

    await admin
      .from('contactos')
      .update({ resena_pedida_at: new Date().toISOString() })
      .eq('id', destinatario.id);

    await admin
      .from('conversiones')
      .update({ resena_propuesta_at: new Date().toISOString() })
      .eq('id', conversion.id);
    creadas++;
  }

  return creadas;
}

// ---------------------------------------------------------------------------
// 4. RIESGO DE RECAÍDA (área clínica)
//
// Dos faltas consecutivas a sesión avisan al terapeuta referente. Es una
// señal, no un diagnóstico: quien interpreta es el profesional.
// ---------------------------------------------------------------------------
async function avisarRiesgoRecaida(admin: Cliente, faltasSeguidas: number): Promise<number> {
  const { data: pacientes } = await admin
    .from('pacientes')
    .select('id, nombre, terapeuta_id')
    .eq('estado', 'activo')
    .not('terapeuta_id', 'is', null);

  if (!pacientes || pacientes.length === 0) return 0;

  const { data: sesiones } = await admin
    .from('sesiones')
    .select('paciente_id, estado, inicio')
    .in(
      'paciente_id',
      pacientes.map((p) => p.id),
    )
    .in('estado', ['realizada', 'no_show'])
    .lte('inicio', new Date().toISOString())
    .order('inicio', { ascending: false });

  const porPaciente = new Map<string, { estado: string; inicio: string }[]>();
  for (const s of sesiones ?? []) {
    const lista = porPaciente.get(s.paciente_id) ?? [];
    lista.push({ estado: s.estado, inicio: s.inicio });
    porPaciente.set(s.paciente_id, lista);
  }

  const avisos: Parameters<typeof avisar>[1] = [];
  for (const paciente of pacientes) {
    const historial = porPaciente.get(paciente.id) ?? [];
    const ultimas = historial.slice(0, faltasSeguidas);
    if (ultimas.length < faltasSeguidas) continue;
    if (!ultimas.every((s) => s.estado === 'no_show')) continue;

    avisos.push({
      usuario_id: paciente.terapeuta_id as string,
      tipo: 'riesgo_recaida',
      mensaje: `${paciente.nombre} lleva ${faltasSeguidas} faltas seguidas a sesión`,
      // La clave incluye la última falta: si vuelve a faltar más adelante,
      // el aviso se repite; mientras no cambie nada, no insiste.
      clave: `riesgo:${paciente.id}:${ultimas[0].inicio}`,
    });
  }

  return avisar(admin, avisos);
}

// ---------------------------------------------------------------------------
// 5. SEGUIMIENTO POST-ALTA (fase 7 del método)
// ---------------------------------------------------------------------------
async function seguimientoPostAlta(
  admin: Cliente,
  hitos: number[],
): Promise<{ programados: number; avisados: number }> {
  // 5.1 Programar los hitos de quien ya tiene alta y aún no los tiene.
  const { data: altas } = await admin
    .from('pacientes')
    .select('id, fecha_alta')
    .eq('estado', 'alta')
    .not('fecha_alta', 'is', null)
    .limit(200);

  const filas = (altas ?? []).flatMap((p) =>
    hitos.map((meses) => ({
      paciente_id: p.id,
      hito_meses: meses,
      fecha_prevista: sumarMeses(p.fecha_alta as string, meses),
    })),
  );

  let programados = 0;
  if (filas.length > 0) {
    const { data } = await admin
      .from('seguimientos_post_alta')
      .upsert(filas, { onConflict: 'paciente_id,hito_meses', ignoreDuplicates: true })
      .select('id');
    programados = (data ?? []).length;
  }

  // 5.2 Avisar de los que vencen hoy o ya vencieron.
  const { data: pendientes } = await admin
    .from('seguimientos_post_alta')
    .select('id, hito_meses, fecha_prevista, paciente:pacientes (id, nombre, terapeuta_id)')
    .is('completado_at', null)
    .lte('fecha_prevista', hoyMadrid())
    .limit(100);

  const avisos: Parameters<typeof avisar>[1] = [];
  for (const seguimiento of pendientes ?? []) {
    const terapeuta = seguimiento.paciente?.terapeuta_id;
    if (!terapeuta) continue;
    avisos.push({
      usuario_id: terapeuta,
      tipo: 'seguimiento_post_alta',
      mensaje: `Seguimiento de ${seguimiento.paciente?.nombre} a los ${seguimiento.hito_meses} meses del alta`,
      clave: `postalta:${seguimiento.id}`,
    });
  }

  return { programados, avisados: await avisar(admin, avisos) };
}

// ---------------------------------------------------------------------------
// 6. INFORME MENSUAL
//
// El día 1 se manda a dirección el resumen del mes cerrado. Idempotente por
// la clave del aviso: aunque el motor corra cada quince minutos todo el día 1,
// el correo sale una sola vez.
// ---------------------------------------------------------------------------
async function informeMensual(admin: Cliente): Promise<number> {
  const hoy = hoyMadrid();
  if (!hoy.endsWith('-01')) return 0;

  const mes = mesAnterior();
  const { data: direccion } = await admin
    .from('perfiles')
    .select('id, nombre, email')
    .eq('rol', 'direccion')
    .eq('activo', true);

  if (!direccion || direccion.length === 0) return 0;

  const avisos = direccion.map((d) => ({
    usuario_id: d.id,
    tipo: 'resumen_diario' as TipoNotificacion,
    mensaje: `Informe mensual de ${mes} listo`,
    clave: `informe:${mes}:${d.id}`,
  }));

  const nuevos = await avisar(admin, avisos);
  if (nuevos === 0) return 0;

  /*
   * Se genera el PDF, se guarda en el bucket privado y se envia adjunto.
   *
   * Antes solo salia un correo con el enlace a la pantalla imprimible, y eso
   * obligaba a tener sesion para verlo: direccion no podia reenviarlo al asesor
   * ni archivarlo. El enlace sigue yendo en el cuerpo; lo que se anade es el
   * fichero.
   *
   * Service role a proposito: el informe es del grupo entero y va solo a
   * direccion, que lo ve todo de todas formas.
   */
  const { generarInformeMensual } = await import('@/lib/informe-pdf');
  const resultado = await generarInformeMensual(admin, mes, { enviar: emailConfigurado() });

  if (!resultado.ok) {
    /*
     * Si el PDF falla no se pierde el informe: se manda el correo de siempre con
     * el enlace. Un fallo de maquetacion no puede dejar a direccion sin su
     * informe el dia 1, que es cuando lo mira.
     */
    if (emailConfigurado()) {
      const informe = await calcularInformeMensual(admin, mes);
      const url = `${(process.env.NEXT_PUBLIC_URL_APP ?? '').replace(/\/$/, '')}/panel/informe?mes=${mes}`;
      for (const persona of direccion) {
        if (!persona.email) continue;
        await enviarCorreo({
          para: persona.email,
          asunto: `Informe de ${informe.titulo} — Grupo Vidaitu`,
          cuerpo:
            cuerpoInformeMensual(informe, url) +
            '\n\n(No se pudo adjuntar el PDF: ' +
            resultado.error +
            ')',
        });
      }
    }
  }

  return nuevos;
}

// ---------------------------------------------------------------------------
// 7. DUPLICADOS ENTRE CENTROS
//
// El alta manual solo deduplica contra los casos que quien la hace puede ver.
// No es un descuido: avisarle de un caso en un centro ajeno convertía el
// formulario en una forma de preguntar «¿es esta persona cliente de
// Horizonte?», probando números uno a uno.
//
// El precio es que puede nacer un duplicado entre centros, y lo paga aquí:
// dirección, que sí ve los dos casos, recibe el aviso para unirlos o derivar.
// ---------------------------------------------------------------------------
async function duplicadosEntreCentros(admin: Cliente): Promise<number> {
  const { data: abiertos } = await admin
    .from('leads')
    .select('id, nombre, telefono, centro_id, created_at')
    .not('estado', 'in', '(convertido,perdido,no_valido)')
    .order('created_at');

  if (!abiertos || abiertos.length === 0) return 0;

  const porTelefono = new Map<string, typeof abiertos>();
  for (const lead of abiertos) {
    const lista = porTelefono.get(lead.telefono) ?? [];
    lista.push(lead);
    porTelefono.set(lead.telefono, lista);
  }

  const { data: direccion } = await admin
    .from('perfiles')
    .select('id')
    .eq('rol', 'direccion')
    .eq('activo', true);
  if (!direccion || direccion.length === 0) return 0;

  const avisos: Parameters<typeof avisar>[1] = [];

  for (const [, casos] of porTelefono) {
    if (casos.length < 2) continue;
    // Solo interesa cuando están en centros DISTINTOS: dos casos abiertos en
    // el mismo centro los ve su propio equipo y los resuelve sin ayuda.
    const centros = new Set(casos.map((c) => c.centro_id));
    if (centros.size < 2) continue;

    for (const persona of direccion) {
      avisos.push({
        usuario_id: persona.id,
        tipo: 'lead_nuevo_bandeja',
        lead_id: casos[casos.length - 1].id,
        mensaje: `${casos[0].nombre} tiene ${casos.length} casos abiertos en centros distintos: únelos o deriva`,
        // La clave lleva los ids ordenados: mientras sigan los mismos casos
        // abiertos no vuelve a avisar, y si aparece un tercero sí.
        clave: `duplicado:${casos.map((c) => c.id).sort().join('-')}:${persona.id}`,
      });
    }
  }

  return avisar(admin, avisos);
}

// ---------------------------------------------------------------------------
// 8. RETENCIÓN (RGPD)
//
// Apagada por defecto. El plazo es una decisión jurídica del grupo, y hasta
// que su asesor lo valide la plataforma no anonimiza nada por su cuenta.
// Cuando se enciende, corre una vez al día: anonimizar no es urgente y no
// tiene sentido revisarlo cada quince minutos.
// ---------------------------------------------------------------------------
async function retencion(admin: Cliente, activa: boolean, meses: number): Promise<number> {
  if (!activa) return 0;

  const { data: direccion } = await admin
    .from('perfiles')
    .select('id')
    .eq('rol', 'direccion')
    .eq('activo', true)
    .limit(1)
    .maybeSingle();

  // Sin dirección activa no hay a quién avisar, y sin aviso no hay marca de
  // "ya se hizo hoy": mejor no ejecutar que ejecutar a ciegas cada pasada.
  if (!direccion) return 0;

  // Una marca al día con la clave del aviso: si ya se hizo hoy, no se repite.
  const nuevos = await avisar(admin, [
    {
      usuario_id: direccion.id,
      tipo: 'resumen_diario',
      mensaje: 'Anonimización por retención ejecutada',
      clave: `retencion:${hoyMadrid()}`,
    },
  ]);
  if (nuevos === 0) return 0;

  const resultado = await anonimizar(admin, meses, null);
  return resultado.casos;
}

// ---------------------------------------------------------------------------

/**
 * Todas las automatizaciones de una pasada.
 *
 * Cada una va envuelta en `fase()`: si una revienta, se anota y las demas siguen
 * su camino. Antes esto era un `Promise.all` pelado, y bastaba que fallara una
 * —la de resenas, pongamos— para que la pasada entera se cayera y los leads se
 * quedaran sin repartir. Un fallo en lo accesorio no puede apagar lo esencial.
 *
 * Los fallos se acumulan en el array que se recibe; quien llama los registra.
 */
export async function ejecutarAutomatizaciones(
  admin: Cliente,
  fallos: FalloDeFase[] = [],
): Promise<ResultadoAutomatizacion> {
  const { data: config } = await admin.from('configuracion').select('clave, valor');
  const mapa = new Map((config ?? []).map((f) => [f.clave, f.valor]));

  const hitos = Array.isArray(mapa.get('post_alta_hitos'))
    ? (mapa.get('post_alta_hitos') as number[])
    : [1, 3, 6, 12];

  const [puntuados, etiquetado, reactivaciones, resenas, riesgosRecaida, postAlta, informe] =
    await Promise.all([
      fase('puntuacion', fallos, () => recalcularPuntuaciones(admin), 0),
      fase('etiquetado', fallos, () => ejecutarEtiquetado(admin), {
        reglas: 0,
        etiquetasAplicadas: 0,
      }),
      fase(
        'reactivacion',
        fallos,
        () => reactivarPerdidos(admin, Number(mapa.get('reactivacion_dias')) || 90),
        0,
      ),
      fase('resenas', fallos, () => proponerResenas(admin, mapa.get('resena_activa') !== false), 0),
      fase(
        'riesgo_recaida',
        fallos,
        () => avisarRiesgoRecaida(admin, Number(mapa.get('riesgo_recaida_faltas')) || 2),
        0,
      ),
      fase('post_alta', fallos, () => seguimientoPostAlta(admin, hitos), {
        programados: 0,
        avisados: 0,
      }),
      fase('informe_mensual', fallos, () => informeMensual(admin), 0),
    ]);

  const duplicadosDetectados = await fase(
    'duplicados',
    fallos,
    () => duplicadosEntreCentros(admin),
    0,
  );

  /**
   * Limpieza de los contadores del limite de peticiones. Sin esto la tabla
   * crece para siempre con ventanas ya pasadas. Se llama en cada pasada
   * porque es una sola sentencia y solo borra lo de hace mas de dos dias.
   */
  /*
   * El registro de accesos guarda IP, que es dato personal: se conserva el
   * plazo mas corto que siga sirviendo para detectar un ataque, y lo borra el
   * motor en cada pasada. No hay boton para esto a proposito — una limpieza que
   * depende de que alguien se acuerde no se hace.
   */
  await fase('limpiar_accesos', fallos, () => limpiarAccesos(admin), 0);

  await fase(
    'limpiar_limites',
    fallos,
    async () => {
      await admin.rpc('limpiar_limites');
    },
    undefined,
  );

  const anonimizados = await fase(
    'retencion',
    fallos,
    () =>
      retencion(
        admin,
        mapa.get('retencion_automatica') === true,
        Number(mapa.get('retencion_meses')) || 12,
      ),
    0,
  );

  return {
    puntuados,
    etiquetasAplicadas: etiquetado.etiquetasAplicadas,
    reactivaciones,
    resenas,
    riesgosRecaida,
    seguimientosProgramados: postAlta.programados,
    seguimientosAvisados: postAlta.avisados,
    informeMensual: informe,
    anonimizados,
    duplicadosDetectados,
  };
}
