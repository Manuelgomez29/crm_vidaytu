import { AppShell } from '@/components/app-shell';
import { exigirDireccion } from '../guard';
import { Avisos, botonAdmin, botonAdminSecundario, inputAdmin } from '../nav';
import { QUE_MIDE, SENALES, type Senal } from '@/lib/scoring';
import { borrarRegla, crearRegla, guardarRegla } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Reglas de puntuación.
 *
 * Lo que se ajusta aquí es CUÁNTO pesa cada señal, no qué se mide. Las señales
 * son un catálogo cerrado del código a propósito: una condición libre mal
 * escrita no encaja nunca y baja la puntuación sin que nadie se entere, y una
 * puntuación en la que no se confía no la mira nadie.
 */
export default async function AdminScoring({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; aviso?: string }>;
}) {
  const { error: errorMsg, aviso } = await searchParams;
  const { supabase } = await exigirDireccion();

  const [{ data: reglas }, { data: casos }] = await Promise.all([
    supabase
      .from('scoring_reglas')
      .select('id, nombre, condicion, puntos, activa, descripcion')
      .order('puntos', { ascending: false }),
    supabase
      .from('leads')
      .select('puntuacion')
      .not('estado', 'in', '(convertido,perdido,no_valido,derivado)'),
  ]);

  const abiertos = casos ?? [];
  const calientes = abiertos.filter((c) => (c.puntuacion ?? 0) >= 70).length;
  const templados = abiertos.filter((c) => (c.puntuacion ?? 0) >= 40 && (c.puntuacion ?? 0) < 70).length;

  const usadas = new Set(
    (reglas ?? []).map((r) => (r.condicion as { senal?: string } | null)?.senal).filter(Boolean),
  );
  const libres = SENALES.filter((s) => !usadas.has(s));

  return (
    <AppShell
      seccion="admin"
      subseccion="/admin/scoring"
      titulo="Puntuación de casos"
      descripcion="Cuánto pesa cada señal al ordenar la cola"
    >
      <Avisos error={errorMsg} aviso={aviso} />

      <p className="mb-4 max-w-[72ch] text-sm text-ink2">
        La puntuación <b>ordena la cola, no decide a quién se atiende</b>: un 12 se llama igual que
        un 90, solo que más tarde. Por eso nunca oculta ni cierra un caso. Los cambios se aplican en
        la siguiente pasada del motor, no al instante.
      </p>

      <div className="mb-5 flex flex-wrap gap-2">
        <span className="chip chip-danger">{calientes} caliente(s) · 70+</span>
        <span className="chip chip-warn">{templados} templado(s) · 40-69</span>
        <span className="chip chip-mut">{abiertos.length} caso(s) abiertos</span>
      </div>

      {/* ---------------- Reglas ---------------- */}
      <div className="panel mb-5 overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th>Regla</th>
              <th>Qué mide</th>
              <th className="text-right">Puntos</th>
              <th>Activa</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(reglas ?? []).map((r) => {
              const senal = (r.condicion as { senal?: string } | null)?.senal as Senal | undefined;
              return (
                <tr key={r.id}>
                  <td>
                    <b className="text-[13px]">{r.nombre}</b>
                    {r.descripcion && (
                      <span className="block text-xs text-muted">{r.descripcion}</span>
                    )}
                  </td>
                  <td className="text-xs text-ink2">
                    {senal && QUE_MIDE[senal] ? (
                      QUE_MIDE[senal]
                    ) : (
                      <span className="chip chip-danger">
                        Señal desconocida: esta regla no cuenta
                      </span>
                    )}
                  </td>
                  <td colSpan={3}>
                    <form
                      action={guardarRegla.bind(null, r.id)}
                      className="flex flex-wrap items-center justify-end gap-2"
                    >
                      <input
                        name="puntos"
                        type="number"
                        min="-100"
                        max="100"
                        defaultValue={r.puntos}
                        className={`${inputAdmin} w-20 text-right`}
                        aria-label={`Puntos de ${r.nombre}`}
                      />
                      <label className="flex items-center gap-1.5 text-xs text-ink2">
                        <input type="checkbox" name="activa" defaultChecked={r.activa} /> Activa
                      </label>
                      <button type="submit" className={botonAdminSecundario}>
                        Guardar
                      </button>
                      <button
                        type="submit"
                        formAction={borrarRegla.bind(null, r.id)}
                        className="text-xs text-muted hover:text-danger hover:underline"
                      >
                        Borrar
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(reglas ?? []).length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted">
            No hay reglas. Sin ellas todos los casos puntúan 0 y la cola queda por orden de llegada.
          </p>
        )}
      </div>

      {/* ---------------- Nueva regla ---------------- */}
      <section className="panel p-4">
        <h2 className="mb-1 text-sm font-semibold">Nueva regla</h2>
        <p className="mb-3 max-w-[72ch] text-xs text-ink2">
          Las señales son las que el sistema sabe calcular. Si necesitas una que no está en la
          lista, hay que añadirla en el código: es lo que evita reglas que no encajan nunca y bajan
          la puntuación sin que nadie se entere.
        </p>
        {libres.length === 0 ? (
          <p className="text-[13px] text-muted">
            Todas las señales disponibles ya tienen su regla. Ajusta los puntos de las de arriba.
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

      <p className="mt-5 max-w-[72ch] text-xs text-muted">
        Estos números salen de la experiencia del equipo, no de datos. Cuando haya cien conversiones
        validadas se podrán recalibrar mirando qué señales predijeron de verdad una conversión — que
        es distinto de las que parecían predecirla.
      </p>
    </AppShell>
  );
}
