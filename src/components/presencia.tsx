'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Companero = { id: string; nombre: string; escribiendo: boolean };

function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .map((p) => p[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Quién más está mirando esto ahora mismo.
 *
 * Evita el choque tonto de dos comerciales llamando al mismo caso a la vez, que
 * para quien recibe la llamada es una señal pésima.
 *
 * SOBRE LO QUE ESTO REVELA, que conviene tenerlo escrito: un canal de presencia
 * no pasa por RLS. Quien conozca el id de un caso puede unirse a su canal y ver
 * qué compañeros lo están mirando —y deducir que ese caso existe—. Por eso solo
 * viaja el nombre de pila de quien mira: ni datos del caso, ni del paciente, ni
 * del centro. Dentro de un equipo de doce personas que ya se ven los casos entre
 * sí, el intercambio compensa; si el equipo creciera o entraran perfiles
 * externos, habría que revisarlo.
 */
export function Presencia({
  canal,
  yo,
  compacto = false,
}: {
  canal: string;
  yo: { id: string; nombre: string };
  compacto?: boolean;
}) {
  const [otros, setOtros] = useState<Companero[]>([]);
  const canalRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const c = supabase.channel(canal, { config: { presence: { key: yo.id } } });
    canalRef.current = c;

    c.on('presence', { event: 'sync' }, () => {
      const estado = c.presenceState<{ nombre: string; escribiendo: boolean }>();
      const lista: Companero[] = [];
      for (const [id, entradas] of Object.entries(estado)) {
        if (id === yo.id) continue;
        const ultima = entradas[entradas.length - 1];
        if (ultima) lista.push({ id, nombre: ultima.nombre, escribiendo: !!ultima.escribiendo });
      }
      setOtros(lista);
    }).subscribe(async (estado) => {
      if (estado === 'SUBSCRIBED') {
        await c.track({ nombre: yo.nombre, escribiendo: false });
      }
    });

    return () => {
      supabase.removeChannel(c);
      canalRef.current = null;
    };
  }, [canal, yo.id, yo.nombre]);

  /**
   * Se expone en el DOM para que el formulario de notas pueda avisar sin que
   * haya que subir el estado a media aplicación. Es feo, pero es un evento
   * suelto y evita atravesar cinco componentes con una prop.
   */
  useEffect(() => {
    function alEscribir(e: Event) {
      const detalle = (e as CustomEvent<{ canal: string; escribiendo: boolean }>).detail;
      if (!detalle || detalle.canal !== canal) return;
      canalRef.current?.track({ nombre: yo.nombre, escribiendo: detalle.escribiendo });
    }
    window.addEventListener('presencia-escribiendo', alEscribir);
    return () => window.removeEventListener('presencia-escribiendo', alEscribir);
  }, [canal, yo.nombre]);

  if (otros.length === 0) return null;

  const escribiendo = otros.filter((o) => o.escribiendo);

  return (
    <div className="flex items-center gap-1.5" aria-live="polite">
      <div className="flex -space-x-1.5">
        {otros.slice(0, 4).map((o) => (
          <span
            key={o.id}
            className="avatar ring-2 ring-surface"
            title={`${o.nombre} está viendo esto`}
          >
            {iniciales(o.nombre)}
          </span>
        ))}
      </div>
      {!compacto && (
        <span className="text-[11px] text-muted">
          {escribiendo.length > 0
            ? `${escribiendo[0].nombre.split(' ')[0]} está escribiendo una nota…`
            : otros.length === 1
              ? `${otros[0].nombre.split(' ')[0]} está viendo esto`
              : `${otros.length} personas viendo esto`}
        </span>
      )}
    </div>
  );
}

/** Avisa al canal de que se está escribiendo. Lo usa el formulario de notas. */
export function avisarEscribiendo(canal: string, escribiendo: boolean) {
  window.dispatchEvent(
    new CustomEvent('presencia-escribiendo', { detail: { canal, escribiendo } }),
  );
}
