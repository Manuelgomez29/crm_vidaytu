'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function establecerClave(formData: FormData) {
  const clave = String(formData.get('clave') ?? '');
  const repetida = String(formData.get('repetida') ?? '');

  if (clave.length < 10) {
    redirect(`/establecer-clave?error=${encodeURIComponent('La contraseña necesita al menos 10 caracteres.')}`);
  }
  if (clave !== repetida) {
    redirect(`/establecer-clave?error=${encodeURIComponent('Las dos contraseñas no coinciden.')}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: clave });
  if (error) {
    redirect(`/establecer-clave?error=${encodeURIComponent(error.message)}`);
  }

  // El siguiente paso obligatorio es el segundo factor; el middleware ya lleva.
  redirect('/seguridad');
}
