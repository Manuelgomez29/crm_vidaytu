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

  /*
   * POR LOTES, NO UNO A UNO.
   *
   * La primera versión hacía, por cada contacto de HighLevel, entre dos y
   * cuatro viajes a la base en fila. Con 2.575 contactos eso eran cinco
   * minutos, y la pasada del motor que coincidía con la copia diaria llegaba
   * al límite de tiempo de Vercel y la cortaban: desde el 10 de octubre no
   * entraba nadie nuevo en el directorio, y lo que va detrás en esa pasada
   * tampoco se hacía.
   *
   * Ahora se lee una vez lo que hay (el directorio y las identidades), se
   * decide en memoria con LAS MISMAS reglas de arriba, y solo se escribe lo
   * que cambia: las personas nuevas, los huecos que se rellenan, y las
   * identidades en bloque.
   */
  const { filas: directorio } = await traerTodo((d, h) =>
    admin
      .from('contactos')
      .select('id, telefono, email, zona, origen, recorrido_id')
      .order('id')
      .range(d, h),
  );
  const porId = new Map(directorio.map((c) => [c.id, c]));
  /** teléfono → personas con ese teléfono (normalmente una). */
  const porTelefono = new Map<string, string[]>();
  for (const c of directorio) {
    if (!c.telefono) continue;
    porTelefono.set(c.telefono, [...(porTelefono.get(c.telefono) ?? []), c.id]);
  }

  const ahora = new Date().toISOString();
  const identidadesNuevas: Database['public']['Tables']['canal_identidades']['Insert'][] = [];

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
    // Solo si es UNA persona: con dos con el mismo número no se elige a ciegas.
    if (!contactoId && telefono) {
      const mismos = porTelefono.get(telefono) ?? [];
      if (mismos.length === 1) {
        contactoId = mismos[0];
        r.enlazados++;
      }
    }

    // --- 3. Si no, nace ------------------------------------------------------
    if (!contactoId) {
      const { data: nuevo, error } = await admin
        .from('contactos')
        .insert({ nombre, telefono, email, zona, origen: 'highlevel', recorrido_id: recorridoHome })
        .select('id, telefono, email, zona, origen, recorrido_id')
        .single();
      if (error || !nuevo) continue;
      contactoId = nuevo.id;
      porId.set(nuevo.id, nuevo);
      if (telefono) porTelefono.set(telefono, [...(porTelefono.get(telefono) ?? []), nuevo.id]);
      r.creados++;
    } else {
      /*
       * Solo se RELLENA lo que falta; no se pisa lo que ya hay. Si alguien
       * corrigió un nombre a mano en el CRM, la copia de esta noche no puede
       * deshacérselo: la corrección humana vale más que el dato de origen.
       */
      const actual = porId.get(contactoId);
      const parche: Partial<Contacto> = {};
      if (actual && !actual.telefono && telefono) parche.telefono = telefono;
      // Si ya estaba por otra vía (un formulario, por ejemplo), su origen es
      // aquel: la primera vez que supimos de esa persona manda.
      if (actual && !actual.origen) parche.origen = 'highlevel';
      if (actual && !actual.recorrido_id && recorridoHome) parche.recorrido_id = recorridoHome;
      if (actual && !actual.email && email) parche.email = email;
      if (actual && !actual.zona && zona) parche.zona = zona;
      if (actual && Object.keys(parche).length > 0) {
        await admin.from('contactos').update(parche).eq('id', contactoId);
        Object.assign(actual, parche);
        // Como en la base: a partir de ahora se la encuentra por ese número.
        if (parche.telefono) {
          porTelefono.set(parche.telefono, [
            ...(porTelefono.get(parche.telefono) ?? []),
            contactoId,
          ]);
        }
        r.actualizados++;
      }
    }

    // --- 4. Y queda apuntado de dónde viene ---------------------------------
    identidadesNuevas.push({
      sistema: 'highlevel',
      plataforma: 'highlevel',
      ref_sistema: fila.ref,
      ref_highlevel: fila.ref,
      nombre,
      telefono,
      email,
      contacto_id: contactoId,
      ultimo_evento_at: ahora,
    });
  }

  for (let i = 0; i < identidadesNuevas.length; i += 500) {
    const { error } = await admin
      .from('canal_identidades')
      .upsert(identidadesNuevas.slice(i, i + 500), { onConflict: 'sistema,ref_sistema' });
    if (error) throw new Error(`identidades de HighLevel: ${error.message}`);
  }

  return r;
}
