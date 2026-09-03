import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { exigirAccesoClinico } from '../../guard';
import { enviarMensaje } from '../actions';
import { MensajesVivos } from './mensajes-vivos';

export default async function Conversacion({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { supabase, perfil } = await exigirAccesoClinico();

  const { data: conversacion } = await supabase
    .from('conversaciones')
    .select('id, titulo, paciente_id, paciente:pacientes (nombre)')
    .eq('id', id)
    .maybeSingle();
  if (!conversacion) notFound();

  const [{ data: mensajes }, { data: participantes }] = await Promise.all([
    supabase
      .from('mensajes')
      .select('id, cuerpo, autor_id, created_at')
      .eq('conversacion_id', id)
      .order('created_at')
      .limit(300),
    supabase
      .from('conversacion_participantes')
      .select('perfil_id, perfil:perfiles (nombre)')
      .eq('conversacion_id', id),
  ]);

  const nombres = Object.fromEntries(
    (participantes ?? []).map((p) => [p.perfil_id, p.perfil?.nombre ?? 'Alguien']),
  );

  // Marca de leído sin bloquear el render: no es crítico si falla.
  void supabase
    .from('conversacion_participantes')
    .update({ leido_at: new Date().toISOString() })
    .eq('conversacion_id', id)
    .eq('perfil_id', perfil.id);

  return (
    <AppShell
      seccion="chat"
      titulo={conversacion.titulo ?? 'Conversación'}
      descripcion={
        conversacion.paciente?.nombre
          ? `Sobre ${conversacion.paciente.nombre} · ${(participantes ?? []).length} participantes`
          : `${(participantes ?? []).length} participantes`
      }
      acciones={
        <Link href="/clinica/chat" className="btn btn-ghost">
          Todas
        </Link>
      }
    >
      {error && (
        <p className="mb-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-danger/25">
          {error}
        </p>
      )}

      <div className="panel flex flex-col p-3">
        <MensajesVivos
          conversacionId={id}
          iniciales={mensajes ?? []}
          yo={perfil.id}
          nombres={nombres}
        />

        <form action={enviarMensaje.bind(null, id)} className="mt-2 flex items-end gap-2 border-t border-line pt-3">
          <textarea
            name="cuerpo"
            rows={2}
            placeholder="Escribe un mensaje…"
            className="campo min-w-0 flex-1 resize-none"
            required
          />
          <button type="submit" className="btn btn-coral">
            Enviar
          </button>
        </form>
      </div>

      <p className="mt-3 text-xs text-muted">
        Participan: {(participantes ?? []).map((p) => p.perfil?.nombre).join(', ')}. Los mensajes no
        se editan ni se borran.
      </p>
    </AppShell>
  );
}
