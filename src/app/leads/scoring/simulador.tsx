'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  QUE_MIDE,
  nivelDeCalor,
  puntuarSenales,
  type Regla,
  type Senal,
  type Umbrales,
} from '@/lib/scoring';

/**
 * Mover un número y ver qué pasa, antes de guardarlo.
 *
 * Esta pantalla era una tabla de formularios: cambiabas un 25 por un 15, dabas a
 * guardar, y no ocurría nada visible hasta que el motor recalculaba quince
 * minutos después. Nadie ajusta a ciegas algo cuyo efecto no puede ver, así que
 * en la práctica los números se quedaban como venían de fábrica.
 *
 * Ahora el servidor manda, una sola vez, qué señales cumple cada caso abierto —
 * no su puntuación, las SEÑALES— y aquí se recalcula todo a cada tecla. Lo que
 * se ve es el efecto real sobre los casos que hay ahora mismo, no un ejemplo.
 *
 * Nada se guarda hasta que se pulsa Guardar. Y hasta entonces, al lado de cada
 * cifra está la que había, porque «he subido esto» se entiende mucho mejor que
 * «esto vale 15».
 */
export type CasoSimulado = {
  id: string;
  nombre: string;
  /** Solo las señales que se cumplen. El resto se deduce por ausencia. */
  senales: Senal[];
};

type ReglaEditable = Regla & { id: string; descripcion: string | null };

function claseNivel(p: number, u: Umbrales) {
  return p >= u.caliente ? 'bg-danger' : p >= u.templado ? 'bg-warn' : 'bg-line2';
}

