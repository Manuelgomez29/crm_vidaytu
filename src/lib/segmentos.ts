/**
 * Segmentos dinámicos: una lista de tipo `dinamica` guarda en `filtro` (jsonb)
 * los criterios, y sus miembros se calculan al consultarla — nunca se
 * materializan. Los criterios son SIEMPRE comerciales (etiqueta, zona,
 * consentimiento, canal de entrada): jamás clínicos.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { traerTodo } from '@/lib/paginar';

export type FiltroSegmento = {
  /** Ids de etiquetas que el contacto debe tener (todas). */
  etiquetas?: string[];
  /** Coincidencia parcial sobre la zona. */
  zona?: string;
  /** true = solo con consentimiento; false = solo sin él; ausente = da igual. */
  consentimiento?: boolean;
  /** Solo contactos con email (para envíos futuros). */
  conEmail?: boolean;
};

export function esFiltroVacio(filtro: FiltroSegmento): boolean {
  return (
    (filtro.etiquetas ?? []).length === 0 &&
    !filtro.zona &&
    filtro.consentimiento === undefined &&
    !filtro.conEmail
  );
}

export function describirFiltro(
  filtro: FiltroSegmento,
  nombresEtiquetas: Map<string, string>,
): string {
  const partes: string[] = [];
  for (const id of filtro.etiquetas ?? []) {
    partes.push(`etiqueta «${nombresEtiquetas.get(id) ?? '—'}»`);
  }
  if (filtro.zona) partes.push(`zona contiene «${filtro.zona}»`);
  if (filtro.consentimiento === true) partes.push('con consentimiento de marketing');
  if (filtro.consentimiento === false) partes.push('sin consentimiento de marketing');
  if (filtro.conEmail) partes.push('con email');
  return partes.length > 0 ? partes.join(' · ') : 'sin criterios (no devuelve a nadie)';
}

/** Ids de los contactos que cumplen el filtro de un segmento. */
export async function contactosDelSegmento(
  cliente: SupabaseClient<Database>,
  filtro: FiltroSegmento,
): Promise<string[]> {
  if (esFiltroVacio(filtro)) return [];

  let consulta = cliente.from('contactos').select('id');
  if (filtro.zona) consulta = consulta.ilike('zona', `%${filtro.zona}%`);
  if (filtro.consentimiento !== undefined) {
    consulta = consulta.eq('consentimiento_marketing', filtro.consentimiento);
  }
  if (filtro.conEmail) consulta = consulta.not('email', 'is', null);

  /*
   * PAGINADO, y no por manía: de aquí sale a quién se le manda una campaña.
   * PostgREST corta en mil sin avisar, así que un segmento de mil doscientas
   * personas habría enviado a mil y nadie habría notado que faltaban
   * doscientas — ni las doscientas, ni quien lanzó la campaña.
   */
  const { filas: candidatos } = await traerTodo((d, h) => consulta.range(d, h));
  let ids = candidatos.map((c) => c.id);

  // Todas las etiquetas exigidas (intersección, no unión).
  for (const etiquetaId of filtro.etiquetas ?? []) {
    if (ids.length === 0) break;
    /*
     * Se pregunta por tandas de identificadores en vez de mandarlos todos en
     * un `in(...)`: con varios miles, esa lista no cabe en la URL y la
     * consulta falla entera.
     */
    const permitidos = new Set<string>();
    for (let i = 0; i < ids.length; i += 300) {
      const tanda = ids.slice(i, i + 300);
      const { filas } = await traerTodo((d, h) =>
        cliente
          .from('contacto_etiquetas')
          .select('contacto_id')
          .eq('etiqueta_id', etiquetaId)
          .in('contacto_id', tanda)
          .range(d, h),
      );
      for (const e of filas) permitidos.add(e.contacto_id);
    }
    ids = ids.filter((id) => permitidos.has(id));
  }

  return ids;
}
