'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Una fila que responde al instante, antes de que conteste el servidor.
 *
 * Completar una tarea es lo que más se hace en la aplicación, y cada vez había
 * que esperar a que el servidor guardara y devolviera la pantalla para ver que
 * se había hecho. Aquí la fila cambia en el mismo clic, y el servidor confirma
 * después:
 *
 *   · `data-optimista="sale"` en un formulario de dentro: la fila se desvanece
 *     y se recoge (completar, aplazar o borrar en la lista de Tareas).
 *   · `data-optimista="hecha"`: la fila se queda tachada y sin botón
 *     (completar una tarea en la ficha del caso, donde las hechas se ven).
 *
 * Si el servidor dice que no —un error, la red—, la fila VUELVE tal como
 * estaba: cuando termina el envío sin que la página nueva la haya quitado, este
 * componente sigue montado y se deshace el cambio. Y si nadie dice nada en
 * quince segundos, también. Lo optimista no puede quedarse mintiendo.
 *
 * El componente no sabe nada de tareas: solo escucha los envíos de los
 * formularios que lleva dentro, así que la acción de cada uno sigue siendo la
 * misma acción de servidor de siempre.
 */

type Modo = 'sale' | 'hecha';

type Props = {
  /** La etiqueta que pinta: `article`, `li`, `div`… para no romper la estructura. */
  como?: 'article' | 'li' | 'div';
  className?: string;
  children: React.ReactNode;
};

const ESPERA_MAXIMA_MS = 15_000;
/** Lo que dura el desvanecido antes de recoger el hueco. */
const SALIDA_MS = 200;

export function FilaOptimista({ como: Etiqueta = 'div', className, children }: Props) {
  const [modo, setModo] = useState<Modo | null>(null);
  const [recogida, setRecogida] = useState(false);
  const relojes = useRef<ReturnType<typeof setTimeout>[]>([]);

  const deshacer = () => {
    for (const r of relojes.current) clearTimeout(r);
    relojes.current = [];
    setModo(null);
    setRecogida(false);
  };

  useEffect(() => {
    // Termina el envío y esta fila sigue aquí: el servidor no la quitó. Se deshace.
    window.addEventListener('vd:envio-terminado', deshacer);
    return () => {
      window.removeEventListener('vd:envio-terminado', deshacer);
      for (const r of relojes.current) clearTimeout(r);
    };
  }, []);

  return (
    <Etiqueta
      className={className}
      data-optimista={modo ?? undefined}
      hidden={recogida || undefined}
      onSubmitCapture={(e) => {
        const form = e.target as HTMLFormElement;
        const pedido = form.dataset?.optimista;
        if (pedido !== 'sale' && pedido !== 'hecha') return;
        // El doble clic ya lo corta la barra de progreso; aquí no se repite nada.
        if (modo) return;

        setModo(pedido);
        if (pedido === 'sale') {
          relojes.current.push(setTimeout(() => setRecogida(true), SALIDA_MS));
        }
        relojes.current.push(setTimeout(deshacer, ESPERA_MAXIMA_MS));
      }}
    >
      {children}
    </Etiqueta>
  );
}
