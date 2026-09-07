'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dentroDelLimite, ipDeLaPeticion } from '@/lib/limites';
import { registrarAcceso } from '@/lib/accesos';

export async function iniciarSesion(formData: FormData) {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    redirect('/login?error=credenciales');
  }

  const cabeceras = await headers();
  const agente = cabeceras.get('user-agent');
  const ip = ipDeLaPeticion(cabeceras);

  /*
   * Todo intento deja rastro, y `redirect()` de Next funciona lanzando: hay que
   * escribir ANTES de redirigir o no se escribe nunca.
   */
  const anotar = (exito: boolean, motivo?: string) =>
    registrarAcceso(createAdminClient(), {
      email,
      exito,
      etapa: 'clave',
      motivo,
      ip,
      agente,
    });

  /**
   * Dos límites, y el orden importa.
   *
   * Por CUENTA es el que de verdad frena un ataque de fuerza bruta: la
   * dirección de correo no se puede falsificar en el formulario, porque es
   * justo la cuenta que se quiere reventar.
   *
   * Por IP frena a quien prueba muchas cuentas distintas. Es el más fácil de
   * esquivar —rotando IPs, o falsificando la cabecera si alguien llega al
   * servidor sin pasar por el proxy—, y por eso nunca va solo.
   *
   * Los dos se consumen SIEMPRE, también cuando la contraseña es correcta: si
   * solo contara los fallos, un atacante sabría por el propio contador cuándo
   * ha acertado.
   */
  const [cabeCuenta, cabeIp] = await Promise.all([
    dentroDelLimite('login_por_cuenta', email),
    dentroDelLimite('login_por_ip', ip),
  ]);

  if (!cabeCuenta || !cabeIp) {
    await anotar(false, 'demasiados');
    redirect('/login?error=demasiados');
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    await anotar(false, 'credenciales');
    // Un solo mensaje para «no existe» y para «contraseña incorrecta»: dos
    // mensajes distintos convierten el login en una lista de quién trabaja aquí.
    redirect('/login?error=credenciales');
  }

  await anotar(true);
  redirect('/mi-dia');
}
