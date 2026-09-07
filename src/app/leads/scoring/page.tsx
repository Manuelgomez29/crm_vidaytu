import { AppShell } from '@/components/app-shell';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Avisos, botonAdmin, botonAdminSecundario, inputAdmin } from '@/app/admin/nav';
import { senalesDeCasosAbiertos } from '@/lib/automatizacion';
import {
  QUE_MIDE,
  SENALES,
  reglaDesdeFila,
  senalesQueCumple,
  umbralesDesde,
  type Regla,
} from '@/lib/scoring';
import { Simulador, type CasoSimulado } from './simulador';
import { borrarRegla, crearRegla, guardarTodo, recalcularAhora } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Lead scoring.
 *
 * Lo que se ajusta aquí es CUÁNTO pesa cada señal, no qué se mide. Las señales
 * son un catálogo cerrado del código a propósito: una condición libre mal
 * escrita no encaja nunca y baja la puntuación sin que nadie se entere, y una
 * puntuación en la que no se confía no la mira nadie.
 *
 * La pantalla era una tabla de formularios donde se cambiaba un número a ciegas
 * y no pasaba nada visible hasta la siguiente pasada del motor, quince minutos
 * después. Nadie ajusta algo cuyo efecto no puede ver, así que los valores se
 * quedaban como venían de fábrica. Ahora el servidor manda las señales que
 * cumple cada caso abierto y el navegador simula el efecto de cualquier cambio
 * antes de guardarlo.
 */
export default async function LeadScoring({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; aviso?: string }>;
}) {
  const { error: errorMsg, aviso } = await searchParams;
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

  /*
   * Las señales se calculan con la clave de servicio y a propósito: el simulador
   * tiene que enseñar el efecto sobre TODOS los casos abiertos del grupo, y esta
   * pantalla ya es exclusiva de dirección, que los ve todos igualmente.
   */
  const admin = createAdminClient();

  const [{ data: filas }, { data: cfg }, casosConSenales] = await Promise.all([
    supabase
      .from('scoring_reglas')
      .select('id, nombre, condicion, puntos, activa, descripcion')
      .order('puntos', { ascending: false }),
    supabase.from('configuracion').select('valor').eq('clave', 'scoring_umbrales').maybeSingle(),
    senalesDeCasosAbiertos(admin),
  ]);

  const umbrales = umbralesDesde(cfg?.valor);

  /*
   * Las reglas cuya señal no existe en el código se apartan: no cuentan para la
   * puntuación, así que meterlas en el simulador sería enseñar un efecto que no
   * ocurre. Se listan abajo para poder borrarlas.
   */
  const reglas = (filas ?? []).map((f) => ({ fila: f, regla: reglaDesdeFila(f) }));
  const validas = reglas
    .filter((r): r is { fila: (typeof reglas)[number]['fila']; regla: Regla } => r.regla !== null)
    .map((r) => ({ ...r.regla, id: r.fila.id, descripcion: r.fila.descripcion }));
  const rotas = reglas.filter((r) => r.regla === null).map((r) => r.fila);

  const casos: CasoSimulado[] = casosConSenales.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    senales: senalesQueCumple(c.senales),
  }));

  const usadas = new Set(validas.map((r) => r.senal));
  const libres = SENALES.filter((s) => !usadas.has(s));

  return (
    <AppShell
      seccion="leads"
      subseccion="/leads/scoring"
      titulo="Lead scoring"
      descripcion="Cuánto pesa cada señal al ordenar la cola"
    >
      <Avisos error={errorMsg} aviso={aviso} />

      <p className="mb-4 mt-4 max-w-[72ch] text-sm text-ink2">
        La puntuación <b>ordena la cola, no decide a quién se atiende</b>: un 12 se llama igual que
        un 90, solo que más tarde. Por eso nunca oculta ni cierra un caso.
      </p>

      {validas.length === 0 ? (
        <p className="panel p-8 text-center text-sm text-muted">
          No hay ninguna regla. Sin ellas todos los casos puntúan 0 y la cola queda por orden de
          llegada.
        </p>
      ) : (
        <Simulador
          reglasIniciales={validas}
          umbralesIniciales={umbrales}
          casos={casos}
          guardar={guardarTodo}
        />
      )}

      {/* ---------------- Reglas rotas ---------------- */}
      {rotas.length > 0 && (
        <section className="panel mb-4 mt-4 p-4">
          <h2 className="mb-1 text-sm font-semibold text-danger">Reglas que no cuentan</h2>
          <p className="mb-3 max-w-[72ch] text-xs text-ink2">
            Su señal no existe en el código, así que no suman ni restan nada. Suele pasar cuando se
            renombra una señal: no fallan, simplemente dejan de aplicarse.
          </p>
          <ul className="flex flex-col gap-2 text-[13px]">
            {rotas.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3">
                <span>
                  <b>{r.nombre}</b>{' '}
                  <span className="text-muted">
                    señal «{String((r.condicion as { senal?: string })?.senal ?? '—')}»
                  </span>
                </span>
                <form action={borrarRegla.bind(null, r.id)}>
                  <button
                    type="submit"
                    className="text-xs text-muted hover:text-danger hover:underline"
                  >
                    Borrar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------------- Nueva regla ---------------- */}
      <section className="panel mt-4 p-4">
        <h2 className="mb-1 text-sm font-semibold">Añadir una regla</h2>
        <p className="mb-3 max-w-[72ch] text-xs text-ink2">
          Las señales son las que el sistema sabe calcular. Si necesitas una que no está en la
          lista, hay que añadirla en el código: es lo que evita reglas que no encajan nunca y bajan
          la puntuación sin que nadie se entere.
        </p>
        {libres.length === 0 ? (
          <p className="text-[13px] text-muted">
            Todas las señales disponibles ya tienen su regla. Ajusta los puntos arriba.
          </p>
        ) : (
          <form action={crearRegla} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-ink2">
              Nombre
              <input
                name="nombre"
                placeholder="Cómo se verá en el desglose"
                className={`${inputAdmin} min-w-56`}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink2">
              Señal
              <select name="senal" className={inputAdmin} required defaultValue="">
                <option value="" disabled>
                  Elige…
                </option>
                {libres.map((s) => (
                  <option key={s} value={s}>
                    {QUE_MIDE[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink2">
              Puntos
              <input
                name="puntos"
                type="number"
                min="-100"
                max="100"
                defaultValue={10}
                className={`${inputAdmin} w-24`}
                required
              />
            </label>
            <button type="submit" className={botonAdmin}>
              Crear
            </button>
          </form>
        )}
      </section>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <form action={recalcularAhora}>
          <button type="submit" className={botonAdminSecundario}>
            Recalcular ahora
          </button>
        </form>
        <p className="max-w-[60ch] text-xs text-muted">
          Al guardar se recalcula solo. Este botón está para rehacer el cálculo sin cambiar nada —
          en staging hace falta porque allí el motor no corre.
        </p>
      </div>

      <p className="mt-5 max-w-[72ch] text-xs text-muted">
        Estos números salen de la experiencia del equipo, no de datos. Cuando haya cien conversiones
        validadas se podrán recalibrar mirando qué señales predijeron de verdad una conversión — que
        es distinto de las que parecían predecirla.
      </p>
    </AppShell>
  );
}
