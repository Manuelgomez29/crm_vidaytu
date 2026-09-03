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
import { pesosDesdeConfig, puntuar, type SenalesLead } from '@/lib/scoring';
import { ejecutarEtiquetado } from '@/lib/etiquetado';

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
async function recalcularPuntuaciones(admin: Cliente, pesosCrudos: unknown): Promise<number> {
  const pesos = pesosDesdeConfig(pesosCrudos);

  const { data: casos } = await admin
    .from('leads')
    .select(
      'id, estado, urgencia, quien_contacta, canal_id, primera_respuesta_at, puntuacion, updated_at, canal:canales (slug)',
    )
    .not('estado', 'in', '(convertido,perdido,no_valido,derivado)');

  if (!casos || casos.length === 0) return 0;

  const ids = casos.map((c) => c.id);

  // Última actividad y existencia de presupuesto, en dos consultas y no en 2N.
  const [{ data: actividades }, { data: presupuestos }] = await Promise.all([
    admin.from('actividades').select('lead_id, created_at').in('lead_id', ids),
    admin.from('presupuestos').select('lead_id').in('lead_id', ids),
  ]);

  const ultimaActividad = new Map<string, number>();
  for (const a of actividades ?? []) {
    const ts = Date.parse(a.created_at);
    if (ts > (ultimaActividad.get(a.lead_id) ?? 0)) ultimaActividad.set(a.lead_id, ts);
  }
  const conPresupuesto = new Set((presupuestos ?? []).map((p) => p.lead_id));

  const ahora = Date.now();
  let cambiados = 0;

  for (const caso of casos) {
    const referencia = ultimaActividad.get(caso.id) ?? Date.parse(caso.updated_at);
    const senales: SenalesLead = {
      estado: caso.estado,
      urgencia: caso.urgencia,
      quienContacta: caso.quien_contacta,
      canalSlug: caso.canal?.slug ?? null,
      respondido: caso.primera_respuesta_at !== null,
      tienePresupuesto: conPresupuesto.has(caso.id),
      diasSinActividad: Math.max(0, Math.floor((ahora - referencia) / DIA_MS)),
    };

    const { puntuacion } = puntuar(senales, pesos);
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
async function reactivarPerdidos(admin: Cliente, dias: number): Promise<number> {
  const limite = new Date(Date.now() - dias * DIA_MS).toISOString();

  const { data: motivo } = await admin
    .from('motivos_perdida')
    .select('id')
    .eq('slug', 'no-es-el-momento')
    .maybeSingle();
  if (!motivo) return 0;

  const { data: casos } = await admin
    .from('leads')
    .select('id, nombre, propietario_id, updated_at')
    .eq('estado', 'perdido')
    .eq('motivo_perdida_id', motivo.id)
    .is('reactivacion_propuesta_at', null)
    .lte('updated_at', limite)
    .limit(100);

  if (!casos || casos.length === 0) return 0;

  let creadas = 0;
  for (const caso of casos) {
    if (!caso.propietario_id) continue;

    const { error } = await admin.from('tareas').insert({
      lead_id: caso.id,
      titulo: `Reactivar: «no era el momento» hace ${dias} días`,
      vence_at: new Date(Date.now() + DIA_MS).toISOString(),
      responsable_id: caso.propietario_id,
    });
    if (error) continue;

    await admin
      .from('leads')
      .update({ reactivacion_propuesta_at: new Date().toISOString() })
      .eq('id', caso.id);

    await avisar(admin, [
      {
        usuario_id: caso.propietario_id,
        tipo: 'tarea_asignada',
        lead_id: caso.id,
        mensaje: `Toca retomar a ${caso.nombre}: se perdió por «no es el momento» hace ${dias} días`,
        clave: `reactivacion:${caso.id}`,
      },
    ]);
    creadas++;
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
    .select('id, lead_id, lead:leads (nombre, propietario_id)')
    .eq('estado', 'validada')
    .is('resena_propuesta_at', null)
    .limit(50);

  if (!conversiones || conversiones.length === 0) return 0;

  let creadas = 0;
  for (const conversion of conversiones) {
    const propietario = conversion.lead?.propietario_id;
    if (!propietario) continue;

    const { error } = await admin.from('tareas').insert({
      lead_id: conversion.lead_id,
      titulo: 'Pedir reseña en Google (usar la plantilla discreta)',
      vence_at: new Date(Date.now() + 3 * DIA_MS).toISOString(),
      responsable_id: propietario,
    });
    if (error) continue;

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

export async function ejecutarAutomatizaciones(admin: Cliente): Promise<ResultadoAutomatizacion> {
  const { data: config } = await admin.from('configuracion').select('clave, valor');
  const mapa = new Map((config ?? []).map((f) => [f.clave, f.valor]));

  const hitos = Array.isArray(mapa.get('post_alta_hitos'))
    ? (mapa.get('post_alta_hitos') as number[])
    : [1, 3, 6, 12];

  const [puntuados, etiquetado, reactivaciones, resenas, riesgosRecaida, postAlta] = await Promise.all([
    recalcularPuntuaciones(admin, mapa.get('scoring_pesos')),
    ejecutarEtiquetado(admin),
    reactivarPerdidos(admin, Number(mapa.get('reactivacion_dias')) || 90),
    proponerResenas(admin, mapa.get('resena_activa') !== false),
    avisarRiesgoRecaida(admin, Number(mapa.get('riesgo_recaida_faltas')) || 2),
    seguimientoPostAlta(admin, hitos),
  ]);

  return {
    puntuados,
    etiquetasAplicadas: etiquetado.etiquetasAplicadas,
    reactivaciones,
    resenas,
    riesgosRecaida,
    seguimientosProgramados: postAlta.programados,
    seguimientosAvisados: postAlta.avisados,
  };
}
