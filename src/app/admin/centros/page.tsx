import { Cabecera } from '@/components/cabecera';
import { exigirDireccion } from '../guard';
import { Avisos, NavAdmin, botonAdmin, botonAdminSecundario, inputAdmin } from '../nav';
import { crearCentro, editarCentro } from '../actions';

export default async function AdminCentros({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; aviso?: string }>;
}) {
  const { error: errorMsg, aviso } = await searchParams;
  const { supabase, user } = await exigirDireccion();

  const [{ data: centros }, { data: leads }] = await Promise.all([
    supabase
      .from('centros')
      .select('id, nombre, slug, ciudad, activo, es_bandeja_grupo')
      .order('es_bandeja_grupo')
      .order('nombre'),
    supabase.from('leads').select('centro_id'),
  ]);

  const leadsPorCentro = new Map<string, number>();
  for (const l of leads ?? []) {
    leadsPorCentro.set(l.centro_id, (leadsPorCentro.get(l.centro_id) ?? 0) + 1);
  }

  return (
    <div className="min-h-screen">
      <Cabecera email={user.email ?? ''} />

      <main className="mx-auto max-w-4xl px-4 py-6">
        <NavAdmin activo="centros" />
        <Avisos error={errorMsg} aviso={aviso} />

        <h2 className="mb-1 mt-4 text-xl font-semibold">Centros</h2>
        <p className="mb-4 text-sm text-slate-500">
          Los centros no se borran (sus leads e historial dependen de ellos): se desactivan, y así
          dejan de ofrecerse en los formularios sin perder nada.
        </p>

        <section className="mb-6 rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Nuevo centro
          </h3>
          <form action={crearCentro} className="flex flex-wrap gap-2">
            <input name="nombre" placeholder="Nombre" required className={`${inputAdmin} min-w-48 flex-1`} />
            <input name="ciudad" placeholder="Ciudad" className={inputAdmin} />
            <button type="submit" className={botonAdmin}>
              Crear
            </button>
          </form>
        </section>

        <div className="flex flex-col gap-3">
          {(centros ?? []).map((c) => (
            <article
              key={c.id}
              className={`rounded-xl bg-white p-4 ring-1 ring-slate-200 ${c.activo ? '' : 'opacity-70'}`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="font-medium">{c.nombre}</h3>
                {c.es_bandeja_grupo && (
                  <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-200">
                    Bandeja de grupo
                  </span>
                )}
                <span className="text-xs text-slate-400">
                  {leadsPorCentro.get(c.id) ?? 0} lead(s) · slug: {c.slug}
                </span>
              </div>
              <form action={editarCentro.bind(null, c.id)} className="flex flex-wrap items-center gap-2">
                <input name="nombre" defaultValue={c.nombre} className={`${inputAdmin} min-w-48 flex-1`} />
                <input
                  name="ciudad"
                  defaultValue={c.ciudad ?? ''}
                  placeholder="Ciudad"
                  className={inputAdmin}
                />
                <label className="flex items-center gap-1.5 text-sm text-slate-600">
                  <input type="checkbox" name="activo" defaultChecked={c.activo} /> Activo
                </label>
                <button type="submit" className={botonAdminSecundario}>
                  Guardar
                </button>
              </form>
            </article>
          ))}
        </div>

        <p className="mt-4 text-xs text-slate-400">
          La bandeja de grupo es un pseudo-centro donde nacen los leads sin centro claro. Asignar uno
          de esos leads a un centro real no es una derivación: es un cambio de centro auditado.
        </p>
      </main>
    </div>
  );
}
