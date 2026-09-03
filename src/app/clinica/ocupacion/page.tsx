import { AppShell } from '@/components/app-shell';
import { fecha, hoyMadrid } from '@/lib/fechas';
import { exigirAccesoClinico } from '../guard';
import { asignarPlaza, liberarPlaza } from './actions';

/**
 * Mapa de ocupación residencial. Bellamar es el único centro con ingreso, pero
 * la pantalla no lo da por hecho: muestra cualquier centro que tenga
 * habitaciones dadas de alta, para que si el grupo abre otro no haya que tocar
 * código.
 */
export default async function Ocupacion({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string; error?: string }>;
}) {
  const { aviso, error } = await searchParams;
  const { supabase, esDireccion } = await exigirAccesoClinico();

  const hoy = hoyMadrid();

  const [{ data: habitaciones }, { data: ocupaciones }, { data: pacientes }] = await Promise.all([
    supabase
      .from('habitaciones')
      .select('id, nombre, plazas, activa, centro:centros (id, nombre, slug)')
      .eq('activa', true)
      .order('nombre'),
    supabase
      .from('ocupaciones')
      .select('id, habitacion_id, desde, hasta, paciente:pacientes (id, nombre)')
      .is('hasta', null),
    supabase
      .from('pacientes')
      .select('id, nombre')
      .eq('estado', 'activo')
      .order('nombre')
      .limit(200),
  ]);

  type Ocupacion = NonNullable<typeof ocupaciones>[number];
  const ocupadasPorHabitacion = new Map<string, Ocupacion[]>();
  for (const o of ocupaciones ?? []) {
    const lista = ocupadasPorHabitacion.get(o.habitacion_id) ?? [];
    lista.push(o);
    ocupadasPorHabitacion.set(o.habitacion_id, lista);
  }

  type Habitacion = NonNullable<typeof habitaciones>[number];
  const porCentro = new Map<string, { nombre: string; habitaciones: Habitacion[] }>();
  for (const h of habitaciones ?? []) {
    const clave = h.centro?.id ?? 'sin-centro';
    const entrada = porCentro.get(clave) ?? {
      nombre: h.centro?.nombre ?? 'Sin centro',
      habitaciones: [] as Habitacion[],
    };
    entrada.habitaciones.push(h);
    porCentro.set(clave, entrada);
  }

  const totalPlazas = (habitaciones ?? []).reduce((s, h) => s + h.plazas, 0);
  const totalOcupadas = (ocupaciones ?? []).length;

  return (
    <AppShell
      seccion="clinica"
      subseccion="/clinica/ocupacion"
      titulo="Ocupación residencial"
      descripcion={
        totalPlazas > 0
          ? `${totalOcupadas} de ${totalPlazas} plazas ocupadas · ${totalPlazas - totalOcupadas} libres`
          : 'Sin habitaciones dadas de alta'
      }
    >
      {aviso && (
        <p className="mb-4 rounded-lg bg-ok-soft px-4 py-3 text-sm text-ok ring-1 ring-ok/25">{aviso}</p>
      )}
      {error && (
        <p className="mb-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-danger/25">
          {error}
        </p>
      )}

      {(habitaciones ?? []).length === 0 ? (
        <p className="panel px-4 py-8 text-center text-sm text-ink2">
          Todavía no hay habitaciones.{' '}
          {esDireccion
            ? 'Se dan de alta en Configuración → Clínica.'
            : 'Dirección puede darlas de alta desde Configuración.'}
        </p>
      ) : (
        Array.from(porCentro.entries()).map(([clave, centro]) => (
          <section key={clave} className="mb-6">
            <h2 className="mb-2 text-[11px] uppercase tracking-[0.1em] text-muted">{centro.nombre}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {centro.habitaciones.map((h) => {
                const dentro = ocupadasPorHabitacion.get(h.id) ?? [];
                const libres = h.plazas - dentro.length;
                return (
                  <article
                    key={h.id}
                    className={`panel p-3 ${libres === 0 ? 'ring-1 ring-warn/40' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <b className="text-[13.5px]">{h.nombre}</b>
                      <span className={`chip ${libres > 0 ? 'chip-ok' : 'chip-warn'}`}>
                        {libres > 0 ? `${libres} libre(s)` : 'Completa'}
                      </span>
                    </div>

                    <ul className="mt-2 flex flex-col gap-1">
                      {dentro.map((o) => (
                        <li
                          key={o.id}
                          className="flex items-center justify-between gap-2 rounded-lg bg-ground px-2.5 py-1.5 text-[13px] ring-1 ring-line"
                        >
                          <span className="min-w-0 truncate">
                            {o.paciente?.nombre ?? 'Paciente'}
                            <span className="block text-[11px] text-muted">
                              desde {fecha(o.desde, false)}
                            </span>
                          </span>
                          <form action={liberarPlaza.bind(null, o.id)}>
                            <button
                              type="submit"
                              className="shrink-0 text-xs text-muted hover:text-danger hover:underline"
                            >
                              Alta
                            </button>
                          </form>
                        </li>
                      ))}
                      {Array.from({ length: Math.max(0, libres) }).map((_, i) => (
                        <li
                          key={`libre-${i}`}
                          className="rounded-lg border border-dashed border-line2 px-2.5 py-1.5 text-[12px] text-muted"
                        >
                          Plaza libre
                        </li>
                      ))}
                    </ul>

                    {libres > 0 && (
                      <form action={asignarPlaza.bind(null, h.id)} className="mt-2 flex gap-1.5">
                        <select name="paciente" defaultValue="" className="campo min-w-0 flex-1 text-xs" required>
                          <option value="">Ingresar a…</option>
                          {(pacientes ?? []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre}
                            </option>
                          ))}
                        </select>
                        <input type="hidden" name="desde" value={hoy} />
                        <button type="submit" className="btn btn-ghost btn-mini">
                          Asignar
                        </button>
                      </form>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))
      )}

      <p className="text-xs text-muted">
        Solo aparecen los pacientes de los que puedes ver la ficha. Si una plaza figura ocupada por
        alguien que no es tuyo, verás la plaza pero no el nombre.
      </p>
    </AppShell>
  );
}
