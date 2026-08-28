import Link from 'next/link';
import { cerrarSesion } from '@/app/leads/actions';

export function Cabecera({ email }: { email: string }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/leads" className="text-lg font-semibold tracking-tight">
          Vida y Tu <span className="text-teal-600">DATA</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-slate-500 sm:inline">{email}</span>
          <form action={cerrarSesion}>
            <button
              type="submit"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
