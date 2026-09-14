'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

/**
 * Lo que contesta Supabase, en castellano.
 *
 * `error.message` viene en ingles y se estaba enseñando tal cual, en la unica
 * pantalla por la que pasa TODO el mundo el primer dia. Y no es un detalle de
 * estilo: quien la ve es alguien que ya esta teniendo un problema para entrar,
 * y «New password should be different from the old password» no le dice que ha
 * escrito la de siempre.
 *
 * Lo que no este en la lista se enseña como venga, que es mejor que un «ha
 * habido un error» que no deja avanzar a nadie.
 */
function enCastellano(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes('different from the old')) {
    return 'Esa es la contraseña que ya tenías. Elige otra distinta.';
  }
  if (m.includes('weak') || m.includes('easy to guess')) {
    return 'Esa contraseña es demasiado fácil de adivinar. Prueba con una más larga o menos común.';
  }
  if (m.includes('at least') || m.includes('too short')) {
    return 'La contraseña es demasiado corta: necesita al menos 10 caracteres.';
  }
  if (m.includes('session') || m.includes('jwt') || m.includes('token')) {
    return 'El enlace ha caducado o ya se había usado. Pide otro desde «¿Has olvidado tu contraseña?».';
  }
  if (m.includes('same_password')) return 'Esa es la contraseña que ya tenías. Elige otra distinta.';
  return mensaje;
}

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
