'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useAviso } from '@/components/avisos';
import { registrarLlamada, type SalidaLlamada } from './registrar-llamada';

type Motivo = { id: string; nombre: string };

const SALIDAS: { clave: SalidaLlamada; texto: string; icono: string; clases: string }[] = [
  { clave: 'contactado', texto: 'Contactado', icono: '✓', clases: 'border-ok/40 text-ok hover:bg-ok-soft' },
  { clave: 'no_contesta', texto: 'No contesta', icono: '↻', clases: 'border-warn/40 text-warn hover:bg-warn-soft' },
  { clave: 'cita', texto: 'Cita agendada', icono: '▤', clases: 'border-primary/40 text-primary hover:bg-primary-soft' },
  { clave: 'perdido', texto: 'Perdido', icono: '✕', clases: 'border-danger/40 text-danger hover:bg-danger-soft' },
];

/**
 * Registro de llamada en un toque.
 *
 * Un comercial hace decenas de llamadas al día. Si apuntarlas cuesta abrir una
 * ficha, elegir un tipo y escribir, no se apuntan — y lo que no se apunta no
 * dispara la cadencia ni aparece en ninguna métrica.
 *
 * Dos toques: el botón y la salida. Los botones son grandes a propósito, porque
 * la mitad de esto se usa desde el móvil y con una mano.
 */
export function BotonLlamada({
  leadId,
  telefono,
  motivos,
}: {
  leadId: string;
  telefono: string | null;
  motivos: Motivo[];
}) {
  const router = useRouter();
  const { mostrar } = useAviso();
  const [abierto, setAbierto] = useState(false);
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);
  const [enviando, empezar] = useTransition();
  const [whatsapp, setWhatsapp] = useState<{ url: string; para: string } | null>(null);

  function registrar(salida: SalidaLlamada, motivoId?: string) {
    empezar(async () => {
      const r = await registrarLlamada(leadId, salida, motivoId);
      if (!r.ok) {
        mostrar({ texto: r.error, tono: 'error' });
        return;
      }
      mostrar({ texto: r.mensaje, tono: 'ok' });
      setAbierto(false);
      setPidiendoMotivo(false);
      setWhatsapp(r.whatsapp ? { url: r.whatsapp.url, para: r.whatsapp.para } : null);
      router.refresh();
      if (r.irA) router.push(r.irA);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {telefono && (
          <a
            href={`tel:${telefono}`}
            className="btn btn-primary flex-1"
            aria-label={`Llamar al ${telefono}`}
          >
            📞 Llamar
          </a>
        )}
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="btn btn-coral flex-1"
        >
          Registrar llamada
        </button>
      </div>

      {abierto && (
        <div className="rounded-lg border border-line bg-ground p-2">
          {!pidiendoMotivo ? (
            <div className="grid grid-cols-2 gap-2">
              {SALIDAS.map((s) => (
                <button
                  key={s.clave}
                  type="button"
                  disabled={enviando}
                  onClick={() =>
                    s.clave === 'perdido' ? setPidiendoMotivo(true) : registrar(s.clave)
                  }
                  className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-lg border-2 bg-surface px-2 py-2 text-[12.5px] font-semibold transition disabled:opacity-50 ${s.clases}`}
                >
                  <span aria-hidden className="text-base leading-none">
                    {s.icono}
                  </span>
                  {s.texto}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-ink2">
                Un caso perdido necesita motivo: sin él la métrica no dice nada.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {motivos.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    disabled={enviando}
                    onClick={() => registrar('perdido', m.id)}
                    className="rounded-lg border border-line2 bg-surface px-2.5 py-1.5 text-[12px] transition hover:border-danger hover:text-danger disabled:opacity-50"
                  >
                    {m.nombre}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPidiendoMotivo(false)}
                className="self-start text-xs text-muted hover:text-ink"
              >
                ← Volver
              </button>
            </div>
          )}
        </div>
      )}

      {whatsapp && (
        <div className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-ink ring-1 ring-warn/25">
          <p className="mb-1">
            Insiste por escrito si quieres. El mensaje no menciona el motivo de consulta.
          </p>
          <a
            href={whatsapp.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary hover:underline"
          >
            Abrir WhatsApp con {whatsapp.para} →
          </a>
        </div>
      )}
    </div>
  );
}
