import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { establecerClave } from './actions';

/** Donde se fija la contraseña: la primera vez, y cada vez que se recupera. */
export default async function EstablecerClave({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // La deja `/auth/confirmar` con el tipo de enlace que se ha abierto.
  const recuperando = (await cookies()).get('vd-elegir-clave')?.value === 'recuperacion';

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="panel p-8">
          <h1 className="text-center text-2xl font-bold tracking-tight">
            Vidaitu <span className="text-coral">DATA</span>
          </h1>
          <p className="mt-1 text-center text-[11px] uppercase tracking-[0.14em] text-muted">
            {recuperando ? 'Contraseña nueva' : 'Elige tu contraseña'}
          </p>
          <p className="mt-4 text-sm text-ink2">
            {recuperando ? (
              <>
                Estás cambiando la contraseña de <b className="text-ink">{user.email}</b>. La
                anterior deja de servir en cuanto guardes.
              </>
            ) : (
              <>
                Bienvenido, <b className="text-ink">{user.email}</b>. Elige una contraseña y, en el
                paso siguiente, activa la verificación en dos pasos.
              </>
            )}
          </p>

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          )}

          <form action={establecerClave} className="mt-5 flex flex-col gap-3">
            <label className="etiqueta-campo">
              Contraseña (mínimo 10 caracteres)
              <input
                type="password"
                name="clave"
                required
                minLength={10}
                autoComplete="new-password"
                className="campo"
              />
            </label>
            <label className="etiqueta-campo">
              Repítela
              <input
                type="password"
                name="repetida"
                required
                minLength={10}
                autoComplete="new-password"
                className="campo"
              />
            </label>
            <button type="submit" className="btn btn-primary py-2.5">
              Guardar y continuar
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
