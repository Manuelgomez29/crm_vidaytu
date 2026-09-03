import { AppShell } from '@/components/app-shell';
import { fecha } from '@/lib/fechas';
import { exigirDireccion } from '../guard';
import { Avisos, botonAdmin, botonAdminSecundario, inputAdmin } from '../nav';
import {
  borrarAusencia,
  crearAusencia,
  crearUsuario,
  editarUsuario,
  guardarDisponibilidad,
  guardarObjetivos,
  retirarSegundoFactor,
} from '../actions';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const ROLES = [
  ['direccion', 'Dirección (lo ve todo)'],
  ['admisiones', 'Admisiones (sus centros)'],
  ['terapeuta', 'Terapeuta (solo sus citas)'],
] as const;

export default async function AdminEquipo({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; aviso?: string }>;
}) {
  const { error: errorMsg, aviso } = await searchParams;
  const { supabase, user } = await exigirDireccion();

  const [{ data: perfiles }, { data: centros }, { data: asignaciones }, { data: disponibilidad }, { data: ausencias }, { data: objetivos }] =
    await Promise.all([
      supabase.from('perfiles').select('id, nombre, email, rol, activo').order('rol').order('nombre'),
      supabase.from('centros').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('perfil_centros').select('perfil_id, centro_id'),
      supabase.from('disponibilidad').select('perfil_id, dia_semana, hora_inicio, hora_fin'),
      supabase.from('ausencias').select('id, perfil_id, desde, hasta, motivo').order('desde', { ascending: false }),
      supabase.from('objetivos').select('perfil_id, mes, meta_citas, meta_conversiones, meta_ingresos'),
    ]);

  const mesActual = new Date().toISOString().slice(0, 7);

  return (
    <AppShell
      seccion="admin"
      subseccion="/admin/equipo"
      titulo="Equipo"
      descripcion="Usuarios, centros, disponibilidad y objetivos"
    >
        <Avisos error={errorMsg} aviso={aviso} />
        <p className="mb-4 text-sm text-ink2">
          Usuarios, centros asignados, disponibilidad, ausencias y objetivos. Desactivar a alguien le
          impide entrar y sus leads pasan a avisar de que el propietario no está.
        </p>

        <section className="mb-6 rounded-xl bg-surface p-4 ring-1 ring-line">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink2">
            Nuevo usuario
          </h3>
          <form action={crearUsuario} className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-ink">
              Nombre *
              <input name="nombre" required className={inputAdmin} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-ink">
              Email *
              <input name="email" type="email" required className={inputAdmin} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-ink">
              Rol *
              <select name="rol" required defaultValue="admisiones" className={inputAdmin}>
                {ROLES.map(([valor, texto]) => (
                  <option key={valor} value={valor}>
                    {texto}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-ink">
              Contraseña inicial * (mínimo 8)
              <input name="password" type="text" required minLength={8} className={inputAdmin} />
            </label>
            <fieldset className="sm:col-span-2">
              <legend className="mb-1 text-sm font-medium text-ink">Centros</legend>
              <div className="flex flex-wrap gap-3">
                {(centros ?? []).map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 text-sm text-ink2">
                    <input type="checkbox" name="centros" value={c.id} /> {c.nombre}
                  </label>
                ))}
              </div>
            </fieldset>
            <button type="submit" className={`${botonAdmin} sm:col-span-2 sm:justify-self-start`}>
              Crear usuario
            </button>
          </form>
          <p className="mt-2 text-xs text-muted">
            La contraseña inicial se le comunica por un canal aparte; el usuario debería cambiarla al
            entrar.
          </p>
        </section>

        <div className="flex flex-col gap-4">
          {(perfiles ?? []).map((p) => {
            const susCentros = (asignaciones ?? [])
              .filter((a) => a.perfil_id === p.id)
              .map((a) => a.centro_id);
            const susFranjas = (disponibilidad ?? []).filter((d) => d.perfil_id === p.id);
            const susAusencias = (ausencias ?? []).filter((a) => a.perfil_id === p.id);
            const suObjetivo = (objetivos ?? []).find(
              (o) => o.perfil_id === p.id && o.mes === `${mesActual}-01`,
            );

            return (
              <article
                key={p.id}
                className={`rounded-xl bg-surface p-4 ring-1 ring-line ${p.activo ? '' : 'opacity-70'}`}
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{p.nombre}</h3>
                  <span className="text-sm text-ink2">{p.email}</span>
                  {!p.activo && (
                    <span className="rounded-full bg-surface2 px-2 py-0.5 text-[11px] font-medium text-ink2 ring-1 ring-line">
                      Inactivo
                    </span>
                  )}
                  {p.id === user.id && (
                    <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary ring-1 ring-primary/25">
                      Tú
                    </span>
                  )}
                </div>

                <form action={editarUsuario.bind(null, p.id)} className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-1 text-xs text-ink2">
                      Nombre
                      <input name="nombre" defaultValue={p.nombre} className={inputAdmin} />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-ink2">
                      Rol
                      <select name="rol" defaultValue={p.rol} className={inputAdmin}>
                        {ROLES.map(([valor, texto]) => (
                          <option key={valor} value={valor}>
                            {texto}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-1.5 pb-2 text-sm text-ink2">
                      <input type="checkbox" name="activo" defaultChecked={p.activo} /> Activo
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {(centros ?? []).map((c) => (
                      <label key={c.id} className="flex items-center gap-1.5 text-sm text-ink2">
                        <input
                          type="checkbox"
                          name="centros"
                          value={c.id}
                          defaultChecked={susCentros.includes(c.id)}
                        />{' '}
                        {c.nombre}
                      </label>
                    ))}
                  </div>
                  <button type="submit" className={`${botonAdminSecundario} self-start`}>
                    Guardar usuario
                  </button>
                </form>

                <form action={retirarSegundoFactor.bind(null, p.id)} className="mt-2">
                  <button
                    type="submit"
                    className="text-xs text-muted hover:text-danger hover:underline"
                    title="Úsalo si ha perdido o cambiado de móvil: tendrá que darlo de alta otra vez"
                  >
                    Retirar su verificación en dos pasos
                  </button>
                </form>

                <details className="mt-3 border-t border-line pt-3">
                  <summary className="cursor-pointer text-sm text-primary hover:underline">
                    Disponibilidad, ausencias y objetivos
                  </summary>

                  <div className="mt-3 flex flex-col gap-4">
                    <form action={guardarDisponibilidad.bind(null, p.id)}>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink2">
                        Disponibilidad semanal
                      </p>
                      <div className="flex flex-col gap-1.5">
                        {[1, 2, 3, 4, 5, 6, 0].map((dia) => {
                          const franja = susFranjas.find((f) => f.dia_semana === dia);
                          return (
                            <div key={dia} className="flex flex-wrap items-center gap-2 text-sm">
                              <span className="w-24 text-ink2">{DIAS[dia]}</span>
                              <input
                                type="time"
                                name={`inicio_${dia}`}
                                defaultValue={franja?.hora_inicio?.slice(0, 5) ?? ''}
                                className={inputAdmin}
                              />
                              <span className="text-muted">→</span>
                              <input
                                type="time"
                                name={`fin_${dia}`}
                                defaultValue={franja?.hora_fin?.slice(0, 5) ?? ''}
                                className={inputAdmin}
                              />
                            </div>
                          );
                        })}
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        Deja vacío un día para marcarlo como no disponible. Solo se guarda una franja
                        por día.
                      </p>
                      <button type="submit" className={`${botonAdminSecundario} mt-2`}>
                        Guardar disponibilidad
                      </button>
                    </form>

                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink2">
                        Ausencias
                      </p>
                      <ul className="mb-2 flex flex-col gap-1">
                        {susAusencias.map((a) => (
                          <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                            <span>
                              {fecha(`${a.desde}T12:00:00`, false)} → {fecha(`${a.hasta}T12:00:00`, false)}
                              {a.motivo && ` · ${a.motivo}`}
                            </span>
                            <form action={borrarAusencia.bind(null, a.id)}>
                              <button
                                type="submit"
                                className="text-xs text-muted hover:text-danger hover:underline"
                              >
                                Quitar
                              </button>
                            </form>
                          </li>
                        ))}
                        {susAusencias.length === 0 && (
                          <li className="text-sm text-muted">Sin ausencias registradas.</li>
                        )}
                      </ul>
                      <form action={crearAusencia.bind(null, p.id)} className="flex flex-wrap gap-2">
                        <input type="date" name="desde" className={inputAdmin} />
                        <input type="date" name="hasta" className={inputAdmin} />
                        <input name="motivo" placeholder="Motivo (opcional)" className={inputAdmin} />
                        <button type="submit" className={botonAdminSecundario}>
                          Añadir
                        </button>
                      </form>
                    </div>

                    {p.rol !== 'terapeuta' && (
                      <form action={guardarObjetivos.bind(null, p.id)}>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink2">
                          Objetivos mensuales
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <input type="month" name="mes" defaultValue={mesActual} className={inputAdmin} />
                          <input
                            type="number"
                            name="meta_citas"
                            min="0"
                            placeholder="Citas"
                            defaultValue={suObjetivo?.meta_citas ?? ''}
                            className={`${inputAdmin} w-28`}
                          />
                          <input
                            type="number"
                            name="meta_conversiones"
                            min="0"
                            placeholder="Conversiones"
                            defaultValue={suObjetivo?.meta_conversiones ?? ''}
                            className={`${inputAdmin} w-36`}
                          />
                          <input
                            type="number"
                            name="meta_ingresos"
                            min="0"
                            step="0.01"
                            placeholder="Ingresos €"
                            defaultValue={suObjetivo?.meta_ingresos ?? ''}
                            className={`${inputAdmin} w-36`}
                          />
                          <button type="submit" className={botonAdminSecundario}>
                            Guardar objetivos
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                </details>
              </article>
            );
          })}
        </div>
      </AppShell>
  );
}
