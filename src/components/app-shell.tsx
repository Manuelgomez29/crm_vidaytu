import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { cerrarSesion, marcarNotificacionesLeidas } from '@/app/leads/actions';
import { AREAS, areasActivas, type Area } from '@/lib/areas';
import { fechaCorta } from '@/lib/fechas';
import { IconoCampana, IconoMenu, IconoSalir } from './iconos';
import { CajaBuscar, LupaMovil } from './caja-buscar';
import { BotonAtras } from './boton-atras';
import { Paleta } from './paleta';
import { Latido } from './latido';
import { ProgresoNavegacion } from './progreso-navegacion';
import { ProveedorAvisos } from './avisos';
import { SelectorTema } from './selector-tema';

export type Seccion =
  | 'mi-dia'
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

type Entrada = {
  clave: Seccion;
  texto: string;
  href: string;
  icono: string;
  /** A qué área pertenece. Si esa área está apagada, la entrada no es enlace. */
  area?: Area;
};
type Bloque = { titulo: string; entradas: Entrada[] };

export type PerfilNav = {
  /** Las áreas encendidas ahora mismo. Ver `lib/areas.ts`. */
  areas: Set<Area>;
  rol: string | undefined;
  accesoClinico: boolean;
  /** 'grupo' manda en todo; 'centros', solo en los suyos. */
  alcance: string | undefined;
};

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
        { area: 'comercial', clave: 'mi-dia', texto: 'Mi día', href: '/mi-dia', icono: '☀' },
        { area: 'comercial', clave: 'leads', texto: 'Kanban', href: '/leads', icono: '▦' },
        { area: 'comercial', clave: 'tareas', texto: 'Mis tareas', href: '/tareas', icono: '☑' },
        {
          area: 'comercial',
          clave: 'contactos',
          texto: 'Contactos',
          href: '/contactos',
          icono: '◉',
        },
        { area: 'comercial', clave: 'agenda', texto: 'Agenda', href: '/agenda', icono: '▤' },
        { area: 'comercial', clave: 'panel', texto: 'Dashboard', href: '/panel', icono: '◔' },
      ],
    });
  }

  /*
   * Marketing es un area aparte, no una pantalla del embudo. Trabaja sobre el
   * directorio de personas y con consentimiento explicito (regla 5), no sobre
   * casos: mezclarla con el kanban invita a confundir «contacto de un caso» con
   * «destinatario de una campana», que son cosas distintas y con reglas
   * distintas.
   */
  if (rol === 'direccion') {
    salida.push({
      titulo: 'Área de marketing',
      entradas: [
        {
          area: 'marketing',
          clave: 'marketing',
          texto: 'Campañas',
          href: '/marketing',
          icono: '✉',
        },
      ],
    });
  }

  if (esClinico) {
    salida.push({
      titulo: 'Área clínica',
      entradas: [
        { area: 'clinica', clave: 'clinica', texto: 'Pacientes', href: '/clinica', icono: '✚' },
        {
          area: 'clinica',
          clave: 'chat',
          texto: 'Chat interno',
          href: '/clinica/chat',
          icono: '💬',
        },
        ...(rol === 'terapeuta' && !esComercial
          ? [
              {
                area: 'comercial' as const,
                clave: 'agenda' as const,
                texto: 'Agenda',
                href: '/agenda',
                icono: '▤',
              },
            ]
          : []),
      ],
    });
  }

  if (esEconomico) {
    salida.push({
      titulo: 'Administración',
      entradas: [
        {
          area: 'facturacion',
          clave: 'facturacion',
          texto: 'Facturación',
          href: '/facturacion',
          icono: '€',
        },
        ...(rol === 'direccion'
          ? [
              {
                area: 'administracion' as const,
                clave: 'admin' as const,
                texto: 'Configuración',
                href: '/admin',
                icono: '⚙',
              },
            ]
          : []),
      ],
    });
  }

  // Un terapeuta puro solo tiene su agenda y su área clínica.
  if (salida.length === 0) {
    salida.push({
      titulo: 'Mi trabajo',
      entradas: [
        { area: 'comercial', clave: 'agenda', texto: 'Agenda', href: '/agenda', icono: '▤' },
      ],
    });
  }

  return salida;
}

/** Subsecciones de las áreas que las tienen. */
const SUBSECCIONES: Partial<
  Record<Seccion, { texto: string; href: string; soloGrupo?: boolean }[]>
