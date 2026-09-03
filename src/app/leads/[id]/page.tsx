import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { ESTADOS_CERRADOS, etiquetaEstado, type EstadoLead } from '@/lib/estados';
import { fecha } from '@/lib/fechas';
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
  subirAdjunto,
  borrarAdjunto,
  validarConversion,
} from './actions';
import { crearCita, cambiarEstadoCita } from '@/app/agenda/actions';
import { ESTADO_CITA, MODALIDAD_CITA, TIPO_CITA } from '@/lib/citas';

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

const inputClase =
  'rounded-lg border border-line2 bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const botonClase =
  'rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-hover';
const botonSecundario =
  'rounded-lg border border-line2 bg-surface px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface2';

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-surface p-4 ring-1 ring-line">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink2">
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
  searchParams: Promise<{ error?: string; aviso?: string; sugerir?: string }>;
}) {
  const { id } = await params;
  const { error: errorMsg, aviso, sugerir } = await searchParams;
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
  if (perfil?.rol === 'terapeuta') redirect('/agenda');
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
    { data: citas },
    { data: profesionales },
    { data: adjuntos },
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
    supabase
      .from('citas')
      .select('id, tipo, modalidad_cita, inicio, fin, estado, notas, profesional:perfiles (nombre), contacto:contactos (nombre)')
      .eq('lead_id', id)
      .order('inicio', { ascending: false }),
    supabase.rpc('profesionales_agendables'),
    supabase
      .from('caso_adjuntos')
      .select('id, nombre_archivo, mime_type, tamano_bytes, created_at, subido:perfiles (nombre)')
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
  const cerrado = ESTADOS_CERRADOS.includes(lead.estado as EstadoLead);
  const tareasPendientes = (tareas ?? []).filter((t) => t.completada_at === null);

  return (
    <AppShell
      seccion="leads"
      titulo="Ficha del caso"
    >
        <Link href="/leads" className="text-sm text-primary hover:underline">
          ← Volver al tablero
        </Link>

        {errorMsg && (
          <p className="mt-3 rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger ring-1 ring-danger/25">
            {errorMsg}
          </p>
        )}
        {aviso && (
          <p className="mt-3 rounded-lg bg-warn-soft px-4 py-2 text-sm text-warn ring-1 ring-warn/25">
            {aviso}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-semibold">{lead.nombre}</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${estado.clases}`}>
            {estado.texto}
          </span>
          <span className="text-sm text-ink2">
            {lead.centro?.nombre}
            {lead.centro?.es_bandeja_grupo && ' (bandeja de grupo)'}
          </span>
          {lead.propietario ? (
            <span className="text-sm text-ink2">Propietario: {lead.propietario.nombre}</span>
          ) : (
            <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-medium text-warn ring-1 ring-warn/25">
              Sin asignar
            </span>
          )}
          {lead.estado === 'perdido' && lead.motivo_perdida && (
            <span className="text-sm text-danger">Motivo: {lead.motivo_perdida.nombre}</span>
          )}
        </div>

        {sugerir && etapas?.some((e) => e.id === sugerir) && (
          <form
            action={cambiarEtapa.bind(null, lead.id)}
            className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-coral/30 bg-coral-soft px-4 py-3"
          >
            <p className="text-sm font-semibold text-coral-ink">
              Cita realizada. ¿Muevo el caso a «{etapas.find((e) => e.id === sugerir)?.nombre}»?
            </p>
            <input type="hidden" name="etapa" value={sugerir} />
            <div className="flex items-center gap-2">
              <button type="submit" className={botonClase}>
                Sí, moverlo
              </button>
              <Link href={`/leads/${lead.id}`} className={botonSecundario}>
                Ahora no
              </Link>
            </div>
          </form>
        )}

        {!cerrado && tareasPendientes.length === 0 && (
          <p className="mt-2 rounded-lg bg-warn-soft px-4 py-2 text-sm text-warn ring-1 ring-warn/25">
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
                  <li key={a.id} className="rounded-lg bg-ground px-3 py-2 ring-1 ring-line">
                    <p className="text-sm">
                      <span className="font-medium">{TIPO_ACTIVIDAD[a.tipo] ?? a.tipo}</span>{' '}
                      {a.contenido}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {a.usuario?.nombre ?? 'Sistema'} · {fecha(a.created_at)}
                    </p>
                  </li>
                ))}
                {(actividades ?? []).length === 0 && (
                  <li className="text-sm text-muted">Sin actividad todavía.</li>
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
                    className="flex items-center justify-between gap-2 rounded-lg bg-ground px-3 py-2 ring-1 ring-line"
                  >
                    <div>
                      <p
                        className={`text-sm ${t.completada_at ? 'text-muted line-through' : ''}`}
                      >
                        {t.titulo}
                      </p>
                      <p
                        className={`text-xs ${
                          !t.completada_at && new Date(t.vence_at) < new Date()
                            ? 'font-medium text-danger'
                            : 'text-muted'
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
                  <li className="text-sm text-muted">Sin tareas.</li>
                )}
              </ul>
            </Seccion>

            <Seccion titulo="Citas">
              <form action={crearCita.bind(null, lead.id)} className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <input name="inicio" type="datetime-local" required className={inputClase} />
                  <select name="duracion" defaultValue="60" className={inputClase}>
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">1 hora</option>
                    <option value="90">1 h 30</option>
                  </select>
                  <select name="profesional" defaultValue="" className={inputClase} required>
                    <option value="">Profesional…</option>
                    {(profesionales ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select name="tipo" defaultValue="primera_cita" className={inputClase}>
                    {Object.entries(TIPO_CITA).map(([valor, texto]) => (
                      <option key={valor} value={valor}>
                        {texto}
                      </option>
                    ))}
                  </select>
                  <select name="modalidad" defaultValue="presencial" className={inputClase}>
                    {Object.entries(MODALIDAD_CITA).map(([valor, texto]) => (
                      <option key={valor} value={valor}>
                        {texto}
                      </option>
                    ))}
                  </select>
                  <select name="contacto" defaultValue="" className={inputClase}>
                    <option value="">¿Con quién se agenda?</option>
                    {(contactosCaso ?? []).map(
                      (lc) =>
                        lc.contacto && (
                          <option key={lc.contacto.id} value={lc.contacto.id}>
                            {lc.contacto.nombre}
                          </option>
                        ),
                    )}
                  </select>
                  <input name="notas" placeholder="Notas" className={`${inputClase} min-w-0 flex-1`} />
                  <button type="submit" className={botonClase}>
                    Agendar
                  </button>
                </div>
                <p className="text-xs text-muted">
                  El recordatorio irá al contacto con quien se agende, y nunca menciona el motivo de
                  consulta.
                </p>
              </form>

              <ul className="mt-3 flex flex-col gap-2">
                {(citas ?? []).map((c) => {
                  const estadoCita = ESTADO_CITA[c.estado] ?? {
                    texto: c.estado,
                    clases: 'bg-surface2 text-ink2 ring-line',
                  };
                  return (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ground px-3 py-2 ring-1 ring-line"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {fecha(c.inicio)} · {TIPO_CITA[c.tipo] ?? c.tipo}
                        </p>
                        <p className="text-xs text-ink2">
                          {MODALIDAD_CITA[c.modalidad_cita] ?? c.modalidad_cita} ·{' '}
                          {c.profesional?.nombre ?? '—'}
                          {c.contacto?.nombre && ` · con ${c.contacto.nombre}`}
                        </p>
                        {c.notas && <p className="text-xs text-ink2">{c.notas}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${estadoCita.clases}`}
                        >
                          {estadoCita.texto}
                        </span>
                        {c.estado === 'programada' && (
                          <form action={cambiarEstadoCita.bind(null, c.id, 'realizada', { lead: lead.id })}>
                            <button type="submit" className={botonSecundario}>
                              Realizada
                            </button>
                          </form>
                        )}
                      </div>
                    </li>
                  );
                })}
                {(citas ?? []).length === 0 && (
                  <li className="text-sm text-muted">Sin citas todavía.</li>
                )}
              </ul>
            </Seccion>

            <Seccion titulo="Adjuntos del caso">
              <form action={subirAdjunto.bind(null, lead.id)} className="flex flex-wrap gap-2">
                <input
                  type="file"
                  name="archivo"
                  accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                  required
                  className="min-w-0 flex-1 text-sm text-ink2 file:mr-3 file:rounded-lg file:border-0 file:bg-surface2 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
                />
                <button type="submit" className={botonClase}>
                  Subir
                </button>
              </form>
              <p className="mt-1 text-xs text-muted">
                Capturas de WhatsApp, justificantes de pago o informes. Imágenes y PDF, hasta 10 MB.
                Se guardan cifrados y solo los ve quien pueda ver este caso.
              </p>

              <ul className="mt-3 flex flex-col gap-2">
                {(adjuntos ?? []).map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface2 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <a
                        href={`/api/adjuntos/${a.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {a.nombre_archivo}
                      </a>
                      <p className="text-xs text-muted">
                        {Math.round((a.tamano_bytes ?? 0) / 1024)} KB · {a.subido?.nombre ?? 'Sistema'}{' '}
                        · {fecha(a.created_at, false)}
                      </p>
                    </div>
                    <form action={borrarAdjunto.bind(null, lead.id, a.id)}>
                      <button
                        type="submit"
                        className="text-xs text-muted hover:text-danger hover:underline"
                      >
                        Borrar
                      </button>
                    </form>
                  </li>
                ))}
                {(adjuntos ?? []).length === 0 && (
                  <li className="text-sm text-muted">Sin adjuntos.</li>
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
                  <li key={p.id} className="rounded-lg bg-ground px-3 py-2 text-sm ring-1 ring-line">
                    <span className="font-medium">
                      {Number(p.importe).toLocaleString('es-ES', {
                        style: 'currency',
                        currency: 'EUR',
                      })}
                    </span>
                    {p.modalidad && ` · ${p.modalidad.nombre}`}
                    {p.descripcion && ` · ${p.descripcion}`}
                    <span className="text-xs text-muted"> · {p.estado} · {fecha(p.created_at, false)}</span>
                  </li>
                ))}
                {(presupuestos ?? []).length === 0 && (
                  <li className="text-sm text-muted">Sin presupuestos.</li>
                )}
              </ul>
            </Seccion>

            <Seccion titulo="Conversión">
              {conversion ? (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
                      conversion.estado === 'validada'
                        ? 'bg-ok-soft text-ok ring-ok/25'
                        : 'bg-warn-soft text-warn ring-warn/25'
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
                  <p className="w-full text-xs text-muted">
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
                <dt className="text-ink2">Teléfono</dt>
                <dd>{lead.telefono}</dd>
                <dt className="text-ink2">Quién contacta</dt>
                <dd>
                  {TIPO_CONTACTO[lead.quien_contacta ?? ''] ?? '—'}
                  {lead.relacion_con_afectado && ` (${lead.relacion_con_afectado})`}
                </dd>
                {lead.nombre_afectado && (
                  <>
                    <dt className="text-ink2">Afectado</dt>
                    <dd>{lead.nombre_afectado}</dd>
                  </>
                )}
                <dt className="text-ink2">Adicción</dt>
                <dd>{lead.adiccion?.nombre ?? '—'}</dd>
                <dt className="text-ink2">Modalidad</dt>
                <dd>{lead.modalidad_interes?.nombre ?? '—'}</dd>
                <dt className="text-ink2">Urgencia</dt>
                <dd>{lead.urgencia ?? '—'}</dd>
                <dt className="text-ink2">Zona</dt>
                <dd>{lead.zona ?? '—'}</dd>
                <dt className="text-ink2">Canal</dt>
                <dd>
                  {lead.canal?.nombre}
                  {lead.subcanal && ` · ${lead.subcanal}`}
                </dd>
                {lead.prescriptor_nombre && (
                  <>
                    <dt className="text-ink2">Prescriptor</dt>
                    <dd>{lead.prescriptor_nombre}</dd>
                  </>
                )}
                <dt className="text-ink2">Creado</dt>
                <dd>{fecha(lead.created_at)}</dd>
                <dt className="text-ink2">1ª respuesta</dt>
                <dd>{fecha(lead.primera_respuesta_at)}</dd>
              </dl>
            </Seccion>

            <Seccion titulo="Contactos del caso">
              <ul className="flex flex-col gap-2">
                {(contactosCaso ?? []).map((lc) => (
                  <li key={lc.id} className="rounded-lg bg-ground px-3 py-2 text-sm ring-1 ring-line">
                    <p className="font-medium">
                      {lc.contacto ? (
                        <Link
                          href={`/contactos/${lc.contacto.id}`}
                          className="hover:text-primary hover:underline"
                        >
                          {lc.contacto.nombre}
                        </Link>
                      ) : (
                        '—'
                      )}
                      {lc.es_principal && (
                        <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary ring-1 ring-primary/25">
                          Principal
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-ink2">
                      {lc.contacto?.telefono} · {TIPO_CONTACTO[lc.tipo]}
                      {lc.relacion && ` (${lc.relacion})`}
                    </p>
                  </li>
                ))}
              </ul>
              <form
                action={anadirContacto.bind(null, lead.id)}
                className="mt-3 flex flex-col gap-2 border-t border-line pt-3"
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
                  <label className="flex items-center gap-1.5 text-sm text-ink2">
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
                  <form action={derivarLead.bind(null, lead.id)} className="flex flex-col gap-2 border-t border-line pt-3">
                    <p className="text-xs text-ink2">
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
                  <ul className="text-xs text-ink2">
                    {(derivaciones ?? []).map((d) => (
                      <li key={d.id}>
                        {d.origen?.nombre} → {d.destino?.nombre} · {fecha(d.created_at, false)}
                        {d.motivo && ` · ${d.motivo}`}
                      </li>
                    ))}
                  </ul>
                )}

                {cerrado ? (
                  <form action={reabrirLead.bind(null, lead.id)} className="border-t border-line pt-3">
                    <button type="submit" className={`${botonSecundario} w-full`}>
                      ♻️ Reabrir caso
                    </button>
                  </form>
                ) : (
                  <div className="flex flex-col gap-2 border-t border-line pt-3">
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
                        className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-1.5 text-sm font-medium text-danger transition hover:bg-danger-soft"
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
      </AppShell>
  );
}
