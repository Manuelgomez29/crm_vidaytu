import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { fecha } from '@/lib/fechas';
import { borrarPlantilla, crearPlantilla } from '../actions';

export default async function Plantillas({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string; error?: string }>;
}) {
  const { aviso, error } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .maybeSingle();
  if (perfil?.rol !== 'direccion') redirect('/leads');

  const { data: plantillas } = await supabase
    .from('plantillas_email')
    .select('id, nombre, asunto, cuerpo_texto, cuerpo_html, created_at')
    .order('nombre');

  return (
    <AppShell
      seccion="marketing"
      subseccion="/marketing/plantillas"
      titulo="Plantillas de email"
      descripcion="Textos reutilizables para no reescribir lo mismo en cada campaña"
    >
      {aviso && (
        <p className="mb-4 rounded-lg bg-ok-soft px-4 py-3 text-sm text-ok ring-1 ring-ok/25">{aviso}</p>
      )}
      {error && (
        <p className="mb-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-danger/25">
          {error}
        </p>
      )}

      <section className="panel mb-5 p-4">
        <h2 className="mb-3 text-sm font-semibold">Nueva plantilla</h2>
        <form action={crearPlantilla} className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <input name="nombre" placeholder="Nombre" className="campo min-w-48 flex-1" required />
            <input name="asunto" placeholder="Asunto" className="campo min-w-48 flex-[2]" required />
          </div>
          <textarea
            name="cuerpo_texto"
            rows={6}
            placeholder="Cuerpo en texto plano. Usa {nombre} para personalizar."
            className="campo w-full font-mono text-[12.5px]"
            required
          />
          <textarea
            name="cuerpo_html"
            rows={4}
            placeholder="Cuerpo en HTML (opcional)"
            className="campo w-full font-mono text-[12.5px]"
          />
          <div>
            <button type="submit" className="btn btn-primary">
              Guardar plantilla
            </button>
          </div>
        </form>
      </section>

      {(plantillas ?? []).length === 0 ? (
        <p className="panel px-4 py-8 text-center text-sm text-ink2">Todavía no hay plantillas.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {(plantillas ?? []).map((p) => (
            <article key={p.id} className="panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-[13.5px] font-semibold">{p.nombre}</h3>
                  <p className="text-xs text-ink2">{p.asunto}</p>
                </div>
                <div className="flex items-center gap-3">
                  {p.cuerpo_html && <span className="chip chip-primary">Con HTML</span>}
                  <span className="text-xs text-muted">{fecha(p.created_at, false)}</span>
                  <form action={borrarPlantilla.bind(null, p.id)}>
                    <button type="submit" className="text-xs text-muted hover:text-danger hover:underline">
                      Borrar
                    </button>
                  </form>
                </div>
              </div>
              <pre className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-ground px-3 py-2 text-[12px] text-ink2">
                {p.cuerpo_texto}
              </pre>
            </article>
          ))}
        </div>
      )}
    </AppShell>
  );
}
