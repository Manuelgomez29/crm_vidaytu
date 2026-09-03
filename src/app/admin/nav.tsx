export function Avisos({ error, aviso }: { error?: string; aviso?: string }) {
  return (
    <>
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}
      {aviso && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">
          {aviso}
        </p>
      )}
    </>
  );
}

export const inputAdmin =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200';
export const botonAdmin =
  'rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-teal-700';
export const botonAdminSecundario =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100';
