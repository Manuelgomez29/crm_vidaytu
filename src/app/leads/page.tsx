import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { ESTADOS_CERRADOS, type EstadoLead } from '@/lib/estados';
import { hace, hoyMadrid } from '@/lib/fechas';
import Kanban, { type TarjetaLead } from './kanban';

/** Estados exentos del aviso "sin próxima acción": cerrados o ya resueltos. */
const ESTADOS_SIN_AVISO_ACCION: string[] = [...ESTADOS_CERRADOS, 'convertido', 'derivado'];

type FilaKanban = {
  id: string;
  nombre: string;
  estado: string;
  urgencia: string | null;
  etapa_id: string;
  created_at: string;
  propietario_id: string | null;
  subcanal: string | null;
  centro: { nombre: string; es_bandeja_grupo: boolean } | null;
  canal: { nombre: string } | null;
  propietario: { nombre: string } | null;
  tareas: { completada_at: string | null }[];
};

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ pipeline?: string; centro?: string }>;
}) {
  const filtros = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Consultas independientes en paralelo; solo etapas y leads esperan al pipeline.
  const hoy = hoyMadrid();
  const [{ data: perfil }, { data: pipelines }, { data: centros }, { data: ausencias }] =
    await Promise.all([
      supabase.from('perfiles').select('rol, nombre').eq('id', user.id).single(),
      supabase.from('pipelines').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('centros').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('ausencias').select('perfil_id').lte('desde', hoy).gte('hasta', hoy),
    ]);

  // El terapeuta solo tiene agenda (regla 14).
  if (perfil?.rol === 'terapeuta') redirect('/agenda');

  const pipelineId =
    (filtros.pipeline && pipelines?.find((p) => p.id === filtros.pipeline)?.id) ||
    pipelines?.[0]?.id;

  let consulta = supabase
    .from('leads')
    .select(
      `id, nombre, estado, urgencia, etapa_id, created_at, propietario_id, subcanal,
       centro:centros (nombre, es_bandeja_grupo),
       canal:canales (nombre),
       propietario:perfiles!leads_propietario_id_fkey (nombre),
       tareas (completada_at)`,
    )
    // Solo tareas PENDIENTES: basta para el aviso y evita arrastrar el histórico.
    .is('tareas.completada_at', null)
    .order('created_at', { ascending: false });
  if (pipelineId) consulta = consulta.eq('pipeline_id', pipelineId);
  if (filtros.centro) consulta = consulta.eq('centro_id', filtros.centro);

  const [{ data: etapas }, { data, error }] = await Promise.all([
    pipelineId
      ? supabase
          .from('pipeline_etapas')
          .select('id, nombre, orden')
          .eq('pipeline_id', pipelineId)
          .order('orden')
      : Promise.resolve({ data: [] as { id: string; nombre: string; orden: number }[] }),
    consulta,
  ]);

  const filas = (data ?? []) as unknown as FilaKanban[];
  const ausentes = new Set((ausencias ?? []).map((a) => a.perfil_id));

  const aTarjeta = (fila: FilaKanban): TarjetaLead => ({
    id: fila.id,
    nombre: fila.nombre,
    estado: fila.estado,
    urgencia: fila.urgencia,
    etapaId: fila.etapa_id,
    centroNombre: fila.centro?.nombre ?? '—',
    canalNombre: fila.canal?.nombre ?? '—',
    subcanal: fila.subcanal,
    propietarioNombre: fila.propietario?.nombre ?? null,
    propietarioAusente: fila.propietario_id !== null && ausentes.has(fila.propietario_id),
    sinProximaAccion:
      !ESTADOS_SIN_AVISO_ACCION.includes(fila.estado) &&
      fila.tareas.length === 0,
    creado: hace(fila.created_at),
  });

  const tarjetas = filas
    .filter((f) => !ESTADOS_CERRADOS.includes(f.estado as EstadoLead))
    .map(aTarjeta);
  const cerradas = filas
    .filter((f) => ESTADOS_CERRADOS.includes(f.estado as EstadoLead))
    .map(aTarjeta);

  return (
    <AppShell
      seccion="leads"
      titulo="Leads"
      descripcion="Tablero de casos por etapa"
      ancho="ancho"
    >
        <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
          <form method="get" className="flex flex-wrap items-center gap-2 text-sm">
            {pipelines && pipelines.length > 1 && (
              <select
                name="pipeline"
                defaultValue={pipelineId}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5"
              >
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            )}
            <select
              name="centro"
              defaultValue={filtros.centro ?? ''}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5"
            >
              <option value="">Todos los centros</option>
              {(centros ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Filtrar
            </button>
            {(filtros.centro || filtros.pipeline) && (
              <Link href="/leads" className="text-teal-700 hover:underline">
                Limpiar
              </Link>
            )}
          </form>
        </div>

        {error ? (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            No se pudieron cargar los leads: {error.message}
          </p>
        ) : (
          <Kanban
            etapas={etapas ?? []}
            tarjetas={tarjetas}
            cerradas={cerradas}
            puedeAutoasignarse={perfil?.rol === 'admisiones'}
          />
        )}
      </AppShell>
  );
}
