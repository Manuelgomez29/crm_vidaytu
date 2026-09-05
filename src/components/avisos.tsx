'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Aviso = {
  id: number;
  texto: string;
  tono: 'ok' | 'error';
  /** Si viene, se ofrece «Deshacer» durante unos segundos. */
  deshacer?: () => void | Promise<void>;
};

type Contexto = {
  mostrar: (aviso: Omit<Aviso, 'id'>) => void;
};

const AvisoContexto = createContext<Contexto | null>(null);

/** Cinco segundos: lo que tarda alguien en darse cuenta de que se equivocó. */
const DURACION = 5000;

export function useAviso(): Contexto {
  const ctx = useContext(AvisoContexto);
  if (ctx) return ctx;

  /*
   * Sin proveedor no se rompe la pantalla, pero SI se dice. La version anterior
   * devolvia una funcion vacia en silencio, y eso convierte «no hay proveedor»
   * en «el aviso no sale», que es indistinguible de un fallo de CSS o de la
   * accion. Costo una tarde averiguar cual de los tres era.
   */
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      '[avisos] Se ha pedido un aviso fuera de <ProveedorAvisos>. No se vera nada.',
    );
  }
  return { mostrar: () => {} };
}

/**
 * Avisos efímeros con deshacer.
 *
 * La edición en línea guarda sola y sin preguntar, que es lo que la hace
 * rápida. Eso solo es aceptable si equivocarse cuesta un clic: el aviso con
 * «Deshacer» es la red que sustituye al diálogo de confirmación.
 *
 * Se anuncia con `role="status"` y `aria-live` para que un lector de pantalla
 * lo lea, y la animación se desactiva sola si el sistema pide menos movimiento.
 */
export function ProveedorAvisos({ children }: { children: React.ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const siguienteId = useRef(1);

  const mostrar = useCallback((aviso: Omit<Aviso, 'id'>) => {
    const id = siguienteId.current++;
    setAvisos((v) => [...v, { ...aviso, id }]);
  }, []);

  /**
   * Los avisos se pintan colgando de <body>, no de donde esta el proveedor.
   *
   * `position: fixed` deja de referirse a la ventana si algun ancestro tiene
   * transform, filter o contain — y en una aplicacion con paneles, drawers y
   * animaciones eso pasa antes o despues. Sacarlo del arbol de estilos es la
   * unica forma de que un aviso no pueda quedarse escondido detras de nada.
   */
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  const bandeja = (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2"
    >
      {avisos.map((a) => (
        <Tarjeta
          key={a.id}
          aviso={a}
          alCerrar={() => setAvisos((v) => v.filter((x) => x.id !== a.id))}
        />
      ))}
    </div>
  );

  return (
    <AvisoContexto.Provider value={{ mostrar }}>
      {children}
      {montado && createPortal(bandeja, document.body)}
    </AvisoContexto.Provider>
  );
}

function Tarjeta({ aviso, alCerrar }: { aviso: Aviso; alCerrar: () => void }) {
  const [ocupado, setOcupado] = useState(false);

  /**
   * El cierre se guarda en una referencia para que el temporizador se plante
   * una sola vez al aparecer el aviso. Si dependiera de la función, cada render
   * del padre reiniciaría la cuenta y el aviso no se iría nunca.
   */
  const cerrar = useRef(alCerrar);
  cerrar.current = alCerrar;

  useEffect(() => {
    const t = setTimeout(() => cerrar.current(), DURACION);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={`panel pointer-events-auto flex items-center gap-3 px-4 py-3 text-[13px] motion-safe:animate-[subir_.18s_ease-out] ${
        aviso.tono === 'error' ? 'ring-1 ring-danger/30' : ''
      }`}
    >
      <span className={`flex-1 ${aviso.tono === 'error' ? 'text-danger' : 'text-ink'}`}>
        {aviso.texto}
      </span>
      {aviso.deshacer && (
        <button
          type="button"
          disabled={ocupado}
          onClick={async () => {
            setOcupado(true);
            await aviso.deshacer!();
            alCerrar();
          }}
          className="shrink-0 font-semibold text-primary underline underline-offset-2 hover:text-primary-hover disabled:opacity-50"
        >
          {ocupado ? 'Deshaciendo…' : 'Deshacer'}
        </button>
      )}
      <button
        type="button"
        onClick={alCerrar}
        aria-label="Cerrar aviso"
        className="shrink-0 text-muted transition hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}