export function Simulador({
  reglasIniciales,
  umbralesIniciales,
  casos,
  guardar,
}: {
  reglasIniciales: ReglaEditable[];
  umbralesIniciales: Umbrales;
  casos: CasoSimulado[];
  /** Server action. Recibe el JSON de lo editado y lo guarda de una vez. */
  guardar: (formData: FormData) => void;
}) {
  const [reglas, setReglas] = useState(reglasIniciales);
  const [umbrales, setUmbrales] = useState(umbralesIniciales);

  const cambiado =
    JSON.stringify(reglas) !== JSON.stringify(reglasIniciales) ||
    JSON.stringify(umbrales) !== JSON.stringify(umbralesIniciales);

  /** Puntuación de cada caso: la de ahora y la que saldría con lo editado. */
  const puntuaciones = useMemo(
    () =>
      casos.map((c) => ({
        ...c,
        antes: puntuarSenales(c.senales, reglasIniciales),
        ahora: puntuarSenales(c.senales, reglas),
      })),
    [casos, reglas, reglasIniciales],
  );

  const reparto = (clave: 'antes' | 'ahora', u: Umbrales) => ({
    caliente: puntuaciones.filter((c) => c[clave] >= u.caliente).length,
    templado: puntuaciones.filter((c) => c[clave] >= u.templado && c[clave] < u.caliente).length,
    frio: puntuaciones.filter((c) => c[clave] < u.templado).length,
  });

  const antes = reparto('antes', umbralesIniciales);
  const ahora = reparto('ahora', umbrales);

  /** Cuántos casos abiertos cumplen cada señal. Una regla que no salta nunca se ve. */
  const cuantosCumplen = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const c of casos) for (const s of c.senales) cuenta.set(s, (cuenta.get(s) ?? 0) + 1);
    return cuenta;
  }, [casos]);

  const ordenados = [...puntuaciones].sort((a, b) => b.ahora - a.ahora);

  const editar = (id: string, cambios: Partial<ReglaEditable>) =>
    setReglas((rs) => rs.map((r) => (r.id === id ? { ...r, ...cambios } : r)));

  const diferencia = (a: number, b: number) =>
    a === b ? null : (
      <span className={`num text-xs font-medium ${b > a ? 'text-ok' : 'text-danger'}`}>
        {b > a ? '↑' : '↓'} {Math.abs(b - a)}
      </span>
    );

  return (
    <form action={guardar}>
      {/* Todo lo editado viaja en un campo, y se guarda de una vez. */}
      <input type="hidden" name="reglas" value={JSON.stringify(reglas)} />
      <input type="hidden" name="umbrales" value={JSON.stringify(umbrales)} />

      {/* ---------- Cómo queda la cola ---------- */}
      <section className="panel mb-4 p-4">
        <h2 className="mb-1 text-sm font-semibold">Cómo queda la cola</h2>
        <p className="mb-3 max-w-[72ch] text-xs text-ink2">
          Los {casos.length} casos abiertos de ahora mismo, repartidos con lo que hay en pantalla.
          Se recalcula a cada cambio y no guarda nada: puedes probar y volver atrás.
        </p>

        <div className="flex h-8 w-full overflow-hidden rounded-lg ring-1 ring-line">
          {(
            [
              ['caliente', ahora.caliente, 'bg-danger'],
              ['templado', ahora.templado, 'bg-warn'],
              ['frío', ahora.frio, 'bg-line2'],
            ] as const
          ).map(([nombre, valor, clase]) =>
            valor === 0 ? null : (
              <div
                key={nombre}
                className={`${clase} flex items-center justify-center text-[11.5px] font-bold text-white`}
                style={{ width: `${(valor / Math.max(1, casos.length)) * 100}%` }}
                title={`${valor} ${nombre}(s)`}
              >
                {valor}
              </div>
            ),
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
          <span>
            <b className="text-danger">{ahora.caliente}</b> calientes{' '}
            {diferencia(antes.caliente, ahora.caliente)}
          </span>
          <span>
            <b className="text-warn-ink">{ahora.templado}</b> templados{' '}
            {diferencia(antes.templado, ahora.templado)}
          </span>
          <span>
            <b className="text-ink2">{ahora.frio}</b> fríos {diferencia(antes.frio, ahora.frio)}
          </span>
        </div>

        {/* ---------- Dónde está el listón ---------- */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {(
            [
              ['caliente', 'Caliente a partir de', umbrales.caliente],
              ['templado', 'Templado a partir de', umbrales.templado],
            ] as const
          ).map(([clave, texto, valor]) => (
            <label key={clave} className="flex flex-col gap-1 text-[13px]">
              <span className="flex items-baseline justify-between">
                <span className="font-medium">{texto}</span>
                <b className="num">{valor}</b>
              </span>
              <input
                type="range"
                min={5}
                max={95}
                step={5}
                value={valor}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setUmbrales((u) =>
                    clave === 'caliente'
                      ? { caliente: n, templado: Math.min(u.templado, n - 5) }
                      : { caliente: Math.max(u.caliente, n + 5), templado: n },
                  );
                }}
                className="accent-primary"
              />
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">
          Por debajo del listón un caso no se descarta: se llama más tarde. Mover esto no cambia la
          puntuación de nadie, solo dónde empieza cada color.
        </p>
      </section>

      {/* ---------- Las reglas ---------- */}
      <section className="panel mb-4 p-4">
        <h2 className="mb-1 text-sm font-semibold">Qué suma y qué resta</h2>
        <p className="mb-3 max-w-[72ch] text-xs text-ink2">
          A la derecha de cada regla, en cuántos de los {casos.length} casos abiertos se cumple hoy.
          Una regla que no se cumple nunca no está haciendo nada, por muchos puntos que tenga.
        </p>

        <ul className="flex flex-col gap-2">
          {reglas.map((r) => {
            const cuantos = cuantosCumplen.get(r.senal) ?? 0;
            const original = reglasIniciales.find((x) => x.id === r.id)!;
            const tocada = r.puntos !== original.puntos || r.activa !== original.activa;
            return (
              <li
                key={r.id}
                className={`rounded-lg p-3 ring-1 ${
                  tocada ? 'bg-surface2 ring-primary/40' : 'ring-line'
                } ${r.activa ? '' : 'opacity-60'}`}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={r.activa}
                      onChange={(e) => editar(r.id, { activa: e.target.checked })}
                      aria-label={`Activar ${r.nombre}`}
                    />
                    <b className="text-[13px]">{r.nombre}</b>
                  </label>

                  <span className="text-xs text-ink2">{QUE_MIDE[r.senal]}</span>

                  <span
                    className={`chip ml-auto ${cuantos === 0 ? 'chip-mut' : 'chip-ok'}`}
                    title={`Se cumple en ${cuantos} de ${casos.length} casos abiertos`}
                  >
                    {cuantos === 0 ? 'no se cumple en ninguno' : `en ${cuantos} de ${casos.length}`}
                  </span>

                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={-40}
                      max={40}
                      step={5}
                      value={r.puntos}
                      onChange={(e) => editar(r.id, { puntos: Number(e.target.value) })}
                      className={r.puntos < 0 ? 'accent-danger' : 'accent-primary'}
                      aria-label={`Puntos de ${r.nombre}`}
                      disabled={!r.activa}
                    />
                    <b
                      className={`num w-12 text-right text-[15px] ${
                        r.puntos < 0 ? 'text-danger' : 'text-ink'
                      }`}
                    >
                      {r.puntos > 0 ? '+' : ''}
                      {r.puntos}
                    </b>
                    {tocada && (
                      <span className="num text-xs text-muted">
                        antes {original.puntos > 0 ? '+' : ''}
                        {original.puntos}
                        {original.activa ? '' : ' (apagada)'}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ---------- Casos de verdad ---------- */}
      <section className="panel mb-4 p-4">
        <h2 className="mb-1 text-sm font-semibold">Los casos, con estas reglas</h2>
        <p className="mb-3 max-w-[72ch] text-xs text-ink2">
          Los quince que más puntúan. Debajo de cada uno, exactamente por qué. Un número sin motivo
          no se cree nadie, y una puntuación en la que no se confía no la mira nadie.
        </p>

        {ordenados.length === 0 ? (
          <p className="text-sm text-muted">No hay casos abiertos con los que probar.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {ordenados.slice(0, 15).map((c) => {
              const nivel = nivelDeCalor(c.ahora, umbrales);
              const motivos = reglas.filter(
                (r) => r.activa && r.puntos !== 0 && c.senales.includes(r.senal),
              );
              return (
                <li key={c.id} className="border-b border-dashed border-line pb-1.5 last:border-0">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={`h-2 w-2 shrink-0 rounded-full ${claseNivel(c.ahora, umbrales)}`}
                    />
                    <Link
                      href={`/leads/${c.id}`}
                      className="text-[13px] font-medium hover:text-primary hover:underline"
                    >
                      {c.nombre}
                    </Link>
                    <span className={`chip ${nivel.clase}`}>{nivel.texto}</span>
                    <span className="num ml-auto text-[15px] font-bold">{c.ahora}</span>
                    {diferencia(c.antes, c.ahora)}
                  </div>
                  <p className="ml-4 text-[11.5px] text-muted">
                    {motivos.length === 0
                      ? 'ninguna regla se cumple en este caso'
                      : motivos
                          .map((m) => `${m.nombre} ${m.puntos > 0 ? '+' : ''}${m.puntos}`)
                          .join(' · ')}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---------- Guardar ---------- */}
      <div className="sticky bottom-3 flex flex-wrap items-center gap-3 rounded-lg bg-surface p-3 ring-1 ring-line">
        <button type="submit" className="btn btn-primary" disabled={!cambiado}>
          Guardar y recalcular
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!cambiado}
          onClick={() => {
            setReglas(reglasIniciales);
            setUmbrales(umbralesIniciales);
          }}
        >
          Descartar cambios
        </button>
        <span className="text-xs text-ink2">
          {cambiado
            ? 'Nada de esto se ha guardado todavía.'
            : 'Mueve cualquier control para ver el efecto antes de guardar.'}
        </span>
      </div>
    </form>
  );
}
