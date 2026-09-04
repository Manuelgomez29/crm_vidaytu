/**
 * Motor de alertas y disciplina comercial. Se ejecuta periódicamente
 * (POST /api/tareas-programadas) y es IDEMPOTENTE: cada aviso lleva una clave
 * única, así que ejecutarlo diez veces al día no genera diez avisos iguales.
 *
 * Lee todos sus parámetros de la tabla `configuracion` (regla 13) y nunca
 * cierra un lead por su cuenta: propone y avisa, la decisión es del comercial.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { ZONA } from '@/lib/fechas';
import { cuerpoResumenDiario, emailConfigurado, enviarCorreo } from '@/lib/email';

type Cliente = SupabaseClient<Database>;
type TipoNotificacion = Database['public']['Enums']['tipo_notificacion'];

export type ResultadoAlertas = {
  sla: number;
  cadencia: number;
  agotados: number;
  presupuestos: number;
  tareasVencidas: number;
  citasProximas: number;
  resumenes: number;
  correosEnviados: number;
  correosPendientes: number;
};

const DIA_MS = 86_400_000;

function hoyMadrid(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: ZONA });
}

async function parametros(admin: Cliente) {
  const { data } = await admin.from('configuracion').select('clave, valor');
  const mapa = new Map((data ?? []).map((f) => [f.clave, f.valor]));
  return {
    slaMinutos: Number(mapa.get('sla_primera_respuesta_minutos')) || 60,
    cadenciaDias: Array.isArray(mapa.get('cadencia_dias'))
      ? (mapa.get('cadencia_dias') as number[])
      : [0, 1, 3, 7, 14],
    alertaPresupuestoDias: Number(mapa.get('alerta_presupuesto_dias')) || 3,
  };
}

/** Inserta avisos ignorando los que ya existían (por su clave). */
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

/** Destinatarios de un aviso sobre un lead: su propietario, o dirección si no tiene. */
function destinatarios(propietarioId: string | null, direccion: string[]): string[] {
  return propietarioId ? [propietarioId] : direccion;
}

