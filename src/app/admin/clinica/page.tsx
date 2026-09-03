import { AppShell } from '@/components/app-shell';
import { exigirDireccion } from '../guard';
import { Avisos, botonAdmin, botonAdminSecundario, inputAdmin } from '../nav';
import {
  anadirPregunta,
  borrarPregunta,
  cambiarEstadoCuestionario,
  cambiarEstadoFase,
  crearCuestionario,
  crearFase,
  crearHabitacion,
  editarHabitacion,
  renombrarFase,
} from './actions';

export default async function AdminClinica({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; aviso?: string }>;
}) {
  const { error, aviso } = await searchParams;
  const { supabase } = await exigirDireccion();

  const [{ data: fases }, { data: habitaciones }, { data: centros }, { data: cuestionarios }] =
    await Promise.all([
      supabase.from('fases_metodo').select('*').order('orden'),
      supabase
        .from('habitaciones')
        .select('*, centro:centros (nombre)')
        .order('nombre'),
      supabase.from('centros').select('id, nombre').eq('activo', true).order('nombre'),
      supabase
        .from('cuestionarios')
        .select('*, preguntas:cuestionario_preguntas (id, texto, orden, valor_min, valor_max)')
        .order('nombre'),
    ]);

  return (
    <AppShell
      seccion="admin"
      subseccion="/admin/clinica"
      titulo="Área clínica"
      descripcion="Fases del método, habitaciones y cuestionarios"
    >
      <Avisos error={error} aviso={aviso} />

      {/* ---------------- Fases ---------------- */}
      <section className="panel mb-5 mt-4 p-4">
        <h2 className="mb-1 text-sm font-semibold">Fases del método</h2>
        <p className="mb-3 text-xs text-ink2">
          Vienen con nombres genéricos («Fase 1», «Fase 2»…) a propósito: la plataforma no inventa
          el método clínico del grupo. Ponles aquí los nombres reales.
        </p>

        <div className="mb-4 flex flex-col gap-2">
          {(fases ?? []).map((f) => (
            <form
              key={f.id}
              action={renombrarFase.bind(null, f.id)}
              className={`flex flex-wrap items-center gap-2 rounded-lg bg-ground px-3 py-2 ring-1 ring-line ${
                f.activa ? '' : 'opacity-60'
              }`}
            >
              <span className="w-6 text-center text-xs text-muted">{f.orden}</span>
              <input name="nombre" defaultValue={f.nombre} className={`${inputAdmin} min-w-40`} />
              <input
                name="descripcion"
                defaultValue={f.descripcion ?? ''}
                placeholder="Descripción (opcional)"
                className={`${inputAdmin} min-w-48 flex-1`}
              />
              <button type="submit" className={botonAdminSecundario}>
                Guardar
              </button>
              <button
                type="submit"
                formAction={cambiarEstadoFase.bind(null, f.id, !f.activa)}
                className="text-xs text-muted hover:text-primary hover:underline"
              >
                {f.activa ? 'Desactivar' : 'Activar'}
              </button>
            </form>
          ))}
        </div>

        <form action={crearFase} className="flex flex-wrap items-center gap-2">
          <input name="nombre" placeholder="Nueva fase" className={`${inputAdmin} min-w-40`} required />
          <input name="descripcion" placeholder="Descripción" className={`${inputAdmin} min-w-48 flex-1`} />
          <button type="submit" className={botonAdmin}>
            Añadir fase
          </button>
        </form>
      </section>

      {/* ---------------- Habitaciones ---------------- */}
      <section className="panel mb-5 p-4">
        <h2 className="mb-1 text-sm font-semibold">Habitaciones</h2>
        <p className="mb-3 text-xs text-ink2">
          Solo hacen falta en los centros con ingreso residencial. El mapa de ocupación se construye
          con esto.
        </p>

        {(habitaciones ?? []).length > 0 && (
          <div className="mb-4 flex flex-col gap-2">
            {(habitaciones ?? []).map((h) => (
              <form
                key={h.id}
                action={editarHabitacion.bind(null, h.id)}
                className="flex flex-wrap items-center gap-2 rounded-lg bg-ground px-3 py-2 ring-1 ring-line"
              >
                <span className="chip chip-mut">{h.centro?.nombre}</span>
                <input name="nombre" defaultValue={h.nombre} className={`${inputAdmin} min-w-32`} />
                <label className="flex items-center gap-1.5 text-xs text-ink2">
                  Plazas
                  <input
                    name="plazas"
                    type="number"
                    min="1"
                    defaultValue={h.plazas}
                    className={`${inputAdmin} w-20`}
                  />
                </label>
                <label className="flex items-center gap-1.5 text-xs text-ink2">
                  <input type="checkbox" name="activa" defaultChecked={h.activa} /> Activa
                </label>
                <button type="submit" className={botonAdminSecundario}>
                  Guardar
                </button>
              </form>
            ))}
          </div>
        )}

        <form action={crearHabitacion} className="flex flex-wrap items-center gap-2">
          <select name="centro" defaultValue="" className={inputAdmin} required>
            <option value="">Centro…</option>
            {(centros ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <input name="nombre" placeholder="Nombre o número" className={`${inputAdmin} min-w-32`} required />
          <input name="plazas" type="number" min="1" defaultValue="1" className={`${inputAdmin} w-20`} />
          <button type="submit" className={botonAdmin}>
            Crear
          </button>
        </form>
      </section>

      {/* ---------------- Cuestionarios ---------------- */}
      <section className="panel p-4">
        <h2 className="mb-1 text-sm font-semibold">Cuestionarios clínicos</h2>
        <p className="mb-3 text-xs text-ink2">
          Evaluaciones periódicas con puntuación. El contenido lo define el equipo clínico; la
          plataforma solo guarda la estructura y dibuja la evolución.
        </p>

        <div className="mb-4 flex flex-col gap-3">
          {(cuestionarios ?? []).map((c) => (
            <details key={c.id} className={`rounded-lg bg-ground p-3 ring-1 ring-line ${c.activo ? '' : 'opacity-60'}`}>
              <summary className="flex cursor-pointer items-center justify-between gap-2">
                <b className="text-[13.5px]">{c.nombre}</b>
                <span className="text-xs text-muted">
                  {(c.preguntas ?? []).length} pregunta(s)
                </span>
              </summary>

              <ul className="mt-3 flex flex-col gap-1.5">
                {(c.preguntas ?? [])
                  .sort((a, b) => a.orden - b.orden)
                  .map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-1.5 text-[13px] ring-1 ring-line"
                    >
                      <span className="min-w-0">{p.texto}</span>
                      <span className="shrink-0 text-xs text-muted">
                        {p.valor_min}–{p.valor_max}
                      </span>
                      <form action={borrarPregunta.bind(null, p.id)}>
                        <button
                          type="submit"
                          className="text-xs text-muted hover:text-danger hover:underline"
                        >
                          Quitar
                        </button>
                      </form>
                    </li>
                  ))}
              </ul>

              <form action={anadirPregunta.bind(null, c.id)} className="mt-3 flex flex-wrap items-center gap-2">
                <input name="texto" placeholder="Nueva pregunta" className={`${inputAdmin} min-w-48 flex-1`} required />
                <input name="min" type="number" defaultValue="0" className={`${inputAdmin} w-16`} />
                <input name="max" type="number" defaultValue="10" className={`${inputAdmin} w-16`} />
                <button type="submit" className={botonAdminSecundario}>
                  Añadir
                </button>
                {/* formAction en lugar de un <form> anidado, que es HTML inválido. */}
                <button
                  type="submit"
                  formAction={cambiarEstadoCuestionario.bind(null, c.id, !c.activo)}
                  className="text-xs text-muted hover:text-primary hover:underline"
                >
                  {c.activo ? 'Desactivar' : 'Activar'}
                </button>
              </form>
            </details>
          ))}
        </div>

        <form action={crearCuestionario} className="flex flex-wrap items-center gap-2">
          <input name="nombre" placeholder="Nombre del cuestionario" className={`${inputAdmin} min-w-40`} required />
          <input name="descripcion" placeholder="Para qué sirve" className={`${inputAdmin} min-w-48 flex-1`} />
          <button type="submit" className={botonAdmin}>
            Crear
          </button>
        </form>
      </section>
    </AppShell>
  );
}
