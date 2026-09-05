'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';

export type Pantalla = Database['public']['Enums']['pantalla_vista'];

export type Vista = {
  id: string;
  nombre: string;
  filtros: Record<string, string>;
  es_favorita: boolean;
};

export type Resultado = { ok: true; id?: string } | { ok: false; error: string };

/** Las vistas de esta persona para una pantalla, la última usada primero. */
export async function misVistas(pantalla: Pantalla): Promise<Vista[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('vistas_guardadas')
    .select('id, nombre, filtros, es_favorita')
    .eq('pantalla', pantalla)
    .order('es_favorita', { ascending: false })
    .order('usada_at', { ascending: false });

  return (data ?? []).map((v) => ({
    id: v.id,
    nombre: v.nombre,
    filtros: (v.filtros ?? {}) as Record<string, string>,
    es_favorita: v.es_favorita,
  }));
}

/**
 * Guarda la combinación de filtros que hay puesta ahora mismo.
 *
 * Se guardan los filtros, no los resultados. Por eso una vista no puede filtrar
 * datos hacia dentro ni hacia fuera: al abrirla se vuelven a hacer las mismas
 * consultas de siempre y RLS decide otra vez qué filas salen.
 */
export async function guardarVista(
  pantalla: Pantalla,
  nombre: string,
  filtros: Record<string, string>,
): Promise<Resultado> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesión caducada. Vuelve a entrar.' };

  const limpio = nombre.trim().slice(0, 60);
  if (!limpio) return { ok: false, error: 'Ponle un nombre para reconocerla luego.' };

  const { data, error } = await supabase
    .from('vistas_guardadas')
    .upsert(
      { usuario_id: user.id, pantalla, nombre: limpio, filtros, usada_at: new Date().toISOString() },
      { onConflict: 'usuario_id,pantalla,nombre' },
    )
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  revalidatePath('/leads');
  revalidatePath('/contactos');
  return { ok: true, id: data?.id };
}

/** Marca una vista como la última usada, para poder volver a ella al entrar. */
export async function marcarUsada(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('vistas_guardadas')
    .update({ usada_at: new Date().toISOString() })
    .eq('id', id);
}

export async function alternarFavorita(id: string, valor: boolean): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('vistas_guardadas')
    .update({ es_favorita: valor })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/leads');
  revalidatePath('/contactos');
  return { ok: true };
}

export async function borrarVista(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from('vistas_guardadas').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/leads');
  revalidatePath('/contactos');
  return { ok: true };
}
