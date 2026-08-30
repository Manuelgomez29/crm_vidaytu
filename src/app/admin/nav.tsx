import Link from 'next/link';

const PESTANAS = [
  { clave: 'equipo', texto: 'Equipo', href: '/admin/equipo' },
  { clave: 'centros', texto: 'Centros', href: '/admin/centros' },
  { clave: 'catalogos', texto: 'Catálogos', href: '/admin/catalogos' },
  { clave: 'pipelines', texto: 'Pipelines', href: '/admin/pipelines' },
  { clave: 'parametros', texto: 'Parámetros', href: '/admin/parametros' },
] as const;

export function NavAdmin({ activo }: { activo: (typeof PESTANAS)[number]['clave'] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-slate-200 pb-2 text-sm">
      {PESTANAS.map((p) => (
        <Link
          key={p.clave}
          href={p.href}
          className={`rounded-lg px-3 py-1.5 font-medium transition ${
            p.clave === activo
              ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-200'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {p.texto}
        </Link>
      ))}
    </nav>
  );
}

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
