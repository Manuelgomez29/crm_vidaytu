import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Cabecera } from '@/components/cabecera';
import { etiquetaEstado } from '@/lib/estados';
import {
  anadirContacto,
  asignarCentro,
  asignarmeDesdeFicha,
  asignarPropietario,
  cambiarEtapa,
  completarTarea,
  crearPresupuesto,
  crearTarea,
  derivarLead,
  marcarNoValido,
  marcarPerdido,
  reabrirLead,
  registrarActividad,
  registrarConversion,
  validarConversion,
} from './actions';

const TIPO_ACTIVIDAD: Record<string, string> = {
  llamada: '📞 Llamada',
  whatsapp: '💬 WhatsApp',
  email: '✉️ Email',
  nota: '📝 Nota',
  cambio_estado: '🔀 Cambio',
  reapertura: '♻️ Reapertura',
};

const TIPO_CONTACTO: Record<string, string> = {
  familiar: 'Familiar',
  afectado: 'Afectado',
  prescriptor: 'Prescriptor',
  otro: 'Otro',
};

function fecha(iso: string | null, conHora = true): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(conHora ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone: 'Europe/Madrid',
  });
}

const inputClase =
  'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200';
const botonClase =
  'rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-teal-700';
const botonSecundario =
  'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100';

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {titulo}
      </h3>
      {children}
    </section>
  );
}

