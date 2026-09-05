import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { calcularInformeMensual, mesAnterior } from '@/lib/informe-mensual';

const euros = (n: number) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;

/**
 * Informe mensual imprimible. El día 1 el motor manda este mismo resumen por
 * correo a dirección con el enlace a esta página.
 *
 * Sin librería de PDF: «Imprimir → Guardar como PDF» del navegador hace un
 * documento correcto, y evita una dependencia que habría que mantener.
 */
export default async function InformeMensual({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .maybeSingle();
  if (perfil?.rol !== 'direccion' && perfil?.rol !== 'admisiones') redirect('/leads');

  const elegido = /^\d{4}-\d{2}$/.test(mes ?? '') ? (mes as string) : mesAnterior();
  const informe = await calcularInformeMensual(supabase, elegido);

  const variacion =
    informe.leadsPrevios > 0
      ? Math.round(((informe.leads - informe.leadsPrevios) / informe.leadsPrevios) * 100)
      : null;

  const totales = informe.porCentro.reduce(
    (acc, c) => ({
      leads: acc.leads + c.leads,
      citas: acc.citas + c.citas,
      conversiones: acc.conversiones + c.conversiones,
      ingresos: acc.ingresos + c.ingresos,
      perdidos: acc.perdidos + c.perdidos,
    }),
    { leads: 0, citas: 0, conversiones: 0, ingresos: 0, perdidos: 0 },
  );

  return (
    <main className="mx-auto max-w-[880px] bg-white p-8 text-ink print:p-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/panel" className="btn btn-ghost">
          ← Volver al panel
        </Link>
        <form className="flex items-center gap-2">
          <input name="mes" type="month" defaultValue={elegido} className="campo" />
          <button type="submit" className="btn btn-ghost">
            Ver
          </button>
        </form>
      </div>

      <header className="mb-8 border-b-2 border-ink pb-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Grupo Vidaitu</p>
        <h1 className="text-[24px] font-bold">Informe de {informe.titulo}</h1>
        <p className="text-[13px] text-ink2">
          Del {informe.desde} al {informe.hasta} · solo cuentan las conversiones validadas
        </p>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ['Leads nuevos', String(informe.leads), variacion !== null ? `${variacion > 0 ? '+' : ''}${variacion}% vs mes anterior` : ''],
          ['Conversiones', String(informe.conversiones), ''],
          ['Ingresos validados', euros(informe.ingresos), ''],
          ['Ticket medio', euros(informe.ticketMedio), ''],
          ['Citas', String(informe.citas), `${informe.noShows} no presentados`],
          ['Bandeja de grupo', String(informe.bandeja), 'nacidos sin centro'],
          ['Empezaron tratamiento', String(informe.pacientesAlta), ''],
          ['Perdidos', String(totales.perdidos), ''],
        ].map(([titulo, valor, pie]) => (
          <div key={titulo} className="rounded-lg bg-ground p-3 ring-1 ring-line">
            <p className="text-[11px] uppercase tracking-wide text-muted">{titulo}</p>
            <p className="mt-0.5 text-[20px] font-bold tabular-nums">{valor}</p>
            {pie && <p className="text-[11px] text-ink2">{pie}</p>}
          </div>
        ))}
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink2">Por centro</h2>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b-2 border-ink">
              <th className="py-2 text-left font-semibold">Centro</th>
              <th className="py-2 text-right font-semibold">Leads</th>
              <th className="py-2 text-right font-semibold">Citas</th>
              <th className="py-2 text-right font-semibold">Conversiones</th>
              <th className="py-2 text-right font-semibold">Ingresos</th>
              <th className="py-2 text-right font-semibold">Perdidos</th>
            </tr>
          </thead>
          <tbody>
            {informe.porCentro.map((c) => (
              <tr key={c.centro} className="border-b border-line">
                <td className="py-2">{c.centro}</td>
                <td className="py-2 text-right tabular-nums">{c.leads}</td>
                <td className="py-2 text-right tabular-nums">{c.citas}</td>
                <td className="py-2 text-right tabular-nums">{c.conversiones}</td>
                <td className="py-2 text-right tabular-nums">{euros(c.ingresos)}</td>
                <td className="py-2 text-right tabular-nums">{c.perdidos}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-ink font-bold">
              <td className="py-2">Total</td>
              <td className="py-2 text-right tabular-nums">{totales.leads}</td>
              <td className="py-2 text-right tabular-nums">{totales.citas}</td>
              <td className="py-2 text-right tabular-nums">{totales.conversiones}</td>
              <td className="py-2 text-right tabular-nums">{euros(totales.ingresos)}</td>
              <td className="py-2 text-right tabular-nums">{totales.perdidos}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <div className="grid gap-8 sm:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink2">
            De dónde llegaron
          </h2>
          {informe.porCanal.length === 0 ? (
            <p className="text-sm text-muted">Sin leads en el mes.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-[13px]">
              {informe.porCanal.map(([canal, n]) => (
                <li key={canal} className="flex justify-between border-b border-line py-1">
                  <span>{canal}</span>
                  <b className="tabular-nums">{n}</b>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink2">
            Por qué se perdieron
          </h2>
          {informe.motivosPerdida.length === 0 ? (
            <p className="text-sm text-muted">Ningún caso perdido en el mes.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-[13px]">
              {informe.motivosPerdida.map(([motivo, n]) => (
                <li key={motivo} className="flex justify-between border-b border-line py-1">
                  <span>{motivo}</span>
                  <b className="tabular-nums">{n}</b>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="mt-8 border-t border-line pt-4 text-[11px] text-muted">
        Generado por Vidaitu DATA. Los ingresos son de conversiones validadas por dirección; las
        pendientes de validar no cuentan. Documento interno: contiene cifras del grupo, no datos de
        personas.
      </p>
    </main>
  );
}
