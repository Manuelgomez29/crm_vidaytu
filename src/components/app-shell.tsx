import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { cerrarSesion, marcarNotificacionesLeidas } from '@/app/leads/actions';
import { fechaCorta } from '@/lib/fechas';
import { IconoCampana, IconoLupa, IconoMenu, IconoSalir } from './iconos';
import { BotonAtras } from './boton-atras';

export type Seccion =
  | 'panel'
  | 'leads'
  | 'tareas'
  | 'agenda'
  | 'contactos'
  | 'marketing'
  | 'clinica'
  | 'chat'
  | 'facturacion'
  | 'admin';

type Entrada = { clave: Seccion; texto: string; href: string; icono: string };
type Bloque = { titulo: string; entradas: Entrada[] };

export type PerfilNav = { rol: string | undefined; accesoClinico: boolean };

/**
 * La navegación es el muro hecho visible: un comercial no ve el área clínica,
 * y un terapeuta no ve pipeline ni dinero. Ocultarlo no es la seguridad —de
 * eso se encargan las políticas de la base de datos— pero sí evita que nadie
 * pierda el tiempo llamando a una puerta cerrada.
 */
function bloques({ rol, accesoClinico }: PerfilNav): Bloque[] {
  const salida: Bloque[] = [];

  const esComercial = rol === 'direccion' || rol === 'admisiones';
  const esClinico = rol === 'direccion' || rol === 'terapeuta' || accesoClinico;
  const esEconomico = rol === 'direccion' || rol === 'administracion';

  if (esComercial) {
    salida.push({
      titulo: 'Área comercial',
      entradas: [
        { clave: 'leads', texto: 'Kanban', href: '/leads', icono: '▦' },
        { clave: 'tareas', texto: 'Mis tareas', href: '/tareas', icono: '☑' },
        { clave: 'contactos', texto: 'Contactos', href: '/contactos', icono: '◉' },
        { clave: 'agenda', texto: 'Agenda', href: '/agenda', icono: '▤' },
        ...(rol === 'direccion'
          ? [{ clave: 'marketing' as const, texto: 'Marketing', href: '/marketing', icono: '✉' }]
          : []),
        { clave: 'panel', texto: 'Dashboard', href: '/panel', icono: '◔' },
      ],
    });
  }

  if (esClinico) {
    salida.push({
      titulo: 'Área clínica',
      entradas: [
        { clave: 'clinica', texto: 'Pacientes', href: '/clinica', icono: '✚' },
        { clave: 'chat', texto: 'Chat interno', href: '/clinica/chat', icono: '💬' },
        ...(rol === 'terapeuta' && !esComercial
          ? [{ clave: 'agenda' as const, texto: 'Agenda', href: '/agenda', icono: '▤' }]
          : []),
      ],
    });
  }

  if (esEconomico) {
    salida.push({
      titulo: 'Administración',
      entradas: [
        { clave: 'facturacion', texto: 'Facturación', href: '/facturacion', icono: '€' },
        ...(rol === 'direccion'
          ? [{ clave: 'admin' as const, texto: 'Configuración', href: '/admin', icono: '⚙' }]
          : []),
      ],
    });
  }

  // Un terapeuta puro solo tiene su agenda y su área clínica.
  if (salida.length === 0) {
    salida.push({
      titulo: 'Mi trabajo',
      entradas: [{ clave: 'agenda', texto: 'Agenda', href: '/agenda', icono: '▤' }],
    });
  }

  return salida;
}

/** Subsecciones de las áreas que las tienen. */
const SUBSECCIONES: Partial<Record<Seccion, { texto: string; href: string }[]>> = {
  contactos: [
    { texto: 'Directorio', href: '/contactos' },
    { texto: 'Etiquetas', href: '/contactos/etiquetas' },
    { texto: 'Listas y segmentos', href: '/contactos/listas' },
  ],
  marketing: [
    { texto: 'Campañas', href: '/marketing' },
    { texto: 'Plantillas', href: '/marketing/plantillas' },
  ],
  panel: [
    { texto: 'Cuadro de mando', href: '/panel' },
    { texto: 'Preguntar a los datos', href: '/panel/asistente' },
    { texto: 'Informe mensual', href: '/panel/informe' },
  ],
  clinica: [
    { texto: 'Pacientes', href: '/clinica' },
    { texto: 'Ocupación', href: '/clinica/ocupacion' },
    { texto: 'Asistente', href: '/clinica/asistente' },
  ],
  facturacion: [
    { texto: 'Facturas', href: '/facturacion' },
    { texto: 'Cobros', href: '/facturacion/cobros' },
    { texto: 'Informe', href: '/facturacion/informe' },
  ],
  admin: [
    { texto: 'Resumen', href: '/admin' },
    { texto: 'Equipo', href: '/admin/equipo' },
    { texto: 'Centros', href: '/admin/centros' },
    { texto: 'Catálogos', href: '/admin/catalogos' },
    { texto: 'Pipelines', href: '/admin/pipelines' },
    { texto: 'Clínica', href: '/admin/clinica' },
    { texto: 'Integraciones', href: '/admin/integraciones' },
    { texto: 'Retención', href: '/admin/retencion' },
    { texto: 'Parámetros', href: '/admin/parametros' },
  ],
};

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '··';
}

