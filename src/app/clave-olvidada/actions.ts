'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { dentroDelLimite, ipDeLaPeticion } from '@/lib/limites';
import { registrarAcceso } from '@/lib/accesos';

/**
 * Pide el enlace para volver a entrar.
 *
 * TRES DECISIONES, y ninguna es obvia:
 *
 * 1. LA RESPUESTA ES SIEMPRE LA MISMA. Da igual que el correo exista, que esté
 *    dado de baja o que no lo haya visto nunca: «si esa dirección es de una
 *    cuenta, te acaba de llegar un correo». Un formulario que distinga es una
 *    lista de quién trabaja aquí, y esta es pública: cualquiera puede ir
 *    probando direcciones hasta que una conteste distinto. El mismo motivo por
 *    el que el login tiene un solo mensaje de error.
 *
 * 2. A QUIEN ESTÁ DE BAJA NO SE LE MANDA NADA. Su cuenta sigue existiendo
 *    —porque su trabajo tiene que seguir teniendo autor (regla 8)— pero no
 *    debe poder volver a entrar. Si el enlace le llegara, un ex-empleado
 *    recuperaría el acceso él solo, y con él la base de contactos entera.
 *
 * 3. TODO QUEDA REGISTRADO, se mande o no. Varias peticiones seguidas contra
 *    una misma cuenta es lo que se ve ANTES de un robo de cuenta por correo, y
 *    peticiones contra correos que aquí no existen es alguien tanteando. Las
 *    dos cosas son invisibles si no se anotan.
 *
 * El enlace en sí lo manda Supabase con la plantilla del grupo, y aterriza en
 * `/auth/confirmar`. Aquí no se fija ninguna contraseña: una contraseña que
 * haya tecleado otra persona no es de quien la usa.
 */
export async function pedirEnlaceDeAcceso(formData: FormData) {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();

  if (!email) redirect('/clave-olvidada?error=vacio');

  const cabeceras = await headers();
  const ip = ipDeLaPeticion(cabeceras);
  const agente = cabeceras.get('user-agent');
  const admin = createAdminClient();

  // `redirect()` funciona lanzando: anotar ANTES, o no se anota nunca.
  const anotar = (exito: boolean, motivo?: string) =>
    registrarAcceso(admin, { email, exito, etapa: 'recuperacion', motivo, ip, agente });

  /*
   * Límite propio, más apretado que el del login, y por una razón distinta:
   * aquí cada intento MANDA UN CORREO. Sin freno, cualquiera puede gastar la
   * cuota de envíos del proyecto —dejando sin invitaciones al equipo— y de
   * paso llenarle el buzón a una persona concreta.
   *
   * Los dos contadores se consumen siempre, también cuando todo va bien: si
   * solo contaran los fallos, el propio contador diría qué correos existen.
   */
  const [cabeCuenta, cabeIp] = await Promise.all([
    dentroDelLimite('recuperar_por_cuenta', email),
    dentroDelLimite('recuperar_por_ip', ip),
  ]);

  if (!cabeCuenta || !cabeIp) {
    await anotar(false, 'demasiados');
    redirect('/clave-olvidada?error=demasiados');
  }

  const { data: perfil } = await admin
    .from('perfiles')
    .select('email, activo')
    .eq('email', email)
    .maybeSingle();

  if (!perfil) {
    await anotar(false, 'desconocida');
    redirect('/clave-olvidada?enviado=1');
  }

  if (!perfil.activo) {
    await anotar(false, 'inactiva');
    redirect('/clave-olvidada?enviado=1');
  }

  const base = (process.env.NEXT_PUBLIC_URL_APP ?? '').replace(/\/+$/, '');
  const { error } = await admin.auth.resetPasswordForEmail(perfil.email, {
    redirectTo: `${base}/auth/confirmar`,
  });

  await anotar(!error, error ? 'envio' : undefined);
  redirect('/clave-olvidada?enviado=1');
}
