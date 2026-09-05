'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAviso } from '@/components/avisos';
import { etiquetaEstado } from '@/lib/estados';
import { hace } from '@/lib/fechas';
import { CampoRapido } from './campo-rapido';
import type { TarjetaLead } from './kanban';
import {
  etiquetarSeleccion,
  moverSeleccion,
  reasignarSeleccion,
  urgenciaSeleccion,
} from './acciones-bloque';

type Columna = {
  clave: string;
  texto: string;
  /** Ancho orientativo; la tabla es densa y el nombre manda. */
  clases?: string;
};

const COLUMNAS: Columna[] = [
  { clave: 'nombre', texto: 'Caso' },
  { clave: 'centro', texto: 'Centro' },
  { clave: 'estado', texto: 'Estado' },
  { clave: 'urgencia', texto: 'Urgencia' },
  { clave: 'propietario', texto: 'Propietario' },
  { clave: 'canal', texto: 'Canal' },
  { clave: 'puntuacion', texto: 'Calor', clases: 'text-right' },
  { clave: 'importe', texto: 'Importe', clases: 'text-right' },
  { clave: 'creado', texto: 'Entró', clases: 'text-right' },
];

const POR_DEFECTO = ['nombre', 'centro', 'estado', 'urgencia', 'propietario', 'creado'];
const ALMACEN = 'columnas-tabla-casos';

const CHIP_CENTRO: Record<string, string> = {
  horizonte: 'chip-hz',
  eclipse: 'chip-ec',
  bellamar: 'chip-bm',
  'bandeja-grupo': 'chip-gr',
};

function leerColumnas(iniciales?: string[]): string[] {
  if (iniciales?.length) return iniciales;
  if (typeof window === 'undefined') return POR_DEFECTO;
  try {
    const guardado = window.localStorage.getItem(ALMACEN);
    if (guardado) return JSON.parse(guardado) as string[];
  } catch {
    // Navegador con el almacenamiento capado: se usan las de serie.
  }
  return POR_DEFECTO;
}

/**
 * Los mismos casos, en tabla densa.
 *
 * El tablero enseña el embudo de un vistazo; la tabla sirve para lo otro que
 * hace un comercial: repasar cincuenta casos seguidos, ordenarlos por lo que le
 * interesa y tocar varios a la vez. Son dos formas de mirar lo mismo, no dos
 * pantallas distintas: comparten filtros, vistas guardadas y URL.
 *
 * Todo lo que se ve aquí ya lo filtró la base de datos. Ordenar y ocultar
 * columnas es cosa del navegador, sobre lo que RLS dejó pasar.
 */
