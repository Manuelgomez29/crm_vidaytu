/**
 * Recordatorios de cita automáticos.
 *
 * DISCRECIÓN (regla 12), que aquí no es un detalle sino el punto entero: este
 * mensaje llega a un teléfono o un correo que puede leer cualquiera de la
 * familia, incluida gente que no sabe nada. Por eso:
 *
 *   · El texto sale de `configuracion.plantilla_recordatorio_cita`, que la
 *     plataforma ya rechaza si menciona el motivo de consulta.
 *   · El asunto es «Confirmación de tu cita» y nada más. Ni el nombre del
 *     centro va en el asunto, porque el asunto se ve en la lista de correos
 *     sin abrir nada.
 *   · Va al contacto CON QUIEN se agendó la cita, no al contacto principal
 *     del caso: si la cita la pidió la madre, el recordatorio es para ella.
 *
 * Por email, que es lo que la plataforma puede enviar hoy. Por WhatsApp hará
 * falta la API de Meta y plantillas aprobadas por ellos.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { ZONA } from '@/lib/fechas';
import { emailConfigurado, enviarCorreo } from '@/lib/email';

type Cliente = SupabaseClient<Database>;

export type ResultadoRecordatorios = { enviados: number; sinDestinatario: number };

const PLANTILLA_POR_DEFECTO =
  'Hola {nombre}, te confirmamos tu cita el {dia} a las {hora} en {lugar}. Un saludo, {profesional}';

/** Nombre de pila. Firmar con el apellido completo suena a carta del banco. */
function nombreDePila(completo: string | null | undefined): string {
  return (completo ?? '').trim().split(/\s+/)[0] ?? '';
}

export async function enviarRecordatoriosCita(admin: Cliente): Promise<ResultadoRecordatorios> {
  if (!emailConfigurado()) return { enviados: 0, sinDestinatario: 0 };

  const { data: config } = await admin
    .from('configuracion')
    .select('clave, valor')
    .in('clave', ['plantilla_recordatorio_cita', 'recordatorios_automaticos']);
  const mapa = new Map((config ?? []).map((c) => [c.clave, c.valor]));

  if (mapa.get('recordatorios_automaticos') !== true) return { enviados: 0, sinDestinatario: 0 };

  const plantilla =
    typeof mapa.get('plantilla_recordatorio_cita') === 'string'
      ? (mapa.get('plantilla_recordatorio_cita') as string)
      : PLANTILLA_POR_DEFECTO;

  /**
   * Ventana de 24 a 26 horas vista. No «las próximas 24 h»: con el motor
   * corriendo cada quince minutos, esa ventana empieza a incluir la cita en
   * cuanto cruza el umbral y habría que llevar la cuenta de a quién ya se le
   * escribió. Con una franja de dos horas y la marca en la fila, cada cita
   * entra una sola vez.
   */
  const desde = new Date(Date.now() + 24 * 3_600_000).toISOString();
  const hasta = new Date(Date.now() + 26 * 3_600_000).toISOString();

  const { data: citas } = await admin
    .from('citas')
    .select(
      `id, inicio, modalidad_cita,
       centro:centros (nombre, direccion),
       profesional:perfiles (nombre),
       contacto:contactos (nombre, email),
       lead:leads (nombre)`,
    )
    .eq('estado', 'programada')
    .is('recordatorio_enviado_at', null)
    .gte('inicio', desde)
    .lte('inicio', hasta);

  if (!citas || citas.length === 0) return { enviados: 0, sinDestinatario: 0 };

  let enviados = 0;
  let sinDestinatario = 0;

  for (const cita of citas) {
    const email = cita.contacto?.email;
    if (!email) {
      // Sin email no se puede avisar, pero la cita se marca igual: si no, el
      // motor la volvería a intentar en cada pasada durante dos horas.
      sinDestinatario++;
      await admin
        .from('citas')
        .update({ recordatorio_enviado_at: new Date().toISOString() })
        .eq('id', cita.id);
      continue;
    }

    const cuando = new Date(cita.inicio);
    const dia = cuando.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: ZONA,
    });
    const hora = cuando.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: ZONA,
    });

    const lugar =
      cita.modalidad_cita === 'presencial'
        ? (cita.centro?.direccion ?? cita.centro?.nombre ?? 'nuestras instalaciones')
        : cita.modalidad_cita === 'videollamada'
          ? 'videollamada (te enviamos el enlace antes)'
          : 'llamada telefónica';

    const cuerpo = plantilla
      .replaceAll('{nombre}', nombreDePila(cita.contacto?.nombre))
      .replaceAll('{dia}', dia)
      .replaceAll('{hora}', hora)
      .replaceAll('{lugar}', lugar)
      .replaceAll('{profesional}', nombreDePila(cita.profesional?.nombre));

    const resultado = await enviarCorreo({
      // El asunto se lee en la bandeja de entrada sin abrir el mensaje: ni
      // centro, ni motivo, ni nada que identifique de qué va.
      para: email,
      asunto: 'Confirmación de tu cita',
      cuerpo,
    });

    await admin
      .from('citas')
      .update({ recordatorio_enviado_at: new Date().toISOString() })
      .eq('id', cita.id);

    if (resultado.enviado) enviados++;
  }

  return { enviados, sinDestinatario };
}
