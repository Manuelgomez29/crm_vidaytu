import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Puerta del área clínica.
 *
 * No sustituye a las políticas de la base de datos: un comercial que se
 * saltara esta comprobación seguiría recibiendo cero filas. Lo que hace es
 * devolverle a su área en lugar de enseñarle una pantalla vacía que le haga
 * pensar que hay un error.
 */
export async function exigirAccesoClinico() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('id, nombre, rol, acceso_clinico')
    .eq('id', user.id)
    .maybeSingle();

  const permitido =
    perfil?.rol === 'direccion' || perfil?.rol === 'terapeuta' || perfil?.acceso_clinico === true;

  if (!permitido) {
    redirect(perfil?.rol === 'administracion' ? '/facturacion' : '/leads');
  }

  return {
    supabase,
    perfil: perfil!,
    esDireccion: perfil!.rol === 'direccion',
  };
}
