import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { Verificar2FA } from './verificar';
import { SalirDeLaPuerta } from '@/components/salir-de-la-puerta';

/** Segundo paso del acceso: el código de la app de autenticación. */
export default async function Login2FA() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === 'aal2') redirect('/mi-dia');

  /*
   * Si venia de un enlace de recuperacion, este no es el final del camino:
   * todavia tiene que elegir la contraseña. Lo dejo apuntado `/auth/confirmar`.
   */
  const vieneAElegirClave = (await cookies()).get('vd-elegir-clave');
  const siguiente = vieneAElegirClave ? '/establecer-clave' : '/mi-dia';

  const { data: factores } = await supabase.auth.mfa.listFactors();
  const verificados = (factores?.totp ?? []).filter((f) => f.status === 'verified');
  if (verificados.length === 0) redirect('/seguridad');

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="panel p-8">
          <h1 className="text-center text-2xl font-bold tracking-tight">
            Vidaitu <span className="text-coral">DATA</span>
          </h1>
          <p className="mt-1 text-center text-[11px] uppercase tracking-[0.14em] text-muted">
            Verificación en dos pasos
          </p>
          {/*
            Van TODOS los dispositivos, no el primero. Quien tiene dos —el movil
            y el portatil— puede llegar aqui con el que tenga a mano, y si la
            pantalla retara siempre al primero, el codigo del segundo saldria
            «incorrecto» sin que nada explicara por que.
          */}
          <Verificar2FA
            siguiente={siguiente}
            factores={verificados.map((f, i) => ({
              id: f.id,
              nombre: f.friendly_name || `App de autenticación ${i + 1}`,
            }))}
          />
          <SalirDeLaPuerta />
        </div>
      </div>
    </main>
  );
}
