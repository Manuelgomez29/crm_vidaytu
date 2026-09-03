import { AppShell } from '@/components/app-shell';
import { ETIQUETA_ESTADO, type EstadoLead } from '@/lib/estados';
import { exigirDireccion } from '../guard';
import { Avisos, botonAdmin, botonAdminSecundario, inputAdmin } from '../nav';
import { anadirEtapa, borrarEtapa, crearPipeline, editarEtapa, editarPipeline } from '../actions';

const ESTADOS = Object.keys(ETIQUETA_ESTADO) as EstadoLead[];

export default async function AdminPipelines({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; aviso?: string }>;
}) {
  const { error: errorMsg, aviso } = await searchParams;
  const { supabase, user } = await exigirDireccion();

  const [{ data: pipelines }, { data: etapas }, { data: centros }, { data: leads }] =
    await Promise.all([
      supabase.from('pipelines').select('id, nombre, centro_id, activo').order('nombre'),
      supabase.from('pipeline_etapas').select('id, pipeline_id, nombre, orden, estado_sistema').order('orden'),
      supabase.from('centros').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('leads').select('etapa_id'),
    ]);

  const nombreCentro = new Map((centros ?? []).map((c) => [c.id, c.nombre]));
  const leadsPorEtapa = new Map<string, number>();
  for (const l of leads ?? []) {
    leadsPorEtapa.set(l.etapa_id, (leadsPorEtapa.get(l.etapa_id) ?? 0) + 1);
  }

  return (
    <AppShell
      seccion="admin"
      subseccion="/admin/pipelines"
      titulo="Pipelines"
      descripcion="Etapas y su estado de sistema"
      ancho="medio"
    >
        <Avisos error={errorMsg} aviso={aviso} />
        <p className="mb-4 text-sm text-slate-500">
          Cada etapa se asocia a un <strong>estado de sistema</strong>: es lo que permite que las
          métricas se calculen igual con cualquier pipeline. Mover una tarjeta al kanban copia ese
          estado al lead.
        </p>

        <section className="mb-6 rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Nuevo pipeline
          </h3>
          <form action={crearPipeline} className="flex flex-wrap gap-2">
            <input name="nombre" placeholder="Nombre" required className={`${inputAdmin} min-w-48 flex-1`} />
            <select name="centro" defaultValue="" className={inputAdmin}>
              <option value="">Global (todos los centros)</option>
              {(centros ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  Solo {c.nombre}
                </option>
              ))}
            </select>
            <button type="submit" className={botonAdmin}>
              Crear
            </button>
          </form>
          <p className="mt-2 text-xs text-slate-400">
            Nace con cuatro etapas estándar que puedes renombrar, ampliar o reordenar.
          </p>
        </section>

        <div className="flex flex-col gap-4">
          {(pipelines ?? []).map((p) => {
            const susEtapas = (etapas ?? []).filter((e) => e.pipeline_id === p.id);
            return (
              <article
                key={p.id}
                className={`rounded-xl bg-white p-4 ring-1 ring-slate-200 ${p.activo ? '' : 'opacity-70'}`}
              >
                <form
                  action={editarPipeline.bind(null, p.id)}
                  className="mb-3 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3"
                >
                  <input name="nombre" defaultValue={p.nombre} className={`${inputAdmin} min-w-48 flex-1`} />
                  <span className="text-xs text-slate-400">
                    {p.centro_id ? `Solo ${nombreCentro.get(p.centro_id) ?? '—'}` : 'Global'}
                  </span>
                  <label className="flex items-center gap-1.5 text-sm text-slate-600">
                    <input type="checkbox" name="activo" defaultChecked={p.activo} /> Activo
                  </label>
                  <button type="submit" className={botonAdminSecundario}>
                    Guardar
                  </button>
                </form>

                <ul className="flex flex-col gap-1.5">
                  {susEtapas.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-2">
                      <span className="w-6 text-xs text-slate-400">{e.orden}.</span>
                      <form
                        action={editarEtapa.bind(null, e.id)}
                        className="flex flex-1 flex-wrap items-center gap-2"
                      >
                        <input name="nombre" defaultValue={e.nombre} className={`${inputAdmin} min-w-36 flex-1`} />
                        <select
                          name="estado_sistema"
                          defaultValue={e.estado_sistema}
                          className={inputAdmin}
                        >
                          {ESTADOS.map((estado) => (
                            <option key={estado} value={estado}>
                              {ETIQUETA_ESTADO[estado].texto}
                            </option>
                          ))}
                        </select>
                        <span className="text-xs text-slate-400">
                          {leadsPorEtapa.get(e.id) ?? 0} lead(s)
                        </span>
                        <button type="submit" className={botonAdminSecundario}>
                          Guardar
                        </button>
                      </form>
                      <form action={borrarEtapa.bind(null, e.id)}>
                        <button
                          type="submit"
                          className="text-xs text-slate-400 hover:text-red-600 hover:underline"
                        >
                          Borrar
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>

                <form
                  action={anadirEtapa.bind(null, p.id)}
                  className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3"
                >
                  <input name="nombre" placeholder="Nueva etapa" className={`${inputAdmin} min-w-36 flex-1`} />
                  <select name="estado_sistema" defaultValue="contactado" className={inputAdmin}>
                    {ESTADOS.map((estado) => (
                      <option key={estado} value={estado}>
                        {ETIQUETA_ESTADO[estado].texto}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className={botonAdminSecundario}>
                    Añadir etapa
                  </button>
                </form>
              </article>
            );
          })}
        </div>
      </AppShell>
  );
}
