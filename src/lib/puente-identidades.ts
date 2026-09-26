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
 * El puente es el usuario de Instagram: ZeroChats lo manda como `username` y
 * HighLevel lo guarda en un campo personalizado llamado `ig_username`, que
 * alguien creó antes que nosotros y que resulta ser justo lo que hacía falta.
 *
 * SIN ESTO, lo que sabe ZeroChats —a qué publicación respondió, qué etiquetas
 * le puso el bot— no llega nunca a la ficha de la persona, que es donde lo
 * necesita quien la va a llamar.
 *
 * Se une por el usuario y NUNCA por el nombre. Dos «María García» no son la
 * misma persona; dos cuentas con el mismo usuario de Instagram, sí.
 */

type ContactoHL = { id?: string; customFields?: { id?: string; value?: unknown }[] };

export type ResultadoPuente = { enlazadas: number; sinPareja: number };

export async function enlazarIdentidadesSociales(
  admin: SupabaseClient<Database>,
): Promise<ResultadoPuente> {
  const r: ResultadoPuente = { enlazadas: 0, sinPareja: 0 };

  // Identidades de canal que todavía no saben a quién pertenecen.
  const { filas: sueltas } = await traerTodo((d, h) =>
    admin
      .from('canal_identidades')
      .select('id, usuario, telefono')
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
    admin.from('canal_espejo').select('ref, contenido').eq('tipo', 'contacto').order('id').range(d, h),
  );

  /** usuario de Instagram (en minúsculas) → identificador del contacto en HighLevel. */
  const porUsuario = new Map<string, string>();
  for (const fila of contactosHL) {
    const c = fila.contenido as ContactoHL;
    const valor = campoUsuario
      ? c.customFields?.find((f) => f.id === campoUsuario)?.value
      : undefined;
    if (typeof valor === 'string' && valor.trim()) {
      porUsuario.set(valor.trim().replace(/^@/, '').toLowerCase(), fila.ref);
    }
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
    const refHL = usuario ? porUsuario.get(usuario) : undefined;
    const contactoId = refHL ? personaDe.get(refHL) : undefined;

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