> = {
  leads: [
    { texto: 'Kanban', href: '/leads' },
    { texto: 'Procesos de venta', href: '/leads/procesos' },
    { texto: 'Lead scoring', href: '/leads/scoring' },
  ],
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
    { texto: 'Puesta en marcha', href: '/admin/puesta-en-marcha', soloGrupo: true },
    { texto: 'Equipo', href: '/admin/equipo' },
    /*
     * `soloGrupo` no es seguridad —de eso se encargan las acciones del servidor,
     * que rechazan por su cuenta— sino cortesia: son ajustes que rigen para los
     * tres centros, y ensenarle el formulario a quien va a recibir un «esto no
     * es tuyo» al enviarlo es hacerle perder el tiempo dos veces.
     */
    { texto: 'Centros', href: '/admin/centros', soloGrupo: true },
    { texto: 'Catálogos', href: '/admin/catalogos', soloGrupo: true },
    { texto: 'Pipelines', href: '/admin/pipelines', soloGrupo: true },
    { texto: 'Clínica', href: '/admin/clinica', soloGrupo: true },
    { texto: 'Integraciones', href: '/admin/integraciones', soloGrupo: true },
    { texto: 'Captación', href: '/admin/captacion', soloGrupo: true },
    { texto: 'Retención', href: '/admin/retencion', soloGrupo: true },
    { texto: 'Parámetros', href: '/admin/parametros', soloGrupo: true },
    { texto: 'Motor', href: '/admin/motor', soloGrupo: true },
    { texto: 'Accesos', href: '/admin/accesos', soloGrupo: true },
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
            const hijos = SUBSECCIONES[e.clave]?.filter(
              (h) => !h.soloGrupo || perfil.alcance === 'grupo',
            );

            /*
             * Un area apagada se ve, pero no se toca. Va como <span> y no como
             * <Link> a proposito: un enlace que lleva a «todavia no» es una
             * promesa incumplida cada vez que alguien lo pulsa, y ademas el
             * teclado se pararia en el.
             */
            const apagada = !!e.area && !perfil.areas.has(e.area);
            if (apagada) {
              return (
                <div
                  key={e.clave}
                  title={`${AREAS[e.area!].texto}: todavía no está en marcha`}
                  className="flex items-start gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium text-[#7F8CA8]"
                >
                  <span className="w-[18px] shrink-0 text-center opacity-60">{e.icono}</span>
                  {/*
                    La etiqueta va DEBAJO, no al lado.
                    «Chat interno» y «PRÓXIMAMENTE» no caben juntos en el ancho
                    de la barra: al lado, o se salia la etiqueta o el nombre
                    quedaba en «Chat in…». Y de las dos cosas, la que no puede
                    perderse es el nombre del area — la etiqueta se entiende
                    igual una linea mas abajo.
                  */}
                  <span className="min-w-0">
                    <span className="block line-through decoration-[#7F8CA8]/50">{e.texto}</span>
                    {AREAS[e.area!].etiqueta && (
                      <span className="mt-0.5 block text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[#6C7894]">
                        {AREAS[e.area!].etiqueta}
                      </span>
                    )}
                  </span>
                </div>
              );
            }

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
      <summary
        aria-label={sinLeer > 0 ? `Notificaciones, ${sinLeer} sin leer` : 'Notificaciones'}
        className="relative flex cursor-pointer list-none items-center rounded-lg p-2 text-ink2 transition hover:bg-ground [&::-webkit-details-marker]:hidden"
      >
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

  const [{ data: notificaciones }, { data: perfil }, areas] = await Promise.all([
    supabase
      .from('notificaciones')
      .select('id, mensaje, lead_id, leida_at, created_at')
      .order('created_at', { ascending: false })
      .limit(15),
    supabase
      .from('perfiles')
      .select('nombre, rol, acceso_clinico, alcance, tema')
      .eq('id', user.id)
      .maybeSingle(),
    areasActivas(supabase),
  ]);

  const sinLeer = (notificaciones ?? []).filter((n) => n.leida_at === null).length;
  const esComercial = perfil?.rol === 'direccion' || perfil?.rol === 'admisiones';
  /*
   * A donde lleva el logotipo. Se mira que el area de destino este encendida:
   * el inicio de quien lleva la administracion economica es facturacion, y
   * mandarle cada vez a una puerta cerrada es peor que no tener atajo.
   */
  const inicio =
    perfil?.rol === 'terapeuta'
      ? // La agenda es del area comercial, que nunca se apaga: un terapeuta
        // siempre tiene a donde ir.
        '/agenda'
      : perfil?.rol === 'administracion' && areas.has('facturacion')
        ? '/facturacion'
        : '/mi-dia';
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
        Vidaitu <span className="text-[#F08F7E]">DATA</span>
      </b>
      <span className="text-[11px] uppercase tracking-[0.14em] text-[#AEBBD6]">Grupo Vidaitu</span>
    </Link>
  );

  const lateral = (
    <>
      <div className="border-b border-white/12 px-5 pb-4 pt-5">{marca}</div>
      <div className="flex-1 overflow-y-auto">
        <Navegacion
          seccion={seccion}
          subseccion={subseccion}
          perfil={{
            rol: perfil?.rol,
            accesoClinico: perfil?.acceso_clinico ?? false,
            alcance: perfil?.alcance,
            areas,
          }}
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
            aria-label="Cerrar sesión"
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
        <a href="#contenido" className="saltar-al-contenido">
          Saltar al contenido
        </a>
        <header className="sticky top-0 z-20 flex items-center gap-3.5 border-b border-line bg-surface px-4 py-3 sm:px-6">
          <details className="relative lg:hidden">
            <summary
              aria-label="Abrir el menú de navegación"
              /* 44x44: es el único camino a todas las secciones en el móvil, y
                 se pulsa con el pulgar mientras se anda. A 34 se falla. */
              className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-lg text-ink2 transition hover:bg-ground [&::-webkit-details-marker]:hidden sm:min-h-0 sm:min-w-0 sm:p-2"
            >
              <IconoMenu />
            </summary>
            <div
              className="absolute left-0 z-30 mt-2 flex w-64 flex-col rounded-lg shadow-lg"
              style={{ background: 'linear-gradient(180deg,#2C3C5C 0%,#384B71 100%)' }}
            >
              {lateral}
              {/*
                El tema vive arriba en el ordenador y AQUÍ en el móvil.
                Sus tres botones ocupan 84 px de una barra que a 360 px —media
                gama Android— ya desbordaba: la página entera se movía en
                horizontal en todas las pantallas. Se cambia dos veces al año;
                el menú es su sitio.
              */}
              <div className="border-t border-white/10 px-3 py-3">
                <p className="pb-1.5 text-[10.5px] uppercase tracking-[0.1em] text-white/50">
                  Tema
                </p>
                <SelectorTema actual={perfil?.tema ?? 'sistema'} />
              </div>
            </div>
          </details>

          {esComercial && (
            <>
              <CajaBuscar />
              <LupaMovil />
            </>
          )}

          <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2">
            {/* El tema se cambia desde arriba: abajo, pegado al nombre, no lo
                buscaba nadie. En el móvil no cabe y baja al menú. */}
            <span className="hidden sm:contents">
              <SelectorTema actual={perfil?.tema ?? 'sistema'} />
            </span>

            {/*
              La accion de la pagina se esconde en el movil.
              Este grupo es `shrink-0` —si se encogiera, el boton coral quedaria
              ilegible—, asi que lo que no cabe no se aprieta: DESBORDA. Con el
              menu, la lupa, el tema, la campana y el «+ Nuevo lead» ya se llega
              a 375px justos; anadir «Ver el tablero» ponia la barra en 493 y
              toda la pagina se movia en horizontal. Y no se pierde nada: lo que
              va aqui esta siempre tambien en el menu o en el cuerpo.

              `sm:contents` y no `sm:block` para que en pantalla grande los
              botones sigan siendo hijos directos del flex, como antes.
            */}
            <span className="hidden sm:contents">{acciones}</span>

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

        <main id="contenido" className="px-4 pb-16 pt-5 sm:px-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-3">
              <BotonAtras />
              <div>
                <h1 className="text-[19px] font-bold">{titulo}</h1>
                {descripcion && <p className="mt-0.5 text-[13px] text-ink2">{descripcion}</p>}
              </div>
            </div>
          </div>
          <ProveedorAvisos>{children}</ProveedorAvisos>
        </main>
      </div>

      {/* Paleta de comandos: vive en el armazon para estar en todas las pantallas. */}
      <Paleta rol={perfil?.rol} />

      {/* Late mientras la pestana este a la vista, para que «quien esta dentro» sea verdad. */}
      <Latido />

      {/* Al tocar un enlace tiene que pasar algo, aunque el servidor tarde. */}
      <ProgresoNavegacion />
    </div>
  );
}