export function TablaCasos({
  tarjetas,
  etapas,
  comerciales,
  etiquetas,
  columnasIniciales,
}: {
  tarjetas: TarjetaLead[];
  etapas: { id: string; nombre: string }[];
  comerciales: { id: string; nombre: string }[];
  etiquetas: { id: string; nombre: string }[];
  columnasIniciales?: string[];
}) {
  const router = useRouter();
  const { mostrar } = useAviso();
  const [visibles, setVisibles] = useState<string[]>(() => leerColumnas(columnasIniciales));
  const [orden, setOrden] = useState<{ campo: string; asc: boolean }>({
    campo: 'creado',
    asc: false,
  });
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [ocupado, empezar] = useTransition();
  const [ajustando, setAjustando] = useState(false);

  const columnas = COLUMNAS.filter((c) => visibles.includes(c.clave));

  function alternarColumna(clave: string) {
    const siguiente = visibles.includes(clave)
      ? visibles.filter((c) => c !== clave)
      : [...COLUMNAS.map((c) => c.clave).filter((c) => visibles.includes(c) || c === clave)];
    if (siguiente.length === 0) return; // nunca dejar la tabla sin columnas
    setVisibles(siguiente);
    try {
      window.localStorage.setItem(ALMACEN, JSON.stringify(siguiente));
    } catch {
      // Sin almacenamiento la preferencia dura lo que la pestaña. No es grave.
    }
  }

  const filas = useMemo(() => {
    const valor = (t: TarjetaLead, campo: string): string | number => {
      switch (campo) {
        case 'nombre':
          return t.nombre.toLowerCase();
        case 'centro':
          return t.centroNombre;
        case 'estado':
          return t.estado;
        case 'urgencia':
          return { alta: 3, media: 2, baja: 1 }[t.urgencia ?? ''] ?? 0;
        case 'propietario':
          return (t.propietarioNombre ?? '').toLowerCase();
        case 'canal':
          return t.canalNombre;
        case 'puntuacion':
          return t.puntuacion;
        case 'importe':
          return t.importe ?? -1;
        default:
          return t.creado;
      }
    };
    return [...tarjetas].sort((a, b) => {
      const va = valor(a, orden.campo);
      const vb = valor(b, orden.campo);
      if (va === vb) return 0;
      return (va < vb ? -1 : 1) * (orden.asc ? 1 : -1);
    });
  }, [tarjetas, orden]);

  const todas = elegidos.size > 0 && elegidos.size === filas.length;

  function alternarFila(id: string) {
    setElegidos((v) => {
      const n = new Set(v);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function enBloque(fn: () => Promise<{ mensaje: string; omitidos: number }>) {
    empezar(async () => {
      const r = await fn();
      mostrar({ texto: r.mensaje, tono: r.omitidos > 0 ? 'error' : 'ok' });
      setElegidos(new Set());
      router.refresh();
    });
  }

  const ids = [...elegidos];

  return (
    <div className="flex flex-col gap-3">
      {/* ---- Barra de acciones en bloque ---- */}
      {elegidos.size > 0 && (
        <div className="panel flex flex-wrap items-center gap-2 p-3">
          <span className="text-[13px] font-semibold">
            {elegidos.size} seleccionado{elegidos.size === 1 ? '' : 's'}
          </span>

          <select
            aria-label="Reasignar los casos seleccionados"
            defaultValue=""
            disabled={ocupado}
            onChange={(e) => e.target.value && enBloque(() => reasignarSeleccion(ids, e.target.value))}
            className="campo py-1 text-[12px]"
          >
            <option value="">Reasignar a…</option>
            {comerciales.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>

          <select
            aria-label="Mover los casos seleccionados de etapa"
            defaultValue=""
            disabled={ocupado}
            onChange={(e) => e.target.value && enBloque(() => moverSeleccion(ids, e.target.value))}
            className="campo py-1 text-[12px]"
          >
            <option value="">Mover a etapa…</option>
            {etapas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>

          <select
            aria-label="Cambiar la urgencia de los casos seleccionados"
            defaultValue=""
            disabled={ocupado}
            onChange={(e) => e.target.value && enBloque(() => urgenciaSeleccion(ids, e.target.value))}
            className="campo py-1 text-[12px]"
          >
            <option value="">Urgencia…</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>

          {etiquetas.length > 0 && (
            <select
              aria-label="Etiquetar a las personas de los casos seleccionados"
              defaultValue=""
              disabled={ocupado}
              onChange={(e) => e.target.value && enBloque(() => etiquetarSeleccion(ids, e.target.value))}
              className="campo py-1 text-[12px]"
            >
              <option value="">Etiquetar…</option>
              {etiquetas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => setElegidos(new Set())}
            className="ml-auto text-xs text-muted hover:text-ink"
          >
            Quitar selección
          </button>
        </div>
      )}

      {/* ---- Selector de columnas ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setAjustando((v) => !v)}
          aria-expanded={ajustando}
          className="btn btn-ghost btn-mini"
        >
          Columnas
        </button>
        {ajustando &&
          COLUMNAS.map((c) => (
            <label key={c.clave} className="flex items-center gap-1 text-xs text-ink2">
              <input
                type="checkbox"
                checked={visibles.includes(c.clave)}
                onChange={() => alternarColumna(c.clave)}
              />
              {c.texto}
            </label>
          ))}
      </div>

      {/* ---- Tabla ---- */}
      <div className="panel overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th className="w-8">
                <input
                  type="checkbox"
                  checked={todas}
                  aria-label="Seleccionar todos los casos de la lista"
                  onChange={(e) =>
                    setElegidos(e.target.checked ? new Set(filas.map((f) => f.id)) : new Set())
                  }
                />
              </th>
              {columnas.map((c) => (
                <th key={c.clave} className={c.clases}>
                  <button
                    type="button"
                    onClick={() =>
                      setOrden((o) => ({ campo: c.clave, asc: o.campo === c.clave ? !o.asc : true }))
                    }
                    className="inline-flex items-center gap-1 uppercase tracking-[0.08em] hover:text-primary"
                    aria-label={`Ordenar por ${c.texto}`}
                  >
                    {c.texto}
                    {orden.campo === c.clave && <span aria-hidden>{orden.asc ? '↑' : '↓'}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((t) => {
              const estado = etiquetaEstado(t.estado);
              const elegida = elegidos.has(t.id);
              return (
                <tr key={t.id} className={elegida ? 'bg-primary-soft/40' : ''}>
                  <td>
                    <input
                      type="checkbox"
                      checked={elegida}
                      aria-label={`Seleccionar ${t.nombre}`}
                      onChange={() => alternarFila(t.id)}
                    />
                  </td>
                  {columnas.map((c) => (
                    <td key={c.clave} className={c.clases}>
                      {c.clave === 'nombre' && (
                        <Link href={`/leads/${t.id}`} className="font-medium hover:text-primary hover:underline">
                          {t.nombre}
                        </Link>
                      )}
                      {c.clave === 'centro' && (
                        <span className={`chip ${CHIP_CENTRO[t.centroSlug] ?? 'chip-mut'}`}>
                          {t.centroNombre}
                        </span>
                      )}
                      {c.clave === 'estado' && <span className={`chip ${estado.clases}`}>{estado.texto}</span>}
                      {c.clave === 'urgencia' && (
                        <CampoRapido
                          leadId={t.id}
                          campo="urgencia"
                          valor={t.urgencia}
                          etiqueta={`Urgencia de ${t.nombre}`}
                          opciones={[
                            { valor: '', texto: '—' },
                            { valor: 'baja', texto: 'Baja' },
                            { valor: 'media', texto: 'Media' },
                            { valor: 'alta', texto: 'Alta' },
                          ]}
                        />
                      )}
                      {c.clave === 'propietario' && (
                        <CampoRapido
                          leadId={t.id}
                          campo="propietario_id"
                          valor={comerciales.find((x) => x.nombre === t.propietarioNombre)?.id ?? ''}
                          etiqueta={`Propietario de ${t.nombre}`}
                          opciones={[
                            { valor: '', texto: 'Sin asignar' },
                            ...comerciales.map((x) => ({ valor: x.id, texto: x.nombre })),
                          ]}
                        />
                      )}
                      {c.clave === 'canal' && <span className="text-ink2">{t.subcanal || t.canalNombre}</span>}
                      {c.clave === 'puntuacion' && <span className="num">{t.puntuacion}</span>}
                      {c.clave === 'importe' && (
                        <span className="num">{t.importe != null ? `${t.importe} €` : '—'}</span>
                      )}
                      {c.clave === 'creado' && <span className="text-muted">{hace(t.creado)}</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>

        {filas.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted">
            Ningún caso con estos filtros. Prueba a quitar alguno, o cambia de proceso arriba.
          </p>
        )}
      </div>
    </div>
  );
}
