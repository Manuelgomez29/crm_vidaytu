import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { ETIQUETA_ESTADO, type EstadoLead } from '@/lib/estados';
import {
  anadirEtapaProceso,
  borrarEtapaProceso,
  borrarProceso,
  crearProceso,
  editarEtapaProceso,
  marcarPredeterminado,
  renombrarProceso,
} from './actions';

const ESTADOS = Object.keys(ETIQUETA_ESTADO) as EstadoLead[];

export default async function Procesos({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; aviso?: string }>;
}) {
  const { error, aviso } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol, nombre')
    .eq('id', user.id)
    .maybeSingle();
  if (perfil?.rol !== 'direccion' && perfil?.rol !== 'admisiones') {
    redirect(perfil?.rol === 'terapeuta' ? '/agenda' : '/leads');
  }
  const esDireccion = perfil.rol === 'direccion';

  const [{ data: procesos }, { data: centros }, { data: leads }, { data: autores }] =
    await Promise.all([
      supabase
        .from('pipelines')
        .select('id, nombre, centro_id, activo, es_predeterminado, created_by, etapas:pipeline_etapas (id, nombre, orden, estado_sistema)')
        .order('nombre'),
      supabase.from('centros').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('leads').select('pipeline_id, etapa_id'),
      supabase.from('perfiles').select('id, nombre'),
    ]);

  const nombreCentro = new Map((centros ?? []).map((c) => [c.id, c.nombre]));
  const nombreAutor = new Map((autores ?? []).map((a) => [a.id, a.nombre]));

  const casosPorProceso = new Map<string, number>();
  const casosPorEtapa = new Map<string, number>();
  for (const l of leads ?? []) {
    casosPorProceso.set(l.pipeline_id, (casosPorProceso.get(l.pipeline_id) ?? 0) + 1);
    casosPorEtapa.set(l.etapa_id, (casosPorEtapa.get(l.etapa_id) ?? 0) + 1);
  }

  const campo =
    'rounded-lg border border-line2 bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';

  return (
    <AppShell
      seccion="leads"
      subseccion="/leads/procesos"
      titulo="Procesos de venta"
      descripcion="Cada equipo puede tener su propio recorrido; las métricas se calculan igual"
      acciones={
        <Link href="/leads" className="btn btn-ghost">
          Volver al kanban
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

      <p className="mb-5 max-w-[68ch] text-sm text-ink2">
        Cada etapa se asocia a un <b>estado de sistema</b>. Eso es lo que permite que un caso pase
        por «Primera llamada» en un proceso y por «Contacto inicial» en otro, y que el embudo del
        panel siga saliendo igual. Puedes renombrar las etapas a vuestro lenguaje sin romper nada.
      </p>

      {/* ---------------- Crear ---------------- */}
      <section className="panel mb-6 p-4">
        <h2 className="mb-1 text-sm font-semibold">Nuevo proceso</h2>
        <p className="mb-3 text-xs text-ink2">
          Lo más práctico es copiar uno que ya funcione y cambiarle lo que sobre o falte.
        </p>
        <form action={crearProceso} className="flex flex-wrap items-center gap-2">
          <input
            name="nombre"
            placeholder="Nombre (p. ej. «Ingreso residencial»)"
            className={`${campo} min-w-56 flex-1`}
            required
          />
          <select name="copiar_de" defaultValue="" className={campo}>
            <option value="">Empezar con el recorrido estándar</option>
            {(procesos ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                Copiar de «{p.nombre}»
              </option>
            ))}
          </select>
          <select name="centro" defaultValue="" className={campo}>
            <option value="">Para todos los centros</option>
            {(centros ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                Solo {c.nombre}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-coral">
            Crear
          </button>
        </form>
      </section>

      {/* ---------------- Lista ---------------- */}
      <div className="flex flex-col gap-4">
        {(procesos ?? []).map((proceso) => {
          const mio = proceso.created_by === user.id;
          const puedoEditar = esDireccion || mio;
          const casos = casosPorProceso.get(proceso.id) ?? 0;
          const etapas = [...(proceso.etapas ?? [])].sort((a, b) => a.orden - b.orden);

          return (
            <article
              key={proceso.id}
              className={`panel p-4 ${proceso.activo ? '' : 'opacity-65'}`}
            >
              {/* Cabecera */}
              <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-line pb-3">
                {puedoEditar ? (
                  <form
                    action={renombrarProceso.bind(null, proceso.id)}
                    className="flex flex-1 flex-wrap items-center gap-2"
                  >
                    <input
                      name="nombre"
                      defaultValue={proceso.nombre}
                      className={`${campo} min-w-48 flex-1`}
                    />
                    <label className="flex items-center gap-1.5 text-xs text-ink2">
                      <input type="checkbox" name="activo" defaultChecked={proceso.activo} /> Activo
                    </label>
                    <button type="submit" className="btn btn-ghost btn-mini">
                      Guardar
                    </button>
                  </form>
                ) : (
                  <b className="flex-1 text-[15px]">{proceso.nombre}</b>
                )}

                <span className="chip chip-mut">
                  {proceso.centro_id ? nombreCentro.get(proceso.centro_id) : 'Todos los centros'}
                </span>
                {proceso.es_predeterminado && (
                  <span className="chip chip-primary" title="Los casos nuevos entran por aquí">
                    Recibe los casos nuevos
                  </span>
                )}
                <span className="text-xs text-muted">
                  {casos} caso(s)
                  {proceso.created_by && ` · lo creó ${nombreAutor.get(proceso.created_by) ?? '—'}`}
                </span>
              </div>

              {/* Etapas */}
              <ol className="mb-3 flex flex-col gap-1.5">
                {etapas.map((etapa) => {
                  const dentro = casosPorEtapa.get(etapa.id) ?? 0;
                  return (
                    <li key={etapa.id}>
                      {puedoEditar ? (
                        <form
                          action={editarEtapaProceso.bind(null, etapa.id)}
                          className="flex flex-wrap items-center gap-2 rounded-lg bg-ground px-3 py-2 ring-1 ring-line"
                        >
                          <input
                            name="orden"
                            type="number"
                            min="1"
                            defaultValue={etapa.orden}
                            className={`${campo} w-16`}
                          />
                          <input
                            name="nombre"
                            defaultValue={etapa.nombre}
                            className={`${campo} min-w-40 flex-1`}
                          />
                          <select
                            name="estado_sistema"
                            defaultValue={etapa.estado_sistema}
                            className={campo}
                            title="El estado con el que cuenta en las métricas"
                          >
                            {ESTADOS.map((e) => (
                              <option key={e} value={e}>
                                {ETIQUETA_ESTADO[e].texto}
                              </option>
                            ))}
                          </select>
                          <span className="text-xs text-muted">{dentro} caso(s)</span>
                          <button type="submit" className="btn btn-ghost btn-mini">
                            Guardar
                          </button>
                          <button
                            type="submit"
                            formAction={borrarEtapaProceso.bind(null, etapa.id)}
                            className="text-xs text-muted hover:text-danger hover:underline"
                          >
                            Quitar
                          </button>
                        </form>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-ground px-3 py-2 text-[13px] ring-1 ring-line">
                          <span className="w-6 text-center text-muted">{etapa.orden}</span>
                          <span className="flex-1">{etapa.nombre}</span>
                          <span className="chip chip-mut">
                            {ETIQUETA_ESTADO[etapa.estado_sistema as EstadoLead]?.texto}
                          </span>
                          <span className="text-xs text-muted">{dentro} caso(s)</span>
                        </div>
                      )}
                    </li>
                  );
                })}
                {etapas.length === 0 && (
                  <li className="text-sm text-danger">
                    Este proceso no tiene etapas: no puede recibir casos.
                  </li>
                )}
              </ol>

              {/* Pie */}
              {puedoEditar && (
                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <form
                    action={anadirEtapaProceso.bind(null, proceso.id)}
                    className="flex flex-1 flex-wrap items-center gap-2"
                  >
                    <input
                      name="nombre"
                      placeholder="Nueva etapa"
                      className={`${campo} min-w-36 flex-1`}
                      required
                    />
                    <select name="estado_sistema" defaultValue="contactado" className={campo}>
                      {ESTADOS.map((e) => (
                        <option key={e} value={e}>
                          Cuenta como {ETIQUETA_ESTADO[e].texto}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="btn btn-ghost btn-mini">
                      Añadir etapa
                    </button>
                  </form>

                  {esDireccion && !proceso.es_predeterminado && proceso.activo && (
                    <form action={marcarPredeterminado.bind(null, proceso.id)}>
                      <button type="submit" className="btn btn-ghost btn-mini">
                        Que reciba los casos nuevos
                      </button>
                    </form>
                  )}

                  {casos === 0 && (
                    <form action={borrarProceso.bind(null, proceso.id)}>
                      <button
                        type="submit"
                        className="text-xs text-muted hover:text-danger hover:underline"
                      >
                        Borrar proceso
                      </button>
                    </form>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <p className="mt-5 max-w-[68ch] text-xs text-muted">
        Cada uno maneja los procesos que ha creado. Los de los demás se ven —hacen falta para poder
        mover un caso a ellos— pero no se tocan. Qué proceso recibe los casos nuevos de un centro lo
        decide dirección: crear recorridos es libre, redirigir la entrada de un centro entero no.
      </p>
    </AppShell>
  );
}
