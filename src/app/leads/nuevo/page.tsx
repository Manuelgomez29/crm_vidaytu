import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { crearLead } from './actions';

const inputClase =
  'rounded-lg border border-line2 bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-ink">
      {etiqueta}
      {children}
    </label>
  );
}

export default async function NuevoLead({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single();

  if (perfil?.rol === 'terapeuta') redirect('/agenda');

  const [{ data: todosCentros }, { data: misCentros }, { data: canales }, { data: adicciones }, { data: modalidades }] =
    await Promise.all([
      supabase.from('centros').select('id, nombre, es_bandeja_grupo').eq('activo', true).order('nombre'),
      supabase.from('perfil_centros').select('centro_id').eq('perfil_id', user.id),
      supabase.from('canales').select('id, nombre, slug').eq('activo', true).order('nombre'),
      supabase.from('adicciones').select('id, nombre').eq('activa', true).order('nombre'),
      supabase.from('modalidades').select('id, nombre').eq('activa', true).order('nombre'),
    ]);

  // Admisiones solo puede dar de alta en sus centros (lo impone también RLS).
  const centrosPermitidos =
    perfil?.rol === 'direccion'
      ? (todosCentros ?? [])
      : (todosCentros ?? []).filter((c) => (misCentros ?? []).some((m) => m.centro_id === c.id));
  const canalTelefono = canales?.find((c) => c.slug === 'telefono');

  return (
    <AppShell
      seccion="leads"
      titulo="Nuevo lead"
      descripcion="Alta manual de un caso"
    >
        <p className="mt-1 text-sm text-ink2">
          Si el teléfono ya existe en el directorio, no se creará un duplicado: te llevaré a su
          caso (reabriéndolo si estaba cerrado).
        </p>

        {error && (
          <p className="mt-3 rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger ring-1 ring-danger/25">
            {error}
          </p>
        )}

        <form action={crearLead} className="mt-4 flex flex-col gap-4 rounded-xl bg-surface p-5 ring-1 ring-line">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Nombre de quien contacta *">
              <input name="nombre" required className={inputClase} />
            </Campo>
            <Campo etiqueta="Teléfono *">
              <input name="telefono" required placeholder="+34 o 6/7/9…" className={inputClase} />
            </Campo>
            <Campo etiqueta="Centro *">
              <select name="centro" required className={inputClase} defaultValue={centrosPermitidos.find((c) => c.es_bandeja_grupo)?.id ?? centrosPermitidos[0]?.id}>
                {centrosPermitidos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Canal *">
              <select name="canal" required className={inputClase} defaultValue={canalTelefono?.id}>
                {(canales ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Quién contacta">
              <select name="quien_contacta" className={inputClase} defaultValue="">
                <option value="">—</option>
                <option value="afectado">Afectado</option>
                <option value="familiar">Familiar</option>
                <option value="prescriptor">Prescriptor</option>
                <option value="otro">Otro</option>
              </select>
            </Campo>
            <Campo etiqueta="Relación con el afectado">
              <input name="relacion_con_afectado" placeholder="madre, pareja…" className={inputClase} />
            </Campo>
            <Campo etiqueta="Nombre del afectado">
              <input name="nombre_afectado" className={inputClase} />
            </Campo>
            <Campo etiqueta="Adicción">
              <select name="adiccion" className={inputClase} defaultValue="">
                <option value="">—</option>
                {(adicciones ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Modalidad de interés">
              <select name="modalidad" className={inputClase} defaultValue="">
                <option value="">—</option>
                {(modalidades ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Urgencia">
              <select name="urgencia" className={inputClase} defaultValue="">
                <option value="">—</option>
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </Campo>
            <Campo etiqueta="Zona">
              <input name="zona" className={inputClase} />
            </Campo>
            <Campo etiqueta="Email">
              <input name="email" type="email" className={inputClase} />
            </Campo>
            <Campo etiqueta="Subcanal">
              <input name="subcanal" placeholder="Instagram Lolo Drago…" className={inputClase} />
            </Campo>
            <Campo etiqueta="Prescriptor (si aplica)">
              <input name="prescriptor_nombre" className={inputClase} />
            </Campo>
          </div>

          <Campo etiqueta="Notas de la primera conversación">
            <textarea name="notas" rows={3} className={inputClase} />
          </Campo>

          <button
            type="submit"
            className="rounded-lg bg-primary px-4 py-2.5 font-medium text-white transition hover:bg-primary-hover"
          >
            Crear lead
          </button>
        </form>
      </AppShell>
  );
}
