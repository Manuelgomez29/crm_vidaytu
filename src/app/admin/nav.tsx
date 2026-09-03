export function Avisos({ error, aviso }: { error?: string; aviso?: string }) {
  return (
    <>
      {error && (
        <p className="mt-3 rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger ring-1 ring-danger/25">
          {error}
        </p>
      )}
      {aviso && (
        <p className="mt-3 rounded-lg bg-ok-soft px-4 py-2 text-sm text-ok ring-1 ring-ok/25">
          {aviso}
        </p>
      )}
    </>
  );
}

export const inputAdmin =
  'rounded-lg border border-line2 bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
export const botonAdmin =
  'rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition hover:bg-primary-hover';
export const botonAdminSecundario =
  'rounded-lg border border-line2 bg-surface px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface2';
