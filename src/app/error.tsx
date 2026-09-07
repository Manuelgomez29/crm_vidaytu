'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Qué se ve cuando una pantalla falla.
 *
 * Sin esto, Next enseña «Application error: a server-side exception has
 * occurred» y un identificador. Para quien está atendiendo una llamada eso no
 * es información, es un muro: no sabe si perdió lo que estaba escribiendo, ni
 * si el problema es suyo, ni a dónde ir.
 *
 * El identificador (`digest`) SÍ se enseña, pero explicado: es lo único que
 * permite encontrar el error en los registros, y pedírselo por teléfono a
 * alguien que no sabe dónde mirar es una conversación imposible.
 *
 * Lo que NO se enseña es el mensaje del error. Puede llevar dentro el nombre de
 * un caso o un fragmento de una consulta, y esto se ve en una pantalla que a
 * veces está delante de un paciente.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // A la consola del navegador para quien esté depurando; a Sentry si está
    // configurado, por el `onRequestError` de instrumentation.
    console.error('[pantalla] ', error);
  }, [error]);

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="panel w-[min(92vw,32rem)] p-6">
        <h1 className="mb-2 text-[17px] font-bold">Esta pantalla no ha podido cargarse</h1>
        <p className="mb-4 text-sm text-ink2">
          No se ha perdido nada de lo que ya estuviera guardado. Puedes intentarlo otra vez; si
          vuelve a fallar, avisa con el código de abajo y se puede localizar exactamente qué pasó.
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" onClick={reset} className="btn btn-primary">
            Intentar de nuevo
          </button>
          <Link href="/mi-dia" className="btn btn-ghost">
            Volver a Mi día
          </Link>
        </div>

        {error.digest && (
          <p className="rounded-lg bg-ground px-3 py-2 text-xs text-ink2 ring-1 ring-line">
            Código del error: <b className="font-mono">{error.digest}</b>
          </p>
        )}
      </div>
    </main>
  );
}
