'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { etiquetaEstado } from '@/lib/estados';
import { asignarmeLead, moverLeadDeEtapa } from './actions';

export type TarjetaLead = {
  id: string;
  nombre: string;
  estado: string;
  urgencia: string | null;
  etapaId: string;
  centroNombre: string;
  centroSlug: string;
  esBandeja: boolean;
  canalNombre: string;
  subcanal: string | null;
  propietarioNombre: string | null;
  propietarioAusente: boolean;
  sinProximaAccion: boolean;
  importe: number | null;
  conversionPendiente: boolean;
  creado: string;
  /** Calor del caso, 0-100. Lo calcula el motor con pesos configurables. */
  puntuacion: number;
};

type Props = {
  etapas: { id: string; nombre: string }[];
  tarjetas: TarjetaLead[];
  cerradas: TarjetaLead[];
  puedeAutoasignarse: boolean;
};

type Arrastre = {
  leadId: string;
  nombre: string;
  /** Punto donde empezó el gesto: contra él se mide el umbral de activación. */
  origenX: number;
  origenY: number;
  x: number;
  y: number;
  activo: boolean;
};

/** Código de color del grupo: cada centro tiene el suyo en chips y borde. */
const CLASES_CENTRO: Record<string, { borde: string; chip: string }> = {
  horizonte: { borde: 'borde-hz', chip: 'chip-hz' },
  eclipse: { borde: 'borde-ec', chip: 'chip-ec' },
  bellamar: { borde: 'borde-bm', chip: 'chip-bm' },
  'bandeja-grupo': { borde: 'borde-gr', chip: 'chip-gr' },
};

function colorCentro(slug: string) {
  return CLASES_CENTRO[slug] ?? { borde: '', chip: 'chip-mut' };
}

function Tarjeta({
  lead,
  puedeAutoasignarse,
  onAsignarme,
  onEmpezarArrastre,
  atenuada,
}: {
  lead: TarjetaLead;
  puedeAutoasignarse: boolean;
  onAsignarme: (id: string) => void;
  onEmpezarArrastre?: (e: React.PointerEvent, lead: TarjetaLead) => void;
  atenuada: boolean;
}) {
  const centro = colorCentro(lead.centroSlug);
  const iniciales = (lead.propietarioNombre ?? '')
    .split(/\s+/)
    .map((p) => p[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      onPointerDown={onEmpezarArrastre ? (e) => onEmpezarArrastre(e, lead) : undefined}
      className={`tarjeta mb-2.5 ${centro.borde} ${
        onEmpezarArrastre ? 'cursor-grab active:cursor-grabbing' : ''
      } ${atenuada ? 'opacity-40' : ''}`}
    >
      <Link
        href={`/leads?caso=${lead.id}`}
        scroll={false}
        className="mb-1.5 block text-[13.5px] font-bold text-ink hover:text-primary"
        draggable={false}
      >
        {lead.nombre}
      </Link>

      <div className="mb-1.5 flex flex-wrap gap-1.5">
        <span className={`chip ${centro.chip}`}>{lead.centroNombre}</span>
        <span className="chip chip-mut">{lead.subcanal || lead.canalNombre}</span>
        {lead.urgencia === 'alta' && <span className="chip chip-danger">Urgente</span>}
        {/* El scoring prioriza la cola; no oculta ni cierra nada. */}
        {lead.puntuacion >= 60 && (
          <span className="chip chip-danger" title={`Puntuación ${lead.puntuacion}/100`}>
            🔥 {lead.puntuacion}
          </span>
        )}
        {lead.puntuacion >= 35 && lead.puntuacion < 60 && (
          <span className="chip chip-warn" title={`Puntuación ${lead.puntuacion}/100`}>
            {lead.puntuacion}
          </span>
        )}
        {lead.propietarioAusente && <span className="chip chip-warn">Propietario ausente</span>}
        {lead.conversionPendiente && <span className="chip chip-warn">Pendiente validación</span>}
      </div>

      <p
        className={`flex items-center gap-1.5 text-xs ${
          lead.sinProximaAccion ? 'font-semibold text-danger' : 'text-ink2'
        }`}
      >
        ◷ {lead.sinProximaAccion ? 'Sin próxima acción' : 'Con próxima acción'} · {lead.creado}
      </p>

      <div className="mt-2 flex items-center justify-between gap-2">
        {lead.propietarioNombre ? (
          <span className="avatar" title={lead.propietarioNombre}>
            {iniciales}
          </span>
        ) : (
          <span className="avatar avatar-vacio" title="Sin propietario">
            !
          </span>
        )}
        {!lead.propietarioNombre && puedeAutoasignarse ? (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onAsignarme(lead.id)}
            className="btn-mini"
          >
            Asignarme
          </button>
        ) : (
          lead.importe !== null && (
            <span className="num text-[12.5px] font-bold text-ink">
              {Number(lead.importe).toLocaleString('es-ES', {
                style: 'currency',
                currency: 'EUR',
                maximumFractionDigits: 0,
              })}
            </span>
          )
        )}
      </div>
    </div>
  );
}

