'use client';

import { useMemo, useState } from 'react';
import type { PasoEnviado, TipoPaso } from '../modelo';

/**
 * El constructor de un flujo: pasos encadenados, con ramas.
 *
 * El dato es un grafo (cada paso sabe cuál va después; una condición sabe dos),
 * pero aquí se pinta como lo que casi siempre es: una cadena vertical que, en
 * una condición, se abre en dos columnas —«sí» y «no»— que siguen cada una por
 * su lado. Es lo que se puede construir sin manual y leer de un vistazo en un
 * móvil. Un lienzo libre de nodos cabe encima de este mismo dato otro día.
 *
 * Nada se guarda hasta pulsar Guardar: el servidor valida el grafo entero
 * —aristas, plantillas, términos clínicos— y es él quien decide.
 */

type Opcion = { id: string; nombre: string; color?: string | null };

type Props = {
  pasosIniciales: PasoEnviado[];
  plantillas: Opcion[];
  etiquetas: Opcion[];
  listas: Opcion[];
  activo: boolean;
  guardar: (formData: FormData) => void;
};

const NOMBRE: Record<TipoPaso, string> = {
  email: 'Enviar correo',
  esperar: 'Esperar',
  etiqueta: 'Etiqueta',
  tarea: 'Tarea al comercial',
  aviso: 'Aviso al equipo',
  lista: 'Añadir a lista',
  condicion: 'Condición',
  fin: 'Fin',
};

const ICONO: Record<TipoPaso, string> = {
  email: '✉',
  esperar: '⏱',
  etiqueta: '🏷',
  tarea: '☑',
  aviso: '🔔',
  lista: '☰',
  condicion: '⑂',
  fin: '■',
};

const ESTADOS = [
  ['nuevo', 'Nuevo'],
  ['contactado', 'Contactado'],
  ['cita_agendada', 'Cita agendada'],
  ['cita_realizada', 'Cita realizada'],
  ['en_valoracion', 'En valoración'],
  ['convertido', 'Convertido'],
  ['derivado', 'Derivado'],
  ['perdido', 'Perdido'],
  ['no_valido', 'No válido'],
  ['reabierto', 'Reabierto'],
] as const;

let contador = 0;
const nuevaClave = () => `n-${Date.now().toString(36)}-${++contador}`;

function configPorDefecto(tipo: TipoPaso): Record<string, unknown> {
  switch (tipo) {
    case 'esperar':
      return { cantidad: 1, unidad: 'dias', solo_horario_centro: true };
    case 'etiqueta':
      return { accion: 'anadir' };
    case 'tarea':
      return { titulo: 'Llamar para hacer seguimiento', vence_en_horas: 24 };
    case 'aviso':
      return { a: 'propietario', mensaje: '' };
    case 'condicion':
      return { tipo: 'abrio_email' };
    default:
      return {};
  }
}

