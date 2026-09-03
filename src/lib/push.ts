/**
 * Notificaciones push (PWA).
 *
 * Sirven para lo que el correo no cubre: un lead entra en la bandeja de grupo
 * un sábado por la tarde y alguien tiene que verlo en el móvil. La plataforma
 * se usa mitad en el móvil, así que esto no es un adorno.
 *
 * Las claves VAPID se generan una vez con `npm run push:claves` y se guardan
 * en el entorno del servidor. Sin ellas, todo lo demás sigue funcionando: los
 * avisos se quedan en la campana y en el correo.
 *
 * DISCRECIÓN (regla 12): una notificación push aparece en la pantalla de
 * bloqueo, donde la puede leer cualquiera que tenga el teléfono delante. Por
 * eso el texto nunca incluye el motivo de consulta ni el nombre completo del
 * paciente — solo lo justo para saber que hay que abrir la aplicación.
 */
import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

type Cliente = SupabaseClient<Database>;

export function pushConfigurado(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.EMAIL_REMITENTE,
  );
}

function configurar() {
  webpush.setVapidDetails(
    `mailto:${(process.env.EMAIL_REMITENTE ?? '').replace(/.*<|>.*/g, '') || 'admin@vidaytu.es'}`,
    process.env.VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string,
  );
}

export type AvisoPush = {
  titulo: string;
  cuerpo: string;
  url?: string;
};

/**
 * Envía un aviso a todos los dispositivos de una persona. Las suscripciones
 * que el navegador ya no reconoce (404/410) se borran: son móviles perdidos,
 * desinstalaciones o permisos revocados, y reintentarlas eternamente solo
 * ralentiza cada pasada del motor.
 */
export async function enviarPush(
  admin: Cliente,
  perfilId: string,
  aviso: AvisoPush,
): Promise<{ enviados: number; retirados: number }> {
  if (!pushConfigurado()) return { enviados: 0, retirados: 0 };
  configurar();

  const { data: suscripciones } = await admin
    .from('push_suscripciones')
    .select('id, endpoint, p256dh, auth')
    .eq('perfil_id', perfilId);

  if (!suscripciones || suscripciones.length === 0) return { enviados: 0, retirados: 0 };

  let enviados = 0;
  let retirados = 0;

  for (const s of suscripciones) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(aviso),
      );
      enviados++;
      await admin
        .from('push_suscripciones')
        .update({ ultimo_uso_at: new Date().toISOString() })
        .eq('id', s.id);
    } catch (e) {
      const codigo = (e as { statusCode?: number }).statusCode;
      if (codigo === 404 || codigo === 410) {
        await admin.from('push_suscripciones').delete().eq('id', s.id);
        retirados++;
      }
    }
  }

  return { enviados, retirados };
}
