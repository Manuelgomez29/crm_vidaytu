'use server';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { registrarAcceso } from '@/lib/accesos';
import { ipDeLaPeticion } from '@/lib/limites';

/**
 * Deja constancia del segundo factor.
 *
 * La verificación del código ocurre en el navegador, con el SDK de Supabase, y
 * desde ahí no se puede escribir en el registro de accesos —ni debe poderse—.
 * Así que el cliente avisa y el servidor lo anota, comprobando por su cuenta
 * quién es: nunca se fía del identificador que le manden.
 *
 * Sin esto, el registro contaría como «entró» a quien acertó la contraseña y se
 * quedó atascado en el código, que es justo el caso que más interesa ver.
 */
export async function anotarSegundoFactor(exito: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return;

  const cabeceras = await headers();
  await registrarAcceso(createAdminClient(), {
    email: user.email,
    usuarioId: user.id,
    exito,
    etapa: '2fa',
    motivo: exito ? null : 'codigo',
    ip: ipDeLaPeticion(cabeceras),
    agente: cabeceras.get('user-agent'),
  });
}
