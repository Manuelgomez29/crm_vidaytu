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
  canalNombre: string;
  subcanal: string | null;
  propietarioNombre: string | null;
  propietarioAusente: boolean;
  sinProximaAccion: boolean;
  creado: string;
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
  const estado = etiquetaEstado(lead.estado);
  return (
    <div
      onPointerDown={onEmpezarArrastre ? (e) => onEmpezarArrastre(e, lead) : undefined}
      className={`rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200 transition ${
        onEmpezarArrastre ? 'cursor-grab active:cursor-grabbing' : ''
      } ${atenuada ? 'opacity-40' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/leads/${lead.id}`}
          className="font-medium text-slate-900 hover:text-teal-700 hover:underline"
          draggable={false}
        >
          {lead.nombre}
        </Link>
        {lead.urgencia === 'alta' && (
          <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 ring-1 ring-red-200">
            Urgente
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-slate-500">
        {lead.centroNombre}
        {' · '}
        {lead.subcanal || lead.canalNombre}
        {' · '}
        {lead.creado}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${estado.clases}`}>
          {estado.texto}
        </span>
        {lead.propietarioNombre ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-200">
            {lead.propietarioNombre}
          </span>
        ) : (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200">
            Sin asignar
          </span>
        )}
        {lead.propietarioAusente && (
          <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700 ring-1 ring-purple-200">
            Propietario ausente
          </span>
        )}
        {lead.sinProximaAccion && (
          <span
            title="Ningún lead abierto debe quedarse sin próxima acción con fecha"
            className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700 ring-1 ring-orange-200"
          >
            ⚠ Sin próxima acción
          </span>
        )}
      </div>

      {!lead.propietarioNombre && puedeAutoasignarse && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onAsignarme(lead.id)}
          className="mt-2 w-full rounded-md border border-teal-200 bg-teal-50 px-2 py-1 text-xs font-medium text-teal-700 transition hover:bg-teal-100"
        >
          Asignármelo
        </button>
      )}
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
      e.preventDefault();
      const a = arrastreRef.current;
      if (!a) return;
      // El umbral se mide contra el ORIGEN del gesto, no contra el último
      // movimiento: si no, un arrastre lento nunca llega a activarse.
      const activo = a.activo || Math.hypot(e.clientX - a.origenX, e.clientY - a.origenY) > 6;
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

  return (
    <div className={arrastre ? 'select-none' : ''}>
      {aviso && (
        <p className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {aviso}
        </p>
      )}

      {arrastre?.activo && (
        <div
          className="pointer-events-none fixed z-50 rounded-lg bg-white px-3 py-2 text-sm font-medium shadow-lg ring-2 ring-teal-400"
          style={{ left: arrastre.x + 8, top: arrastre.y + 8 }}
        >
          {arrastre.nombre}
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-4">
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
                resaltada ? 'bg-teal-50 ring-teal-300' : 'bg-slate-100 ring-slate-200'
              }`}
            >
              <header className="flex items-center justify-between px-3 py-2.5">
                <h3 className="text-sm font-semibold text-slate-700">{etapa.nombre}</h3>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200">
                  {deEtapa.length}
                </span>
              </header>
              <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
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
          <section className="flex w-72 shrink-0 flex-col rounded-xl bg-slate-200/60 ring-1 ring-slate-300">
            <header className="flex items-center justify-between px-3 py-2.5">
              <h3 className="text-sm font-semibold text-slate-500">Cerrados</h3>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200">
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

      <p className="text-xs text-slate-400">
        Arrastra las tarjetas entre etapas (en el móvil, cambia la etapa desde la ficha del caso).
        El movimiento es libre: la plataforma avisa, nunca bloquea.
      </p>
    </div>
  );
}
