import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { clasesEtiqueta } from '@/lib/colores';
import { normalizarTelefono } from '@/lib/telefonos';
import { contactosDelSegmento, type FiltroSegmento } from '@/lib/segmentos';

const LIMITE = 100;

type FilaContacto = {
  id: string;
  nombre: string;
  telefono: string;
  email: string | null;
  zona: string | null;
  consentimiento_marketing: boolean;
  contacto_etiquetas: { etiqueta: { id: string; nombre: string; color: string | null } | null }[];
  lead_contactos: { lead_id: string }[];
};

export default async function DirectorioContactos({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; etiqueta?: string; lista?: string; consent?: string }>;
}) {
  const filtros = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfilRol } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .maybeSingle();
  if (perfilRol?.rol === 'terapeuta') redirect('/agenda');

  const [{ data: etiquetas }, { data: listas }, { count: totalContactos }] = await Promise.all([
    supabase.from('etiquetas').select('id, nombre, color').eq('activa', true).order('nombre'),
    supabase.from('listas').select('id, nombre, tipo, filtro').order('nombre'),
    supabase.from('contactos').select('id', { count: 'exact', head: true }),
  ]);

  // Recuento de cada lista y segmento para el panel lateral.
  const recuentos = new Map<string, number>();
  await Promise.all(
    (listas ?? []).map(async (l) => {
      if (l.tipo === 'estatica') {
        const { count } = await supabase
          .from('lista_contactos')
          .select('contacto_id', { count: 'exact', head: true })
          .eq('lista_id', l.id);
        recuentos.set(l.id, count ?? 0);
      } else {
        const ids = await contactosDelSegmento(supabase, (l.filtro ?? {}) as FiltroSegmento);
        recuentos.set(l.id, ids.length);
      }
    }),
  );

  // Filtro por lista: estática = sus miembros; dinámica = se calcula ahora.
  let idsDeLista: string[] | null = null;
  const listaElegida = listas?.find((l) => l.id === filtros.lista);
  if (listaElegida) {
    if (listaElegida.tipo === 'estatica') {
      const { data: miembros } = await supabase
        .from('lista_contactos')
        .select('contacto_id')
        .eq('lista_id', listaElegida.id);
      idsDeLista = (miembros ?? []).map((m) => m.contacto_id);
    } else {
      idsDeLista = await contactosDelSegmento(
        supabase,
        (listaElegida.filtro ?? {}) as FiltroSegmento,
      );
    }
  }

  let idsDeEtiqueta: string[] | null = null;
  if (filtros.etiqueta) {
    const { data: conEtiqueta } = await supabase
      .from('contacto_etiquetas')
      .select('contacto_id')
      .eq('etiqueta_id', filtros.etiqueta);
    idsDeEtiqueta = (conEtiqueta ?? []).map((c) => c.contacto_id);
  }

  let ids: string[] | null = null;
  if (idsDeLista !== null && idsDeEtiqueta !== null) {
    const enLista = new Set(idsDeLista);
    ids = idsDeEtiqueta.filter((id) => enLista.has(id));
  } else {
    ids = idsDeLista ?? idsDeEtiqueta;
  }

  let consulta = supabase
    .from('contactos')
    .select(
      `id, nombre, telefono, email, zona, consentimiento_marketing,
       contacto_etiquetas (etiqueta:etiquetas (id, nombre, color)),
       lead_contactos (lead_id)`,
    )
    .order('nombre')
    .limit(LIMITE);

  const busqueda = (filtros.q ?? '').trim();
  if (busqueda) {
    // Busca por nombre, email o teléfono (también si se teclea sin prefijo).
    const comoTelefono = normalizarTelefono(busqueda);
    const patrones = [
      `nombre.ilike.%${busqueda}%`,
      `email.ilike.%${busqueda}%`,
      `telefono.ilike.%${busqueda}%`,
      ...(comoTelefono ? [`telefono.eq.${comoTelefono}`] : []),
    ];
    consulta = consulta.or(patrones.join(','));
  }
  if (filtros.consent === 'si') consulta = consulta.eq('consentimiento_marketing', true);
  if (filtros.consent === 'no') consulta = consulta.eq('consentimiento_marketing', false);
  if (ids !== null) {
    if (ids.length === 0) {
      // Filtro que no deja a nadie: evitamos una consulta con lista vacía.
      return (
        <Pagina
          etiquetas={etiquetas ?? []}
          listas={listas ?? []}
          recuentos={recuentos}
          total={totalContactos ?? 0}
          filtros={filtros}
          contactos={[]}
        />
      );
    }
    consulta = consulta.in('id', ids);
  }

  const { data, error } = await consulta;

  return (
    <Pagina
      etiquetas={etiquetas ?? []}
      listas={listas ?? []}
      recuentos={recuentos}
      total={totalContactos ?? 0}
      filtros={filtros}
      contactos={(data ?? []) as unknown as FilaContacto[]}
      error={error?.message}
    />
  );
}

