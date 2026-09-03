'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fechaCorta } from '@/lib/fechas';

export type Mensaje = {
  id: string;
  cuerpo: string;
  autor_id: string | null;
  created_at: string;
};

/**
 * Hilo de mensajes en vivo.
 *
 * Parte de los mensajes que ya vienen renderizados del servidor y se suscribe
 * a los nuevos por Realtime, para que dos terapeutas hablando no tengan que
 * recargar. La suscripción llega filtrada por conversación, y las políticas de
 * la base de datos siguen aplicando sobre el canal: nadie recibe mensajes de
 * una conversación en la que no participa.
 */
export function MensajesVivos({
  conversacionId,
  iniciales,
  yo,
  nombres,
}: {
  conversacionId: string;
  iniciales: Mensaje[];
  yo: string;
  nombres: Record<string, string>;
}) {
  const [mensajes, setMensajes] = useState<Mensaje[]>(iniciales);
  const finRef = useRef<HTMLDivElement>(null);

  // Si el servidor vuelve a renderizar (tras enviar), esa lista manda.
  useEffect(() => setMensajes(iniciales), [iniciales]);

  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel(`chat:${conversacionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensajes',
          filter: `conversacion_id=eq.${conversacionId}`,
        },
        (payload) => {
          const nuevo = payload.new as Mensaje;
          setMensajes((previos) =>
            previos.some((m) => m.id === nuevo.id) ? previos : [...previos, nuevo],
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [conversacionId]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [mensajes.length]);

  return (
    <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto px-1 py-2">
      {mensajes.length === 0 && (
        <p className="py-8 text-center text-sm text-muted">Aún no hay mensajes.</p>
      )}

      {mensajes.map((m) => {
        const mio = m.autor_id === yo;
        return (
          <div key={m.id} className={`flex ${mio ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[13.5px] ${
                mio
                  ? 'rounded-br-sm bg-primary text-white'
                  : 'rounded-bl-sm bg-surface2 text-ink ring-1 ring-line'
              }`}
            >
              {!mio && (
                <b className="mb-0.5 block text-[11px] text-ink2">
                  {nombres[m.autor_id ?? ''] ?? 'Alguien'}
                </b>
              )}
              <p className="whitespace-pre-wrap break-words">{m.cuerpo}</p>
              <span
                className={`mt-0.5 block text-[10.5px] ${mio ? 'text-white/70' : 'text-muted'}`}
              >
                {fechaCorta(m.created_at)}
              </span>
            </div>
          </div>
        );
      })}

      <div ref={finRef} />
    </div>
  );
}
