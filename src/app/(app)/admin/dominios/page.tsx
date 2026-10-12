import { AppShell } from '@/components/app-shell';
import { exigirDireccion } from '../guard';
import { Avisos, botonAdmin, botonAdminSecundario, inputAdmin } from '../nav';
import { claveConfigurada, type RegistroDns } from '@/lib/dominios-correo';
import { anadirDominio, comprobarDominio, quitarDominio } from './actions';

/**
 * Dominios de correo: darlos de alta, ver qué hay que pegar en el DNS y saber si
 * ya verifican. Todo desde aquí; lo único que queda fuera es el DNS.
 */

const ESTADO: Record<string, { texto: string; clase: string }> = {
  not_started: { texto: 'Sin empezar', clase: 'chip-mut' },
  pending: { texto: 'Comprobando', clase: 'chip-warn' },
  verified: { texto: 'Verificado', clase: 'chip-ok' },
  failed: { texto: 'Falla', clase: 'chip-danger' },
  temporary_failure: { texto: 'Fallo temporal', clase: 'chip-warn' },
};

function chip(estado: string) {
  const e = ESTADO[estado] ?? { texto: estado, clase: 'chip-mut' };
  return <span className={`chip ${e.clase}`}>{e.texto}</span>;
}

function cuando(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function AdminDominios({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; aviso?: string }>;
}) {
  const { error, aviso } = await searchParams;
  const { supabase, perfil } = await exigirDireccion();
  const esDeGrupo = perfil?.alcance === 'grupo';

  const [{ data: dominios }, { data: centros }] = await Promise.all([
    supabase.from('dominios_correo').select('*').order('dominio'),
    supabase.from('centros').select('nombre, email_remitente').not('email_remitente', 'is', null),
  ]);

  const hayClave = claveConfigurada();
  const remitenteGlobal = process.env.EMAIL_REMITENTE ?? '';

  // Qué centro firma con cada dominio, para verlo de un vistazo.
  const usoDe = (dominio: string) =>
    (centros ?? [])
      .filter((c) => {
        const correo = (c.email_remitente ?? '').match(/<([^>]+)>/)?.[1] ?? c.email_remitente ?? '';
        const d = correo.split('@')[1]?.toLowerCase() ?? '';
        return d === dominio || d.endsWith('.' + dominio);
      })
      .map((c) => c.nombre);

  return (
    <AppShell
      titulo="Dominios de correo"
      descripcion="Desde qué dominios sale el email: el CRM los da de alta, te dice qué pegar en el DNS y comprueba solo cuando están"
    >
      <Avisos error={error} aviso={aviso} />

      {!hayClave && (
        <div className="mt-3 rounded-lg bg-warn-soft px-4 py-3 text-sm ring-1 ring-warn/25">
          <p className="font-medium text-warn-ink">Falta la clave de Resend en el servidor</p>
          <p className="mt-1 text-ink2">
            Crea una cuenta en Resend, genera una clave con <b>acceso completo</b> (no solo de
            envío: hace falta para crear dominios) y ponla en Vercel como{' '}
            <code>RESEND_API_KEY</code>, junto con <code>EMAIL_REMITENTE</code>. Al redesplegar,
            esta pantalla funciona sola.
          </p>
        </div>
      )}

      {/* ---------------- Alta ---------------- */}
      {esDeGrupo && (
        <section className="panel mt-4 p-4">
          <h2 className="mb-1 text-sm font-semibold">Añadir un dominio</h2>
          <p className="mb-3 text-xs text-ink2">
            Uno por web: el de cada centro para que su correo salga firmado por él. Se crea en la
            región de la UE. Después aparecerán los registros que hay que pegar en el DNS.
          </p>
          <form action={anadirDominio} className="flex flex-wrap gap-2">
            <input
              name="dominio"
              placeholder="bellamarcentro.com"
              className={`${inputAdmin} min-w-64 flex-1 font-mono`}
              required
              disabled={!hayClave}
            />
            <button type="submit" className={botonAdmin} disabled={!hayClave}>
              Dar de alta
            </button>
          </form>
        </section>
      )}

      {/* ---------------- Lista ---------------- */}
      {(dominios ?? []).length === 0 ? (
        <p className="panel mt-4 px-4 py-8 text-center text-sm text-ink2">
          Todavía no hay dominios.{' '}
          {remitenteGlobal ? `Mientras tanto todo sale desde ${remitenteGlobal}.` : ''}
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {(dominios ?? []).map((d) => {
            const registros = (d.registros ?? []) as unknown as RegistroDns[];
            const usa = usoDe(d.dominio);
            return (
              <section key={d.id} className="panel p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-mono text-base font-semibold">{d.dominio}</h2>
                  {chip(d.estado)}
                  <span className="text-xs text-ink2">
                    {d.estado === 'verified'
                      ? `verificado ${cuando(d.verificado_at)}`
                      : `última comprobación ${cuando(d.ultimo_chequeo_at)}`}
                    {usa.length > 0 ? ` · firma: ${usa.join(', ')}` : ''}
                  </span>
                  {esDeGrupo && (
                    <span className="ml-auto flex gap-2">
                      {d.estado !== 'verified' && (
                        <form action={comprobarDominio.bind(null, d.id)}>
                          <button
                            type="submit"
                            className={botonAdminSecundario}
                            disabled={!hayClave}
                          >
                            Comprobar ahora
                          </button>
                        </form>
                      )}
                      <form action={quitarDominio.bind(null, d.id)}>
                        <button type="submit" className="text-xs text-muted hover:text-danger">
                          quitar
                        </button>
                      </form>
                    </span>
                  )}
                </div>

                {d.ultimo_error && (
                  <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger ring-1 ring-danger/25">
                    {d.ultimo_error}
                  </p>
                )}

                {d.estado !== 'verified' && (
                  <p className="mt-3 text-xs text-ink2">
                    Pega estos registros en el DNS de <b>{d.dominio}</b>. En el campo <i>host</i>{' '}
                    pon solo lo que aparece en «Nombre» (sin el dominio). Si tu DNS es Cloudflare,
                    desactiva el proxy (nube naranja) en estos registros. El CRM comprobará solo
                    cada 15 minutos; suele verificar en minutos, pero el DNS puede tardar horas.
                  </p>
                )}

                <div className="mt-3 overflow-x-auto">
                  <table className="tabla w-full text-xs">
                    <thead>
                      <tr>
                        <th>Para</th>
                        <th>Tipo</th>
                        <th>Nombre (host)</th>
                        <th>Valor</th>
                        <th>Prioridad</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registros.map((r, i) => (
                        <tr key={i}>
                          <td>{r.registro}</td>
                          <td className="font-mono">{r.tipo}</td>
                          <td className="font-mono">{r.nombre}</td>
                          <td className="max-w-md break-all font-mono">{r.valor}</td>
                          <td className="num">{r.prioridad ?? '—'}</td>
                          <td>{chip(r.estado)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-xs text-muted">
        El remitente de cada centro se pone en Administración → Centros, y solo se admite sobre un
        dominio verificado: un remitente que no verifica no falla al guardar, falla al enviar.
      </p>
    </AppShell>
  );
}
