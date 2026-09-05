/**
 * Envío de correo. Se apoya en Resend si hay clave configurada; si no la hay,
 * la plataforma sigue funcionando: los avisos quedan en `notificaciones` con
 * `email_enviado_at` nulo y se ven en la campana.
 *
 * DISCRECIÓN (regla 12): estos correos van a personal interno, pero aun así
 * nunca incluyen el motivo de consulta. Un correo se reenvía, se imprime o se
 * lee en una pantalla compartida.
 */

export type Correo = {
  para: string;
  asunto: string;
  cuerpo: string;
  /** Versión HTML opcional. El texto plano SIEMPRE viaja: es el que ven los
   *  clientes que bloquean HTML, y sin él muchos filtros marcan spam. */
  html?: string;
  /** Remitente distinto del de la plataforma (campañas de marketing). */
  remitente?: string;
};

export function emailConfigurado(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_REMITENTE);
}

export async function enviarCorreo(correo: Correo): Promise<{ enviado: boolean; error?: string }> {
  if (!emailConfigurado()) {
    return { enviado: false, error: 'Email no configurado (falta RESEND_API_KEY o EMAIL_REMITENTE)' };
  }

  try {
    const respuesta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: correo.remitente || process.env.EMAIL_REMITENTE,
        to: [correo.para],
        subject: correo.asunto,
        text: correo.cuerpo,
        ...(correo.html ? { html: correo.html } : {}),
      }),
    });

    if (!respuesta.ok) {
      return { enviado: false, error: `Resend respondió ${respuesta.status}: ${await respuesta.text()}` };
    }
    return { enviado: true };
  } catch (e) {
    return { enviado: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}

/** Cuerpo del resumen diario, en texto plano y sin datos clínicos. */
export function cuerpoResumenDiario(datos: {
  nombre: string;
  fecha: string;
  leadsNuevos: number;
  sinAsignar: number;
  sinPrimeraRespuesta: number;
  tareasVencidas: number;
  citasHoy: number;
  conversionesPendientes: number;
  url: string;
}): string {
  return [
    `Buenos días, ${datos.nombre}.`,
    '',
    `Resumen de Vidaitu DATA — ${datos.fecha}`,
    '',
    `· Leads nuevos en las últimas 24 h: ${datos.leadsNuevos}`,
    `· Sin propietario asignado: ${datos.sinAsignar}`,
    `· Sin primera respuesta fuera de plazo: ${datos.sinPrimeraRespuesta}`,
    `· Tareas vencidas: ${datos.tareasVencidas}`,
    `· Citas de hoy: ${datos.citasHoy}`,
    `· Conversiones pendientes de validar: ${datos.conversionesPendientes}`,
    '',
    `Entra en la plataforma para verlo en detalle: ${datos.url}`,
  ].join('\n');
}
