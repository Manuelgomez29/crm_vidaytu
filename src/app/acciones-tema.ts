'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

type Tema = 'claro' | 'oscuro' | 'sistema';

/**
 * Guarda el tema en el perfil de quien lo cambia.
 *
 * En el perfil y no en el navegador: media plantilla entra desde el móvil y
 * desde el ordenador, y que la aplicación salga de un color en cada sitio es
 * exactamente lo que hace pensar que algo falla.
 */
export async function cambiarTema(tema: Tema): Promise<void> {
  if (!['claro', 'oscuro', 'sistema'].includes(tema)) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('perfiles').update({ tema }).eq('id', user.id);

  // El tema se pinta en el layout raíz: hay que rehacerlo entero.
  revalidatePath('/', 'layout');
}
