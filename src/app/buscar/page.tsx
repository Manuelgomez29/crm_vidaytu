import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { etiquetaEstado } from '@/lib/estados';
import { normalizarTelefono } from '@/lib/telefonos';
import { hace } from '@/lib/fechas';

/**
 * Búsqueda global por nombre o teléfono. Devuelve casos y personas por
 * separado, cada cosa limitada por lo que RLS deja ver a quien busca.
 */
export default async function Buscar({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
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
  if (perfil?.rol === 'terapeuta') redirect('/agenda');

  const busqueda = (q ?? '').trim();

  // Se busca por texto y, si lo tecleado parece un teléfono, también en E.164.
  const comoTelefono = normalizarTelefono(busqueda);
  const patrones = busqueda
    ? [
        `nombre.ilike.%${busqueda}%`,
        `telefono.ilike.%${busqueda}%`,
        ...(comoTelefono ? [`telefono.eq.${comoTelefono}`] : []),
      ].join(',')
    : '';

  const [{ data: leads }, { data: contactos }] = busqueda
    ? await Promise.all([
        supabase
          .from('leads')
          .select('id, nombre, telefono, estado, created_at, centro:centros (nombre)')
          .or(patrones)
          .order('created_at', { ascending: false })
          .limit(25),
        supabase
          .from('contactos')
          .select('id, nombre, telefono, email, lead_contactos (lead_id)')
          .or(`${patrones},email.ilike.%${busqueda}%`)
          .order('nombre')
          .limit(25),
      ])
    : [{ data: [] }, { data: [] }];

  return (
    <AppShell
      seccion="leads"
      titulo="Búsqueda"
      descripcion={busqueda ? `Resultados para «${busqueda}»` : 'Busca por nombre o teléfono'}
    >
      <form method="get" className="mb-5 flex max-w-xl gap-2">
        <input
          name="q"
          defaultValue={busqueda}
          placeholder="Nombre o teléfono…"
          autoFocus
          className="campo flex-1"
        />
        <button type="submit" className="btn btn-primary">
          Buscar
        </button>
      </form>

      {!busqueda ? (
        <p className="text-sm text-muted">
          Escribe un nombre o un teléfono. El teléfono funciona con o sin prefijo.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section>
            <h3 className="mb-2 text-[11px] uppercase tracking-[0.1em] text-muted">
              Casos ({(leads ?? []).length})
            </h3>
            <div className="flex flex-col gap-2">
              {(leads ?? []).map((l) => {
                const estado = etiquetaEstado(l.estado);
                return (
                  <Link key={l.id} href={`/leads/${l.id}`} className="panel block p-3">
                    <div className="flex items-center justify-between gap-2">
                      <b className="text-[13.5px]">{l.nombre}</b>
                      <span className={`chip ${estado.clases}`}>{estado.texto}</span>
                    </div>
                    <p className="num mt-0.5 text-xs text-ink2">
                      {l.telefono} · {l.centro?.nombre} · {hace(l.created_at)}
                    </p>
                  </Link>
                );
              })}
              {(leads ?? []).length === 0 && (
                <p className="text-sm text-muted">Ningún caso coincide.</p>
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-[11px] uppercase tracking-[0.1em] text-muted">
              Personas ({(contactos ?? []).length})
            </h3>
            <div className="flex flex-col gap-2">
              {(contactos ?? []).map((c) => (
                <Link key={c.id} href={`/contactos/${c.id}`} className="panel block p-3">
                  <b className="text-[13.5px]">{c.nombre}</b>
                  <p className="num mt-0.5 text-xs text-ink2">
                    {c.telefono}
                    {c.email && ` · ${c.email}`} · {c.lead_contactos.length} caso
                    {c.lead_contactos.length === 1 ? '' : 's'}
                  </p>
                </Link>
              ))}
              {(contactos ?? []).length === 0 && (
                <p className="text-sm text-muted">Ninguna persona coincide.</p>
              )}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
