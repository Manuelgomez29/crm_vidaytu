import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Verificar2FA } from './verificar';

/** Segundo paso del acceso: el código de la app de autenticación. */
export default async function Login2FA() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === 'aal2') redirect('/mi-dia');

  const { data: factores } = await supabase.auth.mfa.listFactors();
  const factor = (factores?.totp ?? []).find((f) => f.status === 'verified');
  if (!factor) redirect('/seguridad');

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
          <Verificar2FA factorId={factor.id} />
        </div>
      </div>
    </main>
  );
}
