import { AppShell } from '@/components/app-shell';
import { hoyMadrid } from '@/lib/fechas';
import { exigirAccesoEconomico } from '../guard';

const euros = (n: number) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Primer día del mes actual, en Madrid. */
function inicioDeMes(): string {
  return `${hoyMadrid().slice(0, 7)}-01`;
}

/**
 * Informe económico por centro. Es lo que se le pasa a la gestoría: facturado,
 * cobrado y pendiente, con el desglose por centro y por método de cobro.
 */
export default async function Informe({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const { desde, hasta } = await searchParams;
  const { supabase } = await exigirAccesoEconomico();

  const inicio = desde || inicioDeMes();
  const fin = hasta || hoyMadrid();

  const [{ data: facturas }, { data: cobros }, { data: centros }] = await Promise.all([
    supabase
      .from('facturas')
      .select('centro_id, total, base_imponible, estado')
      .gte('fecha', inicio)
      .lte('fecha', fin),
    supabase.from('cobros').select('centro_id, importe, metodo').gte('fecha', inicio).lte('fecha', fin),
    supabase.from('centros').select('id, nombre').order('nombre'),
  ]);

  const nombreCentro = new Map((centros ?? []).map((c) => [c.id, c.nombre]));

  type Fila = { facturado: number; base: number; cobrado: number; pendiente: number };
  const porCentro = new Map<string, Fila>();
  const fila = (id: string): Fila => {
    const actual = porCentro.get(id) ?? { facturado: 0, base: 0, cobrado: 0, pendiente: 0 };
    porCentro.set(id, actual);
    return actual;
  };

  for (const f of facturas ?? []) {
    if (f.estado === 'anulada' || f.estado === 'borrador') continue;
    const r = fila(f.centro_id);
    r.facturado += Number(f.total);
    r.base += Number(f.base_imponible);
    if (f.estado === 'emitida') r.pendiente += Number(f.total);
  }
  for (const c of cobros ?? []) {
    fila(c.centro_id).cobrado += Number(c.importe);
  }

  const porMetodo = new Map<string, number>();
  for (const c of cobros ?? []) {
    porMetodo.set(c.metodo, (porMetodo.get(c.metodo) ?? 0) + Number(c.importe));
  }

  const totales = Array.from(porCentro.values()).reduce(
    (acc, r) => ({
      facturado: acc.facturado + r.facturado,
      base: acc.base + r.base,
      cobrado: acc.cobrado + r.cobrado,
      pendiente: acc.pendiente + r.pendiente,
    }),
    { facturado: 0, base: 0, cobrado: 0, pendiente: 0 },
  );

  return (
    <AppShell
      seccion="facturacion"
      subseccion="/facturacion/informe"
      titulo="Informe económico"
      descripcion={`Del ${inicio} al ${fin}`}
    >
      <form className="mb-5 flex flex-wrap items-center gap-2 print:hidden">
        <label className="text-xs text-ink2">
          Desde
          <input name="desde" type="date" defaultValue={inicio} className="campo ml-1.5" />
        </label>
        <label className="text-xs text-ink2">
          Hasta
          <input name="hasta" type="date" defaultValue={fin} className="campo ml-1.5" />
        </label>
        <button type="submit" className="btn btn-ghost">
          Recalcular
        </button>
        <a
          href={`/api/exportar?que=conversiones&desde=${inicio}&hasta=${fin}`}
          className="btn btn-ghost"
        >
          Exportar conversiones
        </a>
      </form>

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        {[
          ['Facturado', totales.facturado],
          ['Base imponible', totales.base],
          ['Cobrado', totales.cobrado],
          ['Pendiente de cobro', totales.pendiente],
        ].map(([texto, valor]) => (
          <article key={texto as string} className="panel p-4">
            <p className="text-[11px] uppercase tracking-[0.1em] text-muted">{texto as string}</p>
            <b className="mt-1 block text-[19px] tabular-nums">{euros(valor as number)}</b>
          </article>
        ))}
      </div>

      <section className="panel mb-5 overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th>Centro</th>
              <th className="text-right">Facturado</th>
              <th className="text-right">Base</th>
              <th className="text-right">Cobrado</th>
              <th className="text-right">Pendiente</th>
            </tr>
          </thead>
          <tbody>
            {porCentro.size === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sm text-muted">
                  Sin movimientos en este periodo.
                </td>
              </tr>
            ) : (
              Array.from(porCentro.entries()).map(([id, r]) => (
                <tr key={id}>
                  <td className="font-medium">{nombreCentro.get(id) ?? 'Sin centro'}</td>
                  <td className="text-right tabular-nums">{euros(r.facturado)}</td>
                  <td className="text-right tabular-nums">{euros(r.base)}</td>
                  <td className="text-right tabular-nums text-ok">{euros(r.cobrado)}</td>
                  <td className="text-right tabular-nums text-warn">{euros(r.pendiente)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {porMetodo.size > 0 && (
        <section className="panel p-4">
          <h2 className="mb-3 text-sm font-semibold">Cobros por método</h2>
          <ul className="flex flex-col gap-1.5 text-[13px]">
            {Array.from(porMetodo.entries()).map(([metodo, importe]) => (
              <li key={metodo} className="flex justify-between">
                <span className="text-ink2 capitalize">{metodo}</span>
                <b className="tabular-nums">{euros(importe)}</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-4 text-xs text-muted">
        «Pendiente» son facturas emitidas sin cobro completo. Las anuladas y los borradores no
        cuentan en ninguna columna.
      </p>
    </AppShell>
  );
}