function Navegacion({
  seccion,
  subseccion,
  perfil,
}: {
  seccion: Seccion;
  subseccion?: string;
  perfil: PerfilNav;
}) {
  return (
    <nav className="flex flex-col gap-0.5 px-2.5 py-3.5">
      {bloques(perfil).map((bloque) => (
        <div key={bloque.titulo}>
          <p className="px-3 pb-1.5 pt-3 text-[10.5px] uppercase tracking-[0.12em] text-[#93A2C2]">
            {bloque.titulo}
          </p>
          {bloque.entradas.map((e) => {
            const activo = e.clave === seccion;
            const hijos = SUBSECCIONES[e.clave];
            return (
              <div key={e.clave}>
                <Link
                  href={e.href}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition ${
                    activo
                      ? 'bg-white/15 font-semibold text-white'
                      : 'font-medium text-[#D4DCEC] hover:bg-white/10'
                  }`}
                >
                  <span className="w-[18px] text-center opacity-90">{e.icono}</span>
                  {e.texto}
                </Link>
                {activo && hijos && (
                  <div className="mb-1 ml-6 flex flex-col gap-0.5 border-l border-white/15 pl-3 pt-0.5">
                    {hijos.map((h) => (
                      <Link
                        key={h.href}
                        href={h.href}
                        className={`rounded-md px-2 py-1.5 text-[12.5px] transition ${
                          subseccion === h.href
                            ? 'font-semibold text-white'
                            : 'text-[#AEBBD6] hover:text-white'
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
        </div>
      ))}

    </nav>
  );
}

function Campana({
  notificaciones,
  sinLeer,
}: {
  notificaciones: {
    id: string;
    mensaje: string;
    lead_id: string | null;
    leida_at: string | null;
    created_at: string;
  }[];
  sinLeer: number;
}) {
  return (
    <details className="relative">
      <summary className="relative flex cursor-pointer list-none items-center rounded-lg p-2 text-ink2 transition hover:bg-ground [&::-webkit-details-marker]:hidden">
        <IconoCampana />
        {sinLeer > 0 && (
          <span className="absolute -right-0.5 -top-0.5 rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">
            {sinLeer}
          </span>
        )}
      </summary>
      <div className="panel absolute right-0 z-30 mt-2 w-80 max-w-[85vw] p-2">
        <div className="flex items-center justify-between px-2 py-1">
          <p className="text-sm font-semibold">Notificaciones</p>
          {sinLeer > 0 && (
            <form action={marcarNotificacionesLeidas}>
              <button type="submit" className="text-xs font-semibold text-primary hover:underline">
                Marcar leídas
              </button>
            </form>
          )}
        </div>
        <ul className="max-h-80 overflow-y-auto">
          {notificaciones.length === 0 && (
            <li className="px-2 py-3 text-sm text-muted">Nada por aquí.</li>
          )}
          {notificaciones.map((n) => (
            <li key={n.id}>
              <Link
                href={n.lead_id ? `/leads/${n.lead_id}` : '/leads'}
                className={`block rounded-lg px-2 py-2 text-[13px] hover:bg-ground ${
                  n.leida_at ? 'text-muted' : 'text-ink2'
                }`}
              >
                {n.mensaje}
                <span className="block text-[11px] text-muted">{fechaCorta(n.created_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

/**
 * Estructura común: barra lateral azul del grupo, topbar con búsqueda global y
 * CTA coral, y cabecera de página con título y subtítulo.
 */
export async function AppShell({
  seccion,
  subseccion,
  titulo,
  descripcion,
  acciones,
  children,
}: {
  seccion: Seccion;
  subseccion?: string;
  titulo: string;
  descripcion?: string;
  acciones?: React.ReactNode;
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
    supabase
      .from('perfiles')
      .select('nombre, rol, acceso_clinico')
      .eq('id', user.id)
      .maybeSingle(),
  ]);

  const sinLeer = (notificaciones ?? []).filter((n) => n.leida_at === null).length;
  const esComercial = perfil?.rol === 'direccion' || perfil?.rol === 'admisiones';
  const inicio =
    perfil?.rol === 'terapeuta'
      ? '/agenda'
      : perfil?.rol === 'administracion'
        ? '/facturacion'
        : '/leads';
  const nombre = perfil?.nombre ?? user.email ?? '';
  const ROL_TEXTO: Record<string, string> = {
    direccion: 'Dirección',
    admisiones: 'Admisiones',
    terapeuta: 'Terapeuta',
    administracion: 'Administración',
  };
  const rolTexto = ROL_TEXTO[perfil?.rol ?? ''] ?? 'Sin rol';

  const marca = (
    <Link href={inicio} className="block">
      <b className="block text-[17px] font-bold tracking-[0.02em] text-white">
        Vida y Tu <span className="text-[#F08F7E]">DATA</span>
      </b>
      <span className="text-[11px] uppercase tracking-[0.14em] text-[#AEBBD6]">
        Grupo Vida y Tu
      </span>
    </Link>
  );

  const lateral = (
    <>
      <div className="border-b border-white/12 px-5 pb-4 pt-5">{marca}</div>
      <div className="flex-1 overflow-y-auto">
        <Navegacion
          seccion={seccion}
          subseccion={subseccion}
          perfil={{ rol: perfil?.rol, accesoClinico: perfil?.acceso_clinico ?? false }}
        />
      </div>
      <div className="flex items-center gap-2.5 border-t border-white/12 px-4 py-3.5">
        <span className="avatar avatar-coral !h-8 !w-8 !text-xs">{iniciales(nombre)}</span>
        <div className="min-w-0 flex-1">
          <b className="block truncate text-[13px] text-white">{nombre}</b>
          <small className="block text-[11px] text-[#AEBBD6]">{rolTexto}</small>
        </div>
        <form action={cerrarSesion}>
          <button
            type="submit"
            title="Cerrar sesión"
            className="rounded-lg p-1.5 text-[#AEBBD6] transition hover:bg-white/10 hover:text-white"
          >
            <IconoSalir />
          </button>
        </form>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen">
      <aside
        className="sticky top-0 hidden h-screen w-[216px] shrink-0 flex-col text-[#E9EDF5] lg:flex"
        style={{ background: 'linear-gradient(180deg,#2C3C5C 0%,#384B71 100%)' }}
      >
        {lateral}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3.5 border-b border-line bg-surface px-4 py-3 sm:px-6">
          <details className="relative lg:hidden">
            <summary className="flex cursor-pointer list-none items-center rounded-lg p-2 text-ink2 transition hover:bg-ground [&::-webkit-details-marker]:hidden">
              <IconoMenu />
            </summary>
            <div
              className="absolute left-0 z-30 mt-2 flex w-64 flex-col rounded-lg shadow-lg"
              style={{ background: 'linear-gradient(180deg,#2C3C5C 0%,#384B71 100%)' }}
            >
              {lateral}
            </div>
          </details>

          {esComercial && (
          <form action="/buscar" className="hidden max-w-[420px] flex-1 sm:flex">
            <label className="flex w-full items-center gap-2 rounded-lg border border-line bg-ground px-3 py-1.5 text-muted focus-within:border-primary">
              <IconoLupa />
              <input
                name="q"
                placeholder="Buscar por nombre o teléfono…"
                className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
              />
            </label>
          </form>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {acciones}

            {/* Exportar: solo dirección, y cada descarga queda auditada. */}
            {perfil?.rol === 'direccion' && (
              <details className="relative hidden sm:block">
                <summary className="btn btn-ghost cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  Exportar
                </summary>
                <div className="panel absolute right-0 z-30 mt-2 w-56 p-2">
                  <p className="px-2 py-1 text-[11px] uppercase tracking-[0.1em] text-muted">
                    Descargar CSV
                  </p>
                  {[
                    ['leads', 'Casos'],
                    ['contactos', 'Contactos'],
                    ['conversiones', 'Conversiones'],
                    ['citas', 'Citas'],
                  ].map(([clave, texto]) => (
                    <a
                      key={clave}
                      href={`/api/exportar?que=${clave}`}
                      className="block rounded-lg px-2 py-2 text-[13px] text-ink2 hover:bg-ground"
                    >
                      {texto}
                    </a>
                  ))}
                  <p className="px-2 pb-1 pt-2 text-[11px] text-muted">
                    Cada exportación queda registrada en la auditoría.
                  </p>
                </div>
              </details>
            )}

            <Campana notificaciones={notificaciones ?? []} sinLeer={sinLeer} />
            {esComercial && (
              <Link href="/leads/nuevo" className="btn btn-coral">
                + Nuevo lead
              </Link>
            )}
          </div>
        </header>

        <div className="px-4 pb-16 pt-5 sm:px-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-3">
              <BotonAtras />
              <div>
                <h1 className="text-[19px] font-bold">{titulo}</h1>
                {descripcion && <p className="mt-0.5 text-[13px] text-ink2">{descripcion}</p>}
              </div>
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
