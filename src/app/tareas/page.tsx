import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { fecha, hoyMadrid } from '@/lib/fechas';
import { completarTareaDesdeLista } from './actions';

type FilaTarea = {
  id: string;
  titulo: string;
  vence_at: string;
  lead_id: string;
  lead: { nombre: string; estado: string; centro: { nombre: string; slug: string } | null } | null;
};

const CHIP_CENTRO: Record<string, string> = {
  horizonte: 'chip-hz',
  eclipse: 'chip-ec',
  bellamar: 'chip-bm',
  'bandeja-grupo': 'chip-gr',
};

function Grupo({
  titulo,
  tareas,
  acento,
}: {
  titulo: string;
  tareas: FilaTarea[];
  acento?: 'rojo' | 'coral';
}) {
  if (tareas.length === 0) return null;
  return (
    <section className="mb-5">
      <h3
        className={`mb-2 text-[11px] uppercase tracking-[0.1em] ${
          acento === 'rojo' ? 'text-danger' : acento === 'coral' ? 'text-coral-ink' : 'text-muted'
        }`}
      >
        {titulo} ({tareas.length})
      </h3>
      <div className="flex flex-col gap-2">
        {tareas.map((t) => (
          <article key={t.id} className="panel flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold">{t.titulo}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink2">
                <Link href={`/leads/${t.lead_id}`} className="font-medium text-primary hover:underline">
                  {t.lead?.nombre ?? 'Caso'}
                </Link>
                {t.lead?.centro && (
                  <span className={`chip ${CHIP_CENTRO[t.lead.centro.slug] ?? 'chip-mut'}`}>
                    {t.lead.centro.nombre}
                  </span>
                )}
                <span className={acento === 'rojo' ? 'font-semibold text-danger' : ''}>
                  ◷ {fecha(t.vence_at)}
                </span>
              </p>
            </div>
            <form action={completarTareaDesdeLista.bind(null, t.id)}>
              <button type="submit" className="btn btn-ghost">
                Completar
              </button>
            </form>
          </article>
        ))}
      </div>
    </section>
  );
}

/** Bandeja personal: lo que cada comercial tiene que hacer hoy. */
export default async function MisTareas({
  searchParams,
}: {
  searchParams: Promise<{ todas?: string }>;
}) {
  const { todas } = await searchParams;
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
  if (perfil?.rol === 'terapeuta') redirect('/agenda');

  const verTodas = todas === '1' && perfil?.rol === 'direccion';

  let consulta = supabase
    .from('tareas')
    .select('id, titulo, vence_at, lead_id, lead:leads (nombre, estado, centro:centros (nombre, slug))')
    .is('completada_at', null)
    .order('vence_at');
  if (!verTodas) consulta = consulta.eq('responsable_id', user.id);

  const { data, error } = await consulta;
  const tareas = (data ?? []) as unknown as FilaTarea[];

  const hoy = hoyMadrid();
  const finDeHoy = new Date(`${hoy}T23:59:59`).getTime();
  const ahora = Date.now();

  const vencidas = tareas.filter((t) => new Date(t.vence_at).getTime() < ahora);
  const deHoy = tareas.filter((t) => {
    const cuando = new Date(t.vence_at).getTime();
    return cuando >= ahora && cuando <= finDeHoy;
  });
  const proximas = tareas.filter((t) => new Date(t.vence_at).getTime() > finDeHoy);

  return (
    <AppShell
      seccion="tareas"
      titulo={verTodas ? 'Tareas del equipo' : 'Mis tareas'}
      descripcion={`${tareas.length} pendiente${tareas.length === 1 ? '' : 's'} · ${vencidas.length} vencida${vencidas.length === 1 ? '' : 's'}`}
    >
      {perfil?.rol === 'direccion' && (
        <nav className="mb-4 flex items-center gap-1 rounded-lg bg-surface2 p-1 text-sm">
          <Link
            href="/tareas"
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              !verTodas ? 'bg-surface text-primary shadow-sm' : 'text-ink2 hover:bg-surface/60'
            }`}
          >
            Mías
          </Link>
          <Link
            href="/tareas?todas=1"
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              verTodas ? 'bg-surface text-primary shadow-sm' : 'text-ink2 hover:bg-surface/60'
            }`}
          >
            Del equipo
          </Link>
        </nav>
      )}

      {error ? (
        <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-danger/25">
          No se pudieron cargar las tareas: {error.message}
        </p>
      ) : tareas.length === 0 ? (
        <p className="panel px-4 py-8 text-center text-sm text-ink2">
          Nada pendiente. Recuerda que ningún caso abierto debería quedarse sin próxima acción.
        </p>
      ) : (
        <>
          <Grupo titulo="Vencidas" tareas={vencidas} acento="rojo" />
          <Grupo titulo="Para hoy" tareas={deHoy} acento="coral" />
          <Grupo titulo="Próximas" tareas={proximas} />
        </>
      )}
    </AppShell>
  );
}
