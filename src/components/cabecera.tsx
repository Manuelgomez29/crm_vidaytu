import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { cerrarSesion, marcarNotificacionesLeidas } from '@/app/leads/actions';
import { fechaCorta } from '@/lib/fechas';

export async function Cabecera({ email }: { email: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Sin usuario no hay nada que pintar: el middleware ya redirige al login.
  if (!user) return null;

  const [{ data: notificaciones }, { data: perfil }] = await Promise.all([
    supabase
      .from('notificaciones')
      .select('id, mensaje, lead_id, leida_at, created_at')
      .order('created_at', { ascending: false })
      .limit(15),
    supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle(),
  ]);

  // El terapeuta solo tiene agenda: no ve leads ni el directorio de contactos.
  const esTerapeuta = perfil?.rol === 'terapeuta';
  const inicio = esTerapeuta ? '/agenda' : '/leads';

  const sinLeer = (notificaciones ?? []).filter((n) => n.leida_at === null).length;

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-baseline gap-4">
          <Link href={inicio} className="text-lg font-semibold tracking-tight">
            Vida y Tu <span className="text-teal-600">DATA</span>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            {!esTerapeuta && (
              <>
                <Link href="/panel" className="text-slate-600 hover:text-teal-700">
                  Panel
                </Link>
                <Link href="/leads" className="text-slate-600 hover:text-teal-700">
                  Leads
                </Link>
              </>
            )}
            <Link href="/agenda" className="text-slate-600 hover:text-teal-700">
              Agenda
            </Link>
            {!esTerapeuta && (
              <Link href="/contactos" className="text-slate-600 hover:text-teal-700">
                Contactos
              </Link>
            )}
            {perfil?.rol === 'direccion' && (
              <Link href="/admin/equipo" className="text-slate-600 hover:text-teal-700">
                Administración
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
              🔔
              {sinLeer > 0 && (
                <span className="rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">
                  {sinLeer}
                </span>
              )}
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-80 max-w-[85vw] rounded-xl bg-white p-2 shadow-lg ring-1 ring-slate-200">
              <div className="flex items-center justify-between px-2 py-1">
                <p className="text-sm font-semibold">Notificaciones</p>
                {sinLeer > 0 && (
                  <form action={marcarNotificacionesLeidas}>
                    <button type="submit" className="text-xs text-teal-700 hover:underline">
                      Marcar leídas
                    </button>
                  </form>
                )}
              </div>
              <ul className="max-h-80 overflow-y-auto">
                {(notificaciones ?? []).length === 0 && (
                  <li className="px-2 py-3 text-sm text-slate-400">Nada por aquí.</li>
                )}
                {(notificaciones ?? []).map((n) => (
                  <li key={n.id}>
                    <Link
                      href={n.lead_id ? `/leads/${n.lead_id}` : '/leads'}
                      className={`block rounded-lg px-2 py-2 text-sm hover:bg-slate-50 ${
                        n.leida_at ? 'text-slate-400' : 'text-slate-700'
                      }`}
                    >
                      {n.mensaje}
                      <span className="block text-xs text-slate-400">{fechaCorta(n.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </details>

          <span className="hidden text-sm text-slate-500 md:inline">{email}</span>
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
