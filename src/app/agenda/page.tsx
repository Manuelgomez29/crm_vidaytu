import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { ZONA, desdeDatetimeLocal } from '@/lib/fechas';
import {
  ESTADO_CITA,
  MODALIDAD_CITA,
  TIPO_CITA,
  componerRecordatorio,
  nombreDePila,
  type CitaAgenda,
} from '@/lib/citas';
import { cambiarEstadoCita } from './actions';

const DIAS_CORTOS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

type Vista = 'mes' | 'semana' | 'rango';

/** Fecha (YYYY-MM-DD) tal como se ve en Madrid. */
function clave(fecha: Date): string {
  return fecha.toLocaleDateString('sv-SE', { timeZone: ZONA });
}

/** Instante ISO de las 00:00 de Madrid de ese día. */
function inicioDelDia(dia: string): string {
  return desdeDatetimeLocal(`${dia}T00:00`) ?? new Date(`${dia}T00:00:00Z`).toISOString();
}

function sumarDias(fecha: Date, dias: number): Date {
  const d = new Date(fecha);
  d.setDate(d.getDate() + dias);
  return d;
}

/** Lunes de la semana que contiene ese día (mediodía, para esquivar el cambio de hora). */
function lunesDe(dia: string): Date {
  const d = new Date(`${dia}T12:00:00`);
  const desplazamiento = (d.getDay() + 6) % 7;
  return sumarDias(d, -desplazamiento);
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ZONA,
  });
}

