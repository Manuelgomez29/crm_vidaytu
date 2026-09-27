import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { traerTodo } from '@/lib/paginar';

/**
 * Del CRM a HighLevel: que el equipo de HOME vea lo que solo sabe el CRM.
 *
 * Hasta ahora todo iba en un sentido: HighLevel y ZeroChats nos contaban, y
 * nosotros guardábamos. Pero durante el piloto el equipo de Método HOME trabaja
 * en HighLevel, y hay personas que entran POR AQUÍ y allí no existen: la que
 * rellena el formulario de la landing de HOME, la que llama, la que llega
 * recomendada. Si el CRM no las empuja, ese equipo no las ve y nadie las llama.
 *
 * QUÉ SE ENVÍA, Y QUÉ NO
 *
 * Solo lo que hace falta para poder hablar con la persona: nombre, teléfono,
 * correo y de dónde viene. NUNCA notas, motivos, ni nada de la conversación.
 * HighLevel es una herramienta de terceros, de pago y provisional, y esto son
 * datos de categoría especial (regla 11): cada campo que se manda de más es una
 * copia más de un dato de salud fuera de nuestra base. Que alguien esté en el
 * programa ya lo dice la etiqueta; por qué está, no sale de aquí.
 *
 * QUIÉN ENTRA
 *
 * Solo las personas del recorrido de Método HOME, que es lo que se decidió: a
 * HighLevel no se le mezclan los leads de los centros.
 *
 * Y SOLO UNA VEZ, SIN REBOTES
 *
 * Se excluye a quien YA tiene una identidad de HighLevel, que son justamente las
 * que vinieron de allí con la copia nocturna. Sin eso, el volcado de entrada y
 * este envío de salida se pasarían las mismas personas en bucle cada noche.
 * El identificador que devuelve HighLevel se guarda como esa identidad: hace de
 * recibo y de antiduplicado a la vez, porque la tabla tiene índice único por
 * `(sistema, ref_sistema)`.
 */

const BASE = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';

export type ResultadoSalida = {
  creados: number;
  actualizados: number;
  sinDatoDeContacto: number;
  errores: number;
  /**
   * Qué dijo HighLevel cuando falló, hasta tres veces.
   *
   * Un contador de errores a secas no sirve para nada: «1 error» no distingue un
   * token caducado de un teléfono que no le gusta, y el que mira el panel de
   * salud no puede hacer nada con ese número. Se guarda el mensaje, no el dato
   * de la persona.
   */
  detalles?: string[];
  saltada?: 'sin_credencial' | 'sin_recorrido';
};

type RespuestaUpsert = {
  new?: boolean;
  contact?: { id?: string };
};

/**
 * Sube o actualiza el contacto en HighLevel.
 *
 * `upsert` y no `create`: respeta la configuración de duplicados de la cuenta y
 * empareja por teléfono o correo en vez de crear otra ficha. El teléfono ya sale
 * de aquí en E.164 y el correo en minúsculas, que es lo que esa comparación
 * necesita para acertar.
 */
async function upsert(
  token: string,
  cuerpo: Record<string, unknown>,
): Promise<RespuestaUpsert> {
  const r = await fetch(`${BASE}/contacts/upsert`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Version: VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${texto.slice(0, 200)}`);
  const json = JSON.parse(texto) as RespuestaUpsert;
  return json;
}

export async function enviarPendientesAHighLevel(
  admin: SupabaseClient<Database>,
): Promise<ResultadoSalida> {
  const r: ResultadoSalida = {
    creados: 0,
    actualizados: 0,
    sinDatoDeContacto: 0,
    errores: 0,
  };

  const token = process.env.HIGHLEVEL_TOKEN;
  const locationId = process.env.HIGHLEVEL_LOCATION_ID;
  if (!token || !locationId) return { ...r, saltada: 'sin_credencial' };

  const { data: home } = await admin
    .from('recorridos')
    .select('id, nombre')
    .eq('slug', 'metodo-home')
    .maybeSingle();
  if (!home) return { ...r, saltada: 'sin_recorrido' };

  // Quién vino de HighLevel: a esos no se les devuelve nada.
  const { filas: deAlli } = await traerTodo((d, h) =>
    admin
      .from('canal_identidades')
      .select('contacto_id')
      .eq('sistema', 'highlevel')
      .not('contacto_id', 'is', null)
      .order('id')
      .range(d, h),
  );
  const yaEstan = new Set(deAlli.map((i) => i.contacto_id as string));

  const { filas: candidatos } = await traerTodo((d, h) =>
    admin
      .from('contactos')
      .select('id, nombre, telefono, email, origen')
      .eq('recorrido_id', home.id)
      .order('id')
      .range(d, h),
  );

  for (const c of candidatos) {
    if (yaEstan.has(c.id)) continue;

    /*
     * HighLevel necesita al menos teléfono o correo para poder emparejar. Sin
     * ninguno de los dos crearía una ficha suelta imposible de reconciliar, así
     * que se cuenta y se deja: esa persona se enviará cuando se sepa su número.
     */
    if (!c.telefono && !c.email) {
      r.sinDatoDeContacto++;
      continue;
    }

    try {
      const respuesta = await upsert(token, {
        locationId,
        name: c.nombre,
        ...(c.telefono ? { phone: c.telefono } : {}),
        ...(c.email ? { email: c.email.toLowerCase() } : {}),
        source: 'Vidaitu DATA',
        // La etiqueta dice que está en el programa. Nada más.
        tags: ['vidaitu-data', c.origen ? `origen:${c.origen}` : 'origen:crm'],
      });

      const refHL = respuesta.contact?.id;
      if (!refHL) {
        r.errores++;
        continue;
      }

      /*
       * El recibo. Si esa ficha ya estaba enlazada a otra persona nuestra, el
       * índice único lo rechaza y no se toca nada: mejor no enviarla otra vez
       * que machacar un enlace que alguien ya tenía.
       */
      const { error } = await admin.from('canal_identidades').insert({
        sistema: 'highlevel',
        plataforma: 'highlevel',
        ref_sistema: refHL,
        ref_highlevel: refHL,
        contacto_id: c.id,
        nombre: c.nombre,
        telefono: c.telefono,
        email: c.email,
      });
      if (error && error.code !== '23505') throw new Error(error.message);

      if (respuesta.new) r.creados++;
      else r.actualizados++;
    } catch (e) {
      /*
       * Un fallo con una persona no puede parar a las demás: se cuenta y se
       * sigue. Lo que no se envió hoy se reintenta solo esta noche, porque la
       * condición de «pendiente» es no tener recibo.
       */
      r.errores++;
      const motivo = e instanceof Error ? e.message : String(e);
      if (!r.detalles) r.detalles = [];
      if (r.detalles.length < 3 && !r.detalles.includes(motivo)) r.detalles.push(motivo);
    }
  }

  return r;
}
