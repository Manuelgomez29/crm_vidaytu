import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { fechaCorta } from '@/lib/fechas';
import {
  estadoDelMotor,
  historicoDelMotor,
  MINUTOS_ENTRE_PASADAS,
  QUE_HACE,
  type Pasada,
} from '@/lib/salud-motor';
import { exigirDireccion } from '../guard';

/**
 * Histórico del motor de automatizaciones.
 *
 * El panel avisa cuando algo va mal. Esta pantalla es para la otra pregunta, la
 * que no tiene alarma: «¿esto lleva semanas funcionando?». Y esa no se contesta
 * mirando errores —no fallar y no ejecutarse se parecen muchísimo si solo miras
 * los errores—, sino mirando si ha corrido SIEMPRE, al ritmo previsto.
 *
 * Por eso el número más importante de aquí no es cuántas pasadas fallaron: es el
 * hueco más largo entre dos pasadas seguidas.
 */
const VENTANAS = [1, 7, 30];

/** «1,1 s» o «340 ms». Los segundos con una cifra bastan para lo que se decide aquí. */
function duracion(ms: number | null) {
  if (ms === null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
}

function espera(minutos: number) {
  if (minutos < 90) return `${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 36) return horas === 1 ? '1 hora' : `${horas} horas`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? '1 día' : `${dias} días`;
}

function Dato({
  titulo,
  valor,
  pie,
  tono = 'normal',
}: {
  titulo: string;
  valor: string;
  pie: string;
  tono?: 'normal' | 'bien' | 'mal';
}) {
  const color = tono === 'bien' ? 'text-ok' : tono === 'mal' ? 'text-danger' : 'text-ink';
  return (
    <div className="panel p-4">
      <p className="text-[11.5px] text-ink2">{titulo}</p>
      <b className={`num mt-1 block text-[19px] font-bold ${color}`}>{valor}</b>
      <p className="mt-0.5 text-[12.5px] text-ink2">{pie}</p>
    </div>
  );
}

/** Lo que hizo una pasada, en palabras. Los ceros no se enseñan: son casi todos. */
function loQueHizo(pasada: Pasada) {
  return QUE_HACE.filter((q) => (pasada.resultado[q.clave] ?? 0) > 0).map(
    (q) => `${pasada.resultado[q.clave]} ${q.texto.toLowerCase()}`,
  );
}

export default async function AdminMotor({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  const { dias: diasPedidos } = await searchParams;
  const { supabase } = await exigirDireccion();

  const dias = VENTANAS.includes(Number(diasPedidos)) ? Number(diasPedidos) : 7;

  const [estado, historico] = await Promise.all([
    estadoDelMotor(supabase),
    historicoDelMotor(supabase, dias),
  ]);

  /*
   * Cobertura: cuántas de las pasadas previstas ocurrieron de verdad.
   *
   * Se limita a 100 % porque el cron puede dispararse alguna vez de más —una
   * llamada manual, un reintento— y un 103 % no significa nada bueno ni malo,
   * solo distrae del caso que importa, que es quedarse corto.
   */
  const cobertura = historico.esperadas
    ? Math.min(100, Math.round((historico.total / historico.esperadas) * 100))
    : 0;

  /* Un hueco es sospechoso a partir del triple del ritmo previsto: 45 min. */
  const huecoFeo =
    historico.huecoMaximoMin !== null && historico.huecoMaximoMin > MINUTOS_ENTRE_PASADAS * 3;

  return (
    <AppShell
      seccion="admin"
      subseccion="/admin/motor"
      titulo="Motor de automatizaciones"
      descripcion={`Reparto, alertas, cadencia, recordatorios y reactivaciones · previsto cada ${MINUTOS_ENTRE_PASADAS} min`}
    >
      {/* --- Estado ahora mismo ------------------------------------------- */}
      {estado.nuncaHaCorrido ? (
        <p className="mb-4 rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn-ink ring-1 ring-warn/25">
          <b>No ha corrido nunca en este entorno.</b> Aquí no se reparten leads solos, ni salen
          alertas de SLA o de cadencia, ni se mandan recordatorios. En staging es lo normal: los
          cron solo se ejecutan en producción. En producción significa que el cron no está activo.
        </p>
      ) : estado.parado ? (
        <p className="mb-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-danger/25">
          <b>Lleva {espera(estado.minutosDesdeBuena!)} sin una pasada correcta.</b> Mientras siga
          así, el trabajo no se pierde pero se queda esperando: nadie recibe avisos, y no recibir
          avisos se parece mucho a no tener nada pendiente.
        </p>
      ) : (
        <p className="mb-4 rounded-lg bg-ok-soft px-4 py-3 text-sm text-ok ring-1 ring-ok/25">
          <b>Funcionando.</b> Última pasada correcta hace {espera(estado.minutosDesdeBuena!)}.
        </p>
      )}

      {/* --- Ventana ------------------------------------------------------ */}
      <nav className="mb-3 flex flex-wrap items-center gap-1 rounded-lg bg-surface2 p-1 text-sm">
        {VENTANAS.map((d) => (
          <Link
            key={d}
            href={`/admin/motor?dias=${d}`}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              dias === d ? 'bg-surface text-primary shadow-sm' : 'text-ink2 hover:bg-surface/60'
            }`}
          >
            {d === 1 ? 'Últimas 24 h' : `${d} días`}
          </Link>
        ))}
        <span className="ml-auto pr-2 text-xs text-muted">
          El registro guarda 30 días; lo anterior se borra solo.
        </span>
      </nav>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Dato
          titulo="Pasadas registradas"
          valor={`${historico.total}`}
          pie={
            historico.desde && historico.esperadas < (dias * 24 * 60) / MINUTOS_ENTRE_PASADAS
              ? `de ${historico.esperadas} previstas desde que hay registro · ${cobertura} %`
              : `de ${historico.esperadas} previstas · ${cobertura} %`
          }
          tono={cobertura >= 95 ? 'bien' : cobertura >= 80 ? 'normal' : 'mal'}
        />
        <Dato
          titulo="Pasadas con algún fallo"
          valor={`${historico.conFallo}`}
          pie={historico.conFallo === 0 ? 'ninguna, ni una fase' : 'abajo está qué falló'}
          tono={historico.conFallo === 0 ? 'bien' : 'mal'}
        />
        <Dato
          titulo="Hueco más largo"
          valor={historico.huecoMaximoMin === null ? '—' : espera(historico.huecoMaximoMin)}
          pie={
            historico.huecoMaximoMin === null
              ? 'hacen falta dos pasadas para medirlo'
              : huecoFeo
                ? `se saltó pasadas (previsto: ${MINUTOS_ENTRE_PASADAS} min)`
                : 'sin saltarse ninguna'
          }
          tono={historico.huecoMaximoMin === null ? 'normal' : huecoFeo ? 'mal' : 'bien'}
        />
        <Dato
          titulo="Duración típica"
          valor={duracion(historico.medianaMs)}
          pie="mediana, no media: una lenta no tiñe el resto"
        />
      </div>

      {/* --- Para qué ha servido ------------------------------------------ */}
      <section className="panel mb-5 p-4">
        <h2 className="mb-1 text-sm font-semibold">Lo que ha hecho</h2>
        <p className="mb-3 max-w-[72ch] text-xs text-ink2">
          Todo esto habría que hacerlo a mano, o no se haría. Es la respuesta a «¿y esto para qué
          sirve?» en {dias === 1 ? 'las últimas 24 horas' : `los últimos ${dias} días`}.
        </p>
        {historico.totales.length === 0 ? (
          <p className="text-sm text-muted">
            No ha hecho nada en esta ventana. Con pocos casos abiertos es normal: el motor solo
            actúa cuando hay algo que hacer, y no hacer nada no es lo mismo que no funcionar.
          </p>
        ) : (
          <ul className="grid gap-1.5 text-[13px] sm:grid-cols-2">
            {historico.totales.map((t) => (
              <li
                key={t.texto}
                className="flex items-baseline justify-between gap-3 border-b border-dashed border-line pb-1.5"
              >
                <span className="text-ink2">{t.texto}</span>
                <b className="num shrink-0">
                  {t.cantidad} {t.cantidad === 1 ? t.unidad : t.unidades}
                </b>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- Fases que fallaron ------------------------------------------- */}
      {historico.fasesConFallo.length > 0 && (
        <section className="panel mb-5 p-4">
          <h2 className="mb-1 text-sm font-semibold">Fases que han fallado</h2>
          <p className="mb-3 max-w-[72ch] text-xs text-ink2">
            Una fase averiada no tumba a las demás: se anota y la pasada continúa. Por eso puede
            haber fallos aquí sin que nada más se haya parado — pero lo que falla, no se hace.
          </p>
          <ul className="flex flex-col gap-2 text-[13px]">
            {historico.fasesConFallo.map((f) => (
              <li key={f.fase} className="rounded-lg bg-danger-soft/50 px-3 py-2">
                <p className="flex justify-between gap-3">
                  <b className="text-danger">{f.fase}</b>
                  <span className="num shrink-0 text-ink2">
                    {f.veces === 1 ? '1 vez' : `${f.veces} veces`}
                  </span>
                </p>
                <p className="mt-0.5 break-words font-mono text-[12px] text-ink2">
                  {f.ultimoError}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --- Las pasadas, una a una --------------------------------------- */}
      <section className="panel p-4">
        <h2 className="mb-3 text-sm font-semibold">
          Pasadas{' '}
          <span className="font-normal text-ink2">
            ({historico.total}
            {historico.total > 60 ? ', se enseñan las 60 últimas' : ''})
          </span>
        </h2>

        {historico.total === 0 ? (
          <p className="text-sm text-muted">
            Ninguna pasada en esta ventana.
            {estado.nuncaHaCorrido ? ' El motor no ha arrancado aquí todavía.' : ''}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla w-full text-[13px]">
              <thead>
                <tr>
                  <th className="text-left">Cuándo</th>
                  <th className="text-right">Duró</th>
                  <th className="text-left">Qué hizo</th>
                </tr>
              </thead>
              <tbody>
                {historico.pasadas.slice(0, 60).map((p) => {
                  const hizo = loQueHizo(p);
                  return (
                    <tr key={p.id} className={p.ok ? '' : 'bg-danger-soft/40'}>
                      <td className="whitespace-nowrap">
                        <span aria-hidden className="mr-1.5">
                          {p.ok ? '·' : '⚠'}
                        </span>
                        <span className="num">{fechaCorta(p.inicio)}</span>
                      </td>
                      <td className="num text-right">{duracion(p.duracion_ms)}</td>
                      <td className="text-ink2">
                        {p.fallos.length > 0 && (
                          <span className="mr-2 font-medium text-danger">
                            falló {p.fallos.map((f) => f.fase).join(', ')}.
                          </span>
                        )}
                        {hizo.length > 0 ? (
                          hizo.join(' · ')
                        ) : p.fallos.length === 0 ? (
                          <span className="text-muted">nada que hacer</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-muted">
          Estas filas las escribe el propio cron con la clave de servicio. Nadie puede añadirlas ni
          cambiarlas desde la aplicación, tampoco dirección: si se pudiera, se podría fabricar una
          pasada falsa y tapar justo lo que esta pantalla sirve para destapar.
        </p>
      </section>
    </AppShell>
  );
}
