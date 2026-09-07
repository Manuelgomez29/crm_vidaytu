/**
 * Gráficos del panel.
 *
 * SVG plano, sin librería. Es la misma decisión que ya se tomó con la gráfica
 * de evolución clínica: 200 kB de dependencia no se justifican para dibujar
 * rectángulos y arcos, y una librería genérica hace difícil cumplir las reglas
 * de color del sistema de diseño.
 *
 * Tres reglas que se respetan en los tres:
 *   · El color sigue al CENTRO, nunca al ranking. Bellamar es azul aunque sea
 *     el último del mes.
 *   · Las cifras van en tinta, jamás en el color de la serie. Quien no
 *     distingue bien los colores tiene que poder leer el gráfico igual.
 *   · Siempre hay leyenda o etiqueta con texto. El color acompaña, no informa
 *     por sí solo.
 */

export type Serie = { etiqueta: string; valor: number; color?: string };

const PALETA = [
  'var(--color-graf-hz)',
  'var(--color-graf-ec)',
  'var(--color-graf-bm)',
  'var(--color-graf-gr)',
  'var(--color-primary)',
  'var(--color-coral)',
];

function colorDe(s: Serie, i: number): string {
  return s.color ?? PALETA[i % PALETA.length];
}

const formatea = (n: number) => new Intl.NumberFormat('es-ES').format(Math.round(n));

