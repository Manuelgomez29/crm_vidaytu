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
        <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          <h1 className="text-center text-2xl font-semibold tracking-tight">
            Vida y Tu <span className="text-teal-600">DATA</span>
          </h1>
          <p className="mt-1 text-center text-sm text-slate-500">Accede con tu cuenta</p>

          {error === 'credenciales' && (
            <p
              role="alert"
              className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200"
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
                className="rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Contraseña
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                className="rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
              />
            </label>
            <button
              type="submit"
              className="mt-2 rounded-lg bg-teal-600 px-4 py-2.5 font-medium text-white transition hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-300"
            >
              Entrar
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
