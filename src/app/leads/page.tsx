import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { ESTADOS_CERRADOS, type EstadoLead } from '@/lib/estados';
import { hace, hoyMadrid } from '@/lib/fechas';
import Kanban, { type TarjetaLead } from './kanban';
import { DrawerCaso } from './drawer-caso';

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
  centro: { nombre: string; slug: string; es_bandeja_grupo: boolean } | null;
  canal: { nombre: string } | null;
  propietario: { nombre: string } | null;
  tareas: { completada_at: string | null }[];
  presupuestos: { importe: number }[];
  conversiones: { importe_primer_pago: number | null; estado: string } | null;
};

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    pipeline?: string;
    centro?: string;
    caso?: string;
    mias?: string;
    canal?: string;
    urgencia?: string;
    inactivos?: string;
  }>;
}) {
  const filtros = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Al cerrar la ficha se vuelve al tablero con los mismos filtros.
  const parametrosTablero = new URLSearchParams();
  for (const clave of ['pipeline', 'centro', 'mias', 'canal', 'urgencia', 'inactivos'] as const) {
    if (filtros[clave]) parametrosTablero.set(clave, filtros[clave]!);
  }
  const volverAlTablero = `/leads${parametrosTablero.toString() ? `?${parametrosTablero}` : ''}`;

  // Consultas independientes en paralelo; solo etapas y leads esperan al pipeline.
  const hoy = hoyMadrid();
  const [{ data: perfil }, { data: pipelines }, { data: centros }, { data: ausencias }, { data: canales }] =
    await Promise.all([
      supabase.from('perfiles').select('rol, nombre').eq('id', user.id).single(),
      supabase.from('pipelines').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('centros').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('ausencias').select('perfil_id').lte('desde', hoy).gte('hasta', hoy),
      supabase.from('canales').select('id, nombre').eq('activo', true).order('nombre'),
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
       centro:centros (nombre, slug, es_bandeja_grupo),
       canal:canales (nombre),
       propietario:perfiles!leads_propietario_id_fkey (nombre),
       tareas (completada_at),
       presupuestos (importe),
       conversiones (importe_primer_pago, estado)`,
    )
    // Solo tareas PENDIENTES: basta para el aviso y evita arrastrar el histórico.
    .is('tareas.completada_at', null)
    .order('created_at', { ascending: false });
  if (pipelineId) consulta = consulta.eq('pipeline_id', pipelineId);
  if (filtros.centro) consulta = consulta.eq('centro_id', filtros.centro);
  if (filtros.mias === '1') consulta = consulta.eq('propietario_id', user.id);
  if (filtros.canal) consulta = consulta.eq('canal_id', filtros.canal);
  if (filtros.urgencia === 'alta' || filtros.urgencia === 'media' || filtros.urgencia === 'baja') {
    consulta = consulta.eq('urgencia', filtros.urgencia);
  }

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

  let filas = (data ?? []) as unknown as FilaKanban[];

  // «Sin actividad» compara contra la última anotación del caso. La consulta
  // solo se hace cuando el filtro está activo: no lastra el tablero normal.
  const diasInactivo = Number(filtros.inactivos);
  if (Number.isFinite(diasInactivo) && diasInactivo > 0 && filas.length > 0) {
    const { data: ultimas } = await supabase
      .from('actividades')
      .select('lead_id, created_at')
      .in('lead_id', filas.map((f) => f.id))
      .order('created_at', { ascending: false });

    const ultimaDe = new Map<string, string>();
    for (const a of ultimas ?? []) {
      if (!ultimaDe.has(a.lead_id)) ultimaDe.set(a.lead_id, a.created_at);
    }
    const limite = Date.now() - diasInactivo * 86_400_000;
    filas = filas.filter(
      (f) => new Date(ultimaDe.get(f.id) ?? f.created_at).getTime() < limite,
    );
  }

  const ausentes = new Set((ausencias ?? []).map((a) => a.perfil_id));

  const aTarjeta = (fila: FilaKanban): TarjetaLead => ({
    id: fila.id,
    nombre: fila.nombre,
    estado: fila.estado,
    urgencia: fila.urgencia,
    etapaId: fila.etapa_id,
    centroNombre: fila.centro?.nombre ?? '—',
    centroSlug: fila.centro?.slug ?? '',
    esBandeja: fila.centro?.es_bandeja_grupo ?? false,
    canalNombre: fila.canal?.nombre ?? '—',
    subcanal: fila.subcanal,
    propietarioNombre: fila.propietario?.nombre ?? null,
    propietarioAusente: fila.propietario_id !== null && ausentes.has(fila.propietario_id),
    sinProximaAccion:
      !ESTADOS_SIN_AVISO_ACCION.includes(fila.estado) &&
      fila.tareas.length === 0,
    importe:
      fila.conversiones?.importe_primer_pago ??
      (fila.presupuestos.length > 0
        ? Math.max(...fila.presupuestos.map((p) => Number(p.importe)))
        : null),
    conversionPendiente: fila.conversiones?.estado === 'pendiente_validacion',
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
      titulo="Kanban comercial"
      descripcion={`Pipeline: ${pipelines?.find((p) => p.id === pipelineId)?.nombre ?? "—"} · ${tarjetas.length} casos abiertos`}
    >
        <form method="get" className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          {pipelines && pipelines.length > 1 && (
            <select name="pipeline" defaultValue={pipelineId} className="campo">
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          )}
          <select name="centro" defaultValue={filtros.centro ?? ''} className="campo">
            <option value="">Todos los centros</option>
            {(centros ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <select name="canal" defaultValue={filtros.canal ?? ''} className="campo">
            <option value="">Todos los canales</option>
            {(canales ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <select name="urgencia" defaultValue={filtros.urgencia ?? ''} className="campo">
            <option value="">Cualquier urgencia</option>
            <option value="alta">Urgencia alta</option>
            <option value="media">Urgencia media</option>
            <option value="baja">Urgencia baja</option>
          </select>
          <select name="inactivos" defaultValue={filtros.inactivos ?? ''} className="campo">
            <option value="">Cualquier actividad</option>
            <option value="3">Sin actividad 3+ días</option>
            <option value="7">Sin actividad 7+ días</option>
            <option value="14">Sin actividad 14+ días</option>
          </select>
          <label className="flex items-center gap-2 rounded-lg border border-line2 bg-surface px-3 py-2 font-medium text-ink2">
            <input type="checkbox" name="mias" value="1" defaultChecked={filtros.mias === '1'} />
            Solo mis leads
          </label>
          <button type="submit" className="btn btn-primary">
            Filtrar
          </button>
          {(filtros.centro || filtros.canal || filtros.urgencia || filtros.inactivos || filtros.mias) && (
            <Link href="/leads" className="px-2 font-medium text-primary hover:underline">
              Limpiar
            </Link>
          )}
        </form>

        {error ? (
          <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-danger/25">
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

        {filtros.caso && <DrawerCaso leadId={filtros.caso} volverA={volverAlTablero} />}
      </AppShell>
  );
}
