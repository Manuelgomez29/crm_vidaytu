import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { fechaCorta } from '@/lib/fechas';
import { iaConfigurada } from '@/lib/ia';
import { consultarPanel } from './actions';

const SUGERENCIAS = [
  '¿Cuántos leads ha traído cada canal este trimestre?',
  '¿Qué centro convierte mejor y cuánto ha ingresado?',
  '¿De dónde viene la mayoría de los casos perdidos?',
  '¿Cuántos pacientes hay en tratamiento ahora mismo?',
];

/**
 * Copiloto de dirección: el dashboard en lenguaje natural.
 *
 * No sustituye al panel: el panel enseña lo que hay que mirar todos los días,
 * y esto responde la pregunta suelta que no tiene su propia tarjeta.
 */
export default async function AsistentePanel({
  searchParams,
}: {
  searchParams: Promise<{ consulta?: string }>;
}) {
  const { consulta } = await searchParams;
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

  const [{ data: activa }, { data: ultima }, { data: historial }] = await Promise.all([
    supabase.from('configuracion').select('valor').eq('clave', 'ia_activa').maybeSingle(),
    consulta
      ? supabase
          .from('ia_consultas')
          .select('pregunta, respuesta, error')
          .eq('id', consulta)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('ia_consultas')
      .select('id, pregunta, created_at')
      .eq('usuario_id', user.id)
      .eq('ambito', 'direccion')
      .order('created_at', { ascending: false })
      .limit(6),
  ]);

  const encendida = activa?.valor === true;
  const conClave = iaConfigurada();

  return (
    <AppShell
      seccion="panel"
      titulo="Preguntar a los datos"
      descripcion="El dashboard en lenguaje natural"
    >
      {!encendida && (
        <p className="mb-4 rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn ring-1 ring-warn/25">
          El asistente está apagado. Se enciende en Configuración → Parámetros, y conviene hacerlo
          solo tras firmar el acuerdo de tratamiento de datos con el proveedor.
        </p>
      )}
      {encendida && !conClave && (
        <p className="mb-4 rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn ring-1 ring-warn/25">
          Falta <code>ANTHROPIC_API_KEY</code> en el servidor.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="panel p-4">
          <form action={consultarPanel} className="flex flex-col gap-3">
            <label className="block">
              <span className="etiqueta-campo">Qué quieres saber</span>
              <textarea
                name="pregunta"
                rows={3}
                defaultValue={ultima?.pregunta ?? ''}
                placeholder={SUGERENCIAS[0]}
                className="campo w-full"
                required
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" className="btn btn-coral" disabled={!encendida || !conClave}>
                Preguntar
              </button>
              <span className="text-xs text-muted">Cada consulta queda auditada.</span>
            </div>
          </form>

          {ultima?.error && (
            <p className="mt-3 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-danger/25">
              {ultima.error}
            </p>
          )}

          {ultima?.respuesta && (
            <div className="mt-4 rounded-lg bg-ground p-4 ring-1 ring-line">
              <p className="mb-2 text-[11px] uppercase tracking-[0.1em] text-muted">Respuesta</p>
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{ultima.respuesta}</p>
            </div>
          )}
        </section>

        <div className="flex flex-col gap-4">
          <section className="panel p-4">
            <h2 className="mb-2 text-sm font-semibold">Qué puede responder</h2>
            <ul className="flex flex-col gap-1.5">
              {SUGERENCIAS.map((s) => (
                <li key={s}>
                  <a
                    href={`/panel/asistente?pregunta=${encodeURIComponent(s)}`}
                    className="block rounded-lg bg-ground px-2.5 py-1.5 text-xs text-ink2 ring-1 ring-line hover:text-primary"
                  >
                    {s}
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              Responde con los números de los últimos 90 días: leads, conversiones validadas,
              ingresos y pacientes. No inventa lo que no consta.
            </p>
          </section>

          {(historial ?? []).length > 0 && (
            <section className="panel p-4">
              <h2 className="mb-2 text-sm font-semibold">Tus últimas preguntas</h2>
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
