import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { fechaCorta } from '@/lib/fechas';
import { exigirAccesoClinico } from '../guard';
import { crearConversacion } from './actions';

export default async function Chat({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { supabase, perfil } = await exigirAccesoClinico();

  const [{ data: conversaciones }, { data: companeros }, { data: pacientes }] = await Promise.all([
    supabase
      .from('conversaciones')
      .select('id, titulo, updated_at, paciente:pacientes (nombre)')
      .order('updated_at', { ascending: false }),
    supabase
      .from('perfiles')
      .select('id, nombre, rol')
      .eq('activo', true)
      .neq('id', perfil.id)
      .or('rol.eq.terapeuta,rol.eq.direccion,acceso_clinico.eq.true')
      .order('nombre'),
    supabase.from('pacientes').select('id, nombre').order('nombre').limit(200),
  ]);

  return (
    <AppShell
      seccion="chat"
      titulo="Chat interno clínico"
      descripcion="Comunicación sobre pacientes dentro de la plataforma, no en WhatsApp"
    >
      {error && (
        <p className="mb-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-danger/25">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="panel p-4">
          <h2 className="mb-3 text-sm font-semibold">Conversaciones</h2>
          {(conversaciones ?? []).length === 0 ? (
            <p className="text-sm text-muted">
              Todavía no hay ninguna. Solo ves aquellas en las que participas.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {(conversaciones ?? []).map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/clinica/chat/${c.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg bg-ground px-3 py-2.5 ring-1 ring-line transition hover:ring-primary"
                  >
                    <div className="min-w-0">
                      <b className="block truncate text-[13.5px]">{c.titulo ?? 'Sin título'}</b>
                      {c.paciente?.nombre && (
                        <span className="text-xs text-ink2">sobre {c.paciente.nombre}</span>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-muted">{fechaCorta(c.updated_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel p-4">
          <h2 className="mb-3 text-sm font-semibold">Nueva conversación</h2>
          <form action={crearConversacion} className="flex flex-col gap-3">
            <label className="block">
              <span className="etiqueta-campo">Título</span>
              <input name="titulo" className="campo w-full" required />
            </label>

            <label className="block">
              <span className="etiqueta-campo">Sobre un paciente (opcional)</span>
              <select name="paciente" defaultValue="" className="campo w-full">
                <option value="">Ninguno en concreto</option>
                {(pacientes ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>

            <fieldset>
              <span className="etiqueta-campo">Con quién</span>
              <div className="mt-1 flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg bg-ground p-2 ring-1 ring-line">
                {(companeros ?? []).length === 0 && (
                  <p className="text-xs text-muted">No hay nadie más con acceso clínico.</p>
                )}
                {(companeros ?? []).map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" name="participantes" value={c.id} />
                    {c.nombre}
                  </label>
                ))}
              </div>
            </fieldset>

            <button type="submit" className="btn btn-coral">
              Crear
            </button>
          </form>

          <p className="mt-3 text-xs text-muted">
            Los mensajes no se pueden editar ni reescribir: es comunicación clínica registrada.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
