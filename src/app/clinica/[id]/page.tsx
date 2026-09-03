import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { fecha } from '@/lib/fechas';
import { exigirAccesoClinico } from '../guard';
import {
  anadirFamiliar,
  asignarTerapeuta,
  borrarDocumento,
  borrarFamiliar,
  cambiarEstadoSesion,
  completarSeguimiento,
  crearSesion,
  guardarNotasSesion,
  guardarPaciente,
  registrarCuestionario,
  subirDocumento,
} from '../actions';

const CHIP_SESION: Record<string, { texto: string; clase: string }> = {
  programada: { texto: 'Programada', clase: 'chip-primary' },
  realizada: { texto: 'Realizada', clase: 'chip-ok' },
  no_show: { texto: 'No se presentó', clase: 'chip-danger' },
  cancelada: { texto: 'Cancelada', clase: 'chip-mut' },
};

const TIPO_SESION: Record<string, string> = {
  individual: 'Individual',
  grupal: 'Grupal',
  familiar: 'Familiar',
};

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="panel p-4">
      <h2 className="mb-3 text-sm font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

export default async function FichaPaciente({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string; error?: string }>;
}) {
  const { id } = await params;
  const { aviso, error } = await searchParams;
  const { supabase, esDireccion } = await exigirAccesoClinico();

  const { data: paciente } = await supabase
    .from('pacientes')
    .select('*, centro:centros (nombre, slug), terapeuta:perfiles!pacientes_terapeuta_id_fkey (nombre)')
    .eq('id', id)
    .maybeSingle();

  // Sin fila = o no existe, o no es suyo. La pantalla no distingue entre las
  // dos cosas a propósito: saber que existe un paciente que no puedes ver ya
  // es información.
  if (!paciente) notFound();

  const [
    { data: sesiones },
    { data: familiares },
    { data: documentos },
    { data: fases },
    { data: modalidades },
    { data: adicciones },
    { data: terapeutas },
    { data: cuestionarios },
    { data: respuestas },
    { data: seguimientos },
  ] = await Promise.all([
    supabase.from('sesiones').select('*').eq('paciente_id', id).order('inicio', { ascending: false }),
    supabase.from('familiares').select('*').eq('paciente_id', id).order('nombre'),
    supabase.from('documentos_clinicos').select('*').eq('paciente_id', id).order('created_at', { ascending: false }),
    supabase.from('fases_metodo').select('id, nombre, orden').eq('activa', true).order('orden'),
    supabase.from('modalidades').select('id, nombre').eq('activa', true).order('nombre'),
    supabase.from('adicciones').select('id, nombre').eq('activa', true).order('nombre'),
    esDireccion
      ? supabase
          .from('perfiles')
          .select('id, nombre')
          .eq('activo', true)
          .or('rol.eq.terapeuta,acceso_clinico.eq.true')
          .order('nombre')
      : Promise.resolve({ data: null }),
    supabase.from('cuestionarios').select('id, nombre, preguntas:cuestionario_preguntas (id, texto, orden, valor_min, valor_max)').eq('activo', true).order('nombre'),
    supabase
      .from('cuestionario_respuestas')
      .select('id, fecha, puntuacion_total, notas, cuestionario:cuestionarios (nombre)')
      .eq('paciente_id', id)
      .order('fecha', { ascending: false }),
    supabase
      .from('seguimientos_post_alta')
      .select('*')
      .eq('paciente_id', id)
      .order('hito_meses'),
  ]);

  const noShowsSeguidos = (sesiones ?? [])
    .filter((s) => s.estado === 'realizada' || s.estado === 'no_show')
    .slice(0, 2);
  const enRiesgo = noShowsSeguidos.length === 2 && noShowsSeguidos.every((s) => s.estado === 'no_show');

  return (
    <AppShell
      seccion="clinica"
      subseccion="/clinica"
      titulo={paciente.nombre}
      descripcion={`${paciente.centro?.nombre ?? ''} · referente: ${paciente.terapeuta?.nombre ?? 'sin asignar'}`}
      acciones={
        <Link href="/clinica" className="btn btn-ghost">
          Todos los pacientes
        </Link>
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
      {enRiesgo && (
        <p className="mb-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-danger/25">
          Dos faltas seguidas a sesión. Es una señal para valorar, no un diagnóstico.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4">
          {/* ---------------- 1. Datos y proceso ---------------- */}
          <Seccion titulo="Datos y proceso">
            <form action={guardarPaciente.bind(null, id)} className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="etiqueta-campo">Nombre</span>
                <input name="nombre" defaultValue={paciente.nombre} className="campo w-full" required />
              </label>
              <label className="block">
                <span className="etiqueta-campo">Teléfono</span>
                <input
                  name="telefono"
                  defaultValue={paciente.telefono ?? ''}
                  placeholder="+34…"
                  className="campo w-full"
                />
              </label>
              <label className="block">
                <span className="etiqueta-campo">Email</span>
                <input name="email" type="email" defaultValue={paciente.email ?? ''} className="campo w-full" />
              </label>
              <label className="block">
                <span className="etiqueta-campo">Fecha de nacimiento</span>
                <input
                  name="fecha_nacimiento"
                  type="date"
                  defaultValue={paciente.fecha_nacimiento ?? ''}
                  className="campo w-full"
                />
              </label>
              <label className="block">
                <span className="etiqueta-campo">Fase del método</span>
                <select name="fase" defaultValue={paciente.fase_id ?? ''} className="campo w-full">
                  <option value="">Sin fase</option>
                  {(fases ?? []).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="etiqueta-campo">Estado</span>
                <select name="estado" defaultValue={paciente.estado} className="campo w-full">
                  <option value="activo">En tratamiento</option>
                  <option value="alta">Alta</option>
                  <option value="abandono">Abandono</option>
                  <option value="derivado_externo">Derivado fuera</option>
                </select>
              </label>
              <label className="block">
                <span className="etiqueta-campo">Modalidad</span>
                <select name="modalidad" defaultValue={paciente.modalidad_id ?? ''} className="campo w-full">
                  <option value="">—</option>
                  {(modalidades ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="etiqueta-campo">Adicción</span>
                <select name="adiccion" defaultValue={paciente.adiccion_id ?? ''} className="campo w-full">
                  <option value="">—</option>
                  {(adicciones ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="etiqueta-campo">Fecha de ingreso</span>
                <input
                  name="fecha_ingreso"
                  type="date"
                  defaultValue={paciente.fecha_ingreso}
                  className="campo w-full"
                />
              </label>
              <label className="block">
                <span className="etiqueta-campo">Fecha de alta</span>
                <input
                  name="fecha_alta"
                  type="date"
                  defaultValue={paciente.fecha_alta ?? ''}
                  className="campo w-full"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="etiqueta-campo">Notas</span>
                <textarea name="notas" rows={3} defaultValue={paciente.notas ?? ''} className="campo w-full" />
              </label>
              <div className="sm:col-span-2">
                <button type="submit" className="btn btn-primary">
                  Guardar ficha
                </button>
              </div>
            </form>
          </Seccion>

          {/* ---------------- 2. Sesiones y evolución ---------------- */}
          <Seccion titulo="Sesiones y evolución">
            <form action={crearSesion.bind(null, id)} className="mb-4 flex flex-wrap items-end gap-2">
              <input name="inicio" type="datetime-local" className="campo" required />
              <select name="duracion" defaultValue="60" className="campo">
                <option value="30">30 min</option>
                <option value="45">45 min</option>
                <option value="60">1 h</option>
                <option value="90">1 h 30</option>
              </select>
              <select name="tipo" defaultValue="individual" className="campo">
                <option value="individual">Individual</option>
                <option value="grupal">Grupal</option>
                <option value="familiar">Familiar</option>
              </select>
              <select name="estado" defaultValue="programada" className="campo">
                <option value="programada">Programada</option>
                <option value="realizada">Ya realizada</option>
                <option value="no_show">No se presentó</option>
              </select>
              <button type="submit" className="btn btn-primary">
                Registrar
              </button>
            </form>

            {(sesiones ?? []).length === 0 ? (
              <p className="text-sm text-muted">Todavía no hay sesiones.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {(sesiones ?? []).map((s) => {
                  const chip = CHIP_SESION[s.estado] ?? { texto: s.estado, clase: 'chip-mut' };
                  return (
                    <li key={s.id} className="rounded-lg bg-ground px-3 py-2.5 ring-1 ring-line">
                      <div className="flex flex-wrap items-center gap-2">
                        <b className="text-[13px]">{fecha(s.inicio)}</b>
                        <span className="chip chip-mut">{TIPO_SESION[s.tipo] ?? s.tipo}</span>
                        <span className={`chip ${chip.clase}`}>{chip.texto}</span>
                        {s.estado === 'programada' && (
                          <span className="ml-auto flex gap-2">
                            <form action={cambiarEstadoSesion.bind(null, id, s.id, 'realizada')}>
                              <button type="submit" className="text-xs font-medium text-primary hover:underline">
                                Realizada
                              </button>
                            </form>
                            <form action={cambiarEstadoSesion.bind(null, id, s.id, 'no_show')}>
                              <button type="submit" className="text-xs text-muted hover:text-danger hover:underline">
                                No vino
                              </button>
                            </form>
                          </span>
                        )}
                      </div>
                      <form
                        action={guardarNotasSesion.bind(null, id, s.id)}
                        className="mt-2 flex items-start gap-2"
                      >
                        <textarea
                          name="notas"
                          rows={2}
                          defaultValue={s.notas_clinicas ?? ''}
                          placeholder="Notas clínicas de la sesión…"
                          className="campo min-w-0 flex-1 text-[12.5px]"
                        />
                        <button type="submit" className="btn btn-ghost btn-mini">
                          Guardar
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </Seccion>

          {/* ---------------- 3. Familia ---------------- */}
          <Seccion titulo="Familia y contactos">
            <form action={anadirFamiliar.bind(null, id)} className="mb-4 flex flex-wrap items-center gap-2">
              <input name="nombre" placeholder="Nombre" className="campo min-w-36 flex-1" required />
              <input name="relacion" placeholder="Relación" className="campo min-w-28" />
              <input name="telefono" placeholder="+34…" className="campo min-w-32" />
              <label className="flex items-center gap-1.5 text-xs text-ink2">
                <input type="checkbox" name="emergencia" /> Emergencia
              </label>
              <button type="submit" className="btn btn-primary">
                Añadir
              </button>
            </form>

            {(familiares ?? []).length === 0 ? (
              <p className="text-sm text-muted">Sin familiares registrados.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {(familiares ?? []).map((f) => (
                  <li
                    key={f.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg bg-ground px-3 py-2 ring-1 ring-line"
                  >
                    <b className="text-[13px]">{f.nombre}</b>
                    {f.relacion && <span className="text-xs text-ink2">{f.relacion}</span>}
                    {f.telefono && (
                      <a href={`tel:${f.telefono}`} className="text-xs text-primary hover:underline">
                        {f.telefono}
                      </a>
                    )}
                    {f.es_contacto_emergencia && <span className="chip chip-warn">Emergencia</span>}
                    <form action={borrarFamiliar.bind(null, id, f.id)} className="ml-auto">
                      <button type="submit" className="text-xs text-muted hover:text-danger hover:underline">
                        Quitar
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Seccion>

          {/* ---------------- 4. Documentos ---------------- */}
          <Seccion titulo="Documentos">
            <form action={subirDocumento.bind(null, id)} className="mb-4 flex flex-wrap items-center gap-2">
              <input type="file" name="archivo" className="campo min-w-48 flex-1 text-xs" required />
              <select name="tipo" defaultValue="otro" className="campo">
                <option value="consentimiento">Consentimiento</option>
                <option value="informe">Informe</option>
                <option value="derivacion">Derivación</option>
                <option value="otro">Otro</option>
              </select>
              <button type="submit" className="btn btn-primary">
                Subir
              </button>
            </form>

            {(documentos ?? []).length === 0 ? (
              <p className="text-sm text-muted">Sin documentos.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {(documentos ?? []).map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg bg-ground px-3 py-2 ring-1 ring-line"
                  >
                    <a
                      href={`/api/documentos-clinicos/${d.id}`}
                      className="text-[13px] font-medium text-primary hover:underline"
                    >
                      {d.nombre}
                    </a>
                    <span className="chip chip-mut">{d.tipo}</span>
                    <span className="text-xs text-muted">{fecha(d.created_at, false)}</span>
                    <form action={borrarDocumento.bind(null, id, d.id)} className="ml-auto">
                      <button type="submit" className="text-xs text-muted hover:text-danger hover:underline">
                        Borrar
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted">
              Los archivos viven en almacenamiento privado en la UE y solo los abre quien puede ver
              esta ficha. Cada descarga usa un enlace que caduca.
            </p>
          </Seccion>
        </div>

        {/* ---------------- Columna lateral ---------------- */}
        <div className="flex flex-col gap-4">
          {esDireccion && (
            <Seccion titulo="Terapeuta referente">
              <form action={asignarTerapeuta.bind(null, id)} className="flex flex-col gap-2">
                <select name="terapeuta" defaultValue={paciente.terapeuta_id ?? ''} className="campo w-full">
                  <option value="">Sin asignar</option>
                  {(terapeutas ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn btn-primary">
                  Asignar
                </button>
              </form>
              <p className="mt-2 text-xs text-muted">
                Cambiar el referente traslada el acceso completo: quien deja de serlo deja de ver la
                ficha.
              </p>
            </Seccion>
          )}

          {(cuestionarios ?? []).length > 0 && (
            <Seccion titulo="Cuestionarios">
              <form action={registrarCuestionario.bind(null, id)} className="flex flex-col gap-2">
                {(cuestionarios ?? []).map((c) => (
                  <details key={c.id} className="rounded-lg bg-ground p-2 ring-1 ring-line">
                    <summary className="cursor-pointer text-[13px] font-medium">{c.nombre}</summary>
                    <input type="hidden" name="cuestionario" value={c.id} />
                    <div className="mt-2 flex flex-col gap-2">
                      {(c.preguntas ?? [])
                        .sort((a, b) => a.orden - b.orden)
                        .map((p) => (
                          <label key={p.id} className="block text-xs">
                            <span className="block text-ink2">{p.texto}</span>
                            <input
                              type="number"
                              name={`p_${p.id}`}
                              min={p.valor_min}
                              max={p.valor_max}
                              className="campo mt-1 w-full"
                            />
                          </label>
                        ))}
                      <button type="submit" className="btn btn-primary btn-mini">
                        Registrar
                      </button>
                    </div>
                  </details>
                ))}
              </form>

              {(respuestas ?? []).length > 0 && (
                <ul className="mt-3 flex flex-col gap-1 text-xs text-ink2">
                  {(respuestas ?? []).map((r) => (
                    <li key={r.id} className="flex justify-between">
                      <span>
                        {r.cuestionario?.nombre} · {fecha(r.fecha, false)}
                      </span>
                      <b className="tabular-nums">{r.puntuacion_total}</b>
                    </li>
                  ))}
                </ul>
              )}
            </Seccion>
          )}

          {(seguimientos ?? []).length > 0 && (
            <Seccion titulo="Seguimiento post-alta">
              <ul className="flex flex-col gap-2">
                {(seguimientos ?? []).map((s) => (
                  <li key={s.id} className="rounded-lg bg-ground px-3 py-2 ring-1 ring-line">
                    <div className="flex items-center justify-between gap-2">
                      <b className="text-[13px]">{s.hito_meses} meses</b>
                      <span className="text-xs text-muted">{fecha(s.fecha_prevista, false)}</span>
                    </div>
                    {s.completado_at ? (
                      <p className="mt-1 text-xs text-ok">✓ {s.resultado ?? 'Hecho'}</p>
                    ) : (
                      <form
                        action={completarSeguimiento.bind(null, id, s.id)}
                        className="mt-1.5 flex gap-1.5"
                      >
                        <input
                          name="resultado"
                          placeholder="Cómo ha ido…"
                          className="campo min-w-0 flex-1 text-xs"
                        />
                        <button type="submit" className="btn btn-ghost btn-mini">
                          Cerrar
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </Seccion>
          )}
        </div>
      </div>
    </AppShell>
  );
}
