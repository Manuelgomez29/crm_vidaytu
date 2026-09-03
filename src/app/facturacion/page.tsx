import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { fecha } from '@/lib/fechas';
import { exigirAccesoEconomico } from './guard';
import { crearFactura } from './actions';

const CHIP_ESTADO: Record<string, { texto: string; clase: string }> = {
  borrador: { texto: 'Borrador', clase: 'chip-mut' },
  emitida: { texto: 'Emitida', clase: 'chip-primary' },
  cobrada: { texto: 'Cobrada', clase: 'chip-ok' },
  anulada: { texto: 'Anulada', clase: 'chip-danger' },
};

const euros = (n: number | string | null) =>
  `${Number(n ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export default async function Facturacion({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; centro?: string; aviso?: string; error?: string }>;
}) {
  const { estado, centro, aviso, error } = await searchParams;
  const { supabase } = await exigirAccesoEconomico();

  let consulta = supabase
    .from('facturas')
    .select('id, numero, cliente_nombre, fecha, total, estado, centro:centros (nombre, slug)')
    .order('fecha', { ascending: false })
    .limit(200);
  if (estado) consulta = consulta.eq('estado', estado as 'borrador');
  if (centro) consulta = consulta.eq('centro_id', centro);

  const [{ data: facturas }, { data: centros }, { data: presupuestos }] = await Promise.all([
    consulta,
    supabase.from('centros').select('id, nombre').eq('activo', true).order('nombre'),
    // Presupuestos aceptados que todavía no tienen factura: es de donde nace
    // casi toda la facturación real.
    supabase
      .from('presupuestos')
      .select('id, importe, descripcion, lead:leads (nombre)')
      .eq('estado', 'aceptado')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const lista = facturas ?? [];
  const emitido = lista
    .filter((f) => f.estado !== 'anulada' && f.estado !== 'borrador')
    .reduce((s, f) => s + Number(f.total), 0);
  const pendiente = lista
    .filter((f) => f.estado === 'emitida')
    .reduce((s, f) => s + Number(f.total), 0);

  return (
    <AppShell
      seccion="facturacion"
      subseccion="/facturacion"
      titulo="Facturación"
      descripcion={`${lista.length} factura(s) · ${euros(emitido)} emitidos · ${euros(pendiente)} pendientes de cobro`}
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
        <h2 className="mb-1 text-sm font-semibold">Nueva factura</h2>
        <p className="mb-3 text-xs text-ink2">
          Lo normal es partir de un presupuesto aceptado: así nunca se factura algo que nadie
          propuso.
        </p>
        <form action={crearFactura} className="flex flex-wrap items-center gap-2">
          <select name="presupuesto" defaultValue="" className="campo min-w-64 flex-1">
            <option value="">Sin presupuesto (factura en blanco)</option>
            {(presupuestos ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.lead?.nombre} — {euros(p.importe)}
                {p.descripcion ? ` · ${p.descripcion.slice(0, 40)}` : ''}
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
          <input name="cliente" placeholder="Cliente (si va en blanco)" className="campo min-w-40" />
          <button type="submit" className="btn btn-coral">
            Crear
          </button>
        </form>
      </section>

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <select name="estado" defaultValue={estado ?? ''} className="campo">
          <option value="">Cualquier estado</option>
          <option value="borrador">Borrador</option>
          <option value="emitida">Emitida</option>
          <option value="cobrada">Cobrada</option>
          <option value="anulada">Anulada</option>
        </select>
        <select name="centro" defaultValue={centro ?? ''} className="campo">
          <option value="">Todos los centros</option>
          {(centros ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-ghost">
          Filtrar
        </button>
      </form>

      {lista.length === 0 ? (
        <p className="panel px-4 py-8 text-center text-sm text-ink2">Todavía no hay facturas.</p>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Número</th>
                <th>Cliente</th>
                <th>Centro</th>
                <th>Fecha</th>
                <th className="text-right">Total</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((f) => {
                const chip = CHIP_ESTADO[f.estado] ?? { texto: f.estado, clase: 'chip-mut' };
                return (
                  <tr key={f.id}>
                    <td>
                      <Link
                        href={`/facturacion/${f.id}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        {f.numero ?? 'Sin numerar'}
                      </Link>
                    </td>
                    <td>{f.cliente_nombre}</td>
                    <td className="text-ink2">{f.centro?.nombre}</td>
                    <td className="text-ink2">{fecha(f.fecha, false)}</td>
                    <td className="text-right font-semibold tabular-nums">{euros(f.total)}</td>
                    <td>
                      <span className={`chip ${chip.clase}`}>{chip.texto}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
