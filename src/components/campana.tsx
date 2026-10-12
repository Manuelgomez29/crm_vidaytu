'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from '@/components/enlace-rapido';
import { createClient } from '@/lib/supabase/client';
import { marcarNotificacionesLeidas } from '@/app/(app)/leads/actions';
import { fechaCorta } from '@/lib/fechas';
import { IconoCampana } from './iconos';

export type Notificacion = {
  id: string;
  mensaje: string;
  lead_id: string | null;
  leida_at: string | null;
  created_at: string;
};

const CUANTAS = 15;

/**
 * La campana de notificaciones, que se pone al día sola.
 *
 * Vive en el armazón, y el armazón ya no se vuelve a pintar al navegar: si las
 * notificaciones llegaran solo con él, la campana se quedaría con lo que había
 * al entrar por la mañana. Por eso llega pintada del servidor (sin parpadeo al
 * cargar) y desde ahí se relee sola en cada cambio de pantalla —como antes,
 * que se releía con cada pantalla nueva— y al volver a la pestaña.
 *
 * La lectura va directa del navegador a la base de datos con la sesión de quien
 * mira; la política `notificaciones_propias_leer` solo deja ver las suyas.
 */
export function Campana({ iniciales }: { iniciales: Notificacion[] }) {
  const ruta = usePathname();
  const [lista, setLista] = useState(iniciales);
  const primera = useRef(true);

  useEffect(() => {
    let vigente = true;
    const supabase = createClient();

    const leer = async () => {
      if (document.visibilityState !== 'visible') return;
      const { data, error } = await supabase
        .from('notificaciones')
        .select('id, mensaje, lead_id, leida_at, created_at')
        .order('created_at', { ascending: false })
        .limit(CUANTAS);
      // Si falla, se queda lo que había: una campana vieja es mejor que vacía.
      if (vigente && !error && data) setLista(data);
    };

    // La primera vez ya viene del servidor; releerla sería una consulta tirada.
    if (primera.current) primera.current = false;
    else void leer();

    document.addEventListener('visibilitychange', leer);
    return () => {
      vigente = false;
      document.removeEventListener('visibilitychange', leer);
    };
  }, [ruta]);

  const sinLeer = lista.filter((n) => n.leida_at === null).length;

  return (
    <details className="relative">
      <summary
        aria-label={sinLeer > 0 ? `Notificaciones, ${sinLeer} sin leer` : 'Notificaciones'}
        className="relative flex cursor-pointer list-none items-center rounded-lg p-2 text-ink2 transition hover:bg-ground [&::-webkit-details-marker]:hidden"
      >
        <IconoCampana />
        {sinLeer > 0 && (
          <span className="num absolute -right-0.5 -top-0.5 rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">
            {sinLeer}
          </span>
        )}
      </summary>
      <div className="panel absolute right-0 z-30 mt-2 w-80 max-w-[85vw] p-2">
        <div className="flex items-center justify-between px-2 py-1">
          <p className="text-sm font-semibold">Notificaciones</p>
          {sinLeer > 0 && (
            <form
              action={async () => {
                // Se ven leídas en el mismo clic; el servidor lo guarda después.
                const ahora = new Date().toISOString();
                setLista((l) => l.map((n) => (n.leida_at ? n : { ...n, leida_at: ahora })));
                await marcarNotificacionesLeidas();
              }}
            >
              <button type="submit" className="text-xs font-semibold text-primary hover:underline">
                Marcar leídas
              </button>
            </form>
          )}
        </div>
        <ul className="max-h-80 overflow-y-auto">
          {lista.length === 0 && <li className="px-2 py-3 text-sm text-muted">Nada por aquí.</li>}
          {lista.map((n) => (
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
