'use client';

import { useActionState } from 'react';
import { crearFuente, regenerarToken, type Resultado } from './actions';

/**
 * El token, enseñado una vez.
 *
 * Aparece aquí, en la respuesta de la acción, y no viajando por la URL: una
 * llave en un `?token=` acaba en el historial del navegador y en los registros
 * del servidor y del proxy. Es el mismo cuidado que con el resumen de un caso.
 *
 * Y no se puede volver a ver, porque en la base solo hay su huella. Es
 * incómodo a propósito: un secreto que se puede releer desde un panel es un
 * secreto que acaba en una captura de pantalla en un chat.
 */
function TokenReciente({ resultado }: { resultado: Resultado }) {
  if (!resultado?.token) return null;
  return (
    <div className="mt-3 rounded-lg bg-ok-soft px-4 py-3 ring-1 ring-ok/25">
      <p className="text-sm font-semibold text-ok">Token de «{resultado.slug}» — cópialo ahora</p>
      <p className="mt-1 break-all rounded bg-surface px-3 py-2 font-mono text-[12.5px] ring-1 ring-line">
        {resultado.token}
      </p>
      <p className="mt-1.5 text-xs text-ink2">
        No se puede volver a ver: en la base solo queda su huella. Si se pierde, se genera otro y se
        cambia en la landing.
      </p>
    </div>
  );
}

export function AltaDeFuente({
  centros,
  canales,
  modalidades,
  clases,
}: {
  centros: { id: string; nombre: string }[];
  canales: { id: string; nombre: string }[];
  modalidades: { id: string; nombre: string }[];
  clases: { input: string; boton: string };
}) {
  const [resultado, accion, enviando] = useActionState<Resultado, FormData>(crearFuente, null);

  return (
    <>
      <form action={accion} className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
          Nombre
          <input name="nombre" required placeholder="Landing Bellamar" className={clases.input} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
          Identificador
          <input name="slug" required placeholder="landing-bellamar" className={clases.input} />
          <span className="text-xs font-normal text-ink2">
            Sale en el listado y en el origen de cada caso. Sin espacios ni acentos.
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
          Centro
          <select name="centro" defaultValue="" className={clases.input}>
            <option value="">Bandeja de grupo (sin centro)</option>
            {centros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <span className="text-xs font-normal text-ink2">
            Aquí se decide a dónde van sus leads. Lo que mande la landing se ignora.
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
          Canal
          <select name="canal" required defaultValue="" className={clases.input}>
            <option value="" disabled>
              Elige…
            </option>
            {canales.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
          Modalidad de interés
          <select name="modalidad" defaultValue="" className={clases.input}>
            <option value="">La que mande la landing</option>
            {modalidades.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
          <span className="text-xs font-normal text-ink2">
            Fíjala solo si la landing ofrece una sola cosa —Bellamar, ingreso residencial—. Donde
            hay varias, que la mande ella.
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
          Subcanal
          <input name="subcanal" placeholder="Meta · campaña otoño" className={clases.input} />
        </label>

        <button
          type="submit"
          disabled={enviando}
          className={`${clases.boton} sm:col-span-2 sm:justify-self-start`}
        >
          {enviando ? 'Creando…' : 'Crear fuente'}
        </button>
      </form>

      {resultado?.error && (
        <p className="mt-3 rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger ring-1 ring-danger/25">
          {resultado.error}
        </p>
      )}
      <TokenReciente resultado={resultado} />
    </>
  );
}

export function RegenerarToken({ id, nombre }: { id: string; nombre: string }) {
  const [resultado, accion, enviando] = useActionState<Resultado, FormData>(regenerarToken, null);

  return (
    <>
      <form action={accion}>
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={enviando}
          className="text-xs text-muted hover:text-danger hover:underline"
          title={`El token actual de ${nombre} dejará de valer en cuanto se genere el nuevo`}
        >
          {enviando ? 'Generando…' : 'Generar un token nuevo'}
        </button>
      </form>
      {resultado?.error && <p className="mt-1 text-xs text-danger">{resultado.error}</p>}
      <TokenReciente resultado={resultado} />
    </>
  );
}
