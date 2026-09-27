import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { traerTodo } from '@/lib/paginar';

/**
 * El puente entre ZeroChats y HighLevel: la misma persona, dos fichas.
 *
 * Alguien que escribe por Instagram acaba existiendo dos veces sin saberlo:
 * una en ZeroChats, que es quien nos avisa por webhook, y otra en HighLevel,
 * que es donde se la atiende y de donde sale nuestra copia. Son dos registros
 * de la misma persona y hasta ahora no se hablaban.
 *
 * SIN ESTO, lo que sabe ZeroChats —a qué publicación respondió, qué etiquetas
 * le puso el bot— no llega nunca a la ficha de la persona, que es donde lo
 * necesita quien la va a llamar.
 *
 * POR DÓNDE SE UNEN
 *
 * La primera versión buscaba el usuario de Instagram en el campo personalizado
 * `ig_username` de HighLevel. El campo existe, alguien lo creó, y parecía
 * puesto justo para esto. Medido contra la cuenta real: está VACÍO en los 85
 * contactos, también al pedir la ficha de detalle una por una. Nadie lo
 * rellena, así que un puente que dependa de él no enlaza a nadie nunca.
 *
 * Donde sí viaja la identidad es en el CORREO. A quien entra por Instagram,
 * HighLevel le pone un email sintético de una de estas dos formas:
 *
 *   · `<usuario>@instagram.com`   → empareja con el `username` de ZeroChats
 *   · `ig-<IGSID>@instagram.com`  → empareja con su `externalId`
 *
 * Los dos son identificadores exactos. 64 de los 85 contactos traen uno. El
 * campo personalizado se sigue mirando por si algún día lo rellenan, pero ya no
 * es de lo que esto depende.
 *
 * Y EN WHATSAPP, EL TELÉFONO
 *
 * Cuando el embudo de HOME desemboca en un WhatsApp —Instagram, TikTok y
 * Facebook llevando al mismo número—, la identidad ya no es un usuario de
 * Instagram: es el número. Y el número no hace falta buscarlo en HighLevel,
 * porque es la clave con la que este CRM deduplica personas desde el primer día.
 *
 * Por eso el teléfono va PRIMERO: es más directo y no depende de que la copia
 * de la noche haya pasado. Si ese número todavía no está en el directorio, la
 * identidad se queda suelta y se enlaza sola en la siguiente pasada, cuando el
 * volcado de HighLevel cree a la persona. Aquí no se crea a nadie: el directorio
 * tiene un único responsable de escribir en él, y no es este puente.
 *
 * Y NUNCA por el nombre. Dos «María García» no son la misma persona; dos
 * cuentas con el mismo usuario de Instagram, sí.
 */

type ContactoHL = {
  id?: string;
  email?: string | null;
  customFields?: { id?: string; value?: unknown }[];
};

const SUFIJO = '@instagram.com';

/** Teléfonos por consulta: un `in(...)` demasiado largo rompe la URL. */
const LOTE = 300;

export type ResultadoPuente = { enlazadas: number; sinPareja: number };

