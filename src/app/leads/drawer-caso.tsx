import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { etiquetaEstado } from '@/lib/estados';
import { fecha } from '@/lib/fechas';
import { ESTADO_CITA, TIPO_CITA } from '@/lib/citas';
import { CampoRapido } from './campo-rapido';
import { BotonLlamada } from './boton-llamada';
import { Presencia } from '@/components/presencia';

const TIPO_ACTIVIDAD: Record<string, string> = {
  llamada: '📞',
  whatsapp: '💬',
  email: '✉️',
  nota: '📝',
  cambio_estado: '🔀',
  reapertura: '♻️',
};

const CHIP_CENTRO: Record<string, string> = {
  horizonte: 'chip-hz',
  eclipse: 'chip-ec',
  bellamar: 'chip-bm',
  'bandeja-grupo': 'chip-gr',
};

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-5 py-4">
      <h5 className="mb-2.5 text-[11px] uppercase tracking-[0.1em] text-muted">{titulo}</h5>
      {children}
    </section>
  );
}

function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .map((p) => p[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Ficha de caso en panel lateral. Se abre con `?caso=<id>` sobre el tablero:
 * así el kanban no se pierde de vista y la URL sigue siendo compartible.
 * La edición a fondo vive en la página completa del caso.
 */
export async function DrawerCaso({
  leadId,
  volverA,
  navegacion,
}: {
  leadId: string;
  volverA: string;
  /** Botones de caso anterior/siguiente. Los calcula quien conoce la lista visible. */
  navegacion?: React.ReactNode;
}) {
  const supabase = await createClient();

  const { data: lead } = await supabase
    .from('leads')
    .select(
      `id, nombre, telefono, estado, urgencia, created_at, primera_respuesta_at,
       centro:centros (nombre, slug),
       canal:canales (nombre),
       subcanal,
       propietario_id,
       propietario:perfiles!leads_propietario_id_fkey (nombre)`,
    )
    .eq('id', leadId)
    .maybeSingle();

  if (!lead) return null;

  // Comerciales activos: los posibles destinatarios del caso. Quién puede
  // reasignarlo de verdad lo decide la base (regla 8), no esta lista.
  const {
    data: { user: yo },
  } = await supabase.auth.getUser();
  const { data: miPerfil } = yo
    ? await supabase.from('perfiles').select('nombre').eq('id', yo.id).maybeSingle()
    : { data: null };

  const { data: motivos } = await supabase
    .from('motivos_perdida')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre');

  const { data: comerciales } = await supabase
    .from('perfiles')
    .select('id, nombre')
    .eq('activo', true)
    .in('rol', ['direccion', 'admisiones'])
    .order('nombre');

  const [{ data: contactos }, { data: actividades }, { data: tareas }, { data: presupuestos }, { data: citas }] =
    await Promise.all([
      supabase
        .from('lead_contactos')
        .select('id, tipo, relacion, es_principal, contacto:contactos (id, nombre, telefono)')
        .eq('lead_id', leadId)
        .order('es_principal', { ascending: false }),
      supabase
        .from('actividades')
        .select('id, tipo, contenido, created_at, usuario:perfiles (nombre)')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('tareas')
        .select('id, titulo, vence_at, completada_at')
        .eq('lead_id', leadId)
        .order('vence_at'),
      supabase
        .from('presupuestos')
        .select('id, importe, estado, created_at')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false }),
      supabase
        .from('citas')
        .select('id, tipo, inicio, estado')
        .eq('lead_id', leadId)
        .order('inicio', { ascending: false })
        .limit(3),
    ]);

  const estado = etiquetaEstado(lead.estado);
  const principal = (contactos ?? []).find((c) => c.es_principal)?.contacto;
  const telefono = principal?.telefono ?? lead.telefono;
  const pendientes = (tareas ?? []).filter((t) => t.completada_at === null);
  const proxima = pendientes[0];
  const vencida = proxima ? new Date(proxima.vence_at) < new Date() : false;

  return (
    <>
      {/* El velo cierra al pulsar fuera; es un enlace, no necesita JavaScript. */}
      <Link
        href={volverA}
        aria-label="Cerrar la ficha"
        className="fixed inset-0 z-30 bg-ink/35"
        scroll={false}
      />

      <aside
        aria-label="Ficha de caso"
        className="fixed inset-y-0 right-0 z-40 w-[min(460px,94vw)] overflow-y-auto bg-surface shadow-[-8px_0_30px_rgba(36,43,58,.2)]"
      >
        <header className="sticky top-0 z-10 border-b border-line bg-surface px-5 pb-3.5 pt-4">
          <Link
            href={volverA}
            scroll={false}
            className="absolute right-3.5 top-3.5 text-lg text-muted transition hover:text-ink"
            aria-label="Cerrar"
          >
            ✕
          </Link>
          <div className="mb-2 flex items-center justify-between gap-2">
            {navegacion ?? <span />}
            {yo && (
              <Presencia
                canal={'caso:' + lead.id}
                yo={{ id: yo.id, nombre: miPerfil?.nombre ?? 'Alguien' }}
                compacto
              />
            )}
          </div>
          <h2 className="mb-1.5 pr-8 text-[18px] font-bold">{lead.nombre}</h2>
          <div className="flex flex-wrap gap-1.5">
            <span className={`chip ${CHIP_CENTRO[lead.centro?.slug ?? ''] ?? 'chip-mut'}`}>
              {lead.centro?.nombre}
            </span>
            <span className="chip chip-mut">{lead.subcanal || lead.canal?.nombre}</span>
            <span className={`chip ${estado.clases}`}>{estado.texto}</span>
            {lead.urgencia === 'alta' && <span className="chip chip-danger">Urgente</span>}
          </div>
        </header>

        {/*
          Edición en línea: se toca el dato y se cambia, con aviso y deshacer.
          Sin diálogos: esto se usa entre llamada y llamada.
        */}
        <Seccion titulo="Cambio rápido">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-muted">
            <label className="flex items-center gap-1.5">
              Urgencia
              <CampoRapido
                leadId={lead.id}
                campo="urgencia"
                valor={lead.urgencia}
                etiqueta="Cambiar la urgencia del caso"
                opciones={[
                  { valor: '', texto: 'Sin marcar' },
                  { valor: 'baja', texto: 'Baja' },
                  { valor: 'media', texto: 'Media' },
                  { valor: 'alta', texto: 'Alta' },
                ]}
              />
            </label>
            <label className="flex items-center gap-1.5">
              Propietario
              <CampoRapido
                leadId={lead.id}
                campo="propietario_id"
                valor={lead.propietario_id}
                etiqueta="Cambiar el comercial propietario"
                opciones={[
                  { valor: '', texto: 'Sin asignar' },
                  ...(comerciales ?? []).map((c) => ({ valor: c.id, texto: c.nombre })),
                ]}
              />
            </label>
          </div>
        </Seccion>

        <Seccion titulo="Acciones rápidas">
          <div className="mb-3">
            <BotonLlamada leadId={lead.id} telefono={telefono} motivos={motivos ?? []} />
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://wa.me/${telefono.replace('+', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-lg border border-line2 bg-surface px-1.5 py-2 text-center text-[12.5px] font-semibold text-primary transition hover:bg-primary-soft"
            >
              💬 WhatsApp
            </a>
            <Link
              href={`/leads/${lead.id}#citas`}
              className="flex-1 rounded-lg border border-line2 bg-surface px-1.5 py-2 text-center text-[12.5px] font-semibold text-primary transition hover:bg-primary-soft"
            >
              📅 Agendar
            </Link>
            <Link
              href={`/leads/${lead.id}#presupuestos`}
              className="flex-1 rounded-lg border border-line2 bg-surface px-1.5 py-2 text-center text-[12.5px] font-semibold text-primary transition hover:bg-primary-soft"
            >
              € Presupuesto
            </Link>
          </div>
        </Seccion>

        <Seccion titulo="Próxima acción">
          {proxima ? (
            <div
              className={`rounded-lg border px-3 py-2.5 text-[13px] font-semibold ${
                vencida
                  ? 'border-danger/30 bg-danger-soft text-danger'
                  : 'border-coral/30 bg-coral-soft text-coral-ink'
              }`}
            >
              ◷ {proxima.titulo} — {fecha(proxima.vence_at)}
              {vencida && ' · vencida'}
            </div>
          ) : (
            <div className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2.5 text-[13px] font-semibold text-warn">
              ⚠ Sin próxima acción. Ningún caso abierto debería quedarse así.
            </div>
          )}
          {pendientes.length > 1 && (
            <p className="mt-2 text-xs text-muted">
              y {pendientes.length - 1} tarea{pendientes.length === 2 ? '' : 's'} más pendiente
              {pendientes.length === 2 ? '' : 's'}
            </p>
          )}
        </Seccion>

        <Seccion titulo="Contactos del caso">
          {(contactos ?? []).map((lc) => (
            <div key={lc.id} className="flex items-center gap-2.5 py-1.5">
              <span className="avatar">{iniciales(lc.contacto?.nombre ?? '?')}</span>
              <div className="min-w-0">
                <b className="text-[13px]">{lc.contacto?.nombre}</b>
                {lc.es_principal && <span className="ml-1.5 text-xs text-warn">★ principal</span>}
                <small className="block text-[11.5px] text-muted">
                  {lc.contacto?.telefono} · {lc.tipo}
                  {lc.relacion && ` (${lc.relacion})`}
                </small>
              </div>
            </div>
          ))}
          <Link
            href={`/leads/${lead.id}`}
            className="mt-1 inline-block text-[12.5px] font-semibold text-primary hover:underline"
          >
            + Añadir contacto
          </Link>
        </Seccion>

        {(citas ?? []).length > 0 && (
          <Seccion titulo="Citas">
            {(citas ?? []).map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-2 border-b border-dashed border-line py-1.5 text-[13px] last:border-0"
              >
                <span>
                  {fecha(c.inicio)} · {TIPO_CITA[c.tipo] ?? c.tipo}
                </span>
                <span className={`chip ${ESTADO_CITA[c.estado]?.clases ?? 'chip-mut'}`}>
                  {ESTADO_CITA[c.estado]?.texto ?? c.estado}
                </span>
              </div>
            ))}
          </Seccion>
        )}

        <Seccion titulo="Actividad">
          <ul className="m-0 list-none p-0">
            {(actividades ?? []).map((a) => (
              <li
                key={a.id}
                className="flex gap-2.5 border-b border-dashed border-line py-1.5 text-[13px] last:border-0"
              >
                <span className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-surface2 text-[11px]">
                  {TIPO_ACTIVIDAD[a.tipo] ?? '·'}
                </span>
                <div className="min-w-0">
                  {a.contenido}
                  <small className="block text-[11px] text-muted">
                    {a.usuario?.nombre ?? 'Sistema'} · {fecha(a.created_at)}
                  </small>
                </div>
              </li>
            ))}
            {(actividades ?? []).length === 0 && (
              <li className="text-[13px] text-muted">Sin actividad todavía.</li>
            )}
          </ul>
        </Seccion>

        <Seccion titulo="Presupuestos">
          {(presupuestos ?? []).length === 0 ? (
            <p className="text-[13px] text-muted">Sin presupuestos todavía.</p>
          ) : (
            (presupuestos ?? []).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between border-b border-dashed border-line py-1.5 text-[13px] last:border-0"
              >
                <span className="num font-semibold">
                  {Number(p.importe).toLocaleString('es-ES', {
                    style: 'currency',
                    currency: 'EUR',
                    maximumFractionDigits: 0,
                  })}
                </span>
                <span className="chip chip-mut">{p.estado}</span>
              </div>
            ))
          )}
        </Seccion>

        <div className="px-5 py-4">
          <Link href={`/leads/${lead.id}`} className="btn btn-primary w-full">
            Abrir la ficha completa
          </Link>
        </div>
      </aside>
    </>
  );
}
