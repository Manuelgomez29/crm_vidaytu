'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/**
 * Campos que se pueden tocar desde la tarjeta o la ficha, con el nombre que hay
 * que enseñar en el historial.
 *
 * Es una lista blanca cerrada, no un parámetro libre: el nombre de la columna
 * viaja desde el navegador y acaba dentro de una consulta. Con la lista, lo que
 * no esté aquí no llega a la base.
 */
const CAMPOS = {
  urgencia: 'urgencia',
  propietario_id: 'propietario',
  etapa_id: 'etapa',
  centro_id: 'centro',
} as const;

export type CampoRapido = keyof typeof CAMPOS;

export type ResultadoCambio =
  | { ok: true; anterior: string | null; descripcion: string }
  | { ok: false; error: string };

/**
 * Cambia un campo de un caso y devuelve lo que había antes, para poder
 * deshacer.
 *
 * NO reimplementa las reglas de negocio. Quién puede cambiar un propietario
 * (regla 8), qué centros ve cada uno o qué etapa corresponde a qué estado lo
 * siguen decidiendo las políticas RLS y los triggers. Aquí solo se traduce el
 * rechazo de la base a algo que se pueda leer en pantalla: duplicar esas reglas
 * en una segunda capa es cómo acaban divergiendo.
 */
export async function cambiarCampo(
  leadId: string,
  campo: CampoRapido,
  valor: string | null,
  esReversion = false,
): Promise<ResultadoCambio> {
  if (!(campo in CAMPOS)) return { ok: false, error: 'Ese campo no se puede editar así.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesión caducada. Vuelve a entrar.' };

  const { data: antes } = await supabase
    .from('leads')
    .select(`${campo}, nombre`)
    .eq('id', leadId)
    .maybeSingle();
  if (!antes) return { ok: false, error: 'No encuentro ese caso, o no puedes verlo.' };

  const anterior = (antes as Record<string, unknown>)[campo] as string | null;
  if (anterior === valor) return { ok: true, anterior, descripcion: 'Sin cambios' };

  /**
   * El nombre de la columna es dinámico y TypeScript no puede comprobarlo, así
   * que hace falta un molde. Es seguro porque `campo` viene de la lista blanca
   * de arriba: cualquier otro valor sale antes de llegar aquí.
   */
  const cambio = { [campo]: valor } as Record<string, string | null>;

  const { error } = await supabase
    .from('leads')
    .update(cambio as never)
    .eq('id', leadId);

  if (error) {
    return {
      ok: false,
      error: error.message.includes('policy')
        ? 'No tienes permiso para ese cambio. Si es el propietario, lo cambia dirección.'
        : error.message,
    };
  }

  /**
   * El cambio ya queda en `auditoria` por el trigger de la tabla, con sus
   * valores anterior y nuevo. Esta anotación es para las personas: el historial
   * del caso tiene que contar lo que pasó sin que nadie consulte la auditoría.
   */
  await supabase.from('actividades').insert({
    lead_id: leadId,
    tipo: 'cambio_estado',
    contenido: esReversion
      ? `Cambio de ${CAMPOS[campo]} deshecho`
      : `Cambio rápido de ${CAMPOS[campo]}`,
    usuario_id: user.id,
  });

  revalidatePath('/leads');
  revalidatePath(`/leads/${leadId}`);
  revalidatePath('/mi-dia');

  return { ok: true, anterior, descripcion: CAMPOS[campo] };
}
