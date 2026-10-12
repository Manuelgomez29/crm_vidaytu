'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from '@/components/enlace-rapido';
import { AREAS, type Area } from '@/lib/areas';

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
  areas: Area[];
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

/**
 * Las entradas del menú que esta persona puede pulsar, sin repetir y sin las
 * de áreas apagadas. De aquí sale también la barra inferior del móvil
 * (`barra-inferior.tsx`): si cada una decidiera por su cuenta quién ve qué,
 * algún día no coincidirían.
 */
export function entradasActivas(
  perfil: PerfilNav,
): { clave: Seccion; texto: string; href: string }[] {
  const areas = new Set(perfil.areas);
  const vistas = new Set<Seccion>();
  const salida: { clave: Seccion; texto: string; href: string }[] = [];
  for (const e of bloques(perfil).flatMap((b) => b.entradas)) {
    if ((e.area && !areas.has(e.area)) || vistas.has(e.clave)) continue;
    vistas.add(e.clave);
    salida.push({ clave: e.clave, texto: e.texto, href: e.href });
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
    { texto: 'Flujos', href: '/marketing/flujos' },
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
    { texto: 'Dominios de correo', href: '/admin/dominios', soloGrupo: true },
    { texto: 'Captación', href: '/admin/captacion', soloGrupo: true },
    { texto: 'Retención', href: '/admin/retencion', soloGrupo: true },
    { texto: 'Parámetros', href: '/admin/parametros', soloGrupo: true },
    { texto: 'Motor', href: '/admin/motor', soloGrupo: true },
    { texto: 'Accesos', href: '/admin/accesos', soloGrupo: true },
  ],
};

const SECCIONES: Seccion[] = [
  'mi-dia',
  'panel',
  'leads',
  'tareas',
  'agenda',
  'contactos',
  'marketing',
  'clinica',
  'facturacion',
  'admin',
];

/**
 * Qué entrada del menú se ilumina, sacado de la dirección.
 *
 * Antes lo decía cada pantalla al pintarse. Ahora el menú vive en el armazón,
 * que NO se vuelve a pintar al navegar —esa es justamente la gracia: se queda
 * quieto mientras la pantalla nueva carga—, así que tiene que enterarse por su
 * cuenta. Y leerlo de la dirección tiene una ventaja: cambia en el mismo clic,
 * no cuando llega la pantalla.
 */
export function seccionDeRuta(ruta: string): { seccion: Seccion | null; subseccion?: string } {
  // El chat cuelga de /clinica pero en el menú es una entrada propia.
  const seccion: Seccion | null = ruta.startsWith('/clinica/chat')
    ? 'chat'
    : // Buscar es buscar casos: es parte del kanban.
      ruta.startsWith('/buscar')
      ? 'leads'
      : (SECCIONES.find((s) => ruta === `/${s}` || ruta.startsWith(`/${s}/`)) ?? null);

  // La subsección es la más larga que encaje: /leads/procesos gana a /leads, y
  // una ficha (/leads/1234) se queda en /leads, que es de donde cuelga.
  const subseccion = (seccion ? (SUBSECCIONES[seccion] ?? []) : [])
    .map((h) => h.href)
    .filter((href) => ruta === href || ruta.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  return { seccion, subseccion };
}

export function Navegacion({ perfil }: { perfil: PerfilNav }) {
  const ruta = usePathname();
  const { seccion, subseccion } = seccionDeRuta(ruta);
  const areas = new Set(perfil.areas);

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
            const apagada = !!e.area && !areas.has(e.area);
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
                {/*
                  Estos sí se precargan al verse (`prefetch={null}`, lo de serie
                  de Next): son pocos, están siempre a la vista, y lo que se trae
                  es solo el ESQUELETO de la pantalla, no sus datos. Con eso, al
                  pulsar, la pantalla nueva aparece ya dibujada en gris en el
                  mismo instante.
                */}
                <Link
                  href={e.href}
                  prefetch={null}
                  aria-current={activo && !subseccion ? 'page' : undefined}
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
                        prefetch={null}
                        aria-current={subseccion === h.href ? 'page' : undefined}
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

/**
 * Cierra los desplegables del armazón al cambiar de pantalla.
 *
 * Cuando el armazón era parte de cada pantalla, navegar lo pintaba de nuevo y
 * el menú del móvil, la campana o «Exportar» volvían cerrados solos. Ahora el
 * armazón se queda, y un `<details>` abierto seguiría abierto encima de la
 * pantalla nueva. Se cierran al pulsar un enlace de dentro —para que se note
 * en el mismo toque— y, por si acaso, al cambiar la dirección.
 */
export function CierreDeMenus() {
  const ruta = usePathname();

  useEffect(() => {
    for (const d of document.querySelectorAll<HTMLDetailsElement>('[data-armazon] details[open]')) {
      d.open = false;
    }
  }, [ruta]);

  useEffect(() => {
    function alPulsar(e: MouseEvent) {
      const enlace = (e.target as HTMLElement | null)?.closest?.('a');
      const menu = enlace?.closest('[data-armazon] details[open]');
      if (menu instanceof HTMLDetailsElement) menu.open = false;
    }
    document.addEventListener('click', alPulsar);
    return () => document.removeEventListener('click', alPulsar);
  }, []);

  return null;
}
