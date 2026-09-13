'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { nuevoToken } from '@/lib/fuentes';

/**
 * Crear una fuente es decidir por dónde entra trabajo a la casa, y además puede
 * apuntar a cualquier centro. Eso lo hace la dirección de grupo.
 */
async function exigirGrupo() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol, alcance')
    .eq('id', user.id)
    .maybeSingle();

  if (perfil?.rol !== 'direccion') redirect('/leads');
  if (perfil.alcance !== 'grupo') redirect('/admin');

  return user;
}

export type Resultado = { token?: string; slug?: string; error?: string } | null;

/**
 * Da de alta una landing y devuelve su token.
 *
 * El token se DEVUELVE, no se redirige con él: puesto en la URL acabaría en el
 * historial del navegador y en los registros del servidor y del proxy, que es
 * justo donde no debe estar una llave. La pantalla lo enseña una vez y quien lo
 * pierda pide otro.
 */
export async function crearFuente(_previo: Resultado, formData: FormData): Promise<Resultado> {
  const user = await exigirGrupo();

  const nombre = String(formData.get('nombre') ?? '').trim();
  const slug = String(formData.get('slug') ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const centroId = String(formData.get('centro') ?? '') || null;
  const canalId = String(formData.get('canal') ?? '');
  const modalidadId = String(formData.get('modalidad') ?? '') || null;
  const subcanal = String(formData.get('subcanal') ?? '').trim() || null;

  if (!nombre || !slug) return { error: 'Hacen falta un nombre y un identificador.' };
  if (!canalId)
    return { error: 'Elige por qué canal entra: es lo que sale luego en las métricas.' };

  const { token, hash } = nuevoToken();
  const admin = createAdminClient();

  const { error } = await admin.from('fuentes_captacion').insert({
    slug,
    nombre,
    token_hash: hash,
    centro_id: centroId,
    canal_id: canalId,
    modalidad_id: modalidadId,
    subcanal,
    created_by: user.id,
  });

  if (error) {
    return {
      error: error.message.includes('duplicate')
        ? `Ya hay una fuente con el identificador «${slug}».`
        : `No se pudo crear: ${error.message}`,
    };
  }

  revalidatePath('/admin/captacion');
  return { token, slug };
}

/**
 * Un token nuevo para una fuente que ya existe.
 *
 * Es la forma de revocar uno que se haya filtrado sin perder el histórico de lo
 * que esa landing ha traído. En cuanto se guarda, el viejo deja de valer: hay
 * que cambiarlo en la landing o dejará de entrar nada.
 */
export async function regenerarToken(_previo: Resultado, formData: FormData): Promise<Resultado> {
  await exigirGrupo();

  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Falta la fuente.' };

  const { token, hash } = nuevoToken();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('fuentes_captacion')
    .update({ token_hash: hash })
    .eq('id', id)
    .select('slug')
    .single();

  if (error) return { error: `No se pudo cambiar el token: ${error.message}` };

  revalidatePath('/admin/captacion');
  return { token, slug: data.slug };
}

/** Apagar una fuente la revoca sin borrar lo que ya trajo. */
export async function alternarFuente(id: string, activa: boolean) {
  await exigirGrupo();
  const admin = createAdminClient();
  await admin.from('fuentes_captacion').update({ activa }).eq('id', id);
  revalidatePath('/admin/captacion');
}
