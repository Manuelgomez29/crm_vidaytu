import { AppShell } from '@/components/app-shell';
import { fecha, hoyMadrid } from '@/lib/fechas';
import { exigirAccesoEconomico } from '../guard';
import { borrarCobro, registrarCobro } from '../actions';

const euros = (n: number | string | null) =>
  `${Number(n ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

const METODOS: Record<string, string> = {
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  efectivo: 'Efectivo',
  domiciliacion: 'Domiciliación',
  otro: 'Otro',
};

export default async function Cobros({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; aviso?: string; error?: string }>;
}) {
  const { desde, hasta, aviso, error } = await searchParams;
  const { supabase } = await exigirAccesoEconomico();

  let consulta = supabase
    .from('cobros')
    .select('id, fecha, importe, metodo, es_primer_pago, notas, centro:centros (nombre), factura:facturas (numero)')
    .order('fecha', { ascending: false })
    .limit(300);
  if (desde) consulta = consulta.gte('fecha', desde);
  if (hasta) consulta = consulta.lte('fecha', hasta);

  const [{ data: cobros }, { data: centros }, { data: facturas }] = await Promise.all([
    consulta,
    supabase.from('centros').select('id, nombre').eq('activo', true).order('nombre'),
    supabase
      .from('facturas')
      .select('id, numero, cliente_nombre, total')
      .eq('estado', 'emitida')
      .order('fecha', { ascending: false })
      .limit(100),
  ]);

  const total = (cobros ?? []).reduce((s, c) => s + Number(c.importe), 0);

  return (
    <AppShell
      seccion="facturacion"
      subseccion="/facturacion/cobros"
      titulo="Cobros"
      descripcion={`${(cobros ?? []).length} cobro(s) · ${euros(total)}`}
    >
      {aviso && (
        <p className="mb-4 rounded-lg bg-ok-soft px-4 py-3 text-sm text-ok ring-1 ring-ok/25">{aviso}</p>
      )}
      {error && (
        <p className="mb-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-danger/25">
          {error}
        </p>
      )}

      <section className="panel mb-5 p-4">
        <h2 className="mb-3 text-sm font-semibold">Registrar un cobro</h2>
        <form action={registrarCobro} className="flex flex-wrap items-end gap-2">
          <select name="factura" defaultValue="" className="campo min-w-56 flex-1">
            <option value="">Sin factura asociada</option>
            {(facturas ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.numero} — {f.cliente_nombre} ({euros(f.total)})
              </option>
            ))}
          </select>
          <select name="centro" defaultValue="" className="campo">
            <option value="">Centro…</option>
            {(centros ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <input name="fecha" type="date" defaultValue={hoyMadrid()} className="campo" />
          <input
            name="importe"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Importe"
            className="campo w-32"
            required
          />
          <select name="metodo" defaultValue="transferencia" className="campo">
            {Object.entries(METODOS).map(([clave, texto]) => (
              <option key={clave} value={clave}>
                {texto}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-ink2">
            <input type="checkbox" name="primer_pago" /> Primer pago
          </label>
          <button type="submit" className="btn btn-coral">
            Registrar
          </button>
        </form>
        <p className="mt-2 text-xs text-muted">
          Si el cobro cubre el total de la factura, esta pasa sola a «cobrada».
        </p>
      </section>

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <input name="desde" type="date" defaultValue={desde ?? ''} className="campo" />
        <input name="hasta" type="date" defaultValue={hasta ?? ''} className="campo" />
        <button type="submit" className="btn btn-ghost">
          Filtrar
        </button>
      </form>

      {(cobros ?? []).length === 0 ? (
        <p className="panel px-4 py-8 text-center text-sm text-ink2">Sin cobros en ese periodo.</p>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Factura</th>
                <th>Centro</th>
                <th>Método</th>
                <th className="text-right">Importe</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(cobros ?? []).map((c) => (
                <tr key={c.id}>
                  <td className="text-ink2">{fecha(c.fecha, false)}</td>
                  <td>
                    {c.factura?.numero ?? <span className="text-muted">—</span>}
                    {c.es_primer_pago && <span className="chip chip-primary ml-1.5">1.º pago</span>}
                  </td>
                  <td className="text-ink2">{c.centro?.nombre}</td>
                  <td className="text-ink2">{METODOS[c.metodo] ?? c.metodo}</td>
                  <td className="text-right font-semibold tabular-nums">{euros(c.importe)}</td>
                  <td className="text-right">
                    <form action={borrarCobro.bind(null, c.id)}>
                      <button
                        type="submit"
                        className="text-xs text-muted hover:text-danger hover:underline"
                      >
                        Borrar
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
