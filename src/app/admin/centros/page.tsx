import { AppShell } from '@/components/app-shell';
import { exigirDireccion } from '../guard';
import { Avisos, botonAdmin, botonAdminSecundario, inputAdmin } from '../nav';
import { crearCentro, editarCentro } from '../actions';
import { DIAS, horarioDe, esVeinticuatroSiete, resumenHorario } from '@/lib/horarios';

export default async function AdminCentros({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; aviso?: string }>;
}) {
  const { error: errorMsg, aviso } = await searchParams;
  const { supabase } = await exigirDireccion();

  const [{ data: centros }, { data: leads }] = await Promise.all([
    supabase
      .from('centros')
      .select(
        'id, nombre, slug, ciudad, activo, es_bandeja_grupo, url_resena_google, horario_atencion',
      )
      .order('es_bandeja_grupo')
      .order('nombre'),
    supabase.from('leads').select('centro_id'),
  ]);

  const leadsPorCentro = new Map<string, number>();
  for (const l of leads ?? []) {
    leadsPorCentro.set(l.centro_id, (leadsPorCentro.get(l.centro_id) ?? 0) + 1);
  }

  return (
    <AppShell
      seccion="admin"
      subseccion="/admin/centros"
      titulo="Centros"
      descripcion="Centros del grupo y bandeja compartida"
    >
      <Avisos error={errorMsg} aviso={aviso} />
      <p className="mb-4 text-sm text-ink2">
        Los centros no se borran (sus leads e historial dependen de ellos): se desactivan, y así
        dejan de ofrecerse en los formularios sin perder nada.
      </p>

      <section className="mb-6 rounded-xl bg-surface p-4 ring-1 ring-line">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink2">
          Nuevo centro
        </h3>
        <form action={crearCentro} className="flex flex-wrap gap-2">
          <input
            name="nombre"
            placeholder="Nombre"
            required
            className={`${inputAdmin} min-w-48 flex-1`}
          />
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
            className={`rounded-xl bg-surface p-4 ring-1 ring-line ${c.activo ? '' : 'opacity-70'}`}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="font-medium">{c.nombre}</h3>
              {c.es_bandeja_grupo && (
                <span className="rounded-full bg-ec-bg px-2 py-0.5 text-[11px] font-medium text-ec ring-1 ring-ec/25">
                  Bandeja de grupo
                </span>
              )}
              <span className="text-xs text-muted">
                {leadsPorCentro.get(c.id) ?? 0} lead(s) · slug: {c.slug}
              </span>
            </div>
            <form
              action={editarCentro.bind(null, c.id)}
              className="flex flex-wrap items-center gap-2"
            >
              <input
                name="nombre"
                defaultValue={c.nombre}
                className={`${inputAdmin} min-w-48 flex-1`}
              />
              <input
                name="url_resena"
                defaultValue={c.url_resena_google ?? ''}
                placeholder="Enlace de reseña de Google"
                title="Sin enlace no se propone pedir reseña para los casos de este centro"
                className={`${inputAdmin} min-w-56 flex-1`}
              />
              <input
                name="ciudad"
                defaultValue={c.ciudad ?? ''}
                placeholder="Ciudad"
                className={inputAdmin}
              />
              <label className="flex items-center gap-1.5 text-sm text-ink2">
                <input type="checkbox" name="activo" defaultChecked={c.activo} /> Activo
              </label>
              <button type="submit" className={botonAdminSecundario}>
                Guardar
              </button>

              {/* ---------------- Horario de atención ---------------- */}
              {(() => {
                const h = horarioDe(c.horario_atencion);
                const abierto247 = esVeinticuatroSiete(h);
                return (
                  <details className="w-full rounded-lg bg-surface2 p-3">
                    <summary className="cursor-pointer list-none text-[13px] font-medium [&::-webkit-details-marker]:hidden">
                      Horario de atención{' '}
                      <span className="font-normal text-ink2">· {resumenHorario(h)}</span>
                    </summary>

                    <p className="mt-2 max-w-[76ch] text-xs text-ink2">
                      Es el reloj del <b>SLA de primera respuesta</b>: los 60 minutos se cuentan
                      solo mientras el centro está abierto. Sin horario cuenta 24 horas al día, y
                      entonces un caso que entra de madrugada sale fuera de plazo antes de que nadie
                      pueda leerlo.
                    </p>

                    <label className="mt-2 flex items-center gap-1.5 text-[13px] text-ink2">
                      <input type="checkbox" name="siempre_abierto" defaultChecked={abierto247} />
                      Abierto siempre (24/7), como admisiones de Bellamar
                    </label>

                    <div className="mt-2 flex flex-col gap-1.5">
                      {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                        const franja = h.dias?.[String(d)] ?? null;
                        return (
                          <div key={d} className="flex flex-wrap items-center gap-2 text-[13px]">
                            <span className="w-24 text-ink2">{DIAS[d]}</span>
                            <input
                              type="time"
                              name={`abre_${d}`}
                              defaultValue={franja?.[0] ?? ''}
                              className={inputAdmin}
                            />
                            <span className="text-muted">a</span>
                            <input
                              type="time"
                              name={`cierra_${d}`}
                              defaultValue={franja?.[1] ?? ''}
                              className={inputAdmin}
                            />
                            <span className="text-xs text-muted">
                              {franja ? '' : 'en blanco = cerrado'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                );
              })()}
            </form>
          </article>
        ))}
      </div>

      <p className="mt-4 text-xs text-muted">
        La bandeja de grupo es un pseudo-centro donde nacen los leads sin centro claro. Asignar uno
        de esos leads a un centro real no es una derivación: es un cambio de centro auditado.
      </p>
    </AppShell>
  );
}
