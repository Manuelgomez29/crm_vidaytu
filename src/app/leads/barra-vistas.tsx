'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useAviso } from '@/components/avisos';
import { alternarFavorita, borrarVista, guardarVista, marcarUsada, type Vista } from './vistas';

/**
 * Vistas guardadas: la combinación de filtros de siempre, a un clic.
 *
 * Cada comercial acaba mirando lo mismo cada mañana —«mis urgentes de
 * Bellamar»— y montarlo cuesta cinco desplegables. Lo que cuesta cinco clics se
 * deja de usar, y entonces se mira lo que sea fácil en vez de lo que toca.
 *
 * Guarda filtros, no resultados: al abrir una vista se vuelve a consultar y RLS
 * decide otra vez qué se ve.
 */
export function BarraVistas({
  pantalla,
  vistas,
  filtrosActuales,
  vistaActiva,
}: {
  pantalla: 'kanban' | 'contactos' | 'tabla_casos';
  vistas: Vista[];
  filtrosActuales: Record<string, string>;
  vistaActiva?: string;
}) {
  const router = useRouter();
  const { mostrar } = useAviso();
  const [nombrando, setNombrando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [ocupado, empezar] = useTransition();

  const hayFiltros = Object.keys(filtrosActuales).length > 0;

  function aplicar(v: Vista) {
    const p = new URLSearchParams(v.filtros);
    p.set('vista', v.id);
    empezar(async () => {
      await marcarUsada(v.id);
      router.push(`/leads?${p}`);
    });
  }

  function guardar() {
    empezar(async () => {
      const r = await guardarVista(pantalla, nombre, filtrosActuales);
      if (!r.ok) {
        mostrar({ texto: r.error, tono: 'error' });
        return;
      }
      setNombrando(false);
      setNombre('');
      mostrar({ texto: 'Vista guardada.', tono: 'ok' });
      router.refresh();
    });
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      {vistas.map((v) => {
        const activa = v.id === vistaActiva;
        return (
          <span
            key={v.id}
            className={`group inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-[12px] font-semibold transition ${
              activa
                ? 'bg-primary text-white'
                : 'bg-surface2 text-ink2 hover:bg-primary-soft hover:text-primary'
            }`}
          >
            <button
              type="button"
              disabled={ocupado}
              onClick={() => aplicar(v)}
              className="disabled:opacity-50"
            >
              {v.es_favorita && <span aria-hidden>★ </span>}
              {v.nombre}
            </button>
            <button
              type="button"
              aria-label={v.es_favorita ? `Quitar ${v.nombre} de favoritas` : `Marcar ${v.nombre} como favorita`}
              title="Favorita"
              onClick={() =>
                empezar(async () => {
                  await alternarFavorita(v.id, !v.es_favorita);
                  router.refresh();
                })
              }
              className="px-0.5 opacity-0 transition group-hover:opacity-70 hover:!opacity-100 focus-visible:opacity-100"
            >
              ☆
            </button>
            <button
              type="button"
              aria-label={`Borrar la vista ${v.nombre}`}
              title="Borrar"
              onClick={() =>
                empezar(async () => {
                  await borrarVista(v.id);
                  mostrar({ texto: `Vista «${v.nombre}» borrada.`, tono: 'ok' });
                  router.refresh();
                })
              }
              className="px-1 opacity-0 transition group-hover:opacity-70 hover:!opacity-100 focus-visible:opacity-100"
            >
              ✕
            </button>
          </span>
        );
      })}

      {nombrando ? (
        <span className="inline-flex items-center gap-1.5">
          <input
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') guardar();
              if (e.key === 'Escape') setNombrando(false);
            }}
            placeholder="Nombre de la vista"
            maxLength={60}
            className="campo py-1 text-[12px]"
          />
          <button type="button" disabled={ocupado} onClick={guardar} className="btn btn-mini">
            Guardar
          </button>
          <button
            type="button"
            onClick={() => setNombrando(false)}
            className="text-xs text-muted hover:text-ink"
          >
            Cancelar
          </button>
        </span>
      ) : (
        hayFiltros && (
          <button
            type="button"
            onClick={() => setNombrando(true)}
            className="rounded-full border border-dashed border-line2 px-2.5 py-0.5 text-[12px] text-ink2 transition hover:border-primary hover:text-primary"
          >
            + Guardar esta vista
          </button>
        )
      )}
    </div>
  );
}
