import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { cerrarSesion, marcarNotificacionesLeidas } from '@/app/leads/actions';
import { fechaCorta } from '@/lib/fechas';
import {
  IconoAdmin,
  IconoAgenda,
  IconoCampana,
  IconoContactos,
  IconoLeads,
  IconoMas,
  IconoMenu,
  IconoPanel,
  IconoSalir,
} from './iconos';

export type Seccion = 'panel' | 'leads' | 'agenda' | 'contactos' | 'admin';

type Enlace = { texto: string; href: string };
type Grupo = {
  clave: Seccion;
  texto: string;
  href: string;
  icono: React.ReactNode;
  hijos?: Enlace[];
};

function grupos(rol: string | undefined): Grupo[] {
  if (rol === 'terapeuta') {
    return [{ clave: 'agenda', texto: 'Agenda', href: '/agenda', icono: <IconoAgenda /> }];
  }

  const base: Grupo[] = [
    { clave: 'panel', texto: 'Panel', href: '/panel', icono: <IconoPanel /> },
    { clave: 'leads', texto: 'Leads', href: '/leads', icono: <IconoLeads /> },
    { clave: 'agenda', texto: 'Agenda', href: '/agenda', icono: <IconoAgenda /> },
    {
      clave: 'contactos',
      texto: 'Contactos',
      href: '/contactos',
      icono: <IconoContactos />,
      hijos: [
        { texto: 'Directorio', href: '/contactos' },
        { texto: 'Etiquetas', href: '/contactos/etiquetas' },
        { texto: 'Listas y segmentos', href: '/contactos/listas' },
      ],
    },
  ];

  if (rol === 'direccion') {
    base.push({
      clave: 'admin',
      texto: 'Administración',
      href: '/admin/equipo',
      icono: <IconoAdmin />,
      hijos: [
        { texto: 'Equipo', href: '/admin/equipo' },
        { texto: 'Centros', href: '/admin/centros' },
        { texto: 'Catálogos', href: '/admin/catalogos' },
        { texto: 'Pipelines', href: '/admin/pipelines' },
        { texto: 'Parámetros', href: '/admin/parametros' },
      ],
    });
  }
  return base;
}

function Navegacion({
  seccion,
  subseccion,
  rol,
}: {
  seccion: Seccion;
  subseccion?: string;
  rol: string | undefined;
}) {
  return (
    <nav className="flex flex-col gap-0.5">
      {grupos(rol).map((g) => {
        const activo = g.clave === seccion;
        return (
          <div key={g.clave}>
            <Link
              href={g.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                activo
                  ? 'bg-teal-50 text-teal-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className={activo ? 'text-teal-600' : 'text-slate-400'}>{g.icono}</span>
              {g.texto}
            </Link>

            {/* Las subsecciones solo se despliegan dentro de su sección. */}
            {activo && g.hijos && (
              <div className="mb-1 ml-[1.4rem] flex flex-col gap-0.5 border-l border-slate-200 pl-3 pt-0.5">
                {g.hijos.map((h) => (
                  <Link
                    key={h.href}
                    href={h.href}
                    className={`rounded-md px-2 py-1.5 text-sm transition ${
                      subseccion === h.href
                        ? 'font-medium text-teal-700'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {h.texto}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function Campana({
  notificaciones,
  sinLeer,
}: {
  notificaciones: { id: string; mensaje: string; lead_id: string | null; leida_at: string | null; created_at: string }[];
  sinLeer: number;
}) {
  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2.5 py-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 [&::-webkit-details-marker]:hidden">
        <IconoCampana />
        {sinLeer > 0 && (
          <span className="rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">
            {sinLeer}
          </span>
        )}
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-80 max-w-[85vw] rounded-xl bg-white p-2 shadow-lg ring-1 ring-slate-200">
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
          {notificaciones.length === 0 && (
            <li className="px-2 py-3 text-sm text-slate-400">Nada por aquí.</li>
          )}
          {notificaciones.map((n) => (
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
  );
}

/**
 * Estructura común de la aplicación: barra lateral fija con las secciones,
 * cabecera de página con título y acciones, y el contenido debajo.
 */
export async function AppShell({
  seccion,
  subseccion,
  titulo,
  descripcion,
  acciones,
  ancho = 'ancho',
  children,
}: {
  seccion: Seccion;
  subseccion?: string;
  titulo: string;
  descripcion?: string;
  acciones?: React.ReactNode;
  ancho?: 'ancho' | 'medio' | 'estrecho';
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: notificaciones }, { data: perfil }] = await Promise.all([
    supabase
      .from('notificaciones')
      .select('id, mensaje, lead_id, leida_at, created_at')
      .order('created_at', { ascending: false })
      .limit(15),
    supabase.from('perfiles').select('nombre, rol').eq('id', user.id).maybeSingle(),
  ]);

  const sinLeer = (notificaciones ?? []).filter((n) => n.leida_at === null).length;
  const esTerapeuta = perfil?.rol === 'terapeuta';
  const maxAncho =
    ancho === 'estrecho' ? 'max-w-3xl' : ancho === 'medio' ? 'max-w-5xl' : 'max-w-7xl';

  const marca = (
    <Link href={esTerapeuta ? '/agenda' : '/panel'} className="text-lg font-semibold tracking-tight">
      Vida y Tu <span className="text-teal-600">DATA</span>
    </Link>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Barra lateral fija (a partir de lg) */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="px-5 py-4">{marca}</div>

        {!esTerapeuta && (
          <div className="px-3 pb-3">
            <Link
              href="/leads/nuevo"
              className="flex items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700"
            >
              <IconoMas /> Nuevo lead
            </Link>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-3">
          <Navegacion seccion={seccion} subseccion={subseccion} rol={perfil?.rol} />
        </div>

        <div className="border-t border-slate-200 p-3">
          <p className="truncate px-2 text-sm font-medium text-slate-700">
            {perfil?.nombre ?? user.email}
          </p>
          <p className="truncate px-2 text-xs text-slate-400">{user.email}</p>
          <form action={cerrarSesion}>
            <button
              type="submit"
              className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <IconoSalir /> Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      <div className="lg:pl-60">
        {/* Cabecera de página */}
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className={`mx-auto flex ${maxAncho} items-center gap-3 px-4 py-3 sm:px-6`}>
            {/* Menú desplegable en pantallas estrechas */}
            <details className="relative lg:hidden">
              <summary className="flex cursor-pointer list-none items-center rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
                <IconoMenu />
              </summary>
              <div className="absolute left-0 z-30 mt-2 w-64 rounded-xl bg-white p-3 shadow-lg ring-1 ring-slate-200">
                <div className="mb-2">{marca}</div>
                <Navegacion seccion={seccion} subseccion={subseccion} rol={perfil?.rol} />
                {!esTerapeuta && (
                  <Link
                    href="/leads/nuevo"
                    className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white"
                  >
                    <IconoMas /> Nuevo lead
                  </Link>
                )}
                <form action={cerrarSesion}>
                  <button
                    type="submit"
                    className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                  >
                    <IconoSalir /> Cerrar sesión
                  </button>
                </form>
              </div>
            </details>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold text-slate-900">{titulo}</h1>
              {descripcion && (
                <p className="hidden truncate text-sm text-slate-500 sm:block">{descripcion}</p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {acciones}
              <Campana notificaciones={notificaciones ?? []} sinLeer={sinLeer} />
            </div>
          </div>
        </header>

        <main className={`mx-auto ${maxAncho} px-4 py-6 sm:px-6`}>{children}</main>
      </div>
    </div>
  );
}
