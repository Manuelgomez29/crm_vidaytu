'use client';

import { useState } from 'react';

/**
 * Vista previa de la campaña, tal y como la verá quien la reciba.
 *
 * En cliente y sin llamar al servidor: quien redacta necesita ver el efecto de
 * un cambio al momento, y esperar a guardar rompe el ritmo de escribir.
 *
 * El HTML se pinta dentro de un iframe con `sandbox` vacío: el cuerpo de un
 * correo es contenido que alguien ha pegado, y no tiene por qué ejecutar
 * scripts ni tocar la página de la plataforma.
 */
export function VistaPrevia({
  asunto,
  texto,
  html,
  pie,
}: {
  asunto: string;
  texto: string;
  html: string | null;
  pie: string;
}) {
  const [modo, setModo] = useState<'texto' | 'html'>(html ? 'html' : 'texto');

  const resolver = (contenido: string, comoHtml: boolean) => {
    const enlace = 'https://…/baja/ejemplo';
    const pieResuelto = pie.replaceAll(
      '{baja}',
      comoHtml ? `<a href="${enlace}">darme de baja</a>` : enlace,
    );
    const cuerpo = contenido.replaceAll('{nombre}', 'Nombre de ejemplo');
    return comoHtml
      ? `${cuerpo}<hr style="border:none;border-top:1px solid #E2DFD6;margin:24px 0"><p style="font:12px/1.5 system-ui,sans-serif;color:#8A8FA0">${pieResuelto}</p>`
      : `${cuerpo}\n\n—\n${pieResuelto}`;
  };

  return (
    <section className="panel p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Vista previa</h2>
        {html && (
          <nav className="flex items-center gap-1 rounded-lg bg-surface2 p-1 text-xs">
            {(['html', 'texto'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModo(m)}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  modo === m ? 'bg-surface text-primary shadow-sm' : 'text-ink2'
                }`}
              >
                {m === 'html' ? 'HTML' : 'Texto plano'}
              </button>
            ))}
          </nav>
        )}
      </div>

      <div className="rounded-lg bg-ground p-3 ring-1 ring-line">
        <p className="mb-2 border-b border-line pb-2 text-[13px]">
          <span className="text-muted">Asunto: </span>
          <b>{asunto || '(sin asunto)'}</b>
        </p>

        {modo === 'html' && html ? (
          <iframe
            title="Vista previa del correo"
            sandbox=""
            srcDoc={`<!doctype html><meta charset="utf-8"><body style="margin:0;font:14px/1.6 system-ui,sans-serif;color:#242B3A">${resolver(html, true)}</body>`}
            className="h-72 w-full rounded-lg border border-line bg-white"
          />
        ) : (
          <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
            {resolver(texto, false) || '(sin contenido)'}
          </pre>
        )}
      </div>

      <p className="mt-2 text-xs text-muted">
        El pie con el enlace de baja lo añade la plataforma al enviar; aquí sale de ejemplo. Quien
        recibe el correo ve su nombre donde pone «Nombre de ejemplo».
      </p>
    </section>
  );
}
