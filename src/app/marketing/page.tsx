import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { fecha } from '@/lib/fechas';
import { emailConfigurado } from '@/lib/email';
import { crearCampana } from './actions';

const CHIP_ESTADO: Record<string, { texto: string; clase: string }> = {
  borrador: { texto: 'Borrador', clase: 'chip-mut' },
  programada: { texto: 'Programada', clase: 'chip-primary' },
  enviando: { texto: 'Enviando', clase: 'chip-warn' },
  enviada: { texto: 'Enviada', clase: 'chip-ok' },
  cancelada: { texto: 'Cancelada', clase: 'chip-danger' },
};

function porcentaje(parte: number, total: number): string {
  if (total === 0) return '—';
  return `${Math.round((parte / total) * 100)}%`;
}

export default async function Marketing({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string; error?: string }>;
}) {
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

  const [{ data: campanas }, { data: plantillas }, { count: conConsentimiento }] = await Promise.all([
    supabase
      .from('campanas_email')
      .select(
        'id, nombre, asunto, estado, programada_para, enviada_at, total_destinatarios, total_enviados, total_aperturas, total_clics, total_bajas, created_at, lista:listas (nombre)',
      )
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('plantillas_email').select('id, nombre').eq('activa', true).order('nombre'),
    supabase
      .from('contactos')
      .select('id', { count: 'exact', head: true })
      .eq('consentimiento_marketing', true)
      .not('email', 'is', null),
  ]);

  const hayCorreo = emailConfigurado();

  return (
    <AppShell
      seccion="marketing"
      subseccion="/marketing"
      titulo="Campañas de email"
      descripcion={`${conConsentimiento ?? 0} contacto(s) con consentimiento y email — la base a la que se puede escribir`}
    >
      {aviso && (
        <p className="mb-4 rounded-lg bg-ok-soft px-4 py-3 text-sm text-ok ring-1 ring-ok/25">{aviso}</p>
      )}
      {error && (
        <p className="mb-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-danger/25">
          {error}
        </p>
      )}

      {!hayCorreo && (
        <p className="mb-4 rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn ring-1 ring-warn/25">
          No hay proveedor de correo configurado. Puedes redactar y programar campañas, pero no
          saldrá ninguna hasta que se definan <code>RESEND_API_KEY</code> y{' '}
          <code>EMAIL_REMITENTE</code> en el servidor.
        </p>
      )}

      <section className="panel mb-5 p-4">
        <h2 className="mb-1 text-sm font-semibold">Nueva campaña</h2>
        <p className="mb-3 text-xs text-ink2">
          Solo se envía a quien dio su consentimiento explícito, y el contenido nunca puede revelar
          el motivo de consulta: la plataforma revisa el texto antes de dejar programar.
        </p>
        <form action={crearCampana} className="flex flex-wrap items-center gap-2">
          <input
            name="nombre"
            placeholder="Nombre interno (p. ej. «Charla Lolo octubre»)"
            className="campo min-w-64 flex-1"
            required
          />
          <select name="plantilla" defaultValue="" className="campo">
            <option value="">Empezar en blanco</option>
            {(plantillas ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                Desde «{p.nombre}»
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-coral">
            Crear
          </button>
        </form>
      </section>

      {(campanas ?? []).length === 0 ? (
        <p className="panel px-4 py-8 text-center text-sm text-ink2">
          Todavía no hay campañas.
        </p>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Campaña</th>
                <th>Destino</th>
                <th>Estado</th>
                <th className="text-right">Enviados</th>
                <th className="text-right">Aperturas</th>
                <th className="text-right">Clics</th>
                <th className="text-right">Bajas</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {(campanas ?? []).map((c) => {
                const estado = CHIP_ESTADO[c.estado] ?? { texto: c.estado, clase: 'chip-mut' };
                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/marketing/${c.id}`} className="font-semibold text-primary hover:underline">
                        {c.nombre}
                      </Link>
                      <span className="block text-xs text-muted">{c.asunto}</span>
                    </td>
                    <td className="text-ink2">{c.lista?.nombre ?? '—'}</td>
                    <td>
                      <span className={`chip ${estado.clase}`}>{estado.texto}</span>
                    </td>
                    <td className="text-right tabular-nums">
                      {c.total_enviados}
                      {c.total_destinatarios > 0 && (
                        <span className="text-muted"> / {c.total_destinatarios}</span>
                      )}
                    </td>
                    <td className="text-right tabular-nums">
                      {porcentaje(c.total_aperturas, c.total_enviados)}
                    </td>
                    <td className="text-right tabular-nums">
                      {porcentaje(c.total_clics, c.total_enviados)}
                    </td>
                    <td className="text-right tabular-nums">{c.total_bajas}</td>
                    <td className="text-ink2">
                      {fecha(c.enviada_at ?? c.programada_para ?? c.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-muted">
        Las tasas de apertura son orientativas: quien bloquea imágenes no cuenta y algunos gestores
        de correo abren los mensajes por su cuenta. Sirven para comparar campañas entre sí.
      </p>
    </AppShell>
  );
}
