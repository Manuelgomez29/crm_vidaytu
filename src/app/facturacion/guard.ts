import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Puerta de la administración económica.
 *
 * El rol `administracion` ve el dinero de los tres centros pero NO el área
 * clínica ni las notas de los casos: para facturar hace falta saber a quién y
 * cuánto, no por qué vino esa persona.
 */
export async function exigirAccesoEconomico() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('id, nombre, rol')
    .eq('id', user.id)
    .maybeSingle();

  if (perfil?.rol !== 'direccion' && perfil?.rol !== 'administracion') {
    redirect(perfil?.rol === 'terapeuta' ? '/agenda' : '/leads');
  }

  return { supabase, perfil: perfil!, esDireccion: perfil!.rol === 'direccion' };
}
