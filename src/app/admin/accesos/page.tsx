import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { fechaCorta } from '@/lib/fechas';
import { dispositivo, quienEstaDentro } from '@/lib/accesos';
import { exigirDireccion } from '../guard';

/**
 * Quién entra y quién está dentro.
 *
 * Dos cosas distintas en una pantalla, y conviene tener claro que no son lo
 * mismo:
 *
 *   · Arriba, la presencia. Es OPERATIVA: sirve para saber a quién se le puede
 *     pasar un caso urgente ahora mismo, o para entender por qué no hay quien
 *     coja el teléfono. Por eso sale todo el equipo, no solo los conectados:
 *     saber quién NO está vale lo mismo que saber quién sí.
 *
 *   · Abajo, los accesos. Es de SEGURIDAD, y lo importante no son las entradas
 *     buenas: son las malas. Veinte fallos seguidos contra la misma cuenta de
 *     madrugada es exactamente lo que nadie ve hasta que ya es tarde.
 *
 * Lo que esta pantalla NO es, y no debe llegar a ser: un control horario. La
 * presencia guarda una marca por persona que se pisa a sí misma; no hay
 * historial de ayer, ni por dónde navega nadie, ni cuánto tiempo pasa en cada
 * sitio. Eso es una decisión, no un descuido.
 */
const VENTANAS = [1, 7, 30];

function espera(minutos: number) {
  if (!Number.isFinite(minutos)) return 'nunca';
  if (minutos < 1) return 'ahora mismo';
  if (minutos < 90) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 36) return horas === 1 ? 'hace 1 hora' : `hace ${horas} horas`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
}

