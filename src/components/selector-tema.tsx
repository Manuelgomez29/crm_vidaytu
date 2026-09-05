'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cambiarTema } from '@/app/acciones-tema';

type Tema = 'claro' | 'oscuro' | 'sistema';

const OPCIONES: { valor: Tema; icono: string; texto: string }[] = [
  { valor: 'claro', icono: '☀', texto: 'Claro' },
  { valor: 'oscuro', icono: '☾', texto: 'Oscuro' },
  { valor: 'sistema', icono: '◐', texto: 'El del sistema' },
];

/**
 * Tres estados, no un interruptor.
 *
 * «El del sistema» es el de serie y el que la mayoría quiere: el móvil ya sabe
 * si es de noche. Los otros dos existen para quien trabaja con la persiana
 * bajada y no quiere que su portátil decida por él.
 *
 * La preferencia se guarda en el perfil, así que viaja del ordenador al móvil.
 * Guardar esto en el navegador es lo que hace que la aplicación aparezca de un
 * color en casa y de otro en el centro, y que la gente piense que se ha roto.
 */
export function SelectorTema({ actual }: { actual: Tema }) {
  const router = useRouter();
  const [ocupado, empezar] = useTransition();

  return (
    <div
      role="group"
      aria-label="Tema de la interfaz"
      className="flex gap-0.5 rounded-lg bg-surface2 p-0.5"
    >
      {OPCIONES.map((o) => (
        <button
          key={o.valor}
          type="button"
          disabled={ocupado}
          aria-pressed={actual === o.valor}
          title={o.texto}
          onClick={() =>
            empezar(async () => {
              await cambiarTema(o.valor);
              router.refresh();
            })
          }
          className={`rounded-md px-2 py-1 text-[13px] leading-5 transition disabled:opacity-50 ${
            actual === o.valor
              ? 'bg-surface text-primary shadow-sm'
              : 'text-muted hover:text-ink'
          }`}
        >
          <span aria-hidden>{o.icono}</span>
          <span className="sr-only">{o.texto}</span>
        </button>
      ))}
    </div>
  );
}
