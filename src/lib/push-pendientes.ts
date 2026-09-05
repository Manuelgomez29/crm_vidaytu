/**
 * Envío al móvil de los avisos que aún no han salido.
 *
 * Corre en la misma pasada que el motor de alertas, después de que todo lo
 * demás haya creado sus notificaciones. Cada aviso se marca al enviarlo: sin
 * esa marca, una alerta sin leer volvería al móvil cada quince minutos, que es
 * la forma más rápida de que alguien desactive los avisos para siempre.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { enviarPush, pushConfigurado } from '@/lib/push';

type Cliente = SupabaseClient<Database>;
type TipoNotificacion = Database['public']['Enums']['tipo_notificacion'];

/**
 * A dónde lleva cada tipo de aviso al pulsarlo, y con qué título.
 *
 * DISCRECIÓN: los textos son deliberadamente sosos. Una notificación push se
 * ve en la pantalla de bloqueo, y el teléfono de un comercial lo puede coger
 * cualquiera. Nada de nombres de pacientes ni motivos.
 */
const AVISOS: Record<TipoNotificacion, { titulo: string; ruta: string }> = {
  lead_asignado: { titulo: 'Caso asignado', ruta: '/leads' },
  lead_sin_atender: { titulo: 'Caso sin atender', ruta: '/leads' },
  lead_nuevo_bandeja: { titulo: 'Caso nuevo en la bandeja', ruta: '/leads' },
  tarea_asignada: { titulo: 'Tarea nueva', ruta: '/tareas' },
  tarea_vencida: { titulo: 'Tarea vencida', ruta: '/tareas' },
  cita_proxima: { titulo: 'Cita próxima', ruta: '/agenda' },
  presupuesto_sin_respuesta: { titulo: 'Presupuesto sin respuesta', ruta: '/leads' },
  resumen_diario: { titulo: 'Resumen del día', ruta: '/panel' },
  riesgo_recaida: { titulo: 'Aviso clínico', ruta: '/clinica' },
  seguimiento_post_alta: { titulo: 'Seguimiento pendiente', ruta: '/clinica' },
  campana_finalizada: { titulo: 'Campaña terminada', ruta: '/marketing' },
  mensaje_chat: { titulo: 'Mensaje nuevo', ruta: '/clinica/chat' },
};

export async function enviarPushPendientes(
  admin: Cliente,
): Promise<{ enviados: number; dispositivosRetirados: number }> {
  if (!pushConfigurado()) return { enviados: 0, dispositivosRetirados: 0 };

  /**
   * Solo lo reciente. Un aviso de hace tres días ya no es urgente, y si el
   * motor estuvo parado un fin de semana nadie quiere veinte notificaciones
   * de golpe al volver: se marcan como enviadas sin llegar a mandarlas.
   */
  const hace6h = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

  const { data: pendientes } = await admin
    .from('notificaciones')
    .select('id, usuario_id, tipo, mensaje, lead_id, created_at')
    .is('push_enviado_at', null)
    .is('leida_at', null)
    .order('created_at', { ascending: false })
    .limit(200);

  if (!pendientes || pendientes.length === 0) return { enviados: 0, dispositivosRetirados: 0 };

  const viejas = pendientes.filter((n) => n.created_at < hace6h);
  const recientes = pendientes.filter((n) => n.created_at >= hace6h);

  const marcar = async (ids: string[]) => {
    if (ids.length === 0) return;
    await admin
      .from('notificaciones')
      .update({ push_enviado_at: new Date().toISOString() })
      .in('id', ids);
  };

  // Las viejas se descartan: se marcan sin enviar.
  await marcar(viejas.map((n) => n.id));

  let enviados = 0;
  let retirados = 0;

  for (const aviso of recientes) {
    const plantilla = AVISOS[aviso.tipo] ?? { titulo: 'Vidaitu DATA', ruta: '/leads' };
    const resultado = await enviarPush(admin, aviso.usuario_id, {
      titulo: plantilla.titulo,
      cuerpo: aviso.mensaje,
      url: aviso.lead_id ? `/leads/${aviso.lead_id}` : plantilla.ruta,
    });
    enviados += resultado.enviados;
    retirados += resultado.retirados;
    await marcar([aviso.id]);
  }

  return { enviados, dispositivosRetirados: retirados };
}
