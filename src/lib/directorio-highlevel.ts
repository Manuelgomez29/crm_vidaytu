import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { normalizarTelefono } from '@/lib/telefonos';
import { traerTodo } from '@/lib/paginar';

/**
 * Los contactos de HighLevel, en el directorio del CRM.
 *
 * Se pidió tenerlos todos en un sitio. Esto los trae, con una condición que
 * define todo lo demás: **entran como PERSONAS, no como casos**.
 *
 * Nada de leads. Sin lead no hay propietario que repartir, ni reloj de SLA que
 * empiece a correr, ni cadencia que avise de un intento pendiente. Si entraran
 * como casos, el motor empezaría a pedir a un equipo que no los trabaja que
 * llame a ochenta y cinco personas que ya está atendiendo otro equipo en otra
 * herramienta. Sería el desastre de los tres leads de prueba, multiplicado.
 *
 * Así que el directorio los enseña, y HighLevel los trabaja.
 */

type Contacto = Database['public']['Tables']['contactos']['Row'];

/** Lo que nos interesa de un contacto de HighLevel. */
type ContactoHL = {
  id?: string;
  firstName?: string | null;
  lastName?: string | null;
  contactName?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  customFields?: { id?: string; value?: unknown }[];
};

function nombreDe(c: ContactoHL): string {
  const compuesto = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  return (c.contactName || c.name || compuesto || 'Sin nombre').trim();
}

export type ResultadoDirectorio = {
  creados: number;
  actualizados: number;
  enlazados: number;
  sinTelefono: number;
};

/**
 * Vuelca el espejo de HighLevel al directorio.
 *
 * LAS REGLAS DE IDENTIDAD, que es donde esto se estropea si se hace deprisa:
 *
 * 1. Si ya hay una identidad registrada para ese contacto de HighLevel, se usa
 *    la persona que tenga enlazada. Es la única forma de que dos pasadas no
 *    creen dos personas.
 * 2. Si trae teléfono y ese teléfono ya está en el directorio, es la misma
 *    persona: se enlaza, no se duplica.
 * 3. Si no, se crea. Sin teléfono si no lo hay — que es el caso normal.
 *
 * Lo que NUNCA se hace es fusionar por nombre. Dos «María García» no son la
 * misma persona, y deshacer una fusión equivocada cuesta mucho más que
 * convivir con un duplicado.
 */
export async function volcarDirectorioDeHighLevel(
  admin: SupabaseClient<Database>,
): Promise<ResultadoDirectorio> {
  const r: ResultadoDirectorio = { creados: 0, actualizados: 0, enlazados: 0, sinTelefono: 0 };

  /*
   * Quien esta en HighLevel es de Metodo HOME: no es una deduccion nuestra,
   * es la regla de negocio —los centros no entran ahi—. Si algun dia deja de
   * serlo, se corrige en el catalogo y aqui, no en ochenta y cinco fichas.
   */
  const { data: home } = await admin
    .from('recorridos')
    .select('id')
    .eq('slug', 'metodo-home')
    .maybeSingle();
  const recorridoHome = home?.id ?? null;

  // Paginado: a cuarenta contactos nuevos al día, esto cruza las mil filas
  // —donde PostgREST corta sin avisar— en menos de un mes.
  const { filas: espejados } = await traerTodo((d, h) =>
    admin
      .from('canal_espejo')
      .select('ref, contenido')
      .eq('sistema', 'highlevel')
      .eq('tipo', 'contacto')
      .order('id')
      .range(d, h),
  );

  if (espejados.length === 0) return r;

  // Las identidades ya conocidas de HighLevel, para no volver a crear a nadie.
  const { filas: identidades } = await traerTodo((d, h) =>
    admin
      .from('canal_identidades')
      .select('id, ref_sistema, contacto_id')
      .eq('sistema', 'highlevel')
      .order('id')
      .range(d, h),
  );
  const porRef = new Map(identidades.map((i) => [i.ref_sistema, i]));

  for (const fila of espejados) {
    const c = fila.contenido as ContactoHL;
    const nombre = nombreDe(c);
    const crudo = (c.phone ?? '').trim();
    const telefono = crudo ? normalizarTelefono(crudo) : null;
    if (!telefono) r.sinTelefono++;

    const email = (c.email ?? '').trim() || null;
    const zona = (c.city ?? '').trim() || null;

    // --- 1. ¿Ya sabemos quién es? -------------------------------------------
    const conocida = porRef.get(fila.ref);
    let contactoId = conocida?.contacto_id ?? null;

    // --- 2. ¿Lo conocemos por su teléfono? ----------------------------------
    if (!contactoId && telefono) {
      const { data: mismo } = await admin
        .from('contactos')
        .select('id')
        .eq('telefono', telefono)
        .maybeSingle();
      if (mismo) {
        contactoId = mismo.id;
        r.enlazados++;
      }
    }

    // --- 3. Si no, nace ------------------------------------------------------
    if (!contactoId) {
      const { data: nuevo, error } = await admin
        .from('contactos')
        .insert({ nombre, telefono, email, zona, origen: 'highlevel', recorrido_id: recorridoHome })
        .select('id')
        .single();
      if (error || !nuevo) continue;
      contactoId = nuevo.id;
      r.creados++;
    } else {
      /*
       * Solo se RELLENA lo que falta; no se pisa lo que ya hay. Si alguien
       * corrigió un nombre a mano en el CRM, la copia de esta noche no puede
       * deshacérselo: la corrección humana vale más que el dato de origen.
       */
      const { data: actual } = await admin
        .from('contactos')
        .select('nombre, telefono, email, zona, origen, recorrido_id')
        .eq('id', contactoId)
        .maybeSingle();

      const parche: Partial<Contacto> = {};
      if (actual && !actual.telefono && telefono) parche.telefono = telefono;
      // Si ya estaba por otra vía (un formulario, por ejemplo), su origen es
      // aquel: la primera vez que supimos de esa persona manda.
      if (actual && !actual.origen) parche.origen = 'highlevel';
      if (actual && !actual.recorrido_id && recorridoHome) parche.recorrido_id = recorridoHome;
      if (actual && !actual.email && email) parche.email = email;
      if (actual && !actual.zona && zona) parche.zona = zona;
      if (Object.keys(parche).length > 0) {
        await admin.from('contactos').update(parche).eq('id', contactoId);
        r.actualizados++;
      }
    }

    // --- 4. Y queda apuntado de dónde viene ---------------------------------
    await admin.from('canal_identidades').upsert(
      {
        sistema: 'highlevel',
        plataforma: 'highlevel',
        ref_sistema: fila.ref,
        ref_highlevel: fila.ref,
        nombre,
        telefono,
        email,
        contacto_id: contactoId,
        ultimo_evento_at: new Date().toISOString(),
      },
      { onConflict: 'sistema,ref_sistema' },
    );
  }

  return r;
}