function Pagina({
  etiquetas,
  listas,
  recuentos,
  total,
  filtros,
  contactos,
  error,
}: {
  etiquetas: { id: string; nombre: string; color: string | null }[];
  listas: { id: string; nombre: string; tipo: string }[];
  recuentos: Map<string, number>;
  total: number;
  filtros: { q?: string; etiqueta?: string; lista?: string; consent?: string };
  contactos: FilaContacto[];
  error?: string;
}) {
  const hayFiltros = Boolean(filtros.q || filtros.etiqueta || filtros.lista || filtros.consent);

  return (
    <AppShell
      seccion="contactos"
      subseccion="/contactos"
      titulo="Contactos"
      descripcion={`${total} personas · deduplicadas por teléfono y email`}
    >
      <div className="grid items-start gap-4 lg:grid-cols-[230px_1fr]">
        {/* Panel de vistas: listas fijas y segmentos que se recalculan solos. */}
        <aside className="panel p-2.5">
          <p className="px-2.5 pb-1 pt-2 text-[10.5px] uppercase tracking-[0.1em] text-muted">
            Vistas
          </p>
          <Link
            href="/contactos"
            className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] font-medium transition ${
              !filtros.lista ? 'bg-primary-soft font-semibold text-primary' : 'text-ink2 hover:bg-ground'
            }`}
          >
            Todos <span className="num">{total}</span>
          </Link>

          {(['estatica', 'dinamica'] as const).map((tipo) => {
            const delTipo = listas.filter((l) => l.tipo === tipo);
            if (delTipo.length === 0) return null;
            return (
              <div key={tipo}>
                <p className="px-2.5 pb-1 pt-3 text-[10.5px] uppercase tracking-[0.1em] text-muted">
                  {tipo === 'estatica' ? 'Listas' : 'Segmentos'}
                </p>
                {delTipo.map((l) => (
                  <Link
                    key={l.id}
                    href={`/contactos?lista=${l.id}`}
                    className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition ${
                      filtros.lista === l.id
                        ? 'bg-primary-soft font-semibold text-primary'
                        : 'font-medium text-ink2 hover:bg-ground'
                    }`}
                  >
                    <span className="truncate">{l.nombre}</span>
                    <span className="num shrink-0">{recuentos.get(l.id) ?? 0}</span>
                  </Link>
                ))}
              </div>
            );
          })}

          <Link
            href="/contactos/listas"
            className="mt-2 block rounded-md px-2.5 py-1.5 text-[13px] font-semibold text-primary hover:bg-ground"
          >
            + Nueva lista o segmento
          </Link>
        </aside>

        <div>
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2 text-sm">
          <input
            name="q"
            defaultValue={filtros.q ?? ''}
            placeholder="Nombre, teléfono o email…"
            className="campo min-w-56 flex-1"
          />
          <select
            name="etiqueta"
            defaultValue={filtros.etiqueta ?? ''}
            className="campo"
          >
            <option value="">Cualquier etiqueta</option>
            {etiquetas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
          <input type="hidden" name="lista" value={filtros.lista ?? ''} />
          <select
            name="consent"
            defaultValue={filtros.consent ?? ''}
            className="campo"
          >
            <option value="">Consentimiento: indiferente</option>
            <option value="si">Con consentimiento</option>
            <option value="no">Sin consentimiento</option>
          </select>
          <button
            type="submit"
            className="btn btn-primary"
          >
            Buscar
          </button>
          {hayFiltros && (
            <Link href="/contactos" className="px-2 py-2 text-primary hover:underline">
              Limpiar
            </Link>
          )}
        </form>

        {error ? (
          <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-danger/25">
            No se pudo cargar el directorio: {error}
          </p>
        ) : contactos.length === 0 ? (
          <p className="rounded-lg bg-surface px-4 py-8 text-center text-sm text-ink2 ring-1 ring-line">
            Ningún contacto coincide con la búsqueda.
          </p>
        ) : (
          <>
            <p className="mb-2 text-sm text-ink2">
              {contactos.length} contacto{contactos.length === 1 ? '' : 's'}
              {contactos.length === LIMITE && ' (mostrando los primeros 100; afina la búsqueda)'}
            </p>
            <div className="panel overflow-x-auto">
              <table className="tabla min-w-[720px]">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Teléfono</th>
                    <th>Email</th>
                    <th>Zona</th>
                    <th>Etiquetas</th>
                    <th>Casos</th>
                    <th>Marketing</th>
                  </tr>
                </thead>
                <tbody>
                  {contactos.map((c) => (
                    <tr key={c.id}>
                      <td className="font-semibold">
                        <Link href={`/contactos/${c.id}`} className="hover:text-primary hover:underline">
                          {c.nombre}
                        </Link>
                      </td>
                      <td className="num text-ink2">{c.telefono}</td>
                      <td className="num text-ink2">{c.email ?? '—'}</td>
                      <td className="num text-ink2">{c.zona ?? '—'}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {c.contacto_etiquetas.map(
                            (ce) =>
                              ce.etiqueta && (
                                <span
                                  key={ce.etiqueta.id}
                                  className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${clasesEtiqueta(ce.etiqueta.color)}`}
                                >
                                  {ce.etiqueta.nombre}
                                </span>
                              ),
                          )}
                          {c.contacto_etiquetas.length === 0 && (
                            <span className="text-muted">—</span>
                          )}
                        </div>
                      </td>
                      <td className="num text-ink2">{c.lead_contactos.length}</td>
                      <td>
                        {c.consentimiento_marketing ? (
                          <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-medium text-ok ring-1 ring-ok/25">
                            Sí
                          </span>
                        ) : (
                          <span className="text-muted">No</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        </div>
      </div>
    </AppShell>
  );
}