export default async function FichaLead({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; aviso?: string }>;
}) {
  const { id } = await params;
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
    .single();
  const esDireccion = perfil?.rol === 'direccion';

  const { data: lead } = await supabase
    .from('leads')
    .select(
      `*,
       centro:centros (id, nombre, es_bandeja_grupo),
       canal:canales (nombre),
       adiccion:adicciones (nombre),
       modalidad_interes:modalidades!leads_modalidad_interes_id_fkey (nombre),
       propietario:perfiles!leads_propietario_id_fkey (id, nombre),
       motivo_perdida:motivos_perdida (nombre),
       etapa:pipeline_etapas!leads_etapa_id_fkey (id, nombre)`,
    )
    .eq('id', id)
    .maybeSingle();

  if (!lead) notFound();

  const [
    { data: contactosCaso },
    { data: actividades },
    { data: tareas },
    { data: presupuestos },
    { data: conversion },
    { data: etapas },
    { data: motivos },
    { data: centros },
    { data: modalidades },
    { data: derivaciones },
  ] = await Promise.all([
    supabase
      .from('lead_contactos')
      .select('id, tipo, relacion, es_principal, contacto:contactos (id, nombre, telefono, email)')
      .eq('lead_id', id)
      .order('es_principal', { ascending: false }),
    supabase
      .from('actividades')
      .select('id, tipo, contenido, created_at, usuario:perfiles (nombre)')
      .eq('lead_id', id)
      .order('created_at', { ascending: false }),
    supabase.from('tareas').select('*').eq('lead_id', id).order('vence_at'),
    supabase
      .from('presupuestos')
      .select('id, importe, descripcion, estado, created_at, modalidad:modalidades (nombre)')
      .eq('lead_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('conversiones')
      .select('id, fecha_inicio, importe_primer_pago, estado, modalidad:modalidades (nombre)')
      .eq('lead_id', id)
      .maybeSingle(),
    supabase
      .from('pipeline_etapas')
      .select('id, nombre, orden')
      .eq('pipeline_id', lead.pipeline_id)
      .order('orden'),
    supabase.from('motivos_perdida').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('centros').select('id, nombre, es_bandeja_grupo').eq('activo', true).order('nombre'),
    supabase.from('modalidades').select('id, nombre').eq('activa', true).order('nombre'),
    supabase
      .from('derivaciones')
      .select('id, motivo, created_at, origen:centros!derivaciones_centro_origen_id_fkey (nombre), destino:centros!derivaciones_centro_destino_id_fkey (nombre)')
      .eq('lead_id', id)
      .order('created_at', { ascending: false }),
  ]);

  const { data: comerciales } = esDireccion
    ? await supabase
        .from('perfiles')
        .select('id, nombre')
        .eq('activo', true)
        .in('rol', ['direccion', 'admisiones'])
        .order('nombre')
    : { data: null };

  const estado = etiquetaEstado(lead.estado);
  const cerrado = ['perdido', 'no_valido'].includes(lead.estado);
  const tareasPendientes = (tareas ?? []).filter((t) => t.completada_at === null);

  return (
    <div className="min-h-screen">
      <Cabecera email={user.email ?? ''} />

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Link href="/leads" className="text-sm text-teal-700 hover:underline">
          ← Volver al tablero
        </Link>

        {errorMsg && (
          <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 ring-1 ring-red-200">
            {errorMsg}
          </p>
        )}
        {aviso && (
          <p className="mt-3 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
            {aviso}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-semibold">{lead.nombre}</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${estado.clases}`}>
            {estado.texto}
          </span>
          <span className="text-sm text-slate-500">
            {lead.centro?.nombre}
            {lead.centro?.es_bandeja_grupo && ' (bandeja de grupo)'}
          </span>
          {lead.propietario ? (
            <span className="text-sm text-slate-500">Propietario: {lead.propietario.nombre}</span>
          ) : (
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
              Sin asignar
            </span>
          )}
          {lead.estado === 'perdido' && lead.motivo_perdida && (
            <span className="text-sm text-red-600">Motivo: {lead.motivo_perdida.nombre}</span>
          )}
        </div>

        {!cerrado && tareasPendientes.length === 0 && (
          <p className="mt-2 rounded-lg bg-orange-50 px-4 py-2 text-sm text-orange-700 ring-1 ring-orange-200">
            ⚠ Este caso no tiene próxima acción con fecha. Crea una tarea.
          </p>
        )}

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {/* Columna principal */}
          <div className="flex flex-col gap-4 lg:col-span-2">
            <Seccion titulo="Registrar actividad">
              <form action={registrarActividad.bind(null, lead.id)} className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <select name="tipo" className={inputClase} defaultValue="llamada">
                    <option value="llamada">Llamada</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">Email</option>
                    <option value="nota">Nota</option>
                  </select>
                  <input
                    name="contenido"
                    placeholder="¿Qué ha pasado?"
                    className={`${inputClase} min-w-0 flex-1`}
                  />
                  <button type="submit" className={botonClase}>
                    Guardar
                  </button>
                </div>
              </form>

              <ul className="mt-4 flex flex-col gap-2">
                {(actividades ?? []).map((a) => (
                  <li key={a.id} className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
                    <p className="text-sm">
                      <span className="font-medium">{TIPO_ACTIVIDAD[a.tipo] ?? a.tipo}</span>{' '}
                      {a.contenido}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {a.usuario?.nombre ?? 'Sistema'} · {fecha(a.created_at)}
                    </p>
                  </li>
                ))}
                {(actividades ?? []).length === 0 && (
                  <li className="text-sm text-slate-400">Sin actividad todavía.</li>
                )}
              </ul>
            </Seccion>

            <Seccion titulo="Tareas (próxima acción)">
              <form action={crearTarea.bind(null, lead.id)} className="flex flex-wrap gap-2">
                <input
                  name="titulo"
                  placeholder="Próxima acción…"
                  className={`${inputClase} min-w-0 flex-1`}
                />
                <input name="vence" type="datetime-local" className={inputClase} />
                <button type="submit" className={botonClase}>
                  Crear
                </button>
              </form>
              <ul className="mt-3 flex flex-col gap-2">
                {(tareas ?? []).map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-100"
                  >
                    <div>
                      <p
                        className={`text-sm ${t.completada_at ? 'text-slate-400 line-through' : ''}`}
                      >
                        {t.titulo}
                      </p>
                      <p
                        className={`text-xs ${
                          !t.completada_at && new Date(t.vence_at) < new Date()
                            ? 'font-medium text-red-600'
                            : 'text-slate-400'
                        }`}
                      >
                        Vence: {fecha(t.vence_at)}
                      </p>
                    </div>
                    {!t.completada_at && (
                      <form action={completarTarea.bind(null, lead.id, t.id)}>
                        <button type="submit" className={botonSecundario}>
                          Completar
                        </button>
                      </form>
                    )}
                  </li>
                ))}
                {(tareas ?? []).length === 0 && (
                  <li className="text-sm text-slate-400">Sin tareas.</li>
                )}
              </ul>
            </Seccion>

            <Seccion titulo="Presupuestos (historial)">
              <form action={crearPresupuesto.bind(null, lead.id)} className="flex flex-wrap gap-2">
                <input
                  name="importe"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Importe €"
                  className={`${inputClase} w-32`}
                />
                <select name="modalidad" className={inputClase} defaultValue="">
                  <option value="">Modalidad…</option>
                  {(modalidades ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
                <input
                  name="descripcion"
                  placeholder="Descripción"
                  className={`${inputClase} min-w-0 flex-1`}
                />
                <button type="submit" className={botonClase}>
                  Añadir
                </button>
              </form>
              <ul className="mt-3 flex flex-col gap-2">
                {(presupuestos ?? []).map((p) => (
                  <li key={p.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-100">
                    <span className="font-medium">
                      {Number(p.importe).toLocaleString('es-ES', {
                        style: 'currency',
                        currency: 'EUR',
                      })}
                    </span>
                    {p.modalidad && ` · ${p.modalidad.nombre}`}
                    {p.descripcion && ` · ${p.descripcion}`}
                    <span className="text-xs text-slate-400"> · {p.estado} · {fecha(p.created_at, false)}</span>
                  </li>
                ))}
                {(presupuestos ?? []).length === 0 && (
                  <li className="text-sm text-slate-400">Sin presupuestos.</li>
                )}
              </ul>
            </Seccion>

            <Seccion titulo="Conversión">
              {conversion ? (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
                      conversion.estado === 'validada'
                        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                        : 'bg-amber-50 text-amber-700 ring-amber-200'
                    }`}
                  >
                    {conversion.estado === 'validada' ? 'Validada' : 'Pendiente de validación'}
                  </span>
                  <span>Inicio: {fecha(conversion.fecha_inicio, false)}</span>
                  {conversion.modalidad && <span>{conversion.modalidad.nombre}</span>}
                  {conversion.importe_primer_pago !== null && (
                    <span>
                      Primer pago:{' '}
                      {Number(conversion.importe_primer_pago).toLocaleString('es-ES', {
                        style: 'currency',
                        currency: 'EUR',
                      })}
                    </span>
                  )}
                  {esDireccion && conversion.estado !== 'validada' && (
                    <form action={validarConversion.bind(null, lead.id, conversion.id)}>
                      <button type="submit" className={botonClase}>
                        Validar pago
                      </button>
                    </form>
                  )}
                </div>
              ) : (
                <form
                  action={registrarConversion.bind(null, lead.id)}
                  className="flex flex-wrap gap-2"
                >
                  <input name="fecha_inicio" type="date" className={inputClase} />
                  <select name="modalidad" className={inputClase} defaultValue="">
                    <option value="">Modalidad…</option>
                    {(modalidades ?? []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre}
                      </option>
                    ))}
                  </select>
                  <input
                    name="importe"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Primer pago €"
                    className={`${inputClase} w-36`}
                  />
                  <button type="submit" className={botonClase}>
                    Registrar conversión
                  </button>
                  <p className="w-full text-xs text-slate-400">
                    Quedará pendiente hasta que dirección valide el pago; las métricas solo cuentan
                    conversiones validadas.
                  </p>
                </form>
              )}
            </Seccion>
          </div>

          {/* Columna lateral */}
          <div className="flex flex-col gap-4">
            <Seccion titulo="Datos del caso">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-slate-500">Teléfono</dt>
                <dd>{lead.telefono}</dd>
                <dt className="text-slate-500">Quién contacta</dt>
                <dd>
                  {TIPO_CONTACTO[lead.quien_contacta ?? ''] ?? '—'}
                  {lead.relacion_con_afectado && ` (${lead.relacion_con_afectado})`}
                </dd>
                {lead.nombre_afectado && (
                  <>
                    <dt className="text-slate-500">Afectado</dt>
                    <dd>{lead.nombre_afectado}</dd>
                  </>
                )}
                <dt className="text-slate-500">Adicción</dt>
                <dd>{lead.adiccion?.nombre ?? '—'}</dd>
                <dt className="text-slate-500">Modalidad</dt>
                <dd>{lead.modalidad_interes?.nombre ?? '—'}</dd>
                <dt className="text-slate-500">Urgencia</dt>
                <dd>{lead.urgencia ?? '—'}</dd>
                <dt className="text-slate-500">Zona</dt>
                <dd>{lead.zona ?? '—'}</dd>
                <dt className="text-slate-500">Canal</dt>
                <dd>
                  {lead.canal?.nombre}
                  {lead.subcanal && ` · ${lead.subcanal}`}
                </dd>
                {lead.prescriptor_nombre && (
                  <>
                    <dt className="text-slate-500">Prescriptor</dt>
                    <dd>{lead.prescriptor_nombre}</dd>
                  </>
                )}
                <dt className="text-slate-500">Creado</dt>
                <dd>{fecha(lead.created_at)}</dd>
                <dt className="text-slate-500">1ª respuesta</dt>
                <dd>{fecha(lead.primera_respuesta_at)}</dd>
              </dl>
            </Seccion>

            <Seccion titulo="Contactos del caso">
              <ul className="flex flex-col gap-2">
                {(contactosCaso ?? []).map((lc) => (
                  <li key={lc.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-100">
                    <p className="font-medium">
                      {lc.contacto?.nombre}
                      {lc.es_principal && (
                        <span className="ml-2 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700 ring-1 ring-teal-200">
                          Principal
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      {lc.contacto?.telefono} · {TIPO_CONTACTO[lc.tipo]}
                      {lc.relacion && ` (${lc.relacion})`}
                    </p>
                  </li>
                ))}
              </ul>
              <form
                action={anadirContacto.bind(null, lead.id)}
                className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3"
              >
                <div className="flex gap-2">
                  <input name="nombre" placeholder="Nombre" className={`${inputClase} min-w-0 flex-1`} />
                  <input name="telefono" placeholder="+34…" className={`${inputClase} w-36`} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select name="tipo" className={inputClase} defaultValue="familiar">
                    {Object.entries(TIPO_CONTACTO).map(([valor, texto]) => (
                      <option key={valor} value={valor}>
                        {texto}
                      </option>
                    ))}
                  </select>
                  <input name="relacion" placeholder="Relación (madre…)" className={`${inputClase} min-w-0 flex-1`} />
                  <label className="flex items-center gap-1.5 text-sm text-slate-600">
                    <input type="checkbox" name="principal" /> Principal
                  </label>
                  <button type="submit" className={botonSecundario}>
                    Añadir
                  </button>
                </div>
              </form>
            </Seccion>

            <Seccion titulo="Acciones">
              <div className="flex flex-col gap-3">
                <form action={cambiarEtapa.bind(null, lead.id)} className="flex gap-2">
                  <select name="etapa" defaultValue={lead.etapa_id} className={`${inputClase} min-w-0 flex-1`}>
                    {(etapas ?? []).map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.orden}. {e.nombre}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className={botonSecundario}>
                    Mover
                  </button>
                </form>

                {!lead.propietario_id && perfil?.rol === 'admisiones' && (
                  <form action={asignarmeDesdeFicha.bind(null, lead.id)}>
                    <button type="submit" className={`${botonClase} w-full`}>
                      Asignarme este lead
                    </button>
                  </form>
                )}

                {esDireccion && (
                  <form action={asignarPropietario.bind(null, lead.id)} className="flex gap-2">
                    <select
                      name="propietario"
                      defaultValue={lead.propietario_id ?? ''}
                      className={`${inputClase} min-w-0 flex-1`}
                    >
                      <option value="">Sin propietario</option>
                      {(comerciales ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className={botonSecundario}>
                      Asignar
                    </button>
                  </form>
                )}

                {lead.centro?.es_bandeja_grupo && (
                  <form action={asignarCentro.bind(null, lead.id)} className="flex gap-2">
                    <select name="centro" defaultValue="" className={`${inputClase} min-w-0 flex-1`}>
                      <option value="">Asignar a centro…</option>
                      {(centros ?? [])
                        .filter((c) => !c.es_bandeja_grupo)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                          </option>
                        ))}
                    </select>
                    <button type="submit" className={botonSecundario}>
                      Asignar
                    </button>
                  </form>
                )}

                {!lead.centro?.es_bandeja_grupo && (
                  <form action={derivarLead.bind(null, lead.id)} className="flex flex-col gap-2 border-t border-slate-100 pt-3">
                    <p className="text-xs text-slate-500">
                      Derivar (mismo caso, atribución al centro de origen):
                    </p>
                    <div className="flex gap-2">
                      <select name="centro_destino" defaultValue="" className={`${inputClase} min-w-0 flex-1`}>
                        <option value="">Centro de destino…</option>
                        {(centros ?? [])
                          .filter((c) => !c.es_bandeja_grupo && c.id !== lead.centro_id)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nombre}
                            </option>
                          ))}
                      </select>
                      <button type="submit" className={botonSecundario}>
                        Derivar
                      </button>
                    </div>
                    <input name="motivo" placeholder="Motivo (opcional)" className={inputClase} />
                  </form>
                )}

                {(derivaciones ?? []).length > 0 && (
                  <ul className="text-xs text-slate-500">
                    {(derivaciones ?? []).map((d) => (
                      <li key={d.id}>
                        {d.origen?.nombre} → {d.destino?.nombre} · {fecha(d.created_at, false)}
                        {d.motivo && ` · ${d.motivo}`}
                      </li>
                    ))}
                  </ul>
                )}

                {cerrado ? (
                  <form action={reabrirLead.bind(null, lead.id)} className="border-t border-slate-100 pt-3">
                    <button type="submit" className={`${botonSecundario} w-full`}>
                      ♻️ Reabrir caso
                    </button>
                  </form>
                ) : (
                  <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
                    <form action={marcarPerdido.bind(null, lead.id)} className="flex gap-2">
                      <select name="motivo" defaultValue="" className={`${inputClase} min-w-0 flex-1`}>
                        <option value="">Motivo de pérdida…</option>
                        {(motivos ?? []).map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nombre}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-100"
                      >
                        Perdido
                      </button>
                    </form>
                    <form action={marcarNoValido.bind(null, lead.id)}>
                      <button type="submit" className={`${botonSecundario} w-full`}>
                        Marcar como no válido
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </Seccion>
          </div>
        </div>
      </main>
    </div>
  );
}
