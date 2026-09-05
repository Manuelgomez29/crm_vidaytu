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
      className="flex gap-0.5 rounded-lg bg-white/10 p-0.5"
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
          className={`rounded-md px-1.5 py-0.5 text-[12px] leading-5 transition disabled:opacity-50 ${
            actual === o.valor
              ? 'bg-white/85 text-[#2C3C5C]'
              : 'text-[#AEBBD6] hover:bg-white/10 hover:text-white'
          }`}
        >
          <span aria-hidden>{o.icono}</span>
          <span className="sr-only">{o.texto}</span>
        </button>
      ))}
    </div>
  );
}