/** Barras horizontales. Lo mejor cuando las etiquetas son largas. */
export function Barras({ series, sufijo = '' }: { series: Serie[]; sufijo?: string }) {
  const max = Math.max(1, ...series.map((s) => s.valor));
  if (series.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {series.map((s, i) => (
        <div key={s.etiqueta}>
          <div className="mb-0.5 flex items-baseline justify-between gap-2 text-[12.5px]">
            <span className="truncate text-ink2">{s.etiqueta}</span>
            <span className="num shrink-0 font-semibold text-ink">
              {formatea(s.valor)}
              {sufijo}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface2">
            <div
              className="h-2 rounded-full"
              style={{ width: `${(s.valor / max) * 100}%`, background: colorDe(s, i) }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Columnas verticales. Para series temporales, donde el orden es el eje. */
export function Columnas({ series, sufijo = '' }: { series: Serie[]; sufijo?: string }) {
  const max = Math.max(1, ...series.map((s) => s.valor));
  if (series.length === 0) return null;

  return (
    <div className="flex items-end gap-1.5" style={{ height: 130 }}>
      {series.map((s, i) => (
        <div key={s.etiqueta} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
          <span className="num text-[11px] font-semibold text-ink">
            {formatea(s.valor)}
            {sufijo}
          </span>
          <div
            className="w-full rounded-t"
            style={{
              height: `${Math.max(2, (s.valor / max) * 88)}%`,
              background: colorDe(s, i),
            }}
            title={`${s.etiqueta}: ${formatea(s.valor)}${sufijo}`}
          />
          <span className="w-full truncate text-center text-[10px] text-muted">{s.etiqueta}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Anillo. Solo para repartos que suman un total con sentido — de dónde llegan
 * los casos, por ejemplo. Nunca para comparar magnitudes: para eso están las
 * barras, que el ojo lee mucho mejor.
 */
export function Anillo({ series }: { series: Serie[] }) {
  const total = series.reduce((s, x) => s + x.valor, 0);
  if (total === 0) return null;

  const R = 60;
  const GROSOR = 18;
  const circunferencia = 2 * Math.PI * R;
  let acumulado = 0;

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg width="150" height="150" viewBox="0 0 150 150" role="img" aria-label="Reparto por canal">
        <g transform="translate(75,75) rotate(-90)">
          {series.map((s, i) => {
            const porcion = (s.valor / total) * circunferencia;
            const trozo = (
              <circle
                key={s.etiqueta}
                r={R}
                fill="none"
                stroke={colorDe(s, i)}
                strokeWidth={GROSOR}
                strokeDasharray={`${porcion} ${circunferencia - porcion}`}
                strokeDashoffset={-acumulado}
              />
            );
            acumulado += porcion;
            return trozo;
          })}
        </g>
        <text
          x="75"
          y="72"
          textAnchor="middle"
          className="num"
          style={{ fontSize: 20, fontWeight: 700, fill: 'var(--color-ink)' }}
        >
          {formatea(total)}
        </text>
        <text
          x="75"
          y="88"
          textAnchor="middle"
          style={{ fontSize: 9, fill: 'var(--color-muted)' }}
        >
          en total
        </text>
      </svg>

      {/* Leyenda con texto: el color acompaña, no informa por sí solo. */}
      <ul className="flex min-w-0 flex-1 flex-col gap-1">
        {series.map((s, i) => (
          <li key={s.etiqueta} className="flex items-center gap-2 text-[12.5px]">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: colorDe(s, i) }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-ink2">{s.etiqueta}</span>
            <span className="num shrink-0 font-semibold">
              {formatea(s.valor)}{' '}
              <span className="font-normal text-muted">
                ({Math.round((s.valor / total) * 100)}%)
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type Apilada = { etiqueta: string; trozos: { etiqueta: string; valor: number }[] };

/**
 * Barras apiladas: el único de los tres que enseña el CRUCE.
 *
 * Los otros dos resumen un eje —cuánto suma cada canal, cómo se reparten los
 * centros— y eso ya lo dice la fila de totales. Esto enseña de qué está hecha
 * cada barra, que es la pregunta que lleva a alguien a cruzar dos dimensiones:
 * no «cuántos casos tiene Bellamar», sino «de dónde le llegan a Bellamar».
 *
 * Las barras se ordenan de mayor a menor porque comparar longitudes desiguales
 * es fácil, y comparar longitudes desordenadas no.
 */
export function BarrasApiladas({
  filas,
  columnas,
  sufijo = '',
}: {
  filas: Apilada[];
  columnas: string[];
  sufijo?: string;
}) {
  const totalDe = (f: Apilada) => f.trozos.reduce((s, t) => s + t.valor, 0);
  const ordenadas = [...filas].sort((a, b) => totalDe(b) - totalDe(a));
  const max = Math.max(1, ...ordenadas.map(totalDe));
  const colorCol = (c: string) => PALETA[columnas.indexOf(c) % PALETA.length];

  if (ordenadas.length === 0) return null;

  return (
    <div>
      {/* Leyenda arriba: hay que saber qué es cada color antes de leer las barras. */}
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
        {columnas.map((c) => (
          <li key={c} className="flex items-center gap-1.5 text-[11.5px] text-ink2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: colorCol(c) }}
              aria-hidden
            />
            {c}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2.5">
        {ordenadas.map((f) => {
          const total = totalDe(f);
          return (
            <div key={f.etiqueta}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-[12.5px]">
                <span className="truncate text-ink2">{f.etiqueta}</span>
                <span className="num shrink-0 font-semibold text-ink">
                  {formatea(total)}
                  {sufijo}
                </span>
              </div>
              <div
                className="flex h-3 overflow-hidden rounded-full bg-surface2"
                style={{ width: `${Math.max(4, (total / max) * 100)}%` }}
                role="img"
                aria-label={`${f.etiqueta}: ${f.trozos
                  .filter((t) => t.valor > 0)
                  .map((t) => `${t.etiqueta} ${formatea(t.valor)}`)
                  .join(', ')}`}
              >
                {f.trozos
                  .filter((t) => t.valor > 0)
                  .map((t) => (
                    <div
                      key={t.etiqueta}
                      style={{
                        width: `${(t.valor / total) * 100}%`,
                        background: colorCol(t.etiqueta),
                      }}
                      title={`${t.etiqueta}: ${formatea(t.valor)}${sufijo}`}
                    />
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
