/**
 * Gráfica de evolución de un cuestionario clínico.
 *
 * SVG plano, sin librería de gráficos: son seis líneas de trigonometría de
 * instituto y evita meter 200 kB de dependencia en una pantalla que se abre
 * cinco veces al día.
 *
 * El texto de las cifras va en tinta, nunca en el color de la serie, y hay
 * puntos además de la línea: quien no distingue bien los colores tiene que
 * poder leerla igual.
 */
export type PuntoEvolucion = { fecha: string; valor: number };

export function Evolucion({
  puntos,
  titulo,
  maximo,
}: {
  puntos: PuntoEvolucion[];
  titulo: string;
  maximo?: number;
}) {
  if (puntos.length === 0) return null;

  // Con un solo registro no hay evolución que dibujar, solo un dato.
  if (puntos.length === 1) {
    return (
      <div className="rounded-lg bg-ground px-3 py-2 ring-1 ring-line">
        <p className="text-xs text-ink2">{titulo}</p>
        <p className="text-[15px] font-bold tabular-nums">{puntos[0].valor}</p>
        <p className="text-[11px] text-muted">
          Un solo registro. La evolución aparece a partir del segundo.
        </p>
      </div>
    );
  }

  const ancho = 280;
  const alto = 70;
  const margen = 6;

  const valores = puntos.map((p) => p.valor);
  const techo = maximo ?? Math.max(...valores, 1);
  const suelo = Math.min(...valores, 0);
  const rango = techo - suelo || 1;

  const coordenadas = puntos.map((p, i) => ({
    x: margen + (i / (puntos.length - 1)) * (ancho - margen * 2),
    y: alto - margen - ((p.valor - suelo) / rango) * (alto - margen * 2),
    ...p,
  }));

  const linea = coordenadas.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const primero = puntos[0].valor;
  const ultimo = puntos[puntos.length - 1].valor;
  const cambio = ultimo - primero;

  return (
    <div className="rounded-lg bg-ground px-3 py-2 ring-1 ring-line">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-ink2">{titulo}</p>
        <p className="shrink-0 text-xs tabular-nums text-ink2">
          <b className="text-[14px] text-ink">{ultimo}</b>
          {cambio !== 0 && (
            <span className="ml-1 text-muted">
              {cambio > 0 ? '+' : ''}
              {cambio} desde {primero}
            </span>
          )}
        </p>
      </div>

      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        className="w-full"
        role="img"
        aria-label={`${titulo}: de ${primero} a ${ultimo} en ${puntos.length} registros`}
      >
        <polyline
          points={linea}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {coordenadas.map((c) => (
          <circle key={c.fecha} cx={c.x} cy={c.y} r="2.6" fill="var(--color-primary)" />
        ))}
      </svg>

      <p className="text-[11px] text-muted">
        {puntos[0].fecha} → {puntos[puntos.length - 1].fecha} · {puntos.length} registros
      </p>
    </div>
  );
}
