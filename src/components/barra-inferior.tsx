'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from '@/components/enlace-rapido';
import { entradasActivas, seccionDeRuta, type PerfilNav, type Seccion } from './navegacion-lateral';
import {
  IconoAdmin,
  IconoAgenda,
  IconoChat,
  IconoContactos,
  IconoCorreo,
  IconoEuro,
  IconoLeads,
  IconoPacientes,
  IconoPanel,
  IconoPuntos,
  IconoSol,
  IconoTareas,
} from './iconos';

/**
 * La barra de abajo del móvil: las cuatro pantallas de cada día, al pulgar.
 *
 * La mitad del equipo trabaja desde el teléfono, y hasta ahora cada cambio de
 * pantalla era abrir la hamburguesa de arriba —al otro extremo del pulgar—,
 * buscar en una lista de quince y pulsar. Aquí son un toque, y las cuatro
 * están siempre a la vista. Lo demás sigue en «Más», que abre ese mismo menú.
 *
 * QUÉ CUATRO: las primeras de `PRIORIDAD` a las que esta persona tiene acceso,
 * sacadas de la misma lista que el menú lateral (`entradasActivas`). Un
 * comercial ve Mi día, Kanban, Tareas y Agenda; un terapeuta, su agenda y lo
 * clínico; administración, facturación. Nadie ve aquí una puerta que el menú
 * no le abriría.
 *
 * Se esconde mientras se escribe: en Android, una barra fija sube con el
 * teclado y tapa justo el campo que se está rellenando.
 */

const PRIORIDAD: Seccion[] = [
  'mi-dia',
  'leads',
  'tareas',
  'agenda',
  'clinica',
  'chat',
  'facturacion',
  'contactos',
  'panel',
  'marketing',
  'admin',
];

const CORTO: Record<Seccion, string> = {
  'mi-dia': 'Mi día',
  leads: 'Kanban',
  tareas: 'Tareas',
  agenda: 'Agenda',
  clinica: 'Pacientes',
  chat: 'Chat',
  facturacion: 'Facturas',
  contactos: 'Contactos',
  panel: 'Panel',
  marketing: 'Campañas',
  admin: 'Ajustes',
};

const ICONO: Record<Seccion, () => React.ReactElement> = {
  'mi-dia': IconoSol,
  leads: IconoLeads,
  tareas: IconoTareas,
  agenda: IconoAgenda,
  clinica: IconoPacientes,
  chat: IconoChat,
  facturacion: IconoEuro,
  contactos: IconoContactos,
  panel: IconoPanel,
  marketing: IconoCorreo,
  admin: IconoAdmin,
};

const HUECOS = 4;

/** Lo que se escribe con teclado en pantalla; un botón o una casilla, no. */
function abreTeclado(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLSelectElement) return false;
  if (!(el instanceof HTMLInputElement)) return false;
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(
    el.type,
  );
}

function menu(): HTMLDetailsElement | null {
  return document.getElementById('menu-movil') as HTMLDetailsElement | null;
}

export function BarraInferior({ perfil }: { perfil: PerfilNav }) {
  const ruta = usePathname();
  const { seccion } = seccionDeRuta(ruta);
  const [escribiendo, setEscribiendo] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => {
    const entra = (e: FocusEvent) => {
      if (abreTeclado(e.target)) setEscribiendo(true);
    };
    // Al pasar de un campo a otro, el foco sale y entra en el mismo instante:
    // se mira después dónde quedó, para no hacer parpadear la barra.
    const sale = () => setTimeout(() => setEscribiendo(abreTeclado(document.activeElement)), 0);
    document.addEventListener('focusin', entra);
    document.addEventListener('focusout', sale);

    const m = menu();
    const alCambiar = () => setMenuAbierto(!!menu()?.open);
    m?.addEventListener('toggle', alCambiar);
    return () => {
      document.removeEventListener('focusin', entra);
      document.removeEventListener('focusout', sale);
      m?.removeEventListener('toggle', alCambiar);
    };
  }, []);

  const entradas = entradasActivas(perfil)
    .filter((e) => PRIORIDAD.includes(e.clave))
    .sort((a, b) => PRIORIDAD.indexOf(a.clave) - PRIORIDAD.indexOf(b.clave))
    .slice(0, HUECOS);
  const fuera = !entradas.some((e) => e.clave === seccion);

  const cerrarMenu = () => {
    const m = menu();
    if (m?.open) m.open = false;
  };

  const clase = (activa: boolean) =>
    `relative flex h-full flex-col items-center justify-center gap-0.5 text-[11px] leading-none transition ${
      activa ? 'font-semibold text-primary' : 'font-medium text-ink2 active:bg-ground'
    }`;
  const marca = (
    <span aria-hidden className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-primary" />
  );

  return (
    <nav
      aria-label="Secciones principales"
      data-armazon
      hidden={escribiendo || undefined}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_14px_rgba(36,43,58,0.06)] lg:hidden print:hidden"
    >
      <ul className="mx-auto grid h-[var(--alto-barra-inferior)] max-w-lg grid-cols-5">
        {entradas.map((e) => {
          const Icono = ICONO[e.clave];
          const activa = e.clave === seccion && !menuAbierto;
          return (
            <li key={e.clave}>
              <Link
                href={e.href}
                prefetch={null}
                onClick={cerrarMenu}
                aria-current={activa ? 'page' : undefined}
                className={clase(activa)}
              >
                {activa && marca}
                <Icono />
                {CORTO[e.clave]}
              </Link>
            </li>
          );
        })}
        <li className={entradas.length < HUECOS ? `col-start-5` : undefined}>
          <button
            type="button"
            aria-controls="menu-movil"
            aria-expanded={menuAbierto}
            onClick={() => {
              const m = menu();
              if (!m) return;
              m.open = !m.open;
              // El menú cuelga de la barra de arriba: que se vea al abrirlo.
              if (m.open) m.scrollIntoView({ block: 'nearest' });
            }}
            className={`w-full ${clase(menuAbierto || fuera)}`}
          >
            {(menuAbierto || fuera) && marca}
            <IconoPuntos />
            Más
          </button>
        </li>
      </ul>
    </nav>
  );
}
