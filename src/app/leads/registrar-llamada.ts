'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type SalidaLlamada = 'contactado' | 'no_contesta' | 'cita' | 'perdido';

export type ResultadoLlamada =
  | {
      ok: true;
      mensaje: string;
      /** Enlace de WhatsApp listo, cuando toca insistir por escrito. */
      whatsapp?: { url: string; texto: string; para: string } | null;
      /** A dónde llevar a la persona después, si el paso siguiente vive en otra pantalla. */
      irA?: string;
    }
  | { ok: false; error: string };

const ETIQUETA: Record<SalidaLlamada, string> = {
  contactado: 'Contactado',
  no_contesta: 'No contesta',
  cita: 'Cita agendada',
  perdido: 'Perdido',
};

/**
 * Registrar una llamada en dos toques.
 *
 * Es la acción que más veces al día hace un comercial, y hasta ahora costaba
 * abrir la ficha, elegir tipo, escribir y guardar. Lo que no se registra en
 * caliente no se registra: el caso se queda sin rastro y la cadencia (regla 9)
 * deja de funcionar sola.
 *
 * Cada salida deja además preparado el paso siguiente, que es lo que evita que
 * un caso se enfríe por olvido.
 */
export async function registrarLlamada(
  leadId: string,
  salida: SalidaLlamada,
  motivoPerdidaId?: string,
): Promise<ResultadoLlamada> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesión caducada. Vuelve a entrar.' };

  const { data: lead } = await supabase
    .from('leads')
    .select('id, nombre, telefono, estado, primera_respuesta_at, propietario_id')
    .eq('id', leadId)
    .maybeSingle();
  if (!lead) return { ok: false, error: 'No encuentro ese caso, o no puedes verlo.' };

  const ahora = new Date();

  const { error: errorActividad } = await supabase.from('actividades').insert({
    lead_id: leadId,
    tipo: 'llamada',
    contenido: `Llamada — ${ETIQUETA[salida]}`,
    usuario_id: user.id,
  });
  if (errorActividad) return { ok: false, error: `No se pudo registrar: ${errorActividad.message}` };

  // Llamar es responder: si era la primera, el SLA queda cumplido.
  if (!lead.primera_respuesta_at) {
    await supabase
      .from('leads')
      .update({ primera_respuesta_at: ahora.toISOString() })
      .eq('id', leadId);
  }

  if (salida === 'perdido') {
    if (!motivoPerdidaId) {
      return { ok: false, error: 'Un caso perdido necesita motivo: es lo que hace útil la métrica.' };
    }
    const { error } = await supabase
      .from('leads')
      .update({ estado: 'perdido', motivo_perdida_id: motivoPerdidaId })
      .eq('id', leadId);
    if (error) return { ok: false, error: error.message };

    revalidatePath('/leads');
    revalidatePath(`/leads/${leadId}`);
    revalidatePath('/mi-dia');
    return { ok: true, mensaje: 'Caso marcado como perdido, con su motivo.' };
  }

  if (salida === 'cita') {
    revalidatePath('/leads');
    revalidatePath(`/leads/${leadId}`);
    return {
      ok: true,
      mensaje: 'Llamada registrada. Ahora pon el hueco.',
      irA: `/leads/${leadId}#agenda`,
    };
  }

  if (salida === 'no_contesta') {
    /**
     * Siguiente intento según la cadencia configurada (regla 9). Se cuenta lo
     * ya intentado para no volver a empezar por el día 0 en cada llamada; si se
     * agotó la cadena, la tarea es la de proponer el cierre, que es lo que toca
     * tras cinco intentos sin respuesta.
     */
    const [{ data: config }, { count: intentos }] = await Promise.all([
      supabase.from('configuracion').select('valor').eq('clave', 'cadencia_dias').maybeSingle(),
      supabase
        .from('actividades')
        .select('id', { count: 'exact', head: true })
        .eq('lead_id', leadId)
        .in('tipo', ['llamada', 'whatsapp']),
    ]);

    const cadencia = Array.isArray(config?.valor) ? (config!.valor as number[]) : [0, 1, 3, 7, 14];
    const hechos = intentos ?? 1;
    const agotada = hechos >= cadencia.length;
    const dias = agotada ? 1 : (cadencia[hechos] ?? 1) - (cadencia[hechos - 1] ?? 0);

    const vence = new Date(ahora.getTime() + Math.max(dias, 1) * 86_400_000);
    await supabase.from('tareas').insert({
      lead_id: leadId,
      titulo: agotada
        ? `Sin respuesta tras ${hechos} intentos: proponer cierre`
        : `Intento ${hechos + 1} de ${cadencia.length}: volver a contactar`,
      vence_at: vence.toISOString(),
      responsable_id: lead.propietario_id ?? user.id,
      created_by: user.id,
    });

    /**
     * Plantilla de seguimiento. Nunca menciona el motivo de consulta (regla 12):
     * quien lea el móvil de esa persona por encima del hombro no puede deducir
     * nada. Por eso no dice ni el centro.
     */
    const nombrePila = (lead.nombre ?? '').trim().split(/\s+/)[0] ?? '';
    const texto = `Hola ${nombrePila}, te he llamado y no he podido localizarte. Cuando puedas, dime qué momento te viene bien y hablamos. Un saludo.`;
    const telefono = (lead.telefono ?? '').replace('+', '');

    revalidatePath('/leads');
    revalidatePath(`/leads/${leadId}`);
    revalidatePath('/mi-dia');
    return {
      ok: true,
      mensaje: agotada
        ? `Registrado. Cadencia agotada: se propone el cierre mañana.`
        : `Registrado. Siguiente intento en ${Math.max(dias, 1)} día(s).`,
      whatsapp: telefono ? { url: `https://wa.me/${telefono}?text=${encodeURIComponent(texto)}`, texto, para: lead.nombre } : null,
    };
  }

  revalidatePath('/leads');
  revalidatePath(`/leads/${leadId}`);
  revalidatePath('/mi-dia');
  return { ok: true, mensaje: 'Llamada registrada.' };
}
