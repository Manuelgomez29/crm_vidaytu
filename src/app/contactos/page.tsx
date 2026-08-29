import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Cabecera } from '@/components/cabecera';
import { NavContactos } from './nav';
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

  const [{ data: etiquetas }, { data: listas }] = await Promise.all([
    supabase.from('etiquetas').select('id, nombre, color').eq('activa', true).order('nombre'),
    supabase.from('listas').select('id, nombre, tipo, filtro').order('nombre'),
  ]);

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
          email={user.email ?? ''}
          etiquetas={etiquetas ?? []}
          listas={listas ?? []}
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
      email={user.email ?? ''}
      etiquetas={etiquetas ?? []}
      listas={listas ?? []}
      filtros={filtros}
      contactos={(data ?? []) as unknown as FilaContacto[]}
      error={error?.message}
    />
  );
}

function Pagina({
  email,
  etiquetas,
  listas,
  filtros,
  contactos,
  error,
}: {
  email: string;
  etiquetas: { id: string; nombre: string; color: string | null }[];
  listas: { id: string; nombre: string; tipo: string }[];
  filtros: { q?: string; etiqueta?: string; lista?: string; consent?: string };
  contactos: FilaContacto[];
  error?: string;
}) {
  const hayFiltros = Boolean(filtros.q || filtros.etiqueta || filtros.lista || filtros.consent);

  return (
    <div className="min-h-screen">
      <Cabecera email={email} />

      <main className="mx-auto max-w-6xl px-4 py-6">
        <NavContactos activo="directorio" />
        <h2 className="mb-4 mt-3 text-xl font-semibold">Directorio de contactos</h2>

        <form method="get" className="mb-4 flex flex-wrap items-end gap-2 text-sm">
          <input
            name="q"
            defaultValue={filtros.q ?? ''}
            placeholder="Nombre, teléfono o email…"
            className="min-w-56 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2"
          />
          <select
            name="etiqueta"
            defaultValue={filtros.etiqueta ?? ''}
            className="rounded-lg border border-slate-300 bg-white px-2 py-2"
          >
            <option value="">Cualquier etiqueta</option>
            {etiquetas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
          <select
            name="lista"
            defaultValue={filtros.lista ?? ''}
            className="rounded-lg border border-slate-300 bg-white px-2 py-2"
          >
            <option value="">Cualquier lista</option>
            {listas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre} {l.tipo === 'dinamica' ? '(segmento)' : ''}
              </option>
            ))}
          </select>
          <select
            name="consent"
            defaultValue={filtros.consent ?? ''}
            className="rounded-lg border border-slate-300 bg-white px-2 py-2"
          >
            <option value="">Consentimiento: indiferente</option>
            <option value="si">Con consentimiento</option>
            <option value="no">Sin consentimiento</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-teal-600 px-3 py-2 font-medium text-white transition hover:bg-teal-700"
          >
            Buscar
          </button>
          {hayFiltros && (
            <Link href="/contactos" className="px-2 py-2 text-teal-700 hover:underline">
              Limpiar
            </Link>
          )}
        </form>

        {error ? (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            No se pudo cargar el directorio: {error}
          </p>
        ) : contactos.length === 0 ? (
          <p className="rounded-lg bg-white px-4 py-8 text-center text-sm text-slate-500 ring-1 ring-slate-200">
            Ningún contacto coincide con la búsqueda.
          </p>
        ) : (
          <>
            <p className="mb-2 text-sm text-slate-500">
              {contactos.length} contacto{contactos.length === 1 ? '' : 's'}
              {contactos.length === LIMITE && ' (mostrando los primeros 100; afina la búsqueda)'}
            </p>
            <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Nombre</th>
                    <th className="px-4 py-3 font-medium">Teléfono</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Zona</th>
                    <th className="px-4 py-3 font-medium">Etiquetas</th>
                    <th className="px-4 py-3 font-medium">Casos</th>
                    <th className="px-4 py-3 font-medium">Marketing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {contactos.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/contactos/${c.id}`} className="hover:text-teal-700 hover:underline">
                          {c.nombre}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{c.telefono}</td>
                      <td className="px-4 py-3 text-slate-600">{c.email ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{c.zona ?? '—'}</td>
                      <td className="px-4 py-3">
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
                            <span className="text-slate-400">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{c.lead_contactos.length}</td>
                      <td className="px-4 py-3">
                        {c.consentimiento_marketing ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                            Sí
                          </span>
                        ) : (
                          <span className="text-slate-400">No</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