export function Constructor({ pasosIniciales, plantillas, etiquetas, listas, activo, guardar }: Props) {
  const [pasos, setPasos] = useState<PasoEnviado[]>(() =>
    pasosIniciales.map((p) => ({ ...p, clave: p.clave || p.id || nuevaClave() })),
  );
  const [menu, setMenu] = useState<{ tras: string | null; rama?: 'si' | 'no' } | null>(null);

  const porClave = useMemo(() => new Map(pasos.map((p) => [p.clave, p])), [pasos]);
  const inicio = pasos.find((p) => p.es_inicio) ?? null;

  const cambiado = JSON.stringify(pasos) !== JSON.stringify(pasosIniciales);

  /** Los pasos en orden de recorrido, para numerarlos y para `orden`. */
  const recorrido = useMemo(() => {
    const vistos: PasoEnviado[] = [];
    const visitar = (clave: string | null) => {
      if (!clave) return;
      const p = porClave.get(clave);
      if (!p || vistos.includes(p)) return;
      vistos.push(p);
      if (p.tipo === 'condicion') {
        visitar(p.siguiente_si);
        visitar(p.siguiente_no);
      } else {
        visitar(p.siguiente);
      }
    };
    visitar(inicio?.clave ?? null);
    return vistos;
  }, [porClave, inicio]);

  const numero = (clave: string) => recorrido.findIndex((p) => p.clave === clave) + 1;

  // --- Mutaciones ----------------------------------------------------------

  const actualizarConfig = (clave: string, cambios: Record<string, unknown>) =>
    setPasos((xs) => xs.map((p) => (p.clave === clave ? { ...p, config: { ...p.config, ...cambios } } : p)));

  /** Inserta un paso nuevo justo detrás de `tras` (o como inicio si no hay). */
  const anadir = (tipo: TipoPaso, tras: string | null, rama?: 'si' | 'no') => {
    const nuevo: PasoEnviado = {
      clave: nuevaClave(),
      tipo,
      config: configPorDefecto(tipo),
      es_inicio: false,
      orden: 0,
      siguiente: null,
      siguiente_si: null,
      siguiente_no: null,
    };
    setPasos((xs) => {
      if (!tras) {
        // Delante del todo: el nuevo pasa a ser el inicio y apunta al inicio anterior.
        const anterior = xs.find((p) => p.es_inicio);
        return [
          { ...nuevo, es_inicio: true, siguiente: anterior?.clave ?? null },
          ...xs.map((p) => ({ ...p, es_inicio: false })),
        ];
      }
      return [
        ...xs.map((p) => {
          if (p.clave !== tras) return p;
          if (p.tipo === 'condicion' && rama) {
            const campo = rama === 'si' ? 'siguiente_si' : 'siguiente_no';
            nuevo.siguiente = p[campo];
            return { ...p, [campo]: nuevo.clave };
          }
          nuevo.siguiente = p.siguiente;
          return { ...p, siguiente: nuevo.clave };
        }),
        nuevo,
      ];
    });
    setMenu(null);
  };

  /** Quita un paso y empalma: quien le apuntaba pasa a apuntar a su siguiente. */
  const quitar = (clave: string) => {
    setPasos((xs) => {
      const p = xs.find((x) => x.clave === clave);
      if (!p) return xs;
      // Una condición se quita con sus dos ramas colgando del «sí»: se conserva ese camino.
      const continuacion = p.tipo === 'condicion' ? p.siguiente_si ?? p.siguiente_no : p.siguiente;
      const resto = xs
        .filter((x) => x.clave !== clave)
        .map((x) => ({
          ...x,
          siguiente: x.siguiente === clave ? continuacion : x.siguiente,
          siguiente_si: x.siguiente_si === clave ? continuacion : x.siguiente_si,
          siguiente_no: x.siguiente_no === clave ? continuacion : x.siguiente_no,
        }));
      if (p.es_inicio && continuacion) {
        return resto.map((x) => (x.clave === continuacion ? { ...x, es_inicio: true } : x));
      }
      return resto;
    });
  };

  /** Lo que se manda al servidor: en orden de recorrido, con `orden` puesto. */
  const serializar = () => {
    const ordenados = recorrido.map((p, i) => ({ ...p, orden: i }));
    // Los que se hayan quedado colgando (no alcanzables) no se guardan.
    return JSON.stringify(ordenados);
  };

  // --- Pintado ---------------------------------------------------------------

  const emailsAntesDe = (clave: string) =>
    recorrido.slice(0, Math.max(0, numero(clave) - 1)).filter((p) => p.tipo === 'email');

  const Menu = ({ tras, rama }: { tras: string | null; rama?: 'si' | 'no' }) => {
    const abierto = menu && menu.tras === tras && menu.rama === rama;
    return (
      <div className="relative flex justify-center py-1">
        <button
          type="button"
          onClick={() => setMenu(abierto ? null : { tras, rama })}
          className="rounded-full border border-line2 bg-surface px-3 py-1 text-xs text-ink2 hover:border-primary hover:text-primary"
          aria-label="Añadir paso aquí"
        >
          + paso
        </button>
        {abierto && (
          <div className="absolute top-8 z-10 grid w-64 grid-cols-2 gap-1 rounded-xl border border-line bg-surface p-2 shadow-lg">
            {(Object.keys(NOMBRE) as TipoPaso[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => anadir(t, tras, rama)}
                className="rounded-lg px-2 py-1.5 text-left text-xs hover:bg-surface2"
              >
                <span className="mr-1" aria-hidden>
                  {ICONO[t]}
                </span>
                {NOMBRE[t]}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const Tarjeta = ({ p }: { p: PasoEnviado }) => {
    const c = p.config;
    const sel = 'campo w-full text-sm';
    return (
      <div className="tarjeta p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="num rounded-md bg-surface2 px-1.5 py-0.5 text-xs text-ink2">{numero(p.clave)}</span>
          <span aria-hidden>{ICONO[p.tipo]}</span>
          <span className="text-sm font-semibold">{NOMBRE[p.tipo]}</span>
          <button
            type="button"
            onClick={() => quitar(p.clave)}
            className="ml-auto text-xs text-muted hover:text-danger"
            aria-label="Quitar paso"
          >
            quitar
          </button>
        </div>

        {p.tipo === 'email' && (
          <select
            className={sel}
            value={String(c.plantilla_id ?? '')}
            onChange={(e) => actualizarConfig(p.clave, { plantilla_id: e.target.value })}
          >
            <option value="">Elige la plantilla…</option>
            {plantillas.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </select>
        )}

        {p.tipo === 'esperar' && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <input
              type="number"
              min={0}
              className="campo w-20"
              value={Number(c.cantidad ?? 0)}
              onChange={(e) => actualizarConfig(p.clave, { cantidad: Number(e.target.value) })}
            />
            <select
              className="campo"
              value={String(c.unidad ?? 'dias')}
              onChange={(e) => actualizarConfig(p.clave, { unidad: e.target.value })}
            >
              <option value="horas">horas</option>
              <option value="dias">días</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-ink2">
              <input
                type="checkbox"
                checked={Boolean(c.solo_horario_centro)}
                onChange={(e) => actualizarConfig(p.clave, { solo_horario_centro: e.target.checked })}
              />
              solo en horario del centro
            </label>
          </div>
        )}

        {p.tipo === 'etiqueta' && (
          <div className="flex flex-wrap gap-2">
            <select
              className="campo"
              value={String(c.accion ?? 'anadir')}
              onChange={(e) => actualizarConfig(p.clave, { accion: e.target.value })}
            >
              <option value="anadir">Añadir</option>
              <option value="quitar">Quitar</option>
            </select>
            <select
              className="campo flex-1"
              value={String(c.etiqueta_id ?? '')}
              onChange={(e) => actualizarConfig(p.clave, { etiqueta_id: e.target.value })}
            >
              <option value="">Elige la etiqueta…</option>
              {etiquetas.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        {p.tipo === 'tarea' && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <input
              className="campo flex-1"
              value={String(c.titulo ?? '')}
              onChange={(e) => actualizarConfig(p.clave, { titulo: e.target.value })}
              placeholder="Título de la tarea"
            />
            <span className="text-xs text-ink2">vence en</span>
            <input
              type="number"
              min={1}
              className="campo w-20"
              value={Number(c.vence_en_horas ?? 24)}
              onChange={(e) => actualizarConfig(p.clave, { vence_en_horas: Number(e.target.value) })}
            />
            <span className="text-xs text-ink2">h</span>
          </div>
        )}

        {p.tipo === 'aviso' && (
          <div className="flex flex-wrap gap-2 text-sm">
            <select
              className="campo"
              value={String(c.a ?? 'propietario')}
              onChange={(e) => actualizarConfig(p.clave, { a: e.target.value })}
            >
              <option value="propietario">Al propietario del caso</option>
              <option value="direccion">A dirección</option>
            </select>
            <input
              className="campo flex-1"
              value={String(c.mensaje ?? '')}
              onChange={(e) => actualizarConfig(p.clave, { mensaje: e.target.value })}
              placeholder="Texto del aviso (sin datos de la persona)"
            />
          </div>
        )}

        {p.tipo === 'lista' && (
          <select
            className={sel}
            value={String(c.lista_id ?? '')}
            onChange={(e) => actualizarConfig(p.clave, { lista_id: e.target.value })}
          >
            <option value="">Elige la lista…</option>
            {listas.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </select>
        )}

        {p.tipo === 'condicion' && (
          <div className="flex flex-wrap gap-2 text-sm">
            <select
              className="campo"
              value={String(c.tipo ?? 'abrio_email')}
              onChange={(e) => actualizarConfig(p.clave, { tipo: e.target.value })}
            >
              <option value="abrio_email">¿Abrió el correo…?</option>
              <option value="hizo_clic">¿Hizo clic en el correo…?</option>
              <option value="tiene_etiqueta">¿Tiene la etiqueta…?</option>
              <option value="tiene_consentimiento">¿Tiene consentimiento de marketing?</option>
              <option value="estado_lead">¿Su caso está en el estado…?</option>
            </select>
            {(c.tipo === 'abrio_email' || c.tipo === 'hizo_clic') && (
              <select
                className="campo flex-1"
                value={String(c.paso_clave ?? c.paso_id ?? '')}
                onChange={(e) => actualizarConfig(p.clave, { paso_clave: e.target.value, paso_id: undefined })}
              >
                <option value="">…del paso</option>
                {emailsAntesDe(p.clave).map((e) => (
                  <option key={e.clave} value={e.clave}>
                    paso {numero(e.clave)} · {plantillas.find((x) => x.id === e.config.plantilla_id)?.nombre ?? 'correo'}
                  </option>
                ))}
              </select>
            )}
            {c.tipo === 'tiene_etiqueta' && (
              <select
                className="campo flex-1"
                value={String(c.etiqueta_id ?? '')}
                onChange={(e) => actualizarConfig(p.clave, { etiqueta_id: e.target.value })}
              >
                <option value="">…la etiqueta</option>
                {etiquetas.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </select>
            )}
            {c.tipo === 'estado_lead' && (
              <select
                className="campo flex-1"
                value={String(c.estado ?? '')}
                onChange={(e) => actualizarConfig(p.clave, { estado: e.target.value })}
              >
                <option value="">…el estado</option>
                {ESTADOS.map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {p.tipo === 'fin' && <p className="text-xs text-ink2">La persona termina el flujo aquí.</p>}
      </div>
    );
  };

  /** Una cadena desde `clave` hasta que se acaba o se abre en dos. */
  const Cadena = ({ desde, profundidad = 0 }: { desde: string | null; profundidad?: number }) => {
    const items: React.ReactNode[] = [];
    let clave = desde;
    let guardia = 0;
    while (clave && guardia++ < 200) {
      const p = porClave.get(clave);
      if (!p) break;
      items.push(<Tarjeta key={p.clave} p={p} />);
      if (p.tipo === 'condicion') {
        items.push(
          <div key={p.clave + '-ramas'} className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {(['si', 'no'] as const).map((rama) => (
              <div key={rama} className="rounded-xl border border-dashed border-line2 p-2">
                <p className="mb-1 text-center text-xs font-semibold text-ink2">
                  {rama === 'si' ? 'Sí →' : 'No →'}
                </p>
                <Cadena desde={rama === 'si' ? p.siguiente_si : p.siguiente_no} profundidad={profundidad + 1} />
                {!(rama === 'si' ? p.siguiente_si : p.siguiente_no) && <Menu tras={p.clave} rama={rama} />}
              </div>
            ))}
          </div>,
        );
        break;
      }
      if (p.tipo === 'fin') break;
      items.push(<Menu key={p.clave + '-mas'} tras={p.clave} />);
      clave = p.siguiente;
    }
    return <div className="flex flex-col gap-2">{items}</div>;
  };

  return (
    <form action={guardar} className="flex flex-col gap-3">
      <input type="hidden" name="pasos" value={serializar()} readOnly />

      {activo && cambiado && (
        <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn ring-1 ring-warn/25">
          El flujo está activo: al guardar, quien ya esté dentro seguirá por los pasos nuevos desde donde esté.
        </p>
      )}

      {!inicio ? (
        <div className="panel flex flex-col items-center gap-2 px-4 py-8 text-center">
          <p className="text-sm text-ink2">Todavía no hay pasos. Empieza por el primero.</p>
          <Menu tras={null} />
        </div>
      ) : (
        <Cadena desde={inicio.clave} />
      )}

      {/* Los pasos que se hayan quedado sin camino hasta ellos no se guardan. */}
      {pasos.length > recorrido.length && (
        <p className="text-xs text-muted">
          {pasos.length - recorrido.length} paso(s) han quedado sin conexión y no se guardarán.
        </p>
      )}

      <div className="sticky bottom-2 flex items-center justify-end gap-2">
        {cambiado && <span className="text-xs text-ink2">Cambios sin guardar</span>}
        <button type="submit" className="btn btn-coral" disabled={!cambiado}>
          Guardar pasos
        </button>
      </div>
    </form>
  );
}
