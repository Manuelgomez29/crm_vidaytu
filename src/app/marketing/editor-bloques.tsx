'use client';

import { useMemo, useState } from 'react';
import {
  renderizarBloques,
  type Bloque,
  type MarcaCorreo,
} from '@/lib/bloques';

/**
 * El editor de correos por bloques.
 *
 * Quien redacta no escribe HTML: añade bloques, los ordena y ve el correo tal
 * cual va a llegar, a la derecha, a cada tecla. El HTML y el texto los genera
 * `renderizarBloques()` —la misma función que usa el servidor al guardar—, así
 * que lo que se ve es lo que se envía.
 *
 * El componente solo produce un campo oculto `bloques` con el JSON: el
 * formulario que lo envuelve decide a qué acción va. Es el servidor quien
 * valida, genera el HTML definitivo y pasa el filtro de términos clínicos.
 */

type Props = {
  inicial: Bloque[];
  marca: MarcaCorreo;
  /** Nombre del campo oculto. Por defecto `bloques`. */
  name?: string;
};

const NOMBRE: Record<Bloque['tipo'], string> = {
  titulo: 'Título',
  parrafo: 'Párrafo',
  boton: 'Botón',
  imagen: 'Imagen',
  separador: 'Separador',
};

function nuevo(tipo: Bloque['tipo']): Bloque {
  switch (tipo) {
    case 'titulo':
      return { tipo, texto: '' };
    case 'parrafo':
      return { tipo, texto: '' };
    case 'boton':
      return { tipo, texto: 'Ver la guía', url: 'https://' };
    case 'imagen':
      return { tipo, url: 'https://', alt: '' };
    case 'separador':
      return { tipo };
  }
}

export function EditorBloques({ inicial, marca, name = 'bloques' }: Props) {
  const [bloques, setBloques] = useState<Bloque[]>(inicial);
  const [vista, setVista] = useState<'html' | 'texto'>('html');

  const { html, texto } = useMemo(() => renderizarBloques(bloques, marca), [bloques, marca]);

  const cambiar = (i: number, cambios: Partial<Bloque>) =>
    setBloques((xs) => xs.map((b, k) => (k === i ? ({ ...b, ...cambios } as Bloque) : b)));
  const mover = (i: number, d: -1 | 1) =>
    setBloques((xs) => {
      const j = i + d;
      if (j < 0 || j >= xs.length) return xs;
      const copia = [...xs];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });
  const quitar = (i: number) => setBloques((xs) => xs.filter((_, k) => k !== i));
  const anadir = (tipo: Bloque['tipo']) => setBloques((xs) => [...xs, nuevo(tipo)]);

  const campo = 'campo w-full text-sm';

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <input type="hidden" name={name} value={JSON.stringify(bloques)} readOnly />

      {/* ---------------------------------------------------------- Bloques */}
      <div className="flex flex-col gap-2">
        {bloques.length === 0 && (
          <p className="rounded-lg bg-surface2 px-3 py-4 text-center text-sm text-ink2">
            Añade el primer bloque con los botones de abajo.
          </p>
        )}

        {bloques.map((b, i) => (
          <div key={i} className="tarjeta p-3">
            <div className="mb-2 flex items-center gap-2 text-xs text-ink2">
              <span className="font-semibold text-ink">{NOMBRE[b.tipo]}</span>
              <span className="ml-auto flex gap-2">
                <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir" className="hover:text-ink disabled:opacity-30">
                  ↑
                </button>
                <button type="button" onClick={() => mover(i, 1)} disabled={i === bloques.length - 1} aria-label="Bajar" className="hover:text-ink disabled:opacity-30">
                  ↓
                </button>
                <button type="button" onClick={() => quitar(i)} className="hover:text-danger">
                  quitar
                </button>
              </span>
            </div>

            {b.tipo === 'titulo' && (
              <input className={campo} value={b.texto} placeholder="Título del correo" onChange={(e) => cambiar(i, { texto: e.target.value })} />
            )}
            {b.tipo === 'parrafo' && (
              <textarea
                className={campo}
                rows={4}
                value={b.texto}
                placeholder="Texto. Puedes usar {nombre} para saludar por su nombre."
                onChange={(e) => cambiar(i, { texto: e.target.value })}
              />
            )}
            {b.tipo === 'boton' && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <input className={campo} value={b.texto} placeholder="Texto del botón" onChange={(e) => cambiar(i, { texto: e.target.value })} />
                <input className={campo} value={b.url} placeholder="https://…" inputMode="url" onChange={(e) => cambiar(i, { url: e.target.value })} />
              </div>
            )}
            {b.tipo === 'imagen' && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <input className={campo} value={b.url} placeholder="https://… (dirección de la imagen)" inputMode="url" onChange={(e) => cambiar(i, { url: e.target.value })} />
                <input className={campo} value={b.alt} placeholder="Qué se ve (para quien no la carga)" onChange={(e) => cambiar(i, { alt: e.target.value })} />
              </div>
            )}
            {b.tipo === 'separador' && <p className="text-xs text-muted">Una línea fina entre secciones.</p>}
          </div>
        ))}

        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(NOMBRE) as Bloque['tipo'][]).map((t) => (
            <button key={t} type="button" onClick={() => anadir(t)} className="btn btn-ghost text-xs">
              + {NOMBRE[t]}
            </button>
          ))}
        </div>

        <p className="text-xs text-muted">
          El pie con el enlace de baja y la firma los pone el sistema al enviar: no hace falta
          escribirlos. Ningún correo puede mencionar el motivo de consulta.
        </p>
      </div>

      {/* ---------------------------------------------------------- Vista previa */}
      <div className="flex min-h-80 flex-col overflow-hidden rounded-xl border border-line">
        <div className="flex items-center gap-1 border-b border-line bg-surface2 px-2 py-1 text-xs">
          <span className="mr-auto text-ink2">Así llegará</span>
          <button type="button" onClick={() => setVista('html')} className={`rounded px-2 py-0.5 ${vista === 'html' ? 'bg-surface font-semibold' : 'text-ink2'}`}>
            Correo
          </button>
          <button type="button" onClick={() => setVista('texto')} className={`rounded px-2 py-0.5 ${vista === 'texto' ? 'bg-surface font-semibold' : 'text-ink2'}`}>
            Texto plano
          </button>
        </div>
        {vista === 'html' ? (
          /*
           * `sandbox` vacío: el cuerpo de un correo no ejecuta nada ni navega a
           * ningún sitio desde dentro de la aplicación. Solo se mira.
           */
          <iframe title="Vista previa del correo" sandbox="" srcDoc={html} className="min-h-80 flex-1 bg-[#F7F6F2]" />
        ) : (
          <pre className="flex-1 overflow-auto whitespace-pre-wrap p-4 text-sm text-ink">{texto}</pre>
        )}
      </div>
    </div>
  );
}
