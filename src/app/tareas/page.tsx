import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { fecha, hoyMadrid } from '@/lib/fechas';
import {
  aplazarTarea,
  borrarTarea,
  completarTareaDesdeLista,
  crearTareaManual,
  reabrirTarea,
} from './actions';

type FilaTarea = {
  id: string;
  titulo: string;
  vence_at: string;
  completada_at: string | null;
  lead_id: string | null;
  lead: { nombre: string; estado: string; centro: { nombre: string; slug: string } | null } | null;
  responsable: { nombre: string } | null;
  cerrada_por: { nombre: string } | null;
};

const CHIP_CENTRO: Record<string, string> = {
  horizonte: 'chip-hz',
  eclipse: 'chip-ec',
  bellamar: 'chip-bm',
  'bandeja-grupo': 'chip-gr',
};

const SELECCION = `id, titulo, vence_at, completada_at, lead_id,
  lead:leads (nombre, estado, centro:centros (nombre, slug)),
  responsable:perfiles!tareas_responsable_id_fkey (nombre),
  cerrada_por:perfiles!tareas_completada_por_fkey (nombre)`;

/** Periodos del historial. Se cambia desde la propia pantalla. */
const PERIODOS = [
  { dias: 30, texto: '30 días' },
  { dias: 90, texto: '90 días' },
  { dias: 365, texto: '1 año' },
];

function ChipCentro({ centro }: { centro: { nombre: string; slug: string } | null }) {
  if (!centro) return null;
  return <span className={`chip ${CHIP_CENTRO[centro.slug] ?? 'chip-mut'}`}>{centro.nombre}</span>;
}

/** De dónde cuelga la tarea: un caso, o nada. */
function Origen({ tarea }: { tarea: FilaTarea }) {
  if (!tarea.lead_id) {
    return <span className="chip chip-mut">Sin caso</span>;
  }
  return (
    <>
      <Link href={`/leads/${tarea.lead_id}`} className="font-medium text-primary hover:underline">
        {tarea.lead?.nombre ?? 'Caso'}
      </Link>
      <ChipCentro centro={tarea.lead?.centro ?? null} />
    </>
  );
}

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
                <Origen tarea={t} />
                <span className={acento === 'rojo' ? 'font-semibold text-danger' : ''}>
                  ◷ {fecha(t.vence_at)}
                </span>
              </p>
            </div>

            {/* Aplazar es lo que más se hace con una tarea: sin abrir nada. */}
            <div className="flex items-center gap-1 text-xs text-muted">
              {[
                [1, '+1d'],
                [3, '+3d'],
                [7, '+7d'],
              ].map(([dias, texto]) => (
                <form key={dias} action={aplazarTarea.bind(null, t.id, dias as number)}>
                  <button
                    type="submit"
                    title={`Aplazar ${dias} día(s)`}
                    className="rounded-md px-1.5 py-1 hover:bg-surface2 hover:text-ink"
                  >
                    {texto}
                  </button>
                </form>
              ))}
            </div>

            <form action={completarTareaDesdeLista.bind(null, t.id)}>
              <button type="submit" className="btn btn-ghost">
                Completar
              </button>
            </form>

            <form action={borrarTarea.bind(null, t.id)}>
              <button
                type="submit"
                title="Borrar la tarea"
                className="text-xs text-muted hover:text-danger hover:underline"
              >
                Borrar
              </button>
            </form>
          </article>
        ))}
      </div>
    </section>
  );
}

