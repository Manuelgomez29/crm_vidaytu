import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { COLORES_ETIQUETA, clasesEtiqueta } from '@/lib/colores';
import { borrarEtiqueta, crearEtiqueta, editarEtiqueta } from '../actions';

const inputClase =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200';

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
      ancho="medio"
    >

        <p className="mt-1 text-sm text-slate-500">
          Las etiquetas organizan el directorio (zona, origen, tipo de contacto…). Nunca deben
          describir la situación clínica de nadie: cualquiera con acceso al directorio las ve.
        </p>

        {errorMsg && (
          <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 ring-1 ring-red-200">
            {errorMsg}
          </p>
        )}

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_320px]">
          <section className="flex flex-col gap-2">
            {(etiquetas ?? []).length === 0 && (
              <p className="rounded-xl bg-white px-4 py-8 text-center text-sm text-slate-500 ring-1 ring-slate-200">
                Todavía no hay etiquetas. Crea la primera en el panel de la derecha.
              </p>
            )}

            {(etiquetas ?? []).map((e) => (
              <article
                key={e.id}
                className={`rounded-xl bg-white p-3 ring-1 ring-slate-200 ${e.activa ? '' : 'opacity-60'}`}
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
                  <label className="flex items-center gap-1.5 text-sm text-slate-600">
                    <input type="checkbox" name="activa" defaultChecked={e.activa} /> Activa
                  </label>
                  <button
                    type="submit"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                  >
                    Guardar
                  </button>
                </form>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <Link
                    href={`/contactos?etiqueta=${e.id}`}
                    className="text-xs text-teal-700 hover:underline"
                  >
                    {recuento.get(e.id) ?? 0} contacto{(recuento.get(e.id) ?? 0) === 1 ? '' : 's'}
                  </Link>
                  <form action={borrarEtiqueta.bind(null, e.id)}>
                    <button
                      type="submit"
                      className="text-xs text-slate-400 hover:text-red-600 hover:underline"
                      title="Borrarla la quita también de todos los contactos que la llevan"
                    >
                      Borrar
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </section>

          <aside className="h-fit rounded-xl bg-white p-4 ring-1 ring-slate-200">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Nueva etiqueta
            </h3>
            <form action={crearEtiqueta} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                Nombre *
                <input name="nombre" required placeholder="p. ej. Zona Reus" className={inputClase} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
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
                className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-teal-700"
              >
                Crear etiqueta
              </button>
            </form>
            <p className="mt-3 text-xs text-slate-400">
              Desactivar una etiqueta la retira de los desplegables sin perder las que ya están
              puestas. Borrarla sí la quita de todos los contactos.
            </p>
          </aside>
        </div>
      </AppShell>
  );
}
