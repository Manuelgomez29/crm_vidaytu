import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Cabecera } from '@/components/cabecera';
import { ESTADOS_CERRADOS } from '@/lib/estados';
import Kanban, { type TarjetaLead } from './kanban';

const ESTADOS_ABIERTOS_SIN_ACCION = ['perdido', 'no_valido', 'convertido', 'derivado'];

function hace(fechaIso: string): string {
  const dias = Math.floor((Date.now() - new Date(fechaIso).getTime()) / 86_400_000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'hace 1 día';
  return `hace ${dias} días`;
}

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

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol, nombre')
    .eq('id', user.id)
    .single();

  const { data: pipelines } = await supabase
    .from('pipelines')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre');

  const pipelineId =
    (filtros.pipeline && pipelines?.find((p) => p.id === filtros.pipeline)?.id) ||
    pipelines?.[0]?.id;

  const { data: etapas } = pipelineId
    ? await supabase
        .from('pipeline_etapas')
        .select('id, nombre, orden')
        .eq('pipeline_id', pipelineId)
        .order('orden')
    : { data: [] };

  const { data: centros } = await supabase
    .from('centros')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre');

  let consulta = supabase
    .from('leads')
    .select(
      `id, nombre, estado, urgencia, etapa_id, created_at, propietario_id, subcanal,
       centro:centros (nombre, es_bandeja_grupo),
       canal:canales (nombre),
       propietario:perfiles!leads_propietario_id_fkey (nombre),
       tareas (completada_at)`,
    )
    .order('created_at', { ascending: false });
  if (pipelineId) consulta = consulta.eq('pipeline_id', pipelineId);
  if (filtros.centro) consulta = consulta.eq('centro_id', filtros.centro);

  const { data, error } = await consulta;
  const filas = (data ?? []) as unknown as FilaKanban[];

  // Propietarios ausentes hoy (fecha en Europe/Madrid)
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
  const { data: ausencias } = await supabase
    .from('ausencias')
    .select('perfil_id')
    .lte('desde', hoy)
    .gte('hasta', hoy);
  const ausentes = new Set((ausencias ?? []).map((a) => a.perfil_id));

  const aTarjeta = (fila: FilaKanban): TarjetaLead => ({
    id: fila.id,
    nombre: fila.nombre,
    estado: fila.estado,
    urgencia: fila.urgencia,
    etapaId: fila.etapa_id,
    centroNombre: fila.centro?.nombre ?? '—',
    esBandeja: fila.centro?.es_bandeja_grupo ?? false,
    canalNombre: fila.canal?.nombre ?? '—',
    subcanal: fila.subcanal,
    propietarioNombre: fila.propietario?.nombre ?? null,
    propietarioAusente: fila.propietario_id !== null && ausentes.has(fila.propietario_id),
    sinProximaAccion:
      !ESTADOS_ABIERTOS_SIN_ACCION.includes(fila.estado) &&
      !fila.tareas.some((t) => t.completada_at === null),
    creado: hace(fila.created_at),
  });

  const tarjetas = filas
    .filter((f) => !ESTADOS_CERRADOS.includes(f.estado as (typeof ESTADOS_CERRADOS)[number]))
    .map(aTarjeta);
  const cerradas = filas
    .filter((f) => ESTADOS_CERRADOS.includes(f.estado as (typeof ESTADOS_CERRADOS)[number]))
    .map(aTarjeta);

  return (
    <div className="min-h-screen">
      <Cabecera email={user.email ?? ''} />

      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Leads</h2>

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
      </main>
    </div>
  );
}