export default async function Agenda({
  searchParams,
}: {
  searchParams: Promise<{
    vista?: string;
    dia?: string;
    desde?: string;
    hasta?: string;
    profesional?: string;
    centro?: string;
    error?: string;
    aviso?: string;
  }>;
}) {
  const filtros = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol, nombre')
    .eq('id', user.id)
    .single();
  const esTerapeuta = perfil?.rol === 'terapeuta';

  const vista: Vista =
    filtros.vista === 'mes' || filtros.vista === 'rango' ? filtros.vista : 'semana';
  const hoy = clave(new Date());

  // ---- Rango de fechas según la vista -------------------------------------
  let desde: string;
  let hasta: string; // exclusivo
  let titulo: string;
  let anteriorHref = '';
  let siguienteHref = '';

  const parametrosComunes = new URLSearchParams();
  if (filtros.profesional) parametrosComunes.set('profesional', filtros.profesional);
  if (filtros.centro) parametrosComunes.set('centro', filtros.centro);
  const cola = parametrosComunes.toString() ? `&${parametrosComunes}` : '';

  if (vista === 'mes') {
    const referencia = new Date(`${filtros.dia ?? hoy}T12:00:00`);
    const primero = new Date(referencia.getFullYear(), referencia.getMonth(), 1, 12);
    const siguienteMes = new Date(referencia.getFullYear(), referencia.getMonth() + 1, 1, 12);
    const mesAnterior = new Date(referencia.getFullYear(), referencia.getMonth() - 1, 1, 12);
    desde = clave(primero);
    hasta = clave(siguienteMes);
    titulo = primero.toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: ZONA });
    anteriorHref = `/agenda?vista=mes&dia=${clave(mesAnterior)}${cola}`;
    siguienteHref = `/agenda?vista=mes&dia=${clave(siguienteMes)}${cola}`;
  } else if (vista === 'rango') {
    desde = filtros.desde || hoy;
    hasta = clave(sumarDias(new Date(`${filtros.hasta || desde}T12:00:00`), 1));
    titulo = `Del ${new Date(`${desde}T12:00:00`).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
    })} al ${new Date(`${filtros.hasta || desde}T12:00:00`).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })}`;
  } else {
    const lunes = lunesDe(filtros.dia ?? hoy);
    desde = clave(lunes);
    hasta = clave(sumarDias(lunes, 7));
    titulo = `Semana del ${lunes.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })}`;
    anteriorHref = `/agenda?vista=semana&dia=${clave(sumarDias(lunes, -7))}${cola}`;
    siguienteHref = `/agenda?vista=semana&dia=${clave(sumarDias(lunes, 7))}${cola}`;
  }

  const [{ data: citas, error }, { data: profesionales }, { data: centros }, { data: plantillaConfig }] =
    await Promise.all([
      supabase.rpc('agenda_citas', { desde: inicioDelDia(desde), hasta: inicioDelDia(hasta) }),
      esTerapeuta ? Promise.resolve({ data: [] }) : supabase.rpc('profesionales_agendables'),
      supabase.from('centros').select('id, nombre').eq('activo', true).order('nombre'),
      supabase
        .from('configuracion')
        .select('valor')
        .eq('clave', 'plantilla_recordatorio_cita')
        .maybeSingle(),
    ]);

  const plantilla =
    typeof plantillaConfig?.valor === 'string'
      ? plantillaConfig.valor
      : 'Hola {nombre}, te confirmamos tu cita el {dia} a las {hora} en {lugar}. Un saludo, {profesional}';

  const visibles = ((citas ?? []) as CitaAgenda[]).filter(
    (c) =>
      (!filtros.profesional || c.profesional_id === filtros.profesional) &&
      (!filtros.centro || c.centro_id === filtros.centro),
  );

  const porDia = new Map<string, CitaAgenda[]>();
  for (const cita of visibles) {
    const k = clave(new Date(cita.inicio));
    porDia.set(k, [...(porDia.get(k) ?? []), cita]);
  }

  // ---- Componentes de tarjeta ---------------------------------------------
  function Recordatorio({ cita }: { cita: CitaAgenda }) {
    const destinatario = cita.contacto_nombre ?? cita.lead_nombre;
    const telefono = cita.contacto_telefono ?? cita.lead_telefono;
    const texto = componerRecordatorio(plantilla, {
      nombre: nombreDePila(destinatario),
      dia: new Date(cita.inicio).toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: ZONA,
      }),
      hora: hora(cita.inicio),
      lugar: cita.centro_nombre,
      profesional: nombreDePila(perfil?.nombre ?? ''),
    });
    return (
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-primary hover:underline">
          Recordatorio
        </summary>
        <p className="mt-1 rounded-lg bg-ground p-2 text-xs text-ink ring-1 ring-line">
          {texto}
        </p>
        <p className="mt-1 text-[11px] text-muted">
          Para {destinatario} ({telefono}). Nunca menciona el motivo de consulta.
        </p>
        <a
          href={`https://wa.me/${telefono.replace('+', '')}?text=${encodeURIComponent(texto)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block text-xs text-primary hover:underline"
        >
          Abrir en WhatsApp →
        </a>
      </details>
    );
  }

  function Acciones({ cita }: { cita: CitaAgenda }) {
    if (cita.estado !== 'programada') return null;
    const destino = { agenda: `vista=${vista}&dia=${filtros.dia ?? desde}` };
    const botones: [string, string, string][] = [
      ['realizada', 'Realizada', 'border-ok/25 bg-ok-soft text-ok hover:bg-ok-soft'],
      ['no_show', 'No vino', 'border-warn/25 bg-warn-soft text-warn hover:bg-warn-soft'],
      ['cancelada', 'Cancelar', 'border-line2 bg-surface text-ink2 hover:bg-surface2'],
    ];
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {botones.map(([estado, texto, clases]) => (
          <form key={estado} action={cambiarEstadoCita.bind(null, cita.id, estado, destino)}>
            <button
              type="submit"
              className={`rounded-md border px-2 py-1 text-[11px] font-medium transition ${clases}`}
            >
              {texto}
            </button>
          </form>
        ))}
      </div>
    );
  }

  function TarjetaCita({ cita }: { cita: CitaAgenda }) {
    const estado = ESTADO_CITA[cita.estado] ?? {
      texto: cita.estado,
      clases: 'bg-surface2 text-ink2 ring-line',
    };
    return (
      <article className="rounded-lg bg-surface p-3 shadow-sm ring-1 ring-line">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold">
            {hora(cita.inicio)}–{hora(cita.fin)}
          </p>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${estado.clases}`}
          >
            {estado.texto}
          </span>
        </div>
        <p className="mt-1 font-medium">
          {esTerapeuta ? (
            cita.lead_nombre
          ) : (
            <Link href={`/leads/${cita.lead_id}`} className="hover:text-primary hover:underline">
              {cita.lead_nombre}
            </Link>
          )}
        </p>
        <p className="text-xs text-ink2">
          {cita.lead_telefono} · {TIPO_CITA[cita.tipo] ?? cita.tipo} ·{' '}
          {MODALIDAD_CITA[cita.modalidad_cita] ?? cita.modalidad_cita}
        </p>
        <p className="text-xs text-ink2">
          {cita.centro_nombre} · {cita.profesional_nombre}
        </p>
        {cita.notas && <p className="mt-1 text-xs text-ink2">{cita.notas}</p>}
        <Recordatorio cita={cita} />
        <Acciones cita={cita} />
      </article>
    );
  }

  // ---- Rejilla del mes -----------------------------------------------------
  // Rejilla del mes: empieza el lunes de la primera semana y cubre semanas
  // completas hasta pasar el último día del mes.
  const primerDiaMes = new Date(`${desde}T12:00:00`);
  const inicioRejilla = lunesDe(desde);
  const diasDelMes = Math.round(
    (new Date(`${hasta}T12:00:00`).getTime() - primerDiaMes.getTime()) / 86_400_000,
  );
  const desplazamientoInicial = Math.round(
    (primerDiaMes.getTime() - inicioRejilla.getTime()) / 86_400_000,
  );
  const semanas = Math.ceil((desplazamientoInicial + diasDelMes) / 7);
  const celdasMes = Array.from({ length: semanas * 7 }, (_, i) => sumarDias(inicioRejilla, i));

  const enlaceVista = (v: Vista) => {
    const p = new URLSearchParams(parametrosComunes);
    p.set('vista', v);
    if (v !== 'rango') p.set('dia', filtros.dia ?? desde);
    if (v === 'rango') {
      p.set('desde', filtros.desde || desde);
      p.set('hasta', filtros.hasta || desde);
    }
    return `/agenda?${p}`;
  };

  return (
    <AppShell
      seccion="agenda"
      titulo="Agenda"
      descripcion="Citas por mes, semana o rango de fechas"
    >
        <div className="mb-3 flex flex-wrap items-center justify-end gap-3">
          <nav className="flex items-center gap-1 rounded-lg bg-surface2 p-1 text-sm">
            {(['mes', 'semana', 'rango'] as Vista[]).map((v) => (
              <Link
                key={v}
                href={enlaceVista(v)}
                className={`rounded-md px-3 py-1.5 font-medium transition ${
                  vista === v ? 'bg-surface text-primary shadow-sm' : 'text-ink2 hover:bg-surface/60'
                }`}
              >
                {v === 'mes' ? 'Mes' : v === 'semana' ? 'Semana' : 'Fechas'}
              </Link>
            ))}
          </nav>
        </div>

        {filtros.error && (
          <p className="mb-3 rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger ring-1 ring-danger/25">
            {filtros.error}
          </p>
        )}
        {filtros.aviso && (
          <p className="mb-3 rounded-lg bg-warn-soft px-4 py-2 text-sm text-warn ring-1 ring-warn/25">
            {filtros.aviso}
          </p>
        )}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {vista !== 'rango' && (
              <>
                <Link
                  href={anteriorHref}
                  className="rounded-lg border border-line2 bg-surface px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface2"
                >
                  ←
                </Link>
                <Link
                  href={`/agenda?vista=${vista}${cola}`}
                  className="rounded-lg border border-line2 bg-surface px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface2"
                >
                  Hoy
                </Link>
                <Link
                  href={siguienteHref}
                  className="rounded-lg border border-line2 bg-surface px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface2"
                >
                  →
                </Link>
              </>
            )}
            <p className="text-sm text-ink2">
              <span className="font-medium capitalize text-ink">{titulo}</span> ·{' '}
              {visibles.length} cita{visibles.length === 1 ? '' : 's'}
            </p>
          </div>

          <form method="get" className="flex flex-wrap items-center gap-2 text-sm">
            <input type="hidden" name="vista" value={vista} />
            {vista !== 'rango' && <input type="hidden" name="dia" value={filtros.dia ?? desde} />}
            {vista === 'rango' && (
              <>
                <input
                  type="date"
                  name="desde"
                  defaultValue={filtros.desde || desde}
                  className="rounded-lg border border-line2 bg-surface px-2 py-1.5"
                />
                <span className="text-muted">→</span>
                <input
                  type="date"
                  name="hasta"
                  defaultValue={filtros.hasta || desde}
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
              {(centros ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            {!esTerapeuta && (
              <select
                name="profesional"
                defaultValue={filtros.profesional ?? ''}
                className="rounded-lg border border-line2 bg-surface px-2 py-1.5"
              >
                <option value="">Todos los profesionales</option>
                {(profesionales ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            )}
            <button
              type="submit"
              className="rounded-lg bg-primary px-3 py-1.5 font-medium text-white transition hover:bg-primary-hover"
            >
              Aplicar
            </button>
            {(filtros.centro || filtros.profesional) && (
              <Link href={`/agenda?vista=${vista}`} className="text-primary hover:underline">
                Limpiar
              </Link>
            )}
          </form>
        </div>

        {error ? (
          <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-danger/25">
            No se pudo cargar la agenda: {error.message}
          </p>
        ) : vista === 'mes' ? (
          <div>
            <div>
              <div className="mb-1 grid grid-cols-7 gap-1 sm:gap-2">
                {DIAS_CORTOS.map((d, i) => (
                  <p key={d} className="px-1 text-xs font-medium uppercase text-ink2">
                    <span className="lg:hidden">{d}</span>
                    <span className="hidden lg:inline">{DIAS[i]}</span>
                  </p>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {celdasMes.map((dia) => {
                  const k = clave(dia);
                  const delDia = porDia.get(k) ?? [];
                  const esDeEsteMes = dia.getMonth() === primerDiaMes.getMonth();
                  const esHoy = k === hoy;
                  return (
                    <div
                      key={k}
                      className={`flex min-h-16 flex-col rounded-xl p-1.5 ring-1 sm:min-h-28 sm:p-2 ${
                        esHoy
                          ? 'bg-primary-soft/60 ring-primary/25'
                          : esDeEsteMes
                            ? 'bg-surface ring-line'
                            : 'bg-ground ring-line'
                      }`}
                    >
                      <Link
                        href={`/agenda?vista=rango&desde=${k}&hasta=${k}${cola}`}
                        className={`text-xs font-semibold hover:text-primary hover:underline ${
                          esDeEsteMes ? 'text-ink' : 'text-muted'
                        }`}
                      >
                        {dia.getDate()}
                        {esHoy && <span className="ml-1 font-normal text-primary">hoy</span>}
                      </Link>
                      {/* En pantallas estrechas la celda no cabe: solo el número de citas. */}
                      {delDia.length > 0 && (
                        <Link
                          href={`/agenda?vista=rango&desde=${k}&hasta=${k}${cola}`}
                          className="mt-1 self-start rounded-full bg-primary px-1.5 text-[11px] font-medium text-white sm:hidden"
                        >
                          {delDia.length}
                        </Link>
                      )}
                      <div className="mt-1 hidden flex-col gap-1 sm:flex">
                        {delDia.slice(0, 3).map((cita) => {
                          const estado = ESTADO_CITA[cita.estado];
                          return (
                            <Link
                              key={cita.id}
                              href={`/agenda?vista=rango&desde=${k}&hasta=${k}${cola}`}
                              className={`truncate rounded px-1.5 py-0.5 text-[11px] ring-1 ${
                                estado?.clases ?? 'bg-surface2 text-ink2 ring-line'
                              }`}
                              title={`${hora(cita.inicio)} ${cita.lead_nombre} · ${cita.centro_nombre}`}
                            >
                              {hora(cita.inicio)} {cita.lead_nombre}
                            </Link>
                          );
                        })}
                        {delDia.length > 3 && (
                          <Link
                            href={`/agenda?vista=rango&desde=${k}&hasta=${k}${cola}`}
                            className="px-1.5 text-[11px] text-primary hover:underline"
                          >
                            +{delDia.length - 3} más
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : vista === 'semana' ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 7 }, (_, i) => sumarDias(new Date(`${desde}T12:00:00`), i)).map(
              (dia, i) => {
                const k = clave(dia);
                const delDia = porDia.get(k) ?? [];
                const esHoy = k === hoy;
                return (
                  <section
                    key={k}
                    className={`flex flex-col rounded-xl ring-1 ${
                      esHoy ? 'bg-primary-soft/50 ring-primary/25' : 'bg-surface2 ring-line'
                    }`}
                  >
                    <header className="flex items-baseline justify-between px-3 py-2.5">
                      <h3 className="text-sm font-semibold text-ink">
                        {DIAS[i]} {dia.getDate()}
                        {esHoy && <span className="ml-1 text-xs font-normal text-primary">hoy</span>}
                      </h3>
                      <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-ink2 ring-1 ring-line">
                        {delDia.length}
                      </span>
                    </header>
                    <div className="flex min-h-16 flex-col gap-2 px-2 pb-2">
                      {delDia.map((cita) => (
                        <TarjetaCita key={cita.id} cita={cita} />
                      ))}
                      {delDia.length === 0 && (
                        <p className="px-1 py-2 text-xs text-muted">Sin citas.</p>
                      )}
                    </div>
                  </section>
                );
              },
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {visibles.length === 0 && (
              <p className="rounded-xl bg-surface px-4 py-8 text-center text-sm text-ink2 ring-1 ring-line">
                No hay citas en estas fechas con los filtros elegidos.
              </p>
            )}
            {[...porDia.entries()]
              .sort(([a], [b]) => (a < b ? -1 : 1))
              .map(([k, delDia]) => (
                <section key={k}>
                  <h3 className="mb-2 text-sm font-semibold capitalize text-ink">
                    {new Date(`${k}T12:00:00`).toLocaleDateString('es-ES', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                    {k === hoy && <span className="ml-2 text-xs font-normal text-primary">hoy</span>}
                  </h3>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {delDia.map((cita) => (
                      <TarjetaCita key={cita.id} cita={cita} />
                    ))}
                  </div>
                </section>
              ))}
          </div>
        )}
      </AppShell>
  );
}
