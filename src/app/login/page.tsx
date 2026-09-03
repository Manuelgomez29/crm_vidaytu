import { iniciarSesion } from './actions';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl bg-surface p-8 shadow-sm ring-1 ring-line">
          <h1 className="text-center text-2xl font-semibold tracking-tight">
            Vida y Tu <span className="text-primary">DATA</span>
          </h1>
          <p className="mt-1 text-center text-sm text-ink2">Accede con tu cuenta</p>

          {error === 'credenciales' && (
            <p
              role="alert"
              className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger ring-1 ring-danger/25"
            >
              Email o contraseña incorrectos. Revísalos e inténtalo de nuevo.
            </p>
          )}

          <form action={iniciarSesion} className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Email
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                className="rounded-lg border border-line2 px-3 py-2 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Contraseña
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                className="rounded-lg border border-line2 px-3 py-2 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
              />
            </label>
            <button
              type="submit"
              className="mt-2 rounded-lg bg-primary px-4 py-2.5 font-medium text-white transition hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              Entrar
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
