import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Cabecera } from '@/components/cabecera';
import { contactosDelSegmento, describirFiltro, type FiltroSegmento } from '@/lib/segmentos';
import { borrarLista, crearLista } from '../actions';

const inputClase =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200';

export default async function ListasYSegmentos({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorMsg } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: listas }, { data: etiquetas }] = await Promise.all([
    supabase
      .from('listas')
      .select('id, nombre, descripcion, tipo, filtro, created_by')
      .order('tipo')
      .order('nombre'),
    supabase.from('etiquetas').select('id, nombre').eq('activa', true).order('nombre'),
  ]);

  const nombresEtiquetas = new Map((etiquetas ?? []).map((e) => [e.id, e.nombre]));

  // Recuento por lista: miembros fijos o resultado del segmento en este momento.
  const recuentos = new Map<string, number>();
  await Promise.all(
    (listas ?? []).map(async (lista) => {
      if (lista.tipo === 'estatica') {
        const { count } = await supabase
          .from('lista_contactos')
          .select('contacto_id', { count: 'exact', head: true })
          .eq('lista_id', lista.id);
        recuentos.set(lista.id, count ?? 0);
      } else {
        const ids = await contactosDelSegmento(supabase, (lista.filtro ?? {}) as FiltroSegmento);
        recuentos.set(lista.id, ids.length);
      }
    }),
  );

  return (
    <div className="min-h-screen">
      <Cabecera email={user.email ?? ''} />

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Link href="/contactos" className="text-sm text-teal-700 hover:underline">
          ← Volver al directorio
        </Link>
        <h2 className="mt-2 text-xl font-semibold">Listas y segmentos</h2>
        <p className="mt-1 text-sm text-slate-500">
          Una <strong>lista estática</strong> tiene los contactos que le añades a mano. Un{' '}
          <strong>segmento dinámico</strong> no guarda miembros: se calcula cada vez a partir de sus
          criterios.
        </p>

        {errorMsg && (
          <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 ring-1 ring-red-200">
            {errorMsg}
          </p>
        )}

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_360px]">
          <section className="flex flex-col gap-2">
            {(listas ?? []).length === 0 && (
              <p className="rounded-xl bg-white px-4 py-8 text-center text-sm text-slate-500 ring-1 ring-slate-200">
                Todavía no hay listas ni segmentos.
              </p>
            )}
            {(listas ?? []).map((lista) => (
              <article key={lista.id} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{lista.nombre}</h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
                        lista.tipo === 'dinamica'
                          ? 'bg-violet-50 text-violet-700 ring-violet-200'
                          : 'bg-slate-100 text-slate-600 ring-slate-200'
                      }`}
                    >
                      {lista.tipo === 'dinamica' ? 'Segmento dinámico' : 'Lista estática'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/contactos?lista=${lista.id}`}
                      className="text-sm text-teal-700 hover:underline"
                    >
                      Ver {recuentos.get(lista.id) ?? 0} contacto
                      {(recuentos.get(lista.id) ?? 0) === 1 ? '' : 's'}
                    </Link>
                    <form action={borrarLista.bind(null, lista.id)}>
                      <button
                        type="submit"
                        className="text-xs text-slate-400 hover:text-red-600 hover:underline"
                      >
                        Borrar
                      </button>
                    </form>
                  </div>
                </div>
                {lista.descripcion && (
                  <p className="mt-1 text-sm text-slate-600">{lista.descripcion}</p>
                )}
                {lista.tipo === 'dinamica' && (
                  <p className="mt-1 text-xs text-slate-500">
                    Criterios: {describirFiltro((lista.filtro ?? {}) as FiltroSegmento, nombresEtiquetas)}
                  </p>
                )}
              </article>
            ))}
          </section>

          <aside className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Nueva lista o segmento
            </h3>
            <form action={crearLista} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                Nombre *
                <input name="nombre" required className={inputClase} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                Descripción
                <input name="descripcion" className={inputClase} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                Tipo
                <select name="tipo" defaultValue="estatica" className={inputClase}>
                  <option value="estatica">Lista estática (se añade a mano)</option>
                  <option value="dinamica">Segmento dinámico (por criterios)</option>
                </select>
              </label>

              <fieldset className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
                <legend className="px-1 text-xs font-medium text-slate-500">
                  Criterios (solo para segmentos)
                </legend>
                <label className="flex flex-col gap-1 text-xs text-slate-600">
                  Etiquetas (debe tenerlas todas)
                  <select name="etiquetas" multiple size={4} className={inputClase}>
                    {(etiquetas ?? []).map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-600">
                  Zona contiene
                  <input name="zona" className={inputClase} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-600">
                  Consentimiento de marketing
                  <select name="consentimiento" defaultValue="" className={inputClase}>
                    <option value="">Indiferente</option>
                    <option value="si">Solo con consentimiento</option>
                    <option value="no">Solo sin consentimiento</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" name="con_email" /> Solo contactos con email
                </label>
              </fieldset>

              <button
                type="submit"
                className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-teal-700"
              >
                Crear
              </button>
            </form>
            <p className="mt-3 text-xs text-slate-400">
              Los criterios son siempre comerciales (etiqueta, zona, consentimiento). Nunca clínicos:
              ninguna lista puede revelar el motivo de consulta de nadie.
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}
