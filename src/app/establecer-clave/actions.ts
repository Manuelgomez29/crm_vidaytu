'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { enCastellano } from '@/lib/mensajes-clave';

export async function establecerClave(formData: FormData) {
  const clave = String(formData.get('clave') ?? '');
  const repetida = String(formData.get('repetida') ?? '');

  if (clave.length < 10) {
    redirect(
      `/establecer-clave?error=${encodeURIComponent('La contraseña necesita al menos 10 caracteres.')}`,
    );
  }
  if (clave !== repetida) {
    redirect(`/establecer-clave?error=${encodeURIComponent('Las dos contraseñas no coinciden.')}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: clave });
  if (error) {
    redirect(`/establecer-clave?error=${encodeURIComponent(enCastellano(error.message))}`);
  }

  // Ya está usada: si se quedara, el próximo código de 2FA volvería a traer
  // aquí a alguien que solo quería entrar.
  (await cookies()).delete('vd-elegir-clave');

  /*
   * Quien viene de recuperar la contraseña YA tiene segundo factor y ya lo ha
   * dado: mandarlo a `/seguridad` le plantaría delante el alta de un
   * dispositivo que no necesita. Quien acaba de ser invitado no lo tiene, y ese
   * es su siguiente paso obligatorio.
   */
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  redirect(aal?.currentLevel === 'aal2' ? '/mi-dia' : '/seguridad');
}