function iniciales(nombre: string) {
  return nombre
    .trim()
    .split(/\s+/)
    .map((p) => p[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const ETIQUETA_ETAPA: Record<string, { hecho: string; fallo: string }> = {
  clave: { hecho: 'Entró', fallo: 'Contraseña incorrecta' },
  '2fa': { hecho: 'Pasó el segundo factor', fallo: 'Código de 2FA incorrecto' },
  salida: { hecho: 'Cerró sesión', fallo: 'Cerró sesión' },
};

const ETIQUETA_MOTIVO: Record<string, string> = {
  credenciales: 'usuario o contraseña incorrectos',
  demasiados: 'bloqueado por demasiados intentos',
  codigo: 'código incorrecto o caducado',
};

export default async function AdminAccesos({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string; solo?: string }>;
}) {
  const { dias: diasPedidos, solo } = await searchParams;
  const { supabase } = await exigirDireccion();

  const dias = VENTANAS.includes(Number(diasPedidos)) ? Number(diasPedidos) : 7;
  const soloFallidos = solo === 'fallidos';
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();

  let consulta = supabase
    .from('accesos')
    .select('id, email, exito, etapa, motivo, ip, agente, created_at, usuario:perfiles (nombre)')
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(200);
  if (soloFallidos) consulta = consulta.eq('exito', false);

  const [presencia, { data: accesos }, { count: fallidos24 }] = await Promise.all([
    quienEstaDentro(supabase),
    consulta,
    supabase
      .from('accesos')
      .select('id', { count: 'exact', head: true })
      .eq('exito', false)
      .gte('created_at', new Date(Date.now() - 86_400_000).toISOString()),
  ]);

  const dentro = presencia.gente.filter((p) => p.ahora);
  const fuera = presencia.gente.filter((p) => !p.ahora);

  /*
   * Cuentas e IPs distintas entre los fallos. Un mismo despistado tecleando mal
   * su contraseña cinco veces no se parece en nada a cinco cuentas distintas
   * probadas desde la misma IP, y el total a secas no distingue entre las dos.
   */
  const delPeriodo = accesos ?? [];
  const fallosPeriodo = delPeriodo.filter((a) => !a.exito);
  const cuentasAtacadas = new Set(fallosPeriodo.map((a) => a.email)).size;
  const ipsDeFallos = new Set(fallosPeriodo.map((a) => a.ip).filter(Boolean)).size;

  return (
    <AppShell
      seccion="admin"
      subseccion="/admin/accesos"
      titulo="Accesos y presencia"
      descripcion="Quién está dentro ahora y quién ha intentado entrar"
    >
      {/* --- Quién está dentro -------------------------------------------- */}
      <section className="panel mb-5 p-4">
        <h2 className="mb-1 text-sm font-semibold">
          Dentro ahora{' '}
          <span className="font-normal text-ink2">
            ({dentro.length} de {presencia.gente.length})
          </span>
        </h2>
        <p className="mb-3 max-w-[72ch] text-xs text-ink2">
          Con la aplicación abierta y a la vista en los últimos {presencia.ventanaMinutos} minutos.
          Una pestaña de fondo o un móvil bloqueado dejan de contar solos: si dijera que sí a quien
          no está mirando, no serviría para lo único que sirve, que es saber a quién pasarle algo
          ahora.
        </p>

        {dentro.length === 0 ? (
          <p className="text-sm text-muted">Nadie con la aplicación abierta en este momento.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {dentro.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-full bg-ok-soft py-1 pl-1 pr-3 ring-1 ring-ok/25"
              >
                <span className="avatar h-7 w-7 text-[11px]">{iniciales(p.nombre)}</span>
                <span className="text-[13px] font-medium">{p.nombre}</span>
                <span className="text-[11.5px] text-ink2">{p.rol}</span>
              </li>
            ))}
          </ul>
        )}

        {fuera.length > 0 && (
          <>
            <h3 className="mb-2 mt-4 text-[11px] uppercase tracking-[0.1em] text-muted">
              Ahora mismo no
            </h3>
            <ul className="flex flex-col gap-1.5 text-[13px]">
              {fuera.map((p) => (
                <li
                  key={p.id}
                  className="flex justify-between gap-3 border-b border-dashed border-line pb-1.5 last:border-0"
                >
                  <span>
                    {p.nombre} <span className="text-ink2">· {p.rol}</span>
                  </span>
                  <span className="shrink-0 text-muted">
                    {p.vistoAt ? espera(p.minutos) : 'no ha entrado nunca'}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* --- Ventana ------------------------------------------------------ */}
      <nav className="mb-3 flex flex-wrap items-center gap-1 rounded-lg bg-surface2 p-1 text-sm">
        {VENTANAS.map((d) => (
          <Link
            key={d}
            href={`/admin/accesos?dias=${d}${soloFallidos ? '&solo=fallidos' : ''}`}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              dias === d ? 'bg-surface text-primary shadow-sm' : 'text-ink2 hover:bg-surface/60'
            }`}
          >
            {d === 1 ? 'Últimas 24 h' : `${d} días`}
          </Link>
        ))}
        <Link
          href={`/admin/accesos?dias=${dias}${soloFallidos ? '' : '&solo=fallidos'}`}
          className={`ml-2 rounded-md px-3 py-1.5 font-medium transition ${
            soloFallidos ? 'bg-surface text-danger shadow-sm' : 'text-ink2 hover:bg-surface/60'
          }`}
        >
          Solo los fallidos
        </Link>
      </nav>

      {/* --- Señales de que alguien está probando -------------------------- */}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="panel p-4">
          <p className="text-[11.5px] text-ink2">Intentos fallidos en 24 h</p>
          <b
            className={`num mt-1 block text-[19px] font-bold ${
              (fallidos24 ?? 0) > 10 ? 'text-danger' : 'text-ink'
            }`}
          >
            {fallidos24 ?? 0}
          </b>
          <p className="mt-0.5 text-[12.5px] text-ink2">
            unos pocos son gente tecleando mal; muchos, no
          </p>
        </div>
        <div className="panel p-4">
          <p className="text-[11.5px] text-ink2">Cuentas distintas con fallos</p>
          <b className="num mt-1 block text-[19px] font-bold">{cuentasAtacadas}</b>
          <p className="mt-0.5 text-[12.5px] text-ink2">
            varias a la vez es otra cosa que uno olvidándose
          </p>
        </div>
        <div className="panel p-4">
          <p className="text-[11.5px] text-ink2">Sitios distintos con fallos</p>
          <b className="num mt-1 block text-[19px] font-bold">{ipsDeFallos}</b>
          <p className="mt-0.5 text-[12.5px] text-ink2">direcciones IP desde las que se falló</p>
        </div>
      </div>

      {/* --- El registro --------------------------------------------------- */}
      <section className="panel p-4">
        <h2 className="mb-3 text-sm font-semibold">
          {soloFallidos ? 'Intentos fallidos' : 'Movimientos'}{' '}
          <span className="font-normal text-ink2">
            ({delPeriodo.length}
            {delPeriodo.length === 200 ? ', se enseñan los 200 últimos' : ''})
          </span>
        </h2>

        {delPeriodo.length === 0 ? (
          <p className="text-sm text-muted">
            {soloFallidos
              ? 'Ningún intento fallido en esta ventana. Es la mejor noticia de esta pantalla.'
              : 'Ningún movimiento registrado en esta ventana.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla w-full text-[13px]">
              <thead>
                <tr>
                  <th className="text-left">Cuándo</th>
                  <th className="text-left">Quién</th>
                  <th className="text-left">Qué pasó</th>
                  <th className="text-left">Desde dónde</th>
                </tr>
              </thead>
              <tbody>
                {delPeriodo.map((a) => {
                  const etiqueta = ETIQUETA_ETAPA[a.etapa] ?? { hecho: a.etapa, fallo: a.etapa };
                  const nombre = (a.usuario as { nombre: string } | null)?.nombre;
                  return (
                    <tr key={a.id} className={a.exito ? '' : 'bg-danger-soft/40'}>
                      <td className="num whitespace-nowrap">{fechaCorta(a.created_at)}</td>
                      <td>
                        {nombre ? (
                          <>
                            {nombre}
                            <span className="block text-[11.5px] text-muted">{a.email}</span>
                          </>
                        ) : (
                          <>
                            <span className="text-ink2">{a.email}</span>
                            {/*
                              Un correo que no es de nadie del equipo no es un
                              despiste: es alguien probando nombres.
                            */}
                            <span className="block text-[11.5px] text-danger">
                              no hay ninguna cuenta con ese correo
                            </span>
                          </>
                        )}
                      </td>
                      <td className={a.exito ? 'text-ink2' : 'font-medium text-danger'}>
                        {a.exito ? etiqueta.hecho : etiqueta.fallo}
                        {!a.exito && a.motivo && (
                          <span className="block text-[11.5px] font-normal text-ink2">
                            {ETIQUETA_MOTIVO[a.motivo] ?? a.motivo}
                          </span>
                        )}
                      </td>
                      <td className="text-ink2">
                        <span className="num">{a.ip ?? '—'}</span>
                        <span className="block text-[11.5px] text-muted">
                          {dispositivo(a.agente)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-muted">
          Guarda dirección IP, que es dato personal, así que se conserva un plazo corto y el motor
          borra lo viejo en cada pasada. Las filas las escribe el servidor: nadie puede añadirlas ni
          cambiarlas desde la aplicación, tampoco dirección — si se pudiera, se podrían esconder ahí
          los propios intentos.
        </p>
      </section>
    </AppShell>
  );
}
