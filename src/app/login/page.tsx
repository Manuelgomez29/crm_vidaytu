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
        <div className="panel p-8">
          <h1 className="text-center text-2xl font-bold tracking-tight">
            Vida y Tu <span className="text-coral">DATA</span>
          </h1>
          <p className="mt-1 text-center text-[11px] uppercase tracking-[0.14em] text-muted">Grupo Vida y Tu</p>

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
                className="campo !text-base"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Contraseña
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                className="campo !text-base"
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary mt-2 py-2.5"
            >
              Entrar
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
