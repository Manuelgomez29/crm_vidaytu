import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { fecha } from '@/lib/fechas';
import { crearFlujo } from '../actions';
import { ESTADOS_LEAD } from '../modelo';
import { describirDisparador, ETIQUETA_ESTADO, type Disparador } from '../describir';

/**
 * Los flujos de seguimiento: qué hay, cuál está encendido y cuánta gente lleva
 * dentro. Crear uno aquí solo pide nombre y disparador; los pasos se montan en
 * su pantalla.
 */

export default async function Flujos({
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
    .select('rol, alcance')
    .eq('id', user.id)
    .maybeSingle();
  if (perfil?.rol !== 'direccion') redirect('/leads');
  const esDeGrupo = perfil.alcance === 'grupo';

  const [
    { data: flujos },
    { data: etiquetas },
    { data: canales },
    { data: fuentes },
    { data: centros },
  ] = await Promise.all([
    supabase
      .from('flujos')
      .select('id, nombre, activo, disparador, centro_id, created_at, centro:centros (nombre)')
      .order('created_at', { ascending: false }),
    supabase.from('etiquetas').select('id, nombre').order('nombre'),
    supabase.from('canales').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('fuentes_captacion').select('id, nombre').eq('activa', true).order('nombre'),
    supabase
      .from('centros')
      .select('id, nombre')
      .eq('activo', true)
      .eq('es_bandeja_grupo', false)
      .order('nombre'),
  ]);

  const nombres = {
    etiquetas: new Map((etiquetas ?? []).map((e) => [e.id, e.nombre])),
    canales: new Map((canales ?? []).map((c) => [c.id, c.nombre])),
    fuentes: new Map((fuentes ?? []).map((f) => [f.id, f.nombre])),
  };

  // Cuánta gente lleva cada flujo. Son pocos flujos: dos recuentos por cada uno.
  const recuentos = new Map<string, { activas: number; terminadas: number }>();
  for (const f of flujos ?? []) {
    const [{ count: activas }, { count: terminadas }] = await Promise.all([
      supabase
        .from('flujo_inscripciones')
        .select('id', { count: 'exact', head: true })
        .eq('flujo_id', f.id)
        .eq('estado', 'activa'),
      supabase
        .from('flujo_inscripciones')
        .select('id', { count: 'exact', head: true })
        .eq('flujo_id', f.id)
        .in('estado', ['completada', 'salida']),
    ]);
    recuentos.set(f.id, { activas: activas ?? 0, terminadas: terminadas ?? 0 });
  }

  return (
    <AppShell
      titulo="Flujos de seguimiento"
      descripcion="Secuencias que se disparan solas: un correo hoy, una guía en tres días, una tarea al comercial si hizo clic"
    >
      {aviso && (
        <p className="mb-4 rounded-lg bg-ok-soft px-4 py-3 text-sm text-ok ring-1 ring-ok/25">
          {aviso}
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-danger/25">
          {error}
        </p>
      )}

      <section className="panel mb-5 p-4">
        <h2 className="mb-1 text-sm font-semibold">Nuevo flujo</h2>
        <p className="mb-3 text-xs text-ink2">
          Un flujo tiene un solo disparador. Los correos que mande pasan por las mismas barreras que
          una campaña: solo a quien consintió, con pie de baja y sin términos clínicos.
        </p>
        <form action={crearFlujo} className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <input
              name="nombre"
              placeholder="Nombre (p. ej. «Guía para familias tras el primer contacto»)"
              className="campo min-w-64 flex-1"
              required
            />
            {esDeGrupo && (
              <select name="centro" defaultValue="" className="campo" title="De qué centro es">
                <option value="">Todo el grupo</option>
                {(centros ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    Solo {c.nombre}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink2">Se dispara</span>
            <select name="disparador_tipo" defaultValue="etiqueta_aplicada" className="campo">
              <option value="etiqueta_aplicada">cuando se le pone una etiqueta</option>
              <option value="lead_creado">cuando entra un caso nuevo</option>
              <option value="estado_lead">cuando su caso cambia de estado</option>
              <option value="consentimiento">cuando da su consentimiento</option>
              <option value="manual">solo a mano</option>
            </select>
            <select
              name="disparador_etiqueta"
              defaultValue=""
              className="campo"
              title="Etiqueta (si el disparador es por etiqueta)"
            >
              <option value="">— etiqueta —</option>
              {(etiquetas ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
            <select
              name="disparador_canal"
              defaultValue=""
              className="campo"
              title="Canal (si es por caso nuevo; opcional)"
            >
              <option value="">— cualquier canal —</option>
              {(canales ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <select
              name="disparador_fuente"
              defaultValue=""
              className="campo"
              title="Fuente (si es por caso nuevo; opcional)"
            >
              <option value="">— cualquier fuente —</option>
              {(fuentes ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nombre}
                </option>
              ))}
            </select>
            <select
              name="disparador_estado"
              defaultValue=""
              className="campo"
              title="Estado (si es por cambio de estado)"
            >
              <option value="">— estado —</option>
              {ESTADOS_LEAD.map((e) => (
                <option key={e} value={e}>
                  {ETIQUETA_ESTADO[e]}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-coral">
              Crear
            </button>
          </div>
          <p className="text-xs text-muted">
            Solo cuenta el desplegable que corresponda al disparador elegido; los demás se ignoran.
          </p>
        </form>
      </section>

      {(flujos ?? []).length === 0 ? (
        <p className="panel px-4 py-8 text-center text-sm text-ink2">Todavía no hay flujos.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {(flujos ?? []).map((f) => {
            const r = recuentos.get(f.id) ?? { activas: 0, terminadas: 0 };
            const centro = (f.centro as { nombre: string } | null)?.nombre ?? 'Grupo';
            return (
              <li key={f.id} className="tarjeta flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/marketing/flujos/${f.id}`}
                    className="font-semibold hover:underline"
                  >
                    {f.nombre}
                  </Link>
                  <p className="truncate text-xs text-ink2">
                    {describirDisparador(f.disparador as Disparador, nombres)} · {centro} · creado
                    el {fecha(f.created_at)}
                  </p>
                </div>
                <span className={`chip ${f.activo ? 'chip-ok' : 'chip-mut'}`}>
                  {f.activo ? 'Activo' : 'En pausa'}
                </span>
                <span
                  className="num text-xs text-ink2"
                  title="Personas dentro ahora / que ya terminaron"
                >
                  {r.activas} dentro · {r.terminadas} terminadas
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