export default function Kanban({ etapas, tarjetas, cerradas, puedeAutoasignarse }: Props) {
  const router = useRouter();
  const [aviso, setAviso] = useState<string | null>(null);
  const [moviendoId, setMoviendoId] = useState<string | null>(null);
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  const arrastreRef = useRef<Arrastre | null>(null);
  const [columnaDestino, setColumnaDestino] = useState<string | null>(null);
  const columnasRef = useRef(new Map<string, HTMLElement>());

  function fijarArrastre(valor: Arrastre | null) {
    arrastreRef.current = valor;
    setArrastre(valor);
  }
  const [, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel('kanban-leads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () =>
        router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [router]);

  function moverLead(leadId: string, etapaId: string) {
    setAviso(null);
    setMoviendoId(leadId);
    startTransition(async () => {
      const r = await moverLeadDeEtapa(leadId, etapaId);
      if (r?.error) setAviso(r.error);
      setMoviendoId(null);
    });
  }

  function asignarme(leadId: string) {
    setAviso(null);
    startTransition(async () => {
      const r = await asignarmeLead(leadId);
      if (r?.error) setAviso(r.error);
    });
  }

  function empezarArrastre(e: React.PointerEvent, lead: TarjetaLead) {
    // Solo ratón / lápiz: en táctil el gesto debe seguir haciendo scroll.
    if (e.pointerType === 'touch' || e.button !== 0) return;
    fijarArrastre({
      leadId: lead.id,
      nombre: lead.nombre,
      origenX: e.clientX,
      origenY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      activo: false,
    });
  }

  useEffect(() => {
    if (!arrastre) return;

    function columnaBajo(x: number, y: number): string | null {
      for (const [id, el] of columnasRef.current) {
        const r = el.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id;
      }
      return null;
    }

    function alMover(e: PointerEvent) {
      const a = arrastreRef.current;
      if (!a) return;
      // El umbral se mide contra el ORIGEN del gesto, no contra el último
      // movimiento: si no, un arrastre lento nunca llega a activarse.
      const activo = a.activo || Math.hypot(e.clientX - a.origenX, e.clientY - a.origenY) > 6;
      // Solo se bloquea el evento cuando el arrastre ya es real: hacerlo antes
      // cancelaba el clic del enlace de la tarjeta.
      if (activo) e.preventDefault();
      fijarArrastre({ ...a, x: e.clientX, y: e.clientY, activo });
      setColumnaDestino(columnaBajo(e.clientX, e.clientY));
    }

    function alSoltar(e: PointerEvent) {
      const a = arrastreRef.current;
      const destino = columnaBajo(e.clientX, e.clientY);
      fijarArrastre(null);
      setColumnaDestino(null);
      if (a?.activo && destino) {
        const lead = tarjetas.find((t) => t.id === a.leadId);
        if (lead && lead.etapaId !== destino) moverLead(a.leadId, destino);
      }
    }

    window.addEventListener('pointermove', alMover);
    window.addEventListener('pointerup', alSoltar);
    return () => {
      window.removeEventListener('pointermove', alMover);
      window.removeEventListener('pointerup', alSoltar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrastre !== null, tarjetas]);

  const enBandejaSinAsignar = tarjetas.filter((t) => t.esBandeja && !t.propietarioNombre);

  return (
    <div className={arrastre ? 'select-none' : ''}>
      {aviso && (
        <p className="mb-3 rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger ring-1 ring-danger/25">
          {aviso}
        </p>
      )}

      {arrastre?.activo && (
        <div
          className="pointer-events-none fixed z-50 rounded-lg bg-surface px-3 py-2 text-sm font-medium shadow-lg ring-2 ring-primary"
          style={{ left: arrastre.x + 8, top: arrastre.y + 8 }}
        >
          {arrastre.nombre}
        </div>
      )}

      {/* La bandeja de grupo va destacada arriba: son los leads que aún no
          tienen centro y compiten por atención (regla 2). */}
      {enBandejaSinAsignar.length > 0 && (
        <section
          className="mb-4 rounded-lg border border-[#EAD9B0] p-3 px-4"
          style={{ background: 'linear-gradient(90deg,#FBF4E3,#F7F1E2)' }}
        >
          <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-gr">
            ◈ Bandeja de grupo · {enBandejaSinAsignar.length} sin asignar
            <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-ok">
              ● en vivo
            </span>
          </h3>
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {enBandejaSinAsignar.map((lead) => (
              <div
                key={lead.id}
                className="flex shrink-0 items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 shadow-sm"
              >
                <div>
                  <Link
                    href={`/leads?caso=${lead.id}`}
                    scroll={false}
                    className="block text-[13px] font-bold text-ink hover:text-primary"
                  >
                    {lead.nombre}
                  </Link>
                  <small className="block text-[11.5px] text-muted">
                    {lead.subcanal || lead.canalNombre} · {lead.creado}
                  </small>
                </div>
                {puedeAutoasignarse && (
                  <button onClick={() => asignarme(lead.id)} className="btn-mini">
                    Asignarme
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex items-start gap-3 overflow-x-auto pb-4">
        {etapas.map((etapa) => {
          const deEtapa = tarjetas.filter((t) => t.etapaId === etapa.id);
          const resaltada = arrastre?.activo && columnaDestino === etapa.id;
          return (
            <section
              key={etapa.id}
              ref={(el) => {
                if (el) columnasRef.current.set(etapa.id, el);
                else columnasRef.current.delete(etapa.id);
              }}
              className={`flex w-72 shrink-0 flex-col rounded-xl ring-1 transition ${
                resaltada ? 'bg-primary-soft ring-primary/40' : 'bg-surface2 ring-line'
              }`}
            >
              <header className="mb-2.5 flex items-center justify-between text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink2">
                <h3>{etapa.nombre}</h3>
                <span className="num rounded-full bg-surface px-2 text-ink">{deEtapa.length}</span>
              </header>
              <div className="flex min-h-24 flex-1 flex-col">
                {deEtapa.map((lead) => (
                  <Tarjeta
                    key={lead.id}
                    lead={lead}
                    puedeAutoasignarse={puedeAutoasignarse}
                    onAsignarme={asignarme}
                    onEmpezarArrastre={empezarArrastre}
                    atenuada={moviendoId === lead.id || (arrastre?.activo === true && arrastre.leadId === lead.id)}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {cerradas.length > 0 && (
          <section className="flex w-72 shrink-0 flex-col rounded-xl bg-surface2 ring-1 ring-line2">
            <header className="flex items-center justify-between px-3 py-2.5">
              <h3 className="text-sm font-semibold text-ink2">Cerrados</h3>
              <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-ink2 ring-1 ring-line">
                {cerradas.length}
              </span>
            </header>
            <div className="flex flex-col gap-2 px-2 pb-2">
              {cerradas.map((lead) => (
                <Tarjeta
                  key={lead.id}
                  lead={lead}
                  puedeAutoasignarse={false}
                  onAsignarme={() => {}}
                  atenuada={false}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      <p className="text-xs text-muted">
        Arrastra las tarjetas entre etapas (en el móvil, cambia la etapa desde la ficha del caso).
        El movimiento es libre: la plataforma avisa, nunca bloquea.
      </p>
    </div>
  );
}