export async function ejecutarAlertas(admin: Cliente): Promise<ResultadoAlertas> {
  const config = await parametros(admin);
  const ahora = new Date();
  const hoy = hoyMadrid();

  const [{ data: direccionActiva }, { data: ausenciasHoy }] = await Promise.all([
    admin.from('perfiles').select('id, nombre, email').eq('rol', 'direccion').eq('activo', true),
    admin.from('ausencias').select('perfil_id').lte('desde', hoy).gte('hasta', hoy),
  ]);
  const idsDireccion = (direccionActiva ?? []).map((p) => p.id);
  // Un comercial ausente no recibe alertas: van a dirección (regla 10).
  const ausentes = new Set((ausenciasHoy ?? []).map((a) => a.perfil_id));
  const paraQuien = (propietarioId: string | null) =>
    destinatarios(propietarioId && !ausentes.has(propietarioId) ? propietarioId : null, idsDireccion);

  const resultado: ResultadoAlertas = {
    sla: 0,
    cadencia: 0,
    agotados: 0,
    presupuestos: 0,
    tareasVencidas: 0,
    citasProximas: 0,
    resumenes: 0,
    correosEnviados: 0,
    correosPendientes: 0,
  };

  // ---------------------------------------------------------------------
  // 1. SLA de primera respuesta incumplido
  // ---------------------------------------------------------------------
  const limiteSla = new Date(ahora.getTime() - config.slaMinutos * 60_000).toISOString();
  const { data: sinResponder } = await admin
    .from('leads')
    .select('id, nombre, propietario_id, created_at')
    .is('primera_respuesta_at', null)
    .lt('created_at', limiteSla)
    .not('estado', 'in', '(perdido,no_valido,convertido,derivado)');

  resultado.sla = await avisar(
    admin,
    (sinResponder ?? []).flatMap((lead) =>
      paraQuien(lead.propietario_id).map((usuario_id) => ({
        usuario_id,
        tipo: 'lead_sin_atender' as TipoNotificacion,
        lead_id: lead.id,
        mensaje: `${lead.nombre} lleva más de ${config.slaMinutos} min sin primera respuesta`,
        clave: `sla:${lead.id}:${usuario_id}`,
      })),
    ),
  );

  // ---------------------------------------------------------------------
  // 2. Cadencia de contacto: intentos en los días configurados
  // ---------------------------------------------------------------------
  const { data: enCadencia } = await admin
    .from('leads')
    .select('id, nombre, propietario_id, created_at, actividades (tipo, created_at)')
    .in('estado', ['nuevo', 'contactado', 'reabierto'])
    .gte('created_at', new Date(ahora.getTime() - 60 * DIA_MS).toISOString());

  const avisosCadencia: Parameters<typeof avisar>[1] = [];
  const avisosAgotados: Parameters<typeof avisar>[1] = [];

  for (const lead of enCadencia ?? []) {
    const intentos = (lead.actividades as { tipo: string; created_at: string }[]).filter((a) =>
      ['llamada', 'whatsapp', 'email'].includes(a.tipo),
    ).length;
    const diasDesdeAlta = Math.floor(
      (ahora.getTime() - new Date(lead.created_at).getTime()) / DIA_MS,
    );

    // ¿Toca ya el siguiente intento según la cadencia configurada?
    const intentoQueTocaria = config.cadenciaDias.filter((d) => d <= diasDesdeAlta).length;

    if (intentos >= config.cadenciaDias.length) {
      // Cadencia agotada: se PROPONE perdido, nunca se cierra solo.
      avisosAgotados.push(
        ...paraQuien(lead.propietario_id).map((usuario_id) => ({
          usuario_id,
          tipo: 'lead_sin_atender' as TipoNotificacion,
          lead_id: lead.id,
          mensaje: `${lead.nombre}: agotados los ${config.cadenciaDias.length} intentos sin respuesta. Valora marcarlo como perdido «no respondió»`,
          clave: `cadencia_agotada:${lead.id}:${usuario_id}`,
        })),
      );
    } else if (intentoQueTocaria > intentos) {
      avisosCadencia.push(
        ...paraQuien(lead.propietario_id).map((usuario_id) => ({
          usuario_id,
          tipo: 'lead_sin_atender' as TipoNotificacion,
          lead_id: lead.id,
          mensaje: `${lead.nombre}: toca el intento ${intentos + 1} de ${config.cadenciaDias.length} (${intentos % 2 === 0 ? 'llamada' : 'WhatsApp'})`,
          clave: `cadencia:${lead.id}:${intentos + 1}:${usuario_id}`,
        })),
      );
    }
  }
  resultado.cadencia = await avisar(admin, avisosCadencia);
  resultado.agotados = await avisar(admin, avisosAgotados);

  // ---------------------------------------------------------------------
  // 3. Presupuestos sin respuesta
  // ---------------------------------------------------------------------
  const limitePresupuesto = new Date(
    ahora.getTime() - config.alertaPresupuestoDias * DIA_MS,
  ).toISOString();
  const { data: presupuestos } = await admin
    .from('presupuestos')
    .select('id, lead_id, importe, created_at, lead:leads (nombre, propietario_id, estado)')
    .eq('estado', 'propuesto')
    .lt('created_at', limitePresupuesto);

  resultado.presupuestos = await avisar(
    admin,
    (presupuestos ?? [])
      .filter((p) => p.lead && !['perdido', 'no_valido'].includes(p.lead.estado))
      .flatMap((p) =>
        paraQuien(p.lead!.propietario_id).map((usuario_id) => ({
          usuario_id,
          tipo: 'presupuesto_sin_respuesta' as TipoNotificacion,
          lead_id: p.lead_id,
          mensaje: `${p.lead!.nombre}: presupuesto sin respuesta desde hace ${config.alertaPresupuestoDias} días`,
          clave: `presupuesto:${p.id}:${usuario_id}`,
        })),
      ),
  );

  // ---------------------------------------------------------------------
  // 4. Tareas vencidas
  // ---------------------------------------------------------------------
  const { data: vencidas } = await admin
    .from('tareas')
    .select('id, titulo, lead_id, responsable_id, vence_at, lead:leads (nombre, propietario_id)')
    .is('completada_at', null)
    .lt('vence_at', ahora.toISOString());

  resultado.tareasVencidas = await avisar(
    admin,
    (vencidas ?? []).flatMap((t) =>
      paraQuien(t.responsable_id ?? t.lead?.propietario_id ?? null).map((usuario_id) => ({
        usuario_id,
        tipo: 'tarea_vencida' as TipoNotificacion,
        lead_id: t.lead_id,
        // Una tarea suelta no cuelga de ningún caso: nombrarlo sería mentir.
        mensaje: t.lead?.nombre
          ? `Tarea vencida en ${t.lead.nombre}: ${t.titulo}`
          : `Tarea vencida: ${t.titulo}`,
        clave: `tarea_vencida:${t.id}:${usuario_id}`,
      })),
    ),
  );

  // ---------------------------------------------------------------------
  // 5. Citas de las próximas 24 h (aviso al profesional)
  // ---------------------------------------------------------------------
  const { data: proximas } = await admin
    .from('citas')
    .select('id, inicio, profesional_id, lead:leads (nombre)')
    .eq('estado', 'programada')
    .gte('inicio', ahora.toISOString())
    .lt('inicio', new Date(ahora.getTime() + DIA_MS).toISOString());

  resultado.citasProximas = await avisar(
    admin,
    (proximas ?? []).map((c) => ({
      usuario_id: c.profesional_id,
      tipo: 'cita_proxima' as TipoNotificacion,
      lead_id: null,
      mensaje: `Cita en las próximas 24 h: ${c.lead?.nombre ?? 'sin nombre'} a las ${new Date(
        c.inicio,
      ).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: ZONA })}`,
      clave: `cita_proxima:${c.id}`,
    })),
  );

  // ---------------------------------------------------------------------
  // 6. Resumen diario a dirección
  // ---------------------------------------------------------------------
  const hace24h = new Date(ahora.getTime() - DIA_MS).toISOString();
  const finDeHoy = new Date(`${hoy}T23:59:59`).toISOString();

  const [
    { count: leadsNuevos },
    { count: sinAsignar },
    { count: conversionesPendientes },
    { count: citasHoy },
  ] = await Promise.all([
    admin.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', hace24h),
    admin
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .is('propietario_id', null)
      .not('estado', 'in', '(perdido,no_valido,convertido,derivado)'),
    admin
      .from('conversiones')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'pendiente_validacion'),
    admin
      .from('citas')
      .select('id', { count: 'exact', head: true })
      .gte('inicio', `${hoy}T00:00:00`)
      .lte('inicio', finDeHoy),
  ]);

  const resumenTexto = `Resumen de hoy: ${leadsNuevos ?? 0} leads nuevos · ${sinAsignar ?? 0} sin asignar · ${
    (sinResponder ?? []).length
  } fuera de SLA · ${(vencidas ?? []).length} tareas vencidas · ${citasHoy ?? 0} citas · ${
    conversionesPendientes ?? 0
  } conversiones por validar`;

  resultado.resumenes = await avisar(
    admin,
    idsDireccion.map((usuario_id) => ({
      usuario_id,
      tipo: 'resumen_diario' as TipoNotificacion,
      lead_id: null,
      mensaje: resumenTexto,
      clave: `resumen:${usuario_id}:${hoy}`,
    })),
  );

  // ---------------------------------------------------------------------
  // 7. Envío por correo de lo que aún no se ha enviado
  // ---------------------------------------------------------------------
  const { data: pendientesDeEnviar } = await admin
    .from('notificaciones')
    .select('id, usuario_id, tipo, mensaje, usuario:perfiles (nombre, email, activo)')
    .is('email_enviado_at', null)
    .gte('created_at', hace24h)
    .limit(200);

  const enviables = (pendientesDeEnviar ?? []).filter((n) => n.usuario?.activo && n.usuario.email);
  resultado.correosPendientes = enviables.length;

  if (emailConfigurado()) {
    const url = process.env.NEXT_PUBLIC_URL_APP ?? 'http://localhost:3000';
    for (const aviso of enviables) {
      const esResumen = aviso.tipo === 'resumen_diario';
      const correo = esResumen
        ? {
            para: aviso.usuario!.email,
            asunto: `Vida y Tu DATA — resumen del ${hoy}`,
            cuerpo: cuerpoResumenDiario({
              nombre: aviso.usuario!.nombre,
              fecha: hoy,
              leadsNuevos: leadsNuevos ?? 0,
              sinAsignar: sinAsignar ?? 0,
              sinPrimeraRespuesta: (sinResponder ?? []).length,
              tareasVencidas: (vencidas ?? []).length,
              citasHoy: citasHoy ?? 0,
              conversionesPendientes: conversionesPendientes ?? 0,
              url,
            }),
          }
        : {
            para: aviso.usuario!.email,
            asunto: 'Vida y Tu DATA — aviso',
            cuerpo: `${aviso.mensaje}\n\nEntra en la plataforma: ${url}`,
          };

      const { enviado } = await enviarCorreo(correo);
      if (enviado) {
        await admin
          .from('notificaciones')
          .update({ email_enviado_at: new Date().toISOString() })
          .eq('id', aviso.id);
        resultado.correosEnviados++;
        resultado.correosPendientes--;
      }
    }
  }

  return resultado;
}
