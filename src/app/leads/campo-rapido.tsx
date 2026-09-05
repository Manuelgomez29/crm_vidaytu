'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useAviso } from '@/components/avisos';
import { cambiarCampo, type CampoRapido as Campo } from './edicion-rapida';

export type Opcion = { valor: string; texto: string };

/**
 * Edición en línea: se toca el dato y se cambia, sin abrir nada.
 *
 * Guarda al instante y sin preguntar. No hay diálogo de confirmación porque
 * esto se usa veinte veces al día; lo que hay es un aviso con «Deshacer», que
 * cuesta un clic y deja rastro en el historial igual que el cambio.
 *
 * Si la base rechaza el cambio —un comercial intentando reasignar el
 * propietario de un caso, por ejemplo— se revierte lo que se veía en pantalla y
 * se explica por qué. La regla la sigue aplicando la base de datos, no esto.
 */
export function CampoRapido({
  leadId,
  campo,
  valor,
  opciones,
  etiqueta,
  className = '',
}: {
  leadId: string;
  campo: Campo;
  valor: string | null;
  opciones: Opcion[];
  etiqueta: string;
  className?: string;
}) {
  const router = useRouter();
  const { mostrar } = useAviso();
  const [actual, setActual] = useState(valor ?? '');
  const [guardando, empezar] = useTransition();

  function aplicar(nuevo: string, esReversion = false) {
    const previo = actual;
    setActual(nuevo);
    empezar(async () => {
      const r = await cambiarCampo(leadId, campo, nuevo || null, esReversion);
      if (!r.ok) {
        setActual(previo);
        mostrar({ texto: r.error, tono: 'error' });
        return;
      }
      if (r.descripcion === 'Sin cambios') return;
      router.refresh();
      mostrar({
        texto: esReversion ? 'Cambio deshecho.' : `${r.descripcion} actualizado.`,
        tono: 'ok',
        // Al deshacer no se ofrece deshacer otra vez: sería un bucle.
        deshacer: esReversion ? undefined : () => aplicar(r.anterior ?? '', true),
      });
    });
  }

  return (
    <select
      aria-label={etiqueta}
      title={etiqueta}
      value={actual}
      disabled={guardando}
      onChange={(e) => aplicar(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      /*
       * Dentro de una tarjeta arrastrable, tocar el desplegable empezaria a
       * arrastrarla: el gesto nace en el pointerdown, antes de que el navegador
       * decida que era un clic sobre un <select>. Cortarlo aqui es lo que hace
       * que se pueda editar en el tablero sin pelearse con el arrastre.
       */
      onPointerDown={(e) => e.stopPropagation()}
      className={`cursor-pointer rounded-lg border border-transparent bg-transparent px-1.5 py-0.5 text-[12px] text-ink2 outline-none transition hover:border-line2 hover:bg-surface focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25 disabled:opacity-50 ${className}`}
    >
      {opciones.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.texto}
        </option>
      ))}
    </select>
  );
}
