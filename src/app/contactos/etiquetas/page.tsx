import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { COLORES_ETIQUETA, clasesEtiqueta } from '@/lib/colores';
import { borrarEtiqueta, crearEtiqueta, editarEtiqueta } from '../actions';

const inputClase =
  'rounded-lg border border-line2 bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';

export default async function GestionEtiquetas({
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

  const { data: perfilRol } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .maybeSingle();
  if (perfilRol?.rol === 'terapeuta') redirect('/agenda');

  const [{ data: etiquetas }, { data: usos }] = await Promise.all([
    supabase
      .from('etiquetas')
      .select('id, nombre, color, activa, created_by')
      .order('activa', { ascending: false })
      .order('nombre'),
    supabase.from('contacto_etiquetas').select('etiqueta_id'),
  ]);

  const recuento = new Map<string, number>();
  for (const u of usos ?? []) {
    recuento.set(u.etiqueta_id, (recuento.get(u.etiqueta_id) ?? 0) + 1);
  }

  return (
    <AppShell
      seccion="contactos"
      subseccion="/contactos/etiquetas"
      titulo="Etiquetas"
      descripcion="Organización del directorio"
    >

        <p className="mt-1 text-sm text-ink2">
          Las etiquetas organizan el directorio (zona, origen, tipo de contacto…). Nunca deben
          describir la situación clínica de nadie: cualquiera con acceso al directorio las ve.
        </p>

        {errorMsg && (
          <p className="mt-3 rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger ring-1 ring-danger/25">
            {errorMsg}
          </p>
        )}

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_320px]">
          <section className="flex flex-col gap-2">
            {(etiquetas ?? []).length === 0 && (
              <p className="rounded-xl bg-surface px-4 py-8 text-center text-sm text-ink2 ring-1 ring-line">
                Todavía no hay etiquetas. Crea la primera en el panel de la derecha.
              </p>
            )}

            {(etiquetas ?? []).map((e) => (
              <article
                key={e.id}
                className={`rounded-xl bg-surface p-3 ring-1 ring-line ${e.activa ? '' : 'opacity-60'}`}
              >
                <form
                  action={editarEtiqueta.bind(null, e.id)}
                  className="flex flex-wrap items-center gap-2"
                >
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${clasesEtiqueta(e.color)}`}
                  >
                    {e.nombre}
                  </span>
                  <input
                    name="nombre"
                    defaultValue={e.nombre}
                    className={`${inputClase} min-w-0 flex-1`}
                    aria-label="Nombre de la etiqueta"
                  />
                  <select
                    name="color"
                    defaultValue={e.color ?? 'gris'}
                    className={inputClase}
                    aria-label="Color"
                  >
                    {Object.entries(COLORES_ETIQUETA).map(([clave, c]) => (
                      <option key={clave} value={clave}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1.5 text-sm text-ink2">
                    <input type="checkbox" name="activa" defaultChecked={e.activa} /> Activa
                  </label>
                  <button
                    type="submit"
                    className="rounded-lg border border-line2 bg-surface px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface2"
                  >
                    Guardar
                  </button>
                </form>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <Link
                    href={`/contactos?etiqueta=${e.id}`}
                    className="text-xs text-primary hover:underline"
                  >
                    {recuento.get(e.id) ?? 0} contacto{(recuento.get(e.id) ?? 0) === 1 ? '' : 's'}
                  </Link>
                  <form action={borrarEtiqueta.bind(null, e.id)}>
                    <button
                      type="submit"
                      className="text-xs text-muted hover:text-danger hover:underline"
                      title="Borrarla la quita también de todos los contactos que la llevan"
                    >
                      Borrar
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </section>

          <aside className="h-fit rounded-xl bg-surface p-4 ring-1 ring-line">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink2">
              Nueva etiqueta
            </h3>
            <form action={crearEtiqueta} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm font-medium text-ink">
                Nombre *
                <input name="nombre" required placeholder="p. ej. Zona Reus" className={inputClase} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-ink">
                Color
                <select name="color" defaultValue="gris" className={inputClase}>
                  {Object.entries(COLORES_ETIQUETA).map(([clave, c]) => (
                    <option key={clave} value={clave}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
              >
                Crear etiqueta
              </button>
            </form>
            <p className="mt-3 text-xs text-muted">
              Desactivar una etiqueta la retira de los desplegables sin perder las que ya están
              puestas. Borrarla sí la quita de todos los contactos.
            </p>
          </aside>
        </div>
      </AppShell>
  );
}
