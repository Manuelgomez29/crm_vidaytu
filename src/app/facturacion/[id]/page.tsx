import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { fecha } from '@/lib/fechas';
import { exigirAccesoEconomico } from '../guard';
import { anadirLinea, anularFactura, borrarLinea, emitirFactura, guardarFactura } from '../actions';

const CHIP_ESTADO: Record<string, { texto: string; clase: string }> = {
  borrador: { texto: 'Borrador', clase: 'chip-mut' },
  emitida: { texto: 'Emitida', clase: 'chip-primary' },
  cobrada: { texto: 'Cobrada', clase: 'chip-ok' },
  anulada: { texto: 'Anulada', clase: 'chip-danger' },
};

const euros = (n: number | string | null) =>
  `${Number(n ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export default async function Factura({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string; error?: string }>;
}) {
  const { id } = await params;
  const { aviso, error } = await searchParams;
  const { supabase } = await exigirAccesoEconomico();

  const { data: factura } = await supabase
    .from('facturas')
    .select('*, centro:centros (nombre), lead:leads (id, nombre)')
    .eq('id', id)
    .maybeSingle();
  if (!factura) notFound();

  const [{ data: lineas }, { data: cobros }, { data: datosFiscales }] = await Promise.all([
    supabase.from('factura_lineas').select('*').eq('factura_id', id).order('orden'),
    supabase.from('cobros').select('id, fecha, importe, metodo').eq('factura_id', id).order('fecha'),
    supabase.from('configuracion').select('valor').eq('clave', 'datos_fiscales').maybeSingle(),
  ]);

  const emisor = (datosFiscales?.valor ?? {}) as {
    razon_social?: string;
    nif?: string;
    direccion?: string;
  };

  const cobrado = (cobros ?? []).reduce((s, c) => s + Number(c.importe), 0);
  const editable = factura.estado === 'borrador';
  const chip = CHIP_ESTADO[factura.estado] ?? { texto: factura.estado, clase: 'chip-mut' };

  return (
    <AppShell
      seccion="facturacion"
      subseccion="/facturacion"
      titulo={factura.numero ?? 'Factura en borrador'}
      descripcion={`${factura.cliente_nombre} · ${factura.centro?.nombre} · ${chip.texto}`}
      acciones={
        <Link href="/facturacion" className="btn btn-ghost">
          Todas
        </Link>
      }
    >
      {aviso && (
        <p className="mb-4 rounded-lg bg-ok-soft px-4 py-3 text-sm text-ok ring-1 ring-ok/25">{aviso}</p>
      )}
      {error && (
        <p className="mb-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-danger/25">
          {error}
        </p>
      )}
      {!emisor.nif && (
        <p className="mb-4 rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn ring-1 ring-warn/25">
          Faltan los datos fiscales del grupo. Dirección los rellena en Configuración → Parámetros:
          sin ellos la factura no es válida.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <section className="panel p-4">
            <h2 className="mb-3 text-sm font-semibold">Datos de la factura</h2>
            <form action={guardarFactura.bind(null, id)} className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="etiqueta-campo">Cliente</span>
                <input
                  name="cliente"
                  defaultValue={factura.cliente_nombre}
                  className="campo w-full"
                  disabled={!editable}
                  required
                />
              </label>
              <label className="block">
                <span className="etiqueta-campo">NIF / DNI</span>
                <input
                  name="nif"
                  defaultValue={factura.cliente_nif ?? ''}
                  className="campo w-full"
                  disabled={!editable}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="etiqueta-campo">Dirección</span>
                <input
                  name="direccion"
                  defaultValue={factura.cliente_direccion ?? ''}
                  className="campo w-full"
                  disabled={!editable}
                />
              </label>
              <label className="block">
                <span className="etiqueta-campo">Email</span>
                <input
                  name="email"
                  type="email"
                  defaultValue={factura.cliente_email ?? ''}
                  className="campo w-full"
                  disabled={!editable}
                />
              </label>
              <label className="block">
                <span className="etiqueta-campo">Fecha</span>
                <input
                  name="fecha"
                  type="date"
                  defaultValue={factura.fecha}
                  className="campo w-full"
                  disabled={!editable}
                />
              </label>
              <label className="block">
                <span className="etiqueta-campo">IVA (%)</span>
                <input
                  name="iva"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={factura.iva_porcentaje}
                  className="campo w-full"
                  disabled={!editable}
                />
                <span className="mt-1 block text-xs text-muted">
                  Los servicios sanitarios suelen ir exentos. Confírmalo con la gestoría.
                </span>
              </label>
              <label className="block sm:col-span-2">
                <span className="etiqueta-campo">Notas</span>
                <textarea
                  name="notas"
                  rows={2}
                  defaultValue={factura.notas ?? ''}
                  className="campo w-full"
                  disabled={!editable}
                />
              </label>
              {editable && (
                <div className="sm:col-span-2">
                  <button type="submit" className="btn btn-primary">
                    Guardar
                  </button>
                </div>
              )}
            </form>
          </section>

          <section className="panel p-4">
            <h2 className="mb-3 text-sm font-semibold">Conceptos</h2>

            {(lineas ?? []).length === 0 ? (
              <p className="mb-3 text-sm text-muted">Sin líneas todavía.</p>
            ) : (
              <div className="mb-3 overflow-x-auto">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Concepto</th>
                      <th className="text-right">Cantidad</th>
                      <th className="text-right">Precio</th>
                      <th className="text-right">Importe</th>
                      {editable && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {(lineas ?? []).map((l) => (
                      <tr key={l.id}>
                        <td>{l.concepto}</td>
                        <td className="text-right tabular-nums">{Number(l.cantidad)}</td>
                        <td className="text-right tabular-nums">{euros(l.precio_unitario)}</td>
                        <td className="text-right font-semibold tabular-nums">
                          {euros(Number(l.cantidad) * Number(l.precio_unitario))}
                        </td>
                        {editable && (
                          <td className="text-right">
                            <form action={borrarLinea.bind(null, id, l.id)}>
                              <button
                                type="submit"
                                className="text-xs text-muted hover:text-danger hover:underline"
                              >
                                Quitar
                              </button>
                            </form>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {editable && (
              <form action={anadirLinea.bind(null, id)} className="flex flex-wrap items-center gap-2">
                <input name="concepto" placeholder="Concepto" className="campo min-w-40 flex-1" required />
                <input
                  name="cantidad"
                  type="number"
                  step="0.01"
                  min="0.01"
                  defaultValue="1"
                  className="campo w-24"
                />
                <input
                  name="precio"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Precio"
                  className="campo w-32"
                  required
                />
                <button type="submit" className="btn btn-ghost">
                  Añadir
                </button>
              </form>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <section className="panel p-4">
            <h2 className="mb-3 text-sm font-semibold">Totales</h2>
            <dl className="flex flex-col gap-2 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-ink2">Base imponible</dt>
                <dd className="tabular-nums">{euros(factura.base_imponible)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink2">IVA ({Number(factura.iva_porcentaje)}%)</dt>
                <dd className="tabular-nums">
                  {euros(Number(factura.total) - Number(factura.base_imponible))}
                </dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2 text-[15px]">
                <dt className="font-semibold">Total</dt>
                <dd className="font-bold tabular-nums">{euros(factura.total)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink2">Cobrado</dt>
                <dd className={`tabular-nums ${cobrado > 0 ? 'text-ok' : 'text-muted'}`}>
                  {euros(cobrado)}
                </dd>
              </div>
              {Number(factura.total) - cobrado > 0.005 && (
                <div className="flex justify-between">
                  <dt className="text-ink2">Pendiente</dt>
                  <dd className="font-semibold tabular-nums text-warn">
                    {euros(Number(factura.total) - cobrado)}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {editable && (
            <form action={emitirFactura.bind(null, id)}>
              <button type="submit" className="btn btn-coral w-full">
                Emitir factura
              </button>
              <p className="mt-2 text-xs text-muted">
                Al emitirla se le asigna número de serie y deja de poder editarse.
              </p>
            </form>
          )}

          {factura.numero && factura.estado !== 'anulada' && (
            <>
              <Link href={`/facturacion/${id}/imprimir`} className="btn btn-ghost w-full">
                Ver para imprimir
              </Link>
              <form action={anularFactura.bind(null, id)}>
                <button type="submit" className="btn btn-ghost w-full text-danger">
                  Anular
                </button>
              </form>
            </>
          )}

          {(cobros ?? []).length > 0 && (
            <section className="panel p-4">
              <h2 className="mb-2 text-sm font-semibold">Cobros</h2>
              <ul className="flex flex-col gap-1.5 text-xs text-ink2">
                {(cobros ?? []).map((c) => (
                  <li key={c.id} className="flex justify-between">
                    <span>
                      {fecha(c.fecha, false)} · {c.metodo}
                    </span>
                    <b className="tabular-nums">{euros(c.importe)}</b>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {factura.lead && (
            <p className="text-xs text-muted">
              Viene del caso{' '}
              <Link href={`/facturacion`} className="text-primary hover:underline">
                {factura.lead.nombre}
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
