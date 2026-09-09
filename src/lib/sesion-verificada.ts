import { createClient } from '@/lib/supabase/server';

/**
 * Sesión con el segundo factor YA dado.
 *
 * El middleware obliga a pasar por el 2FA, pero su `matcher` excluye `/api/`
 * —tiene que hacerlo: los webhooks de formularios, WhatsApp y el cron entran por
 * ahí sin sesión y no se les puede redirigir a una pantalla de login—. El efecto
 * es que las rutas de API se quedaban fuera de esa comprobación.
 *
 * Y se pudo demostrar, que es lo que lo convierte de sospecha en agujero: con
 * una sesión de dirección a la que solo se le había dado la CONTRASEÑA, con el
 * código de dos pasos todavía pendiente, `GET /api/exportar?que=leads` devolvía
 * 200 y el CSV entero —nombre, teléfono, centro, canal, adicción, zona de cada
 * caso—. La misma sesión pidiendo `/panel` recibía un 307 a `/login/2fa`.
 *
 * O sea que el segundo factor protegía las pantallas y no los datos, que es al
 * revés de como sirve: quien roba una contraseña no necesita la interfaz.
 *
 * Se comprueba aquí, en cada ruta, y no ampliando el `matcher`: el middleware
 * tendría que aprenderse qué rutas de API son públicas a propósito, y una lista
 * de excepciones que hay que mantener al día es justo como se abren estos
 * agujeros. Las rutas que se autentican con secreto o firma no usan esto.
 */
export async function sesionVerificada() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, motivo: 'sin sesión' as const };

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  /*
   * `nextLevel === 'aal2'` significa «esta cuenta tiene segundo factor». Si lo
   * tiene y `currentLevel` no ha llegado ahí, la sesión está a medias.
   *
   * Quien todavía no lo ha dado de alta pasa: el middleware ya lo manda a
   * activarlo, y bloquearlo aquí dejaría a una cuenta nueva sin poder ni
   * descargarse nada mientras lo configura.
   */
  if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
    return { supabase, user: null, motivo: 'falta el segundo factor' as const };
  }

  return { supabase, user, motivo: null };
}
