import { redirect } from 'next/navigation';
import Link from '@/components/enlace-rapido';
import { createClient } from '@/lib/supabase/server';
import { cerrarSesion } from '@/app/(app)/leads/actions';
import { areasActivas } from '@/lib/areas';
import { IconoMenu, IconoSalir } from './iconos';
import { CajaBuscar, LupaMovil } from './caja-buscar';
import { BotonAtras } from './boton-atras';
import { Paleta } from './paleta';
import { Latido } from './latido';
import { ProgresoNavegacion } from './progreso-navegacion';
import { ProveedorAvisos } from './avisos';
import { EcoAvisos } from './eco-avisos';
import { SelectorTema } from './selector-tema';
import { Campana } from './campana';
import { CierreDeMenus, Navegacion } from './navegacion-lateral';
import { BarraInferior } from './barra-inferior';

export type { Seccion } from './navegacion-lateral';

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '··';
}

/**
 * El armazón: barra lateral azul del grupo y topbar con búsqueda global y CTA
 * coral. Lo pinta UNA vez `app/(app)/layout.tsx` y se queda puesto mientras se
 * navega.
 *
 * Antes cada pantalla traía su propio armazón (`AppShell` lo era todo), y eso
 * impedía los esqueletos de carga: el esqueleto de una pantalla sustituye a la
 * pantalla, y con ella se iba también el menú. Ahora, al pulsar, el menú y la
 * cabecera no se mueven y solo el hueco del contenido pasa a gris hasta que
 * llegan los datos.
 *
 * Lo que eso cambia: el armazón NO se vuelve a pintar al navegar. Lo que tiene
 * que estar al día por su cuenta lo está: la entrada activa del menú sale de la
 * dirección (`navegacion-lateral.tsx`) y la campana se relee sola
 * (`campana.tsx`). El nombre, el rol y las áreas encendidas cambian una vez al
 * año y se refrescan al recargar o al cambiar el tema.
 */
export async function Armazon({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // El middleware ya manda al login a quien no tiene sesión; esto es el cinturón.
  if (!user) redirect('/login');

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

  const perfilNav = {
    rol: perfil?.rol,
    accesoClinico: perfil?.acceso_clinico ?? false,
    alcance: perfil?.alcance,
    areas: [...areas],
  };

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
        <Navegacion perfil={perfilNav} />
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
        data-armazon
        className="sticky top-0 hidden h-screen w-[216px] shrink-0 flex-col text-[#E9EDF5] lg:flex"
        style={{ background: 'linear-gradient(180deg,#2C3C5C 0%,#384B71 100%)' }}
      >
        {lateral}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <a href="#contenido" className="saltar-al-contenido">
          Saltar al contenido
        </a>
        <header
          data-armazon
          className="sticky top-0 z-20 flex items-center gap-3.5 border-b border-line bg-surface px-4 py-3 sm:px-6"
        >
          <details id="menu-movil" className="relative lg:hidden">
            <summary
              aria-label="Abrir el menú de navegación"
              /* 44x44: es el único camino a todas las secciones en el móvil, y
                 se pulsa con el pulgar mientras se anda. A 34 se falla. */
              className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-lg text-ink2 transition hover:bg-ground [&::-webkit-details-marker]:hidden sm:min-h-0 sm:min-w-0 sm:p-2"
            >
              <IconoMenu />
            </summary>
            <div
              className="absolute left-0 z-30 mt-2 flex max-h-[calc(100dvh-5rem-var(--barra-inferior))] w-64 flex-col overflow-y-auto rounded-lg shadow-lg"
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

            <Campana iniciales={notificaciones ?? []} />
            {esComercial && (
              <Link href="/leads/nuevo" className="btn btn-coral">
                + Nuevo lead
              </Link>
            )}
          </div>
        </header>

        <main id="contenido" className="px-4 pb-[calc(4rem+var(--barra-inferior))] pt-5 sm:px-6">
          <ProveedorAvisos>
            <EcoAvisos />
            {children}
          </ProveedorAvisos>
        </main>
      </div>

      {/* Paleta de comandos: vive en el armazon para estar en todas las pantallas. */}
      <Paleta rol={perfil?.rol} />

      {/* Late mientras la pestana este a la vista, para que «quien esta dentro» sea verdad. */}
      <Latido />

      {/* Al tocar un enlace tiene que pasar algo, aunque el servidor tarde. */}
      <ProgresoNavegacion />

      {/* En el móvil, las pantallas de cada día al alcance del pulgar. */}
      <BarraInferior perfil={perfilNav} />

      <CierreDeMenus />
    </div>
  );
}

/**
 * La cabecera de una pantalla: volver, título y subtítulo, y su acción.
 *
 * Es también la cabecera de los esqueletos de carga (`esqueletos.tsx`), para
 * que al llegar los datos el título no salte ni un píxel.
 *
 * La acción de la página vivía en la barra de arriba. Esa barra ahora es del
 * armazón y no cambia al navegar, así que la acción baja aquí, a la altura del
 * título, que es además donde se busca. En el móvil sigue escondida: lo que va
 * aquí está siempre también en el cuerpo de la pantalla.
 */
export function CabeceraPagina({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: React.ReactNode;
  descripcion?: React.ReactNode;
  acciones?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <BotonAtras />
        <div className="min-w-0">
          <h1 className="text-[19px] font-bold">{titulo}</h1>
          {descripcion && <p className="mt-0.5 text-[13px] text-ink2">{descripcion}</p>}
        </div>
      </div>
      {acciones && <div className="hidden flex-wrap items-center gap-2 sm:flex">{acciones}</div>}
    </div>
  );
}

/**
 * Una pantalla de la aplicación: su cabecera y su contenido.
 *
 * Conserva el nombre de cuando era el armazón entero para no tocar las sesenta
 * pantallas que lo usan; el armazón de verdad es `Armazon`, más arriba.
 */
export function AppShell({
  titulo,
  descripcion,
  acciones,
  children,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <CabeceraPagina titulo={titulo} descripcion={descripcion} acciones={acciones} />
      {children}
    </>
  );
}