export async function enlazarIdentidadesSociales(
  admin: SupabaseClient<Database>,
): Promise<ResultadoPuente> {
  const r: ResultadoPuente = { enlazadas: 0, sinPareja: 0 };

  // Identidades de canal que todavía no saben a quién pertenecen.
  const { filas: sueltas } = await traerTodo((d, h) =>
    admin
      .from('canal_identidades')
      .select('id, usuario, telefono, ref_plataforma')
      .is('contacto_id', null)
      .neq('sistema', 'highlevel')
      .order('id')
      .range(d, h),
  );

  if (sueltas.length === 0) return r;

  /*
   * Qué campo de HighLevel guarda el usuario de Instagram. Se busca por su
   * nombre en vez de fijar el identificador: los identificadores de campo son
   * de esta subcuenta, y dejarlos escritos aquí ataría el código a una cuenta
   * concreta.
   */
  const { data: campos } = await admin
    .from('canal_espejo')
    .select('ref, contenido')
    .eq('tipo', 'campo');

  const campoUsuario = (campos ?? []).find((c) => {
    const x = c.contenido as { name?: string; fieldKey?: string };
    const texto = `${x.name ?? ''} ${x.fieldKey ?? ''}`.toLowerCase();
    return texto.includes('ig_username') || texto.includes('instagram');
  })?.ref;

  const { filas: contactosHL } = await traerTodo((d, h) =>
    admin
      .from('canal_espejo')
      .select('ref, contenido')
      .eq('tipo', 'contacto')
      .order('id')
      .range(d, h),
  );

  /** usuario de Instagram (en minúsculas) → identificador del contacto en HighLevel. */
  const porUsuario = new Map<string, string>();
  /** IGSID → identificador del contacto en HighLevel. */
  const porIgsid = new Map<string, string>();

  for (const fila of contactosHL) {
    const c = fila.contenido as ContactoHL;

    // 1. El correo sintético, que es de donde sale casi todo.
    const correo = String(c.email ?? '')
      .trim()
      .toLowerCase();
    if (correo.endsWith(SUFIJO)) {
      const local = correo.slice(0, -SUFIJO.length);
      const soloIgsid = /^ig-(\d+)$/.exec(local);
      if (soloIgsid) porIgsid.set(soloIgsid[1], fila.ref);
      else if (local) porUsuario.set(local, fila.ref);
    }

    // 2. Y el campo personalizado, si alguien empieza a rellenarlo.
    const valor = campoUsuario
      ? c.customFields?.find((f) => f.id === campoUsuario)?.value
      : undefined;
    if (typeof valor === 'string' && valor.trim()) {
      porUsuario.set(valor.trim().replace(/^@/, '').toLowerCase(), fila.ref);
    }
  }

  /*
   * Las personas del directorio que tienen uno de esos números.
   *
   * Por lotes: un `in(...)` con miles de teléfonos no cabe en la URL, y ese
   * fallo no aparece hasta que hay volumen.
   */
  const telefonos = [...new Set(sueltas.map((s) => s.telefono).filter(Boolean) as string[])];
  const porTelefono = new Map<string, string>();
  for (let i = 0; i < telefonos.length; i += LOTE) {
    const { data, error } = await admin
      .from('contactos')
      .select('id, telefono')
      .in('telefono', telefonos.slice(i, i + LOTE));
    if (error) throw new Error('buscando por teléfono: ' + error.message);
    for (const c of data ?? []) if (c.telefono) porTelefono.set(c.telefono, c.id);
  }

  // Y a qué persona del directorio corresponde cada contacto de HighLevel.
  const { filas: deHighLevel } = await traerTodo((d, h) =>
    admin
      .from('canal_identidades')
      .select('ref_sistema, contacto_id')
      .eq('sistema', 'highlevel')
      .not('contacto_id', 'is', null)
      .order('id')
      .range(d, h),
  );
  const personaDe = new Map(deHighLevel.map((i) => [i.ref_sistema, i.contacto_id as string]));

  for (const suelta of sueltas) {
    const usuario = (suelta.usuario ?? '').trim().replace(/^@/, '').toLowerCase();
    const igsid = String(suelta.ref_plataforma ?? '').trim();

    /*
     * El teléfono primero, porque no pasa por HighLevel: va directo a la persona
     * del directorio. Después el usuario de Instagram y después el IGSID; para
     * el resultado da igual cuál de los dos —las dos claves son exactas— pero no
     * para lo que se entiende al mirar los datos: el usuario es legible y el
     * IGSID es solo un número largo.
     */
    const porNumero = suelta.telefono ? porTelefono.get(suelta.telefono) : undefined;
    const refHL = porNumero
      ? undefined
      : ((usuario ? porUsuario.get(usuario) : undefined) ??
        (igsid ? porIgsid.get(igsid) : undefined));
    const contactoId = porNumero ?? (refHL ? personaDe.get(refHL) : undefined);

    if (!contactoId) {
      r.sinPareja++;
      continue;
    }

    await admin
      .from('canal_identidades')
      .update({ contacto_id: contactoId, ref_highlevel: refHL })
      .eq('id', suelta.id);
    r.enlazadas++;
  }

  return r;
}
