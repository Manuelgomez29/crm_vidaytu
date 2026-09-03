import { AppShell } from '@/components/app-shell';
import { fechaCorta } from '@/lib/fechas';
import { iaConfigurada } from '@/lib/ia';
import { exigirAccesoClinico } from '../guard';
import { consultarAsistente } from './actions';

/**
 * Asistente clínico. Dos pestañas en una: consulta de datos (fase 3) y apoyo
 * profesional (fase 3b). Comparten la misma garantía de permisos, así que no
 * tiene sentido separarlas en dos pantallas.
 */
export default async function Asistente({
  searchParams,
}: {
  searchParams: Promise<{ ambito?: string; pregunta?: string; consulta?: string }>;
}) {
  const { ambito, pregunta, consulta } = await searchParams;
  const { supabase, perfil } = await exigirAccesoClinico();

  const modo = ambito === 'psicologia' ? 'psicologia' : 'clinica';

  const [{ data: activa }, { data: historial }, { data: ultima }] = await Promise.all([
    supabase.from('configuracion').select('valor').eq('clave', 'ia_activa').maybeSingle(),
    supabase
      .from('ia_consultas')
      .select('id, pregunta, ambito, created_at')
      .eq('usuario_id', perfil.id)
      .order('created_at', { ascending: false })
      .limit(8),
    consulta
      ? supabase
          .from('ia_consultas')
          .select('pregunta, respuesta, error')
          .eq('id', consulta)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const respuesta = ultima?.respuesta ?? null;
  const error = ultima?.error ?? null;
  const preguntaMostrada = ultima?.pregunta ?? pregunta ?? '';

  const encendida = activa?.valor === true;
  const conClave = iaConfigurada();

  const SUGERENCIAS =
    modo === 'psicologia'
      ? [
          'Resume la evolución de mis pacientes en las últimas sesiones.',
          'Prepárame un guion para la próxima sesión de seguimiento.',
          'Redacta un borrador de informe de evolución con lo registrado.',
        ]
      : [
          '¿Qué pacientes tengo en tratamiento ahora mismo?',
          '¿Cuántas sesiones lleva cada uno?',
          '¿A quién le toca seguimiento post-alta este mes?',
        ];

  return (
    <AppShell
      seccion="clinica"
      subseccion="/clinica/asistente"
      titulo="Asistente"
      descripcion="Responde solo con lo que tú puedes ver"
    >
      {!encendida && (
        <p className="mb-4 rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn ring-1 ring-warn/25">
          El asistente está apagado. Dirección lo enciende en Configuración → Parámetros, y conviene
          hacerlo solo después de firmar el acuerdo de tratamiento de datos con el proveedor.
        </p>
      )}
      {encendida && !conClave && (
        <p className="mb-4 rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn ring-1 ring-warn/25">
          Falta la clave del proveedor (<code>ANTHROPIC_API_KEY</code>) en el servidor.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-4">
          <nav className="flex w-fit items-center gap-1 rounded-lg bg-surface2 p-1 text-sm">
            {[
              ['clinica', 'Consultar datos'],
              ['psicologia', 'Apoyo profesional'],
            ].map(([clave, texto]) => (
              <a
                key={clave}
                href={`/clinica/asistente?ambito=${clave}`}
                className={`rounded-md px-3 py-1.5 font-medium transition ${
                  modo === clave ? 'bg-surface text-primary shadow-sm' : 'text-ink2 hover:bg-surface/60'
                }`}
              >
                {texto}
              </a>
            ))}
          </nav>

          <section className="panel p-4">
            <form action={consultarAsistente} className="flex flex-col gap-3">
              <input type="hidden" name="ambito" value={modo} />
              <label className="block">
                <span className="etiqueta-campo">
                  {modo === 'psicologia' ? 'En qué te ayudo' : 'Qué quieres saber'}
                </span>
                <textarea
                  name="pregunta"
                  rows={3}
                  defaultValue={preguntaMostrada}
                  placeholder={SUGERENCIAS[0]}
                  className="campo w-full"
                  required
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button type="submit" className="btn btn-coral" disabled={!encendida || !conClave}>
                  Preguntar
                </button>
                <span className="text-xs text-muted">
                  Cada consulta queda registrada en la auditoría.
                </span>
              </div>
            </form>

            {error && (
              <p className="mt-3 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-danger/25">
                {error}
              </p>
            )}

            {respuesta && (
              <div className="mt-4 rounded-lg bg-ground p-4 ring-1 ring-line">
                <p className="mb-2 text-[11px] uppercase tracking-[0.1em] text-muted">Respuesta</p>
                <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">
                  {respuesta}
                </p>
                {modo === 'psicologia' && (
                  <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
                    Es un borrador de apoyo. La decisión clínica es tuya.
                  </p>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <section className="panel p-4">
            <h2 className="mb-2 text-sm font-semibold">Cómo funciona</h2>
            <p className="text-xs leading-relaxed text-ink2">
              El asistente solo recibe los datos que <b>tú</b> puedes abrir en la plataforma. Si
              preguntas por un paciente que no es tuyo, no es que se niegue a contestar: es que ese
              dato nunca sale de la base de datos.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-ink2">
              No emite diagnósticos ni pautas de tratamiento, y no completa con lo que no consta.
            </p>
          </section>

          <section className="panel p-4">
            <h2 className="mb-2 text-sm font-semibold">Ejemplos</h2>
            <ul className="flex flex-col gap-1.5">
              {SUGERENCIAS.map((s) => (
                <li key={s}>
                  <a
                    href={`/clinica/asistente?ambito=${modo}&pregunta=${encodeURIComponent(s)}`}
                    className="block rounded-lg bg-ground px-2.5 py-1.5 text-xs text-ink2 ring-1 ring-line hover:text-primary"
                  >
                    {s}
                  </a>
                </li>
              ))}
            </ul>
          </section>

          {(historial ?? []).length > 0 && (
            <section className="panel p-4">
              <h2 className="mb-2 text-sm font-semibold">Tus últimas consultas</h2>
              <ul className="flex flex-col gap-1.5 text-xs text-ink2">
                {(historial ?? []).map((h) => (
                  <li key={h.id}>
                    <span className="block truncate">{h.pregunta}</span>
                    <span className="text-muted">{fechaCorta(h.created_at)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </AppShell>
  );
}
