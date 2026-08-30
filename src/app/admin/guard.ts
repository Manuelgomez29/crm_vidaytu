import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * La administración es exclusiva de dirección. Se comprueba en el servidor en
 * cada página y en cada acción: la interfaz nunca es la única barrera.
 */
export async function exigirDireccion() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol, nombre')
    .eq('id', user.id)
    .maybeSingle();

  if (perfil?.rol !== 'direccion') {
    redirect(perfil?.rol === 'terapeuta' ? '/agenda' : '/leads');
  }
  return { supabase, user, perfil };
}
