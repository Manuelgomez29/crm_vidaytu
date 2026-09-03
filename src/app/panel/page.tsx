import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { ETIQUETA_ESTADO, type EstadoLead } from '@/lib/estados';
import { desdeDatetimeLocal } from '@/lib/fechas';
import {
  euros,
  mesDelPeriodo,
  minutosEntre,
  periodoAnterior,
  periodoDesdeFiltros,
  porcentaje,
  variacion,
} from '@/lib/metricas';

/** Etapas del embudo, en orden. Cada lead cuenta en la más avanzada que alcanzó. */
const EMBUDO: EstadoLead[] = [
  'nuevo',
  'contactado',
  'cita_agendada',
  'cita_realizada',
  'en_valoracion',
  'convertido',
];

type LeadMetrica = {
  id: string;
  estado: string;
  centro_id: string;
  canal_id: string;
  propietario_id: string | null;
  created_at: string;
  primera_respuesta_at: string | null;
};

function Tarjeta({
  titulo,
  valor,
  pie,
  acento,
  delta,
  contra,
}: {
  titulo: string;
  valor: string;
  pie?: string;
  acento?: 'verde' | 'ambar' | 'rojo';
  /** Variación porcentual frente al periodo anterior. */
  delta?: number | null;
  contra?: string;
}) {
  const color =
    acento === 'verde'
      ? 'text-ok'
      : acento === 'ambar'
        ? 'text-warn'
        : acento === 'rojo'
          ? 'text-danger'
          : 'text-ink';
  return (
    <div className="rounded-xl bg-surface p-4 ring-1 ring-line">
      <p className="text-xs font-medium uppercase tracking-wide text-ink2">{titulo}</p>
      <p className={`num mt-1 text-2xl font-bold tracking-tight ${color}`}>{valor}</p>
      {delta !== undefined && delta !== null && (
        <p
          className={`mt-0.5 text-[11.5px] font-semibold ${
            delta > 0 ? 'text-ok' : delta < 0 ? 'text-danger' : 'text-ink2'
          }`}
        >
          {delta > 0 ? '▲' : delta < 0 ? '▼' : '='} {Math.abs(delta)}% vs {contra}
        </p>
      )}
      {pie && <p className="mt-0.5 text-xs text-ink2">{pie}</p>}
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-surface p-4 ring-1 ring-line">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink2">{titulo}</h3>
      {children}
    </section>
  );
}

