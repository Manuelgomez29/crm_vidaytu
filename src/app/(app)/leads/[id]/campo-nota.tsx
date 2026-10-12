'use client';

import { useEffect, useRef } from 'react';
import { avisarEscribiendo } from '@/components/presencia';

/**
 * El campo de la nota, que además avisa al canal de presencia.
 *
 * Así un compañero que tenga el mismo caso abierto ve «Fulano está escribiendo
 * una nota…» y no se pone a escribir la suya en paralelo. Se deja de avisar
 * sola a los dos segundos sin teclear: si no, quien se levanta a por un café
 * aparece escribiendo el resto de la tarde.
 */
export function CampoNota({ leadId, className }: { leadId: string; className?: string }) {
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canal = `caso:${leadId}`;

  useEffect(() => {
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
      avisarEscribiendo(canal, false);
    };
  }, [canal]);

  return (
    <input
      name="contenido"
      placeholder="¿Qué ha pasado?"
      className={className}
      onChange={(e) => {
        avisarEscribiendo(canal, e.target.value.length > 0);
        if (temporizador.current) clearTimeout(temporizador.current);
        temporizador.current = setTimeout(() => avisarEscribiendo(canal, false), 2000);
      }}
      onBlur={() => avisarEscribiendo(canal, false)}
    />
  );
}
