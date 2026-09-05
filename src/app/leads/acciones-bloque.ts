'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type ResultadoBloque = {
  aplicados: number;
  omitidos: number;
  mensaje: string;
};

const MAXIMO = 200;

/**
 * Acciones sobre varios casos a la vez.
 *
 * Todas pasan por el cliente con la sesión de quien las lanza, así que RLS
 * aplica fila a fila: si en la selección hay casos de un centro que esa persona
 * no lleva, esos simplemente no se tocan.
 *
 * Y se DICE cuántos se quedaron fuera. Una acción en bloque que informa «hecho»
 * habiendo cambiado la mitad es peor que una que falla: quien la lanzó se queda
 * convencido de que movió todo.
 */
async function aplicar(
  ids: string[],
  cambio: Record<string, string | null>,
  nombreAccion: string,
): Promise<ResultadoBloque> {
  const supabase = await createClient();
  const seleccion = ids.slice(0, MAXIMO);

  const { data, error } = await supabase
    .from('leads')
    .update(cambio as never)
    .in('id', seleccion)
    .select('id');

  if (error) {
    return { aplicados: 0, omitidos: seleccion.length, mensaje: `No se pudo: ${error.message}` };
  }

  const aplicados = (data ?? []).length;
  const omitidos = seleccion.length - aplicados;

  revalidatePath('/leads');
  revalidatePath('/mi-dia');

  return {
    aplicados,
    omitidos,
    mensaje:
      omitidos === 0
        ? `${nombreAccion}: ${aplicados} caso(s).`
        : `${nombreAccion}: ${aplicados} de ${seleccion.length}. ${omitidos} se quedaron fuera porque no puedes editarlos.`,
  };
}

export async function reasignarSeleccion(ids: string[], propietarioId: string) {
  return aplicar(ids, { propietario_id: propietarioId || null }, 'Propietario cambiado');
}

export async function moverSeleccion(ids: string[], etapaId: string) {
  return aplicar(ids, { etapa_id: etapaId }, 'Movidos de etapa');
}

export async function urgenciaSeleccion(ids: string[], urgencia: string) {
  return aplicar(ids, { urgencia: urgencia || null }, 'Urgencia cambiada');
}

/**
 * Aplicar una etiqueta a los contactos de los casos seleccionados.
 *
 * Las etiquetas viven en la persona, no en el caso (regla 5): el directorio es
 * global y deduplicado. Por eso esto salta del caso a sus contactos, y por eso
 * puede tocar a alguien que aparezca en dos casos distintos.
 */
export async function etiquetarSeleccion(
  ids: string[],
  etiquetaId: string,
): Promise<ResultadoBloque> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { aplicados: 0, omitidos: ids.length, mensaje: 'Sesión caducada.' };

  const seleccion = ids.slice(0, MAXIMO);

  const { data: vinculos } = await supabase
    .from('lead_contactos')
    .select('contacto_id')
    .in('lead_id', seleccion);

  const contactos = [...new Set((vinculos ?? []).map((v) => v.contacto_id))];
  if (contactos.length === 0) {
    return { aplicados: 0, omitidos: seleccion.length, mensaje: 'Esos casos no tienen contactos.' };
  }

  const { data, error } = await supabase
    .from('contacto_etiquetas')
    .upsert(
      contactos.map((contacto_id) => ({
        contacto_id,
        etiqueta_id: etiquetaId,
        aplicada_por: user.id,
      })),
      { onConflict: 'contacto_id,etiqueta_id', ignoreDuplicates: true },
    )
    .select('contacto_id');

  if (error) {
    return { aplicados: 0, omitidos: contactos.length, mensaje: `No se pudo: ${error.message}` };
  }

  const aplicados = (data ?? []).length;
  revalidatePath('/leads');
  revalidatePath('/contactos');

  return {
    aplicados,
    omitidos: contactos.length - aplicados,
    mensaje:
      aplicados === contactos.length
        ? `Etiqueta puesta a ${aplicados} persona(s).`
        : `Etiqueta puesta a ${aplicados} de ${contactos.length}. El resto ya la tenía o no puedes editarlo.`,
  };
}