function Barra({ valor, maximo, clases }: { valor: number; maximo: number; clases: string }) {
  const ancho = maximo > 0 ? Math.max(2, Math.round((valor / maximo) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface2">
      <div className={`h-full rounded-full ${clases}`} style={{ width: `${ancho}%` }} />
    </div>
  );
}

export default async function Panel({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string; centro?: string }>;
}) {
  const filtros = await searchParams;
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

  const periodo = periodoDesdeFiltros(filtros);
  const desdeIso = desdeDatetimeLocal(`${periodo.desde}T00:00`)!;
  const hastaIso = desdeDatetimeLocal(`${periodo.hasta}T00:00`)!;

  let consultaLeads = supabase
    .from('leads')
    .select('id, estado, centro_id, canal_id, propietario_id, created_at, primera_respuesta_at')
    .gte('created_at', desdeIso)
    .lt('created_at', hastaIso);
  if (filtros.centro) consultaLeads = consultaLeads.eq('centro_id', filtros.centro);

  let consultaConversiones = supabase
    .from('conversiones')
    .select('id, estado, importe_primer_pago, centro_id, created_at, lead:leads (propietario_id)')
    .gte('created_at', desdeIso)
    .lt('created_at', hastaIso);
  if (filtros.centro) consultaConversiones = consultaConversiones.eq('centro_id', filtros.centro);

  let consultaCitas = supabase
    .from('citas')
    .select('id, estado, centro_id, profesional_id')
    .gte('inicio', desdeIso)
    .lt('inicio', hastaIso);
  if (filtros.centro) consultaCitas = consultaCitas.eq('centro_id', filtros.centro);

  const [
    { data: leadsData, error },
    { data: conversiones },
    { data: citas },
    { data: centros },
    { data: canales },
    { data: comerciales },
    { data: objetivos },
    { data: configSla },
    { data: leadsAbiertosSinTarea },
    { data: misCentros },
  ] = await Promise.all([
    consultaLeads,
    consultaConversiones,
    consultaCitas,
    supabase.from('centros').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('canales').select('id, nombre').eq('activo', true),
    supabase
      .from('perfiles')
      .select('id, nombre, rol')
      .eq('activo', true)
      .in('rol', ['direccion', 'admisiones'])
      .order('nombre'),
    supabase.from('objetivos').select('perfil_id, meta_citas, meta_conversiones, meta_ingresos, mes'),
    supabase
      .from('configuracion')
      .select('valor')
      .eq('clave', 'sla_primera_respuesta_minutos')
      .maybeSingle(),
    // Disciplina: leads abiertos sin ninguna tarea pendiente, en todo momento.
    supabase
      .from('leads')
      .select('id, estado, tareas (completada_at)')
      .not('estado', 'in', '(perdido,no_valido,convertido,derivado)')
      .is('tareas.completada_at', null),
    supabase.from('perfil_centros').select('centro_id').eq('perfil_id', user.id),
  ]);

  // Admisiones solo elige entre sus centros; dirección, entre todos.
  const centrosElegibles = esDireccion
    ? (centros ?? [])
    : (centros ?? []).filter((c) => (misCentros ?? []).some((m) => m.centro_id === c.id));

  // Comparativa con el periodo anterior de la misma duración.
  const anterior = periodoAnterior(periodo);
  const anteriorDesde = desdeDatetimeLocal(`${anterior.desde}T00:00`)!;
  const anteriorHasta = desdeDatetimeLocal(`${anterior.hasta}T00:00`)!;

  let leadsAnteriores = supabase
    .from('leads')
    .select('id, estado', { count: 'exact' })
    .gte('created_at', anteriorDesde)
    .lt('created_at', anteriorHasta);
  if (filtros.centro) leadsAnteriores = leadsAnteriores.eq('centro_id', filtros.centro);

  let conversionesAnteriores = supabase
    .from('conversiones')
    .select('id, estado, importe_primer_pago')
    .eq('estado', 'validada')
    .gte('created_at', anteriorDesde)
    .lt('created_at', anteriorHasta);
  if (filtros.centro) conversionesAnteriores = conversionesAnteriores.eq('centro_id', filtros.centro);

  const [{ data: leadsPrevios }, { data: conversionesPrevias }] = await Promise.all([
    leadsAnteriores,
    conversionesAnteriores,
  ]);

  const leads = (leadsData ?? []) as LeadMetrica[];
  const slaMinutos = Number(configSla?.valor) || 60;
  const mesActual = mesDelPeriodo(periodo);

  // --- Embudo --------------------------------------------------------------
  const porEstado = new Map<string, number>();
  for (const l of leads) porEstado.set(l.estado, (porEstado.get(l.estado) ?? 0) + 1);

  const validadas = (conversiones ?? []).filter((c) => c.estado === 'validada');
  const pendientes = (conversiones ?? []).filter((c) => c.estado !== 'validada');
  const ingresos = validadas.reduce((suma, c) => suma + Number(c.importe_primer_pago ?? 0), 0);

  const totalPrevio = (leadsPrevios ?? []).length;
  const validadasPrevias = (conversionesPrevias ?? []).length;
  const ingresosPrevios = (conversionesPrevias ?? []).reduce(
    (suma, c) => suma + Number(c.importe_primer_pago ?? 0),
    0,
  );
  const tasaActual = leads.length > 0 ? (validadas.length / leads.length) * 100 : 0;
  const tasaPrevia = totalPrevio > 0 ? (validadasPrevias / totalPrevio) * 100 : 0;

  // --- SLA de primera respuesta -------------------------------------------
  const respondidos = leads.filter((l) => l.primera_respuesta_at !== null);
  const dentroDeSla = respondidos.filter(
    (l) => minutosEntre(l.created_at, l.primera_respuesta_at!) <= slaMinutos,
  );
  const sinResponder = leads.length - respondidos.length;

  const sinAsignar = leads.filter((l) => l.propietario_id === null).length;
  const sinProximaAccion = (leadsAbiertosSinTarea ?? []).filter(
    (l) => (l.tareas as { completada_at: string | null }[]).length === 0,
  ).length;

  // --- Agrupaciones --------------------------------------------------------
  const nombreCentro = new Map((centros ?? []).map((c) => [c.id, c.nombre]));
  const nombreCanal = new Map((canales ?? []).map((c) => [c.id, c.nombre]));

  const porCanal = new Map<string, { total: number; convertidos: number }>();
  for (const l of leads) {
    const fila = porCanal.get(l.canal_id) ?? { total: 0, convertidos: 0 };
    fila.total++;
    if (l.estado === 'convertido') fila.convertidos++;
    porCanal.set(l.canal_id, fila);
  }

  const porCentro = new Map<string, { total: number; convertidos: number }>();
  for (const l of leads) {
    const fila = porCentro.get(l.centro_id) ?? { total: 0, convertidos: 0 };
    fila.total++;
    if (l.estado === 'convertido') fila.convertidos++;
    porCentro.set(l.centro_id, fila);
  }

  // --- Por comercial, contra objetivos del mes -----------------------------
  const citasPorComercial = new Map<string, number>();
  for (const c of citas ?? []) {
    citasPorComercial.set(c.profesional_id, (citasPorComercial.get(c.profesional_id) ?? 0) + 1);
  }
  const conversionesPorComercial = new Map<string, { numero: number; importe: number }>();
  for (const c of validadas) {
    const propietario = (c.lead as { propietario_id: string | null } | null)?.propietario_id;
    if (!propietario) continue;
    const fila = conversionesPorComercial.get(propietario) ?? { numero: 0, importe: 0 };
    fila.numero++;
    fila.importe += Number(c.importe_primer_pago ?? 0);
    conversionesPorComercial.set(propietario, fila);
  }
  const leadsPorComercial = new Map<string, number>();
  for (const l of leads) {
    if (!l.propietario_id) continue;
    leadsPorComercial.set(l.propietario_id, (leadsPorComercial.get(l.propietario_id) ?? 0) + 1);
  }
  const objetivoDe = new Map(
    (objetivos ?? []).filter((o) => o.mes === mesActual).map((o) => [o.perfil_id, o]),
  );

  const maxEmbudo = Math.max(1, ...EMBUDO.map((e) => porEstado.get(e) ?? 0));

  const enlacePeriodo = (p: string) => {
    const q = new URLSearchParams();
    q.set('periodo', p);
    if (filtros.centro) q.set('centro', filtros.centro);
    return `/panel?${q}`;
  };

  return (
    <AppShell
      seccion="panel"
      titulo="Dashboard de dirección"
      descripcion={`${periodo.titulo} · solo cuentan las conversiones validadas`}
    >
        <div className="mb-3 flex flex-wrap items-center justify-end gap-3">
          <nav className="flex flex-wrap items-center gap-1 rounded-lg bg-surface2 p-1 text-sm">
            {[
              ['mes', 'Este mes'],
              ['mes_anterior', 'Mes anterior'],
              ['trimestre', '3 meses'],
              ['anio', 'Año'],
              ['rango', 'Fechas'],
            ].map(([clave, texto]) => (
              <Link
                key={clave}
                href={enlacePeriodo(clave)}
                className={`rounded-md px-3 py-1.5 font-medium transition ${
                  (filtros.periodo ?? 'mes') === clave
                    ? 'bg-surface text-primary shadow-sm'
                    : 'text-ink2 hover:bg-surface/60'
                }`}
              >
                {texto}
              </Link>
            ))}
          </nav>
        </div>

        <form method="get" className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <input type="hidden" name="periodo" value={filtros.periodo ?? 'mes'} />
          {filtros.periodo === 'rango' && (
            <>
              <input
                type="date"
                name="desde"
                defaultValue={filtros.desde || periodo.desde}
                className="rounded-lg border border-line2 bg-surface px-2 py-1.5"
              />
              <span className="text-muted">→</span>
              <input
                type="date"
                name="hasta"
                defaultValue={filtros.hasta || periodo.desde}
                className="rounded-lg border border-line2 bg-surface px-2 py-1.5"
              />
            </>
          )}
          <select
            name="centro"
            defaultValue={filtros.centro ?? ''}
            className="rounded-lg border border-line2 bg-surface px-2 py-1.5"
          >
            <option value="">Todos los centros</option>
            {centrosElegibles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-primary px-3 py-1.5 font-medium text-white transition hover:bg-primary-hover"
          >
            Aplicar
          </button>
          <span className="text-ink2">
            <span className="font-medium capitalize text-ink">{periodo.titulo}</span>
          </span>
        </form>

        {error ? (
          <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-danger/25">
            No se pudieron cargar las métricas: {error.message}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Tarjeta
                titulo="Leads nuevos"
                valor={String(leads.length)}
                delta={variacion(leads.length, totalPrevio)}
                contra={anterior.titulo}
              />
              <Tarjeta
                titulo="Sin atender ahora"
                valor={String(sinResponder)}
                pie={`SLA ${slaMinutos} min`}
                acento={sinResponder > 0 ? 'rojo' : 'verde'}
              />
              <Tarjeta
                titulo="Conversión"
                valor={porcentaje(validadas.length, leads.length)}
                delta={Math.round(tasaActual - tasaPrevia)}
                contra={anterior.titulo}
                pie="Solo conversiones validadas"
              />
              <Tarjeta
                titulo="Ingresos validados"
                valor={euros(ingresos)}
                delta={variacion(ingresos, ingresosPrevios)}
                contra={anterior.titulo}
                acento="verde"
              />
              <Tarjeta
                titulo="Pend. validación"
                valor={String(pendientes.length)}
                pie={euros(
                  pendientes.reduce((suma, c) => suma + Number(c.importe_primer_pago ?? 0), 0),
                )}
                acento={pendientes.length > 0 ? 'ambar' : undefined}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Tarjeta
                titulo="Cumplimiento del SLA"
                valor={porcentaje(dentroDeSla.length, respondidos.length)}
                pie={`De los ${respondidos.length} leads ya respondidos`}
              />
              <Tarjeta
                titulo="Leads sin asignar"
                valor={String(sinAsignar)}
                pie="Del periodo. Todo lead debe acabar con propietario"
                acento={sinAsignar > 0 ? 'ambar' : 'verde'}
              />
              <Tarjeta
                titulo="Abiertos sin próxima acción"
                valor={String(sinProximaAccion)}
                pie="En todo momento, no solo del periodo"
                acento={sinProximaAccion > 0 ? 'rojo' : 'verde'}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Seccion titulo="Embudo del periodo">
                <ul className="flex flex-col gap-2.5">
                  {EMBUDO.map((estado) => {
                    const numero = porEstado.get(estado) ?? 0;
                    return (
                      <li key={estado}>
                        <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                          <span>{ETIQUETA_ESTADO[estado].texto}</span>
                          <span className="text-ink2">
                            {numero} · {porcentaje(numero, leads.length)}
                          </span>
                        </div>
                        <Barra valor={numero} maximo={maxEmbudo} clases="bg-primary-soft0" />
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-xs text-muted">
                  Cada lead cuenta en su estado actual. Perdidos: {porEstado.get('perdido') ?? 0} ·
                  No válidos: {porEstado.get('no_valido') ?? 0} · Derivados:{' '}
                  {porEstado.get('derivado') ?? 0}
                </p>
              </Seccion>

              <Seccion titulo="Origen de los leads">
                <ul className="flex flex-col gap-2.5">
                  {[...porCanal.entries()]
                    .sort((a, b) => b[1].total - a[1].total)
                    .map(([canalId, fila]) => (
                      <li key={canalId}>
                        <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                          <span>{nombreCanal.get(canalId) ?? '—'}</span>
                          <span className="text-ink2">
                            {fila.total} · {fila.convertidos} convertido
                            {fila.convertidos === 1 ? '' : 's'}
                          </span>
                        </div>
                        <Barra
                          valor={fila.total}
                          maximo={Math.max(1, ...[...porCanal.values()].map((f) => f.total))}
                          clases="bg-graf-ec"
                        />
                      </li>
                    ))}
                  {porCanal.size === 0 && (
                    <li className="text-sm text-muted">Sin leads en el periodo.</li>
                  )}
                </ul>
              </Seccion>
            </div>

            <Seccion titulo="Por centro">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead className="border-b border-line text-xs uppercase tracking-wide text-ink2">
                    <tr>
                      <th className="py-2 font-medium">Centro</th>
                      <th className="py-2 font-medium">Leads</th>
                      <th className="py-2 font-medium">Convertidos</th>
                      <th className="py-2 font-medium">Tasa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {[...porCentro.entries()]
                      .sort((a, b) => b[1].total - a[1].total)
                      .map(([centroId, fila]) => (
                        <tr key={centroId}>
                          <td className="py-2">{nombreCentro.get(centroId) ?? '—'}</td>
                          <td className="py-2">{fila.total}</td>
                          <td className="py-2">{fila.convertidos}</td>
                          <td className="py-2 text-ink2">
                            {porcentaje(fila.convertidos, fila.total)}
                          </td>
                        </tr>
                      ))}
                    {porCentro.size === 0 && (
                      <tr>
                        <td colSpan={4} className="py-3 text-muted">
                          Sin leads en el periodo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Seccion>

            <Seccion titulo="Equipo comercial y objetivos del mes">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-line text-xs uppercase tracking-wide text-ink2">
                    <tr>
                      <th className="py-2 font-medium">Comercial</th>
                      <th className="py-2 font-medium">Leads</th>
                      <th className="py-2 font-medium">Citas</th>
                      <th className="py-2 font-medium">Conversiones</th>
                      <th className="py-2 font-medium">Ingresos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {(comerciales ?? []).map((c) => {
                      const objetivo = objetivoDe.get(c.id);
                      const citasReales = citasPorComercial.get(c.id) ?? 0;
                      const conv = conversionesPorComercial.get(c.id) ?? { numero: 0, importe: 0 };
                      return (
                        <tr key={c.id}>
                          <td className="py-2">{c.nombre}</td>
                          <td className="py-2">{leadsPorComercial.get(c.id) ?? 0}</td>
                          <td className="py-2">
                            {citasReales}
                            {objetivo?.meta_citas ? (
                              <span className="text-muted"> / {objetivo.meta_citas}</span>
                            ) : null}
                          </td>
                          <td className="py-2">
                            {conv.numero}
                            {objetivo?.meta_conversiones ? (
                              <span className="text-muted"> / {objetivo.meta_conversiones}</span>
                            ) : null}
                          </td>
                          <td className="py-2">
                            {euros(conv.importe)}
                            {objetivo?.meta_ingresos ? (
                              <span className="text-muted">
                                {' '}
                                / {euros(Number(objetivo.meta_ingresos))}
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {objetivoDe.size === 0 && (
                <p className="mt-3 text-xs text-muted">
                  No hay objetivos definidos para este mes. Se fijarán desde el panel de
                  administración; mientras tanto, la tabla muestra solo los datos reales.
                </p>
              )}
            </Seccion>

            {!esDireccion && (
              <p className="text-xs text-muted">
                Ves únicamente los datos de los centros que tienes asignados.
              </p>
            )}
          </div>
        )}
      </AppShell>
  );
}
