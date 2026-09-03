import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { fecha } from '@/lib/fechas';
import {
  cancelarCampana,
  enviarPrueba,
  guardarCampana,
  programarCampana,
  revisarCampana,
} from '../actions';

const CHIP_ESTADO: Record<string, { texto: string; clase: string }> = {
  borrador: { texto: 'Borrador', clase: 'chip-mut' },
  programada: { texto: 'Programada', clase: 'chip-primary' },
  enviando: { texto: 'Enviando', clase: 'chip-warn' },
  enviada: { texto: 'Enviada', clase: 'chip-ok' },
  cancelada: { texto: 'Cancelada', clase: 'chip-danger' },
};

export default async function EditorCampana({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string; error?: string }>;
}) {
  const { id } = await params;
  const { aviso, error } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .maybeSingle();
  if (perfil?.rol !== 'direccion') redirect('/leads');

  const [{ data: campana }, { data: listas }] = await Promise.all([
    supabase
      .from('campanas_email')
      .select('*, lista:listas (nombre, tipo)')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('listas').select('id, nombre, tipo').order('nombre'),
  ]);

  if (!campana) notFound();

  const editable = campana.estado === 'borrador' || campana.estado === 'programada';
  const estado = CHIP_ESTADO[campana.estado] ?? { texto: campana.estado, clase: 'chip-mut' };

  const { data: fallidos } = await supabase
    .from('campana_destinatarios')
    .select('email, error')
    .eq('campana_id', id)
    .eq('estado', 'fallido')
    .limit(10);

  return (
    <AppShell
      seccion="marketing"
      subseccion="/marketing"
      titulo={campana.nombre}
      descripcion={`Campaña de email · ${estado.texto}`}
      acciones={
        <Link href="/marketing" className="btn btn-ghost">
          Todas las campañas
        </Link>
      }
    >
      {aviso && (
        <p className="mb-4 rounded-lg bg-ok-soft px-4 py-3 text-sm text-ok ring-1 ring-ok/25">{aviso}</p>
      )}
      {error && (
        <p className="mb-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-danger/25">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="panel p-4">
          <h2 className="mb-3 text-sm font-semibold">Contenido</h2>

          {!editable && (
            <p className="mb-3 rounded-lg bg-surface2 px-3 py-2 text-xs text-ink2">
              Esta campaña ya no se puede editar: está en «{estado.texto}».
            </p>
          )}

          <form action={guardarCampana.bind(null, id)} className="flex flex-col gap-3">
            <label className="block">
              <span className="etiqueta-campo">Nombre interno</span>
              <input
                name="nombre"
                defaultValue={campana.nombre}
                className="campo w-full"
                disabled={!editable}
                required
              />
            </label>

            <label className="block">
              <span className="etiqueta-campo">Asunto</span>
              <input
                name="asunto"
                defaultValue={campana.asunto}
                className="campo w-full"
                disabled={!editable}
                required
              />
            </label>

            <label className="block">
              <span className="etiqueta-campo">A quién se envía</span>
              <select
                name="lista"
                defaultValue={campana.lista_id ?? ''}
                className="campo w-full"
                disabled={!editable}
              >
                <option value="">Elegir lista o segmento…</option>
                {(listas ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre} ({l.tipo === 'dinamica' ? 'segmento' : 'lista'})
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-muted">
                De esa lista solo entran quienes tengan consentimiento registrado y email. Un
                segmento se resuelve en el momento del envío, no ahora.
              </span>
            </label>

            <label className="block">
              <span className="etiqueta-campo">Cuerpo en texto (obligatorio)</span>
              <textarea
                name="cuerpo_texto"
                defaultValue={campana.cuerpo_texto}
                rows={10}
                className="campo w-full font-mono text-[12.5px]"
                disabled={!editable}
                required
              />
              <span className="mt-1 block text-xs text-muted">
                Usa <code>{'{nombre}'}</code> para el nombre de la persona. El pie con el enlace de
                baja se añade solo: no hay que escribirlo.
              </span>
            </label>

            <label className="block">
              <span className="etiqueta-campo">Cuerpo en HTML (opcional)</span>
              <textarea
                name="cuerpo_html"
                defaultValue={campana.cuerpo_html ?? ''}
                rows={8}
                className="campo w-full font-mono text-[12.5px]"
                disabled={!editable}
              />
            </label>

            {editable && (
              <div>
                <button type="submit" className="btn btn-primary">
                  Guardar cambios
                </button>
              </div>
            )}
          </form>
        </section>

        <div className="flex flex-col gap-4">
          <section className="panel p-4">
            <h2 className="mb-3 text-sm font-semibold">Resultados</h2>
            <dl className="flex flex-col gap-2 text-[13px]">
              {[
                ['Destinatarios', campana.total_destinatarios],
                ['Enviados', campana.total_enviados],
                ['Aperturas', campana.total_aperturas],
                ['Clics', campana.total_clics],
                ['Bajas', campana.total_bajas],
                ['Fallidos', campana.total_fallidos],
              ].map(([texto, valor]) => (
                <div key={texto as string} className="flex justify-between">
                  <dt className="text-ink2">{texto}</dt>
                  <dd className="font-semibold tabular-nums">{valor as number}</dd>
                </div>
              ))}
            </dl>
            {campana.enviada_at && (
              <p className="mt-3 text-xs text-muted">Terminó el {fecha(campana.enviada_at)}</p>
            )}
            {campana.programada_para && campana.estado === 'programada' && (
              <p className="mt-3 text-xs text-muted">Saldrá el {fecha(campana.programada_para)}</p>
            )}
          </section>

          {editable && (
            <>
              <section className="panel p-4">
                <h2 className="mb-1 text-sm font-semibold">Antes de enviar</h2>
                <p className="mb-3 text-xs text-ink2">
                  Comprueba cuánta gente recibiría la campaña y que el texto no menciona nada
                  clínico.
                </p>
                <form action={revisarCampana.bind(null, id)}>
                  <button type="submit" className="btn btn-ghost w-full">
                    Revisar
                  </button>
                </form>

                <form action={enviarPrueba.bind(null, id)} className="mt-3 flex gap-2">
                  <input
                    name="email_prueba"
                    type="email"
                    placeholder="tu@correo.com"
                    className="campo min-w-0 flex-1"
                    required
                  />
                  <button type="submit" className="btn btn-ghost">
                    Prueba
                  </button>
                </form>
              </section>

              <section className="panel p-4">
                <h2 className="mb-3 text-sm font-semibold">Programar</h2>
                <form action={programarCampana.bind(null, id)} className="flex flex-col gap-2">
                  <input
                    name="cuando"
                    type="datetime-local"
                    defaultValue={
                      campana.programada_para
                        ? new Date(campana.programada_para).toISOString().slice(0, 16)
                        : undefined
                    }
                    className="campo w-full"
                    required
                  />
                  <button type="submit" className="btn btn-coral">
                    {campana.estado === 'programada' ? 'Cambiar la hora' : 'Programar envío'}
                  </button>
                </form>
                <p className="mt-2 text-xs text-muted">
                  El motor la envía por lotes, no de golpe: así un proveedor de correo no la corta a
                  la mitad.
                </p>
              </section>
            </>
          )}

          {campana.estado !== 'enviada' && campana.estado !== 'cancelada' && (
            <form action={cancelarCampana.bind(null, id)}>
              <button type="submit" className="btn btn-ghost w-full text-danger">
                Cancelar campaña
              </button>
            </form>
          )}

          {(fallidos ?? []).length > 0 && (
            <section className="panel p-4">
              <h2 className="mb-2 text-sm font-semibold text-danger">Envíos fallidos</h2>
              <ul className="flex flex-col gap-1.5 text-xs text-ink2">
                {(fallidos ?? []).map((f) => (
                  <li key={f.email}>
                    <b>{f.email}</b>
                    <span className="block text-muted">{f.error}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </AppShell>
  );
}
