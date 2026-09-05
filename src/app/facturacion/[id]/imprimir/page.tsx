import { notFound } from 'next/navigation';
import Link from 'next/link';
import { fecha } from '@/lib/fechas';
import { exigirAccesoEconomico } from '../../guard';

const euros = (n: number | string | null) =>
  `${Number(n ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/**
 * Factura lista para imprimir o guardar como PDF desde el navegador.
 *
 * Sin librería de PDF a propósito: el «Imprimir → Guardar como PDF» del
 * navegador produce un documento correcto, con la tipografía del sistema del
 * usuario, y evita meter una dependencia pesada que habría que mantener para
 * algo que el navegador ya hace bien.
 */
export default async function ImprimirFactura({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await exigirAccesoEconomico();

  const { data: factura } = await supabase
    .from('facturas')
    .select('*, centro:centros (nombre)')
    .eq('id', id)
    .maybeSingle();
  if (!factura) notFound();

  const [{ data: lineas }, { data: datosFiscales }] = await Promise.all([
    supabase.from('factura_lineas').select('*').eq('factura_id', id).order('orden'),
    supabase.from('configuracion').select('valor').eq('clave', 'datos_fiscales').maybeSingle(),
  ]);

  const emisor = (datosFiscales?.valor ?? {}) as {
    razon_social?: string;
    nif?: string;
    direccion?: string;
    email?: string;
  };

  return (
    <main className="mx-auto max-w-[820px] bg-white p-8 text-ink print:p-0">
      <div className="mb-6 flex items-center justify-between gap-4 print:hidden">
        <Link href={`/facturacion/${id}`} className="btn btn-ghost">
          ← Volver
        </Link>
        <p className="text-xs text-muted">
          Usa Imprimir del navegador y elige «Guardar como PDF».
        </p>
      </div>

      <header className="mb-8 flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
        <div>
          <b className="block text-[17px] font-bold">
            {emisor.razon_social || 'Vidaitu'}
          </b>
          {emisor.nif && <span className="block text-[13px] text-ink2">NIF {emisor.nif}</span>}
          {emisor.direccion && (
            <span className="block text-[13px] text-ink2">{emisor.direccion}</span>
          )}
          {emisor.email && <span className="block text-[13px] text-ink2">{emisor.email}</span>}
          <span className="mt-1 block text-[12px] text-muted">{factura.centro?.nombre}</span>
        </div>

        <div className="text-right">
          <b className="block text-[17px] font-bold">{factura.numero ?? 'BORRADOR'}</b>
          <span className="block text-[13px] text-ink2">{fecha(factura.fecha, false)}</span>
          {factura.estado === 'anulada' && (
            <span className="mt-1 block text-[13px] font-bold text-danger">ANULADA</span>
          )}
        </div>
      </header>

      <section className="mb-8">
        <p className="mb-1 text-[11px] uppercase tracking-[0.1em] text-muted">Cliente</p>
        <b className="block text-[14px]">{factura.cliente_nombre}</b>
        {factura.cliente_nif && (
          <span className="block text-[13px] text-ink2">NIF {factura.cliente_nif}</span>
        )}
        {factura.cliente_direccion && (
          <span className="block text-[13px] text-ink2">{factura.cliente_direccion}</span>
        )}
      </section>

      <table className="mb-6 w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b-2 border-ink">
            <th className="py-2 text-left font-semibold">Concepto</th>
            <th className="py-2 text-right font-semibold">Cant.</th>
            <th className="py-2 text-right font-semibold">Precio</th>
            <th className="py-2 text-right font-semibold">Importe</th>
          </tr>
        </thead>
        <tbody>
          {(lineas ?? []).map((l) => (
            <tr key={l.id} className="border-b border-line">
              <td className="py-2">{l.concepto}</td>
              <td className="py-2 text-right tabular-nums">{Number(l.cantidad)}</td>
              <td className="py-2 text-right tabular-nums">{euros(l.precio_unitario)}</td>
              <td className="py-2 text-right tabular-nums">
                {euros(Number(l.cantidad) * Number(l.precio_unitario))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto w-full max-w-[280px] text-[13px]">
        <div className="flex justify-between py-1">
          <span className="text-ink2">Base imponible</span>
          <span className="tabular-nums">{euros(factura.base_imponible)}</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-ink2">IVA ({Number(factura.iva_porcentaje)}%)</span>
          <span className="tabular-nums">
            {euros(Number(factura.total) - Number(factura.base_imponible))}
          </span>
        </div>
        <div className="flex justify-between border-t-2 border-ink py-2 text-[15px] font-bold">
          <span>Total</span>
          <span className="tabular-nums">{euros(factura.total)}</span>
        </div>
      </div>

      {factura.notas && (
        <p className="mt-8 border-t border-line pt-4 text-[12px] text-ink2">{factura.notas}</p>
      )}

      {Number(factura.iva_porcentaje) === 0 && (
        <p className="mt-4 text-[11px] text-muted">
          Operación exenta de IVA. Confirmar el fundamento con la gestoría antes de emitir en serie.
        </p>
      )}
    </main>
  );
}
