import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Cabecera } from '@/components/cabecera';
import { ZONA } from '@/lib/fechas';
import {
  ESTADO_CITA,
  MODALIDAD_CITA,
  TIPO_CITA,
  componerRecordatorio,
  nombreDePila,
  type CitaAgenda,
} from '@/lib/citas';
import { cambiarEstadoCita } from './actions';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/** Lunes de la semana que contiene la fecha dada, a las 00:00 de Madrid. */
function lunesDe(referencia: Date): Date {
  const enMadrid = new Date(referencia.toLocaleString('en-US', { timeZone: ZONA }));
  const dia = (enMadrid.getDay() + 6) % 7; // lunes = 0
  enMadrid.setDate(enMadrid.getDate() - dia);
  enMadrid.setHours(0, 0, 0, 0);
  return enMadrid;
}

function claveSemana(fecha: Date): string {
  return fecha.toLocaleDateString('sv-SE', { timeZone: ZONA });
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
  searchParams: Promise<{ semana?: string; profesional?: string; error?: string; aviso?: string }>;
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

  const referencia = filtros.semana ? new Date(`${filtros.semana}T12:00:00`) : new Date();
  const lunes = lunesDe(referencia);
  const siguiente = new Date(lunes);
  siguiente.setDate(siguiente.getDate() + 7);
  const anterior = new Date(lunes);
  anterior.setDate(anterior.getDate() - 7);

  const [{ data: citas, error }, { data: profesionales }, { data: plantillaConfig }] =
    await Promise.all([
      supabase.rpc('agenda_citas', {
        desde: lunes.toISOString(),
        hasta: siguiente.toISOString(),
      }),
      esTerapeuta
        ? Promise.resolve({ data: [] })
        : supabase.rpc('profesionales_agendables'),
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
    (c) => !filtros.profesional || c.profesional_id === filtros.profesional,
  );

  // Agrupación por día de la semana en hora de Madrid.
  const porDia = new Map<string, CitaAgenda[]>();
  for (const cita of visibles) {
    const clave = new Date(cita.inicio).toLocaleDateString('sv-SE', { timeZone: ZONA });
    porDia.set(clave, [...(porDia.get(clave) ?? []), cita]);
  }

  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lunes);
    d.setDate(d.getDate() + i);
    return d;
  });
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: ZONA });

  return (
    <div className="min-h-screen">
      <Cabecera email={user.email ?? ''} />

      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Agenda</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              href={`/agenda?semana=${claveSemana(anterior)}`}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-100"
            >
              ← Semana anterior
            </Link>
            <Link
              href="/agenda"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Esta semana
            </Link>
            <Link
              href={`/agenda?semana=${claveSemana(siguiente)}`}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Semana siguiente →
            </Link>
          </div>
        </div>

        {filtros.error && (
          <p className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 ring-1 ring-red-200">
            {filtros.error}
          </p>
        )}
        {filtros.aviso && (
          <p className="mb-3 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
            {filtros.aviso}
          </p>
        )}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-500">
            Semana del{' '}
            {lunes.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })} ·{' '}
            {visibles.length} cita{visibles.length === 1 ? '' : 's'}
          </p>
          {!esTerapeuta && (profesionales ?? []).length > 0 && (
            <form method="get" className="flex items-center gap-2 text-sm">
              <input type="hidden" name="semana" value={claveSemana(lunes)} />
              <select
                name="profesional"
                defaultValue={filtros.profesional ?? ''}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5"
              >
                <option value="">Todos los profesionales</option>
                {(profesionales ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Filtrar
              </button>
            </form>
          )}
        </div>

        {error ? (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            No se pudo cargar la agenda: {error.message}
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {dias.map((dia, i) => {
              const clave = dia.toLocaleDateString('sv-SE', { timeZone: ZONA });
              const delDia = porDia.get(clave) ?? [];
              const esHoy = clave === hoy;
              return (
                <section
                  key={clave}
                  className={`flex flex-col rounded-xl ring-1 ${
                    esHoy ? 'bg-teal-50/50 ring-teal-200' : 'bg-slate-100 ring-slate-200'
                  }`}
                >
                  <header className="flex items-baseline justify-between px-3 py-2.5">
                    <h3 className="text-sm font-semibold text-slate-700">
                      {DIAS[i]} {dia.getDate()}
                      {esHoy && <span className="ml-1 text-xs font-normal text-teal-700">hoy</span>}
                    </h3>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200">
                      {delDia.length}
                    </span>
                  </header>
                  <div className="flex min-h-16 flex-col gap-2 px-2 pb-2">
                    {delDia.map((cita) => {
                      const estado = ESTADO_CITA[cita.estado] ?? {
                        texto: cita.estado,
                        clases: 'bg-slate-100 text-slate-600 ring-slate-200',
                      };
                      const destinatario = cita.contacto_nombre ?? cita.lead_nombre;
                      const telefono = cita.contacto_telefono ?? cita.lead_telefono;
                      const recordatorio = componerRecordatorio(plantilla, {
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
                        <article
                          key={cita.id}
                          className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200"
                        >
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
                              <Link
                                href={`/leads/${cita.lead_id}`}
                                className="hover:text-teal-700 hover:underline"
                              >
                                {cita.lead_nombre}
                              </Link>
                            )}
                          </p>
                          <p className="text-xs text-slate-500">
                            {cita.lead_telefono} · {TIPO_CITA[cita.tipo] ?? cita.tipo} ·{' '}
                            {MODALIDAD_CITA[cita.modalidad_cita] ?? cita.modalidad_cita}
                          </p>
                          <p className="text-xs text-slate-500">
                            {cita.centro_nombre} · {cita.profesional_nombre}
                          </p>
                          {cita.notas && <p className="mt-1 text-xs text-slate-600">{cita.notas}</p>}

                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-teal-700 hover:underline">
                              Recordatorio
                            </summary>
                            <p className="mt-1 rounded-lg bg-slate-50 p-2 text-xs text-slate-700 ring-1 ring-slate-100">
                              {recordatorio}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-400">
                              Para {destinatario} ({telefono}). Nunca menciona el motivo de consulta.
                            </p>
                            <a
                              href={`https://wa.me/${telefono.replace('+', '')}?text=${encodeURIComponent(recordatorio)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 inline-block text-xs text-teal-700 hover:underline"
                            >
                              Abrir en WhatsApp →
                            </a>
                          </details>

                          {cita.estado === 'programada' && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <form
                                action={cambiarEstadoCita.bind(null, cita.id, 'realizada', {
                                  agenda: claveSemana(lunes),
                                })}
                              >
                                <button
                                  type="submit"
                                  className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-100"
                                >
                                  Realizada
                                </button>
                              </form>
                              <form
                                action={cambiarEstadoCita.bind(null, cita.id, 'no_show', {
                                  agenda: claveSemana(lunes),
                                })}
                              >
                                <button
                                  type="submit"
                                  className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 transition hover:bg-amber-100"
                                >
                                  No vino
                                </button>
                              </form>
                              <form
                                action={cambiarEstadoCita.bind(null, cita.id, 'cancelada', {
                                  agenda: claveSemana(lunes),
                                })}
                              >
                                <button
                                  type="submit"
                                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-100"
                                >
                                  Cancelar
                                </button>
                              </form>
                            </div>
                          )}
                        </article>
                      );
                    })}
                    {delDia.length === 0 && (
                      <p className="px-1 py-2 text-xs text-slate-400">Sin citas.</p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
