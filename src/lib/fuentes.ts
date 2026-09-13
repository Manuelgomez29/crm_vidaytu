import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

type Cliente = SupabaseClient<Database>;

/**
 * Las fuentes de captación: cada landing con su llave y su sitio.
 *
 * Lo que hace distinta a una fuente de un secreto compartido es que la fuente
 * IMPONE a dónde va lo que trae. El centro, el canal y —si procede— la modalidad
 * salen de aquí, no del cuerpo de la petición. Así una landing mal configurada,
 * o una de la que alguien copie el código, no puede meter leads en un centro que
 * no es el suyo.
 */

/**
 * Un token nuevo, y su huella.
 *
 * El token se enseña UNA vez y no se guarda: en la base queda solo el SHA-256.
 * Quien lo pierda no lo recupera, pide otro — que es lo correcto, porque un
 * token que se puede volver a leer desde un panel es un token que acaba en una
 * captura de pantalla en un chat.
 */
export function nuevoToken(): { token: string; hash: string } {
  const token = 'vft_' + crypto.randomBytes(24).toString('base64url');
  return { token, hash: huella(token) };
}

export function huella(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export type Fuente = {
  id: string;
  slug: string;
  nombre: string;
  centro_id: string | null;
  canal_id: string;
  modalidad_id: string | null;
  subcanal: string | null;
};

/**
 * ¿De quién es este token?
 *
 * Se busca por la huella, no por el token: en la base no hay tokens que buscar.
 * Y una fuente apagada no entra —apagarla es la forma de revocar una landing sin
 * borrar su histórico ni romper las métricas de lo que ya trajo—.
 */
export async function fuentePorToken(admin: Cliente, token: string): Promise<Fuente | null> {
  if (!token || token.length < 16) return null;

  const { data } = await admin
    .from('fuentes_captacion')
    .select('id, slug, nombre, centro_id, canal_id, modalidad_id, subcanal')
    .eq('token_hash', huella(token))
    .eq('activa', true)
    .maybeSingle();

  return data ?? null;
}

/**
 * Deja constancia de que la fuente sigue viva.
 *
 * Es lo que permite ver en el panel que una landing lleva tres días sin traer a
 * nadie. Sin esto, una landing rota y una campaña sin demanda se ven igual: no
 * llegan leads.
 *
 * No se deja fallar hacia arriba: que no se pueda apuntar la marca no puede
 * impedir que el lead entre.
 */
export async function apuntarLead(admin: Cliente, fuenteId: string): Promise<void> {
  try {
    const { data } = await admin
      .from('fuentes_captacion')
      .select('total_leads')
      .eq('id', fuenteId)
      .maybeSingle();

    await admin
      .from('fuentes_captacion')
      .update({
        ultimo_lead_at: new Date().toISOString(),
        total_leads: (data?.total_leads ?? 0) + 1,
      })
      .eq('id', fuenteId);
  } catch {
    // Ver arriba.
  }
}