/** Bandeja personal: lo que cada comercial tiene que hacer hoy, y lo que ya hizo. */
export default async function MisTareas({
  searchParams,
}: {
  searchParams: Promise<{
    todas?: string;
    ver?: string;
    dias?: string;
    aviso?: string;
    error?: string;
  }>;
}) {
  const { todas, ver, dias, aviso, error: errorParam } = await searchParams;
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
  if (perfil?.rol === 'terapeuta') redirect('/agenda');

  const esDireccion = perfil?.rol === 'direccion';
  const verTodas = todas === '1' && esDireccion;
  const verHechas = ver === 'hechas';
  const diasHistorial = PERIODOS.some((p) => String(p.dias) === dias) ? Number(dias) : 90;

  /** Conserva el resto de pestañas al cambiar una de ellas. */
  const enlace = (cambios: { todas?: boolean; hechas?: boolean; dias?: number }) => {
    const p = new URLSearchParams();
    if (cambios.todas ?? verTodas) p.set('todas', '1');
    const hechas = cambios.hechas ?? verHechas;
    if (hechas) p.set('ver', 'hechas');
    const d = cambios.dias ?? diasHistorial;
    if (hechas && d !== 90) p.set('dias', String(d));
    const q = p.toString();
    return `/tareas${q ? `?${q}` : ''}`;
  };

  let consulta = supabase.from('tareas').select(SELECCION);
  if (verHechas) {
    const desde = new Date(Date.now() - diasHistorial * 24 * 60 * 60 * 1000).toISOString();
    consulta = consulta
      .not('completada_at', 'is', null)
      .gte('completada_at', desde)
      .order('completada_at', { ascending: false })
      .limit(300);
  } else {
    consulta = consulta.is('completada_at', null).order('vence_at');
  }
  if (!verTodas) consulta = consulta.eq('responsable_id', user.id);

  /**
   * Los casos que puede elegir al crear la tarea. Solo abiertos: apuntar una
   * próxima acción sobre un caso ya cerrado no tiene sentido, y la lista sería
   * el doble de larga.
   */
  const [{ data, error }, { data: casos }, { data: companeros }] = await Promise.all([
    consulta,
    supabase
      .from('leads')
      .select('id, nombre, centro:centros (nombre)')
      .not('estado', 'in', '(convertido,perdido,no_valido)')
      .order('created_at', { ascending: false })
      .limit(200),
    esDireccion
      ? supabase
          .from('perfiles')
          .select('id, nombre')
          .eq('activo', true)
          .in('rol', ['direccion', 'admisiones'])
          .order('nombre')
      : Promise.resolve({ data: null }),
  ]);

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

  /**
   * Cerrada antes de vencer. Es el indicador de disciplina comercial (regla 9)
   * y por eso se ve aquí, no escondido en el dashboard.
   */
  const enPlazo = tareas.filter(
    (t) => t.completada_at && new Date(t.completada_at).getTime() <= new Date(t.vence_at).getTime(),
  ).length;
  const porcentaje = tareas.length > 0 ? Math.round((enPlazo / tareas.length) * 100) : 0;
  const textoPeriodo = diasHistorial === 365 ? '12 meses' : `${diasHistorial} días`;

  // Por defecto, mañana a las nueve: lo que se apunta hoy casi nunca es para hoy.
  const manana = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const porDefecto = `${manana.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })}T09:00`;

  const pestana = (activa: boolean) =>
    `rounded-md px-3 py-1.5 font-medium transition ${
      activa ? 'bg-surface text-primary shadow-sm' : 'text-ink2 hover:bg-surface/60'
    }`;

  return (
    <AppShell
      seccion="tareas"
      titulo={verTodas ? 'Tareas del equipo' : 'Mis tareas'}
      descripcion={
        verHechas
          ? `${tareas.length} completada${tareas.length === 1 ? '' : 's'} en los últimos ${textoPeriodo}${
              tareas.length > 0 ? ` · ${porcentaje}% dentro de plazo` : ''
            }`
          : `${tareas.length} pendiente${tareas.length === 1 ? '' : 's'} · ${vencidas.length} vencida${
              vencidas.length === 1 ? '' : 's'
            }`
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav className="flex items-center gap-1 rounded-lg bg-surface2 p-1 text-sm">
          <Link href={enlace({ hechas: false })} className={pestana(!verHechas)}>
            Pendientes
          </Link>
          <Link href={enlace({ hechas: true })} className={pestana(verHechas)}>
            Completadas
          </Link>
        </nav>

        {esDireccion && (
          <nav className="flex items-center gap-1 rounded-lg bg-surface2 p-1 text-sm">
            <Link href={enlace({ todas: false })} className={pestana(!verTodas)}>
              Mías
            </Link>
            <Link href={enlace({ todas: true })} className={pestana(verTodas)}>
              Del equipo
            </Link>
          </nav>
        )}

        {verHechas && (
          <nav className="flex items-center gap-1 rounded-lg bg-surface2 p-1 text-sm">
            {PERIODOS.map((p) => (
              <Link
                key={p.dias}
                href={enlace({ dias: p.dias })}
                className={pestana(diasHistorial === p.dias)}
              >
                {p.texto}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {aviso && (
        <p className="mb-4 rounded-lg bg-ok-soft px-4 py-3 text-sm text-ok ring-1 ring-ok/25">{aviso}</p>
      )}
      {errorParam && (
        <p className="mb-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-danger/25">
          {errorParam}
        </p>
      )}

      {/* -------------------- Apuntar algo -------------------- */}
      {!verHechas && (
        <section className="panel mb-5 p-4">
          <h2 className="mb-1 text-sm font-semibold">Apuntar una tarea</h2>
          <p className="mb-3 text-xs text-ink2">
            El caso es opcional: aquí también va lo que no cuelga de ninguno — llamar a un
            prescriptor, preparar la reunión del lunes. Lo que acaba en un post-it no lo cubre nadie
            cuando estás de baja.
          </p>

          <form action={crearTareaManual} className="flex flex-wrap items-end gap-2">
            <input
              name="titulo"
              placeholder="¿Qué hay que hacer?"
              className="campo min-w-56 flex-1"
              required
            />
            <label className="text-xs text-ink2">
              <span className="mb-0.5 block">Para cuándo</span>
              <input name="vence" type="datetime-local" defaultValue={porDefecto} className="campo" required />
            </label>
            <label className="text-xs text-ink2">
              <span className="mb-0.5 block">Sobre un caso</span>
              <select name="lead" defaultValue="" className="campo max-w-56">
                <option value="">Ninguno</option>
                {(casos ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                    {c.centro?.nombre ? ` · ${c.centro.nombre}` : ''}
                  </option>
                ))}
              </select>
            </label>
            {esDireccion && (companeros ?? []).length > 0 && (
              <label className="text-xs text-ink2">
                <span className="mb-0.5 block">Para quién</span>
                <select name="responsable" defaultValue={user.id} className="campo">
                  {(companeros ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id === user.id ? 'Para mí' : c.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="submit" className="btn btn-coral">
              Apuntar
            </button>
          </form>
        </section>
      )}

      {error ? (
        <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-danger/25">
          No se pudieron cargar las tareas: {error.message}
        </p>
      ) : verHechas ? (
        tareas.length === 0 ? (
          <p className="panel px-4 py-8 text-center text-sm text-ink2">
            Ninguna tarea completada en este periodo. Prueba a ampliar el rango.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {tareas.map((t) => {
              const cerrada = t.completada_at as string;
              const tarde = new Date(cerrada).getTime() > new Date(t.vence_at).getTime();
              return (
                <article key={t.id} className="panel flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold text-ink2 line-through decoration-line2">
                      {t.titulo}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink2">
                      <Origen tarea={t} />
                      <span className={`chip ${tarde ? 'chip-warn' : 'chip-ok'}`}>
                        {tarde ? 'Fuera de plazo' : 'En plazo'}
                      </span>
                      <span>✓ {fecha(cerrada)}</span>
                      {t.cerrada_por?.nombre && <span>por {t.cerrada_por.nombre}</span>}
                      {verTodas &&
                        t.responsable?.nombre &&
                        t.responsable.nombre !== t.cerrada_por?.nombre && (
                          <span className="text-muted">· asignada a {t.responsable.nombre}</span>
                        )}
                      <span className="text-muted">· vencía {fecha(t.vence_at)}</span>
                    </p>
                  </div>
                  <form action={reabrirTarea.bind(null, t.id)}>
                    <button type="submit" className="btn btn-ghost" title="Devolver a pendientes">
                      Reabrir
                    </button>
                  </form>
                </article>
              );
            })}
          </div>
        )
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
