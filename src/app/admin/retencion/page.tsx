import { AppShell } from '@/components/app-shell';
import { createAdminClient } from '@/lib/supabase/admin';
import { candidatosAnonimizacion } from '@/lib/anonimizar';
import { exigirDireccion } from '../guard';
import { Avisos, botonAdmin, inputAdmin } from '../nav';
import { anonimizarAhora, guardarRetencion } from './actions';

/**
 * Retención y anonimización.
 *
 * La pantalla enseña PRIMERO qué se anonimizaría y solo después ofrece el
 * botón. Una acción irreversible sobre datos de personas se mira antes de
 * hacerse, y «12 meses» en abstracto no dice lo mismo que «estos 47 casos».
 */
export default async function AdminRetencion({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; aviso?: string; meses?: string }>;
}) {
  const { error, aviso, meses } = await searchParams;
  const { supabase } = await exigirDireccion();

  const { data: config } = await supabase
    .from('configuracion')
    .select('clave, valor')
    .in('clave', ['retencion_meses', 'retencion_automatica']);
  const valor = new Map((config ?? []).map((c) => [c.clave, c.valor]));

  const guardados = Number(valor.get('retencion_meses') ?? 12);
  const automatica = valor.get('retencion_automatica') === true;

  // La previsualización usa el plazo que se esté mirando, no solo el guardado:
  // así se puede ver el efecto de bajarlo a 6 antes de decidir nada.
  const plazo = Number(meses) > 0 ? Number(meses) : guardados;

  // Service role: la previsualización cuenta casos de todos los centros, y
  // esta pantalla ya es exclusiva de dirección.
  const candidatos = await candidatosAnonimizacion(createAdminClient(), plazo);

  return (
    <AppShell
      seccion="admin"
      subseccion="/admin/retencion"
      titulo="Retención y anonimización"
      descripcion="Cuánto tiempo se conservan los datos de los casos cerrados"
    >
      <Avisos error={error} aviso={aviso} />

      <p className="mb-4 mt-4 rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn ring-1 ring-warn/25">
        <b>Esto lo valida vuestro asesor, no la plataforma.</b> El plazo de conservación es una
        decisión jurídica. Los 12 meses que vienen puestos son una propuesta de partida, y la
        anonimización automática está <b>apagada</b> hasta que alguien la encienda a conciencia.
      </p>

      <section className="panel mb-5 p-4">
        <h2 className="mb-3 text-sm font-semibold">Plazo</h2>
        <form action={guardarRetencion} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="_interruptores" value="1" />
          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            Meses desde el cierre
            <input
              name="retencion_meses"
              type="number"
              min="1"
              defaultValue={guardados}
              className={`${inputAdmin} w-32`}
            />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-ink2">
            <input type="checkbox" name="retencion_automatica" defaultChecked={automatica} />
            Anonimizar automáticamente
          </label>
          <button type="submit" className={botonAdmin}>
            Guardar
          </button>
        </form>
        <p className="mt-3 text-xs text-ink2">
          Solo afecta a casos <b>perdidos</b> y <b>no válidos</b>. Nunca a casos abiertos ni
          convertidos: detrás de una conversión hay una relación contractual con su propio plazo, y
          ese no lo decide esta pantalla.
        </p>
      </section>

      <section className="panel mb-5 p-4">
        <h2 className="mb-1 text-sm font-semibold">Qué se anonimizaría hoy</h2>
        <p className="mb-3 text-xs text-ink2">
          Con un plazo de {plazo} meses. Cambia el número de arriba y vuelve a mirar antes de
          guardar nada.
        </p>

        <form className="mb-4 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-ink2">
            Simular con
            <input name="meses" type="number" min="1" defaultValue={plazo} className={`${inputAdmin} w-28`} />
          </label>
          <button type="submit" className="btn btn-ghost">
            Ver
          </button>
        </form>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-ground p-3 ring-1 ring-line">
            <p className="text-[11px] uppercase tracking-wide text-muted">Casos</p>
            <p className="text-[19px] font-bold tabular-nums">{candidatos.casos.length}</p>
          </div>
          <div className="rounded-lg bg-ground p-3 ring-1 ring-line">
            <p className="text-[11px] uppercase tracking-wide text-muted">Personas del directorio</p>
            <p className="text-[19px] font-bold tabular-nums">{candidatos.contactos}</p>
            <p className="text-[11px] text-ink2">Solo las que no participan en ningún caso vivo</p>
          </div>
        </div>

        {candidatos.casos.length === 0 ? (
          <p className="text-sm text-muted">
            No hay ningún caso que pase de ese plazo. No habría nada que anonimizar.
          </p>
        ) : (
          <>
            <div className="max-h-64 overflow-y-auto rounded-lg ring-1 ring-line">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Caso</th>
                    <th>Estado</th>
                    <th>Cerrado</th>
                  </tr>
                </thead>
                <tbody>
                  {candidatos.casos.slice(0, 100).map((c) => (
                    <tr key={c.id}>
                      <td>{c.nombre}</td>
                      <td className="text-ink2">{c.estado}</td>
                      <td className="text-ink2">{c.cerrado}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {candidatos.casos.length > 100 && (
              <p className="mt-2 text-xs text-muted">
                Se listan los 100 primeros de {candidatos.casos.length}.
              </p>
            )}

            <form action={anonimizarAhora.bind(null, plazo)} className="mt-4">
              <button type="submit" className="btn btn-ghost text-danger">
                Anonimizar ahora estos {candidatos.casos.length} caso(s)
              </button>
              <p className="mt-2 text-xs text-danger">
                <b>Irreversible.</b> Los nombres, teléfonos y notas se sustituyen para siempre. Las
                filas se quedan, así que las métricas históricas siguen cuadrando: cuántos leads
                entraron, por qué canal y por qué se perdieron. Queda registrado en la auditoría.
              </p>
            </form>
          </>
        )}
      </section>

      <section className="panel p-4">
        <h2 className="mb-2 text-sm font-semibold">Qué se conserva y qué se va</h2>
        <div className="grid gap-4 text-xs sm:grid-cols-2">
          <div>
            <p className="mb-1 font-semibold text-ok">Se conserva</p>
            <ul className="flex flex-col gap-1 text-ink2">
              <li>· Centro, canal y subcanal</li>
              <li>· Estado y motivo de pérdida</li>
              <li>· Fechas de entrada, respuesta y cierre</li>
              <li>· Atribución UTM</li>
              <li>· Que hubo actividad, sin su contenido</li>
              <li>· La auditoría entera (es append-only)</li>
            </ul>
          </div>
          <div>
            <p className="mb-1 font-semibold text-danger">Se va</p>
            <ul className="flex flex-col gap-1 text-ink2">
              <li>· Nombre y teléfono</li>
              <li>· Nombre de la persona afectada y su relación</li>
              <li>· Zona y prescriptor</li>
              <li>· El contenido de las notas y del historial</li>
              <li>· Email, notas y consentimiento del contacto</li>
            </ul>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
