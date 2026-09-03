import { AppShell } from '@/components/app-shell';
import { fecha } from '@/lib/fechas';
import { exigirDireccion } from '../guard';
import { Avisos, botonAdmin, botonAdminSecundario, inputAdmin } from '../nav';
import { borrarGasto, guardarIntegracion, importarCsv, registrarGasto } from './actions';

const euros = (n: number | string) =>
  `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Lo que hace falta en el servidor para que cada integración funcione. */
const REQUISITOS: Record<string, { variables: string[]; explicacion: string }> = {
  whatsapp: {
    variables: ['WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET'],
    explicacion:
      'Meta llama al webhook cuando alguien escribe. Los mensajes entrantes se registran y se emparejan con el caso por teléfono; si no existe, entra como lead nuevo en la bandeja de grupo. En las campañas click-to-WhatsApp, Meta manda también qué anuncio trajo a la persona.',
  },
  zerochats: {
    variables: ['ZEROCHATS_API_KEY'],
    explicacion:
      'Instagram de Lolo Drago. Mientras no haya clave, los leads de Instagram se siguen registrando a mano en la bandeja de grupo, que es como funciona ahora.',
  },
  google_calendar: {
    variables: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    explicacion:
      'Complemento, no sustituto: la agenda de referencia es la de la plataforma, y los recordatorios salen de aquí.',
  },
};

export default async function AdminIntegraciones({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; aviso?: string }>;
}) {
  const { error, aviso } = await searchParams;
  const { supabase } = await exigirDireccion();

  const [{ data: integraciones }, { data: etiquetas }, { data: centros }, { data: gastos }] =
    await Promise.all([
      supabase.from('integraciones').select('*').order('nombre'),
      supabase.from('etiquetas').select('id, nombre').eq('activa', true).order('nombre'),
      supabase.from('centros').select('id, nombre').eq('activo', true).order('nombre'),
      supabase
        .from('gasto_campanas')
        .select('*, centro:centros (nombre)')
        .order('desde', { ascending: false })
        .limit(50),
    ]);

  const urlApp = process.env.NEXT_PUBLIC_URL_APP ?? 'https://tu-dominio';

  return (
    <AppShell
      seccion="admin"
      subseccion="/admin/integraciones"
      titulo="Integraciones"
      descripcion="Conexiones externas, importaciones y gasto publicitario"
    >
      <Avisos error={error} aviso={aviso} />

      {/* ---------------- Conectores ---------------- */}
      <section className="mb-5 mt-4 flex flex-col gap-3">
        {(integraciones ?? []).map((i) => {
          const requisitos = REQUISITOS[i.clave];
          const ajustes = (i.ajustes ?? {}) as Record<string, string>;
          return (
            <form
              key={i.id}
              action={guardarIntegracion.bind(null, i.clave)}
              className="panel p-4"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{i.nombre}</h2>
                <label className="flex items-center gap-1.5 text-xs text-ink2">
                  <input type="checkbox" name="activa" defaultChecked={i.activa} /> Activa
                </label>
              </div>

              {requisitos && <p className="mb-3 text-xs text-ink2">{requisitos.explicacion}</p>}

              <div className="mb-3 flex flex-wrap gap-2">
                {Object.keys(ajustes).map((campo) => (
                  <label key={campo} className="text-xs text-ink2">
                    <span className="mb-0.5 block capitalize">{campo.replace(/_/g, ' ')}</span>
                    <input
                      name={`ajuste_${campo}`}
                      defaultValue={ajustes[campo]}
                      className={`${inputAdmin} min-w-48`}
                    />
                  </label>
                ))}
              </div>

              {i.clave === 'whatsapp' && (
                <p className="mb-3 rounded-lg bg-surface2 px-3 py-2 text-xs text-ink2">
                  URL del webhook para pegar en Meta:{' '}
                  <code className="break-all">{urlApp}/api/whatsapp</code>
                </p>
              )}

              {requisitos && (
                <p className="mb-3 text-xs text-muted">
                  Necesita en el servidor: {requisitos.variables.map((v) => <code key={v} className="mr-1.5">{v}</code>)}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" className={botonAdminSecundario}>
                  Guardar
                </button>
                {i.ultima_sincronizacion_at && (
                  <span className="text-xs text-muted">
                    Última sincronización: {fecha(i.ultima_sincronizacion_at)}
                  </span>
                )}
                {i.ultimo_error && (
                  <span className="text-xs text-danger">Último error: {i.ultimo_error}</span>
                )}
              </div>
            </form>
          );
        })}
      </section>

      <p className="mb-5 rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn ring-1 ring-warn/25">
        Ninguna clave ni token se guarda aquí: van en variables de entorno del servidor. Una fila de
        base de datos acaba en una copia de seguridad o en una exportación.
      </p>

      {/* ---------------- Importación ---------------- */}
      <section className="panel mb-5 p-4">
        <h2 className="mb-1 text-sm font-semibold">Importar contactos desde CSV</h2>
        <p className="mb-3 text-xs text-ink2">
          Para los históricos de Clientify, Zerochats o cualquier hoja de cálculo. Deduplica por
          teléfono contra todo el sistema y <b>nunca pisa</b> lo que ya hay: solo rellena huecos.
          Importar dos veces el mismo fichero no duplica nada.
        </p>

        <form action={importarCsv} className="flex flex-wrap items-end gap-2">
          <input type="file" name="archivo" accept=".csv,text/csv" className={`${inputAdmin} min-w-48 flex-1`} required />
          <input name="origen" placeholder="Origen (p. ej. Clientify)" className={`${inputAdmin} min-w-36`} />
          <select name="etiqueta" defaultValue="" className={inputAdmin}>
            <option value="">Sin etiquetar</option>
            {(etiquetas ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                Etiquetar como «{e.nombre}»
              </option>
            ))}
          </select>
          <button type="submit" className={botonAdmin}>
            Importar
          </button>
        </form>

        <div className="mt-3 rounded-lg bg-surface2 px-3 py-2 text-xs text-ink2">
          <p className="mb-1 font-semibold">Columnas que reconoce</p>
          <p>
            <b>telefono</b> (obligatoria; también «movil» o «phone») · <b>nombre</b> y{' '}
            <b>apellidos</b> · <b>email</b> · <b>zona</b> · <b>notas</b> · <b>consentimiento</b>.
          </p>
          <p className="mt-1.5">
            El consentimiento de marketing solo se marca si esa columna dice explícitamente que sí.
            Sin ella, todo entra como <b>sin consentimiento</b>: es preferible perder envíos a
            escribir a quien no lo autorizó.
          </p>
        </div>
      </section>

      {/* ---------------- Gasto publicitario ---------------- */}
      <section className="panel p-4">
        <h2 className="mb-1 text-sm font-semibold">Gasto publicitario</h2>
        <p className="mb-3 text-xs text-ink2">
          Meta y Google Ads no se conectan (haría falta acceso a las cuentas de anuncios). Anota
          aquí lo gastado por campaña y la plataforma lo cruza con la atribución UTM de cada lead
          para calcular el coste por lead y por conversión, que se ve en el Dashboard.
        </p>

        <form action={registrarGasto} className="mb-4 flex flex-wrap items-end gap-2">
          <select name="plataforma" defaultValue="meta" className={inputAdmin}>
            <option value="meta">Meta</option>
            <option value="google">Google</option>
            <option value="otro">Otro</option>
          </select>
          <input
            name="campana"
            placeholder="Campaña (igual que la utm_campaign)"
            className={`${inputAdmin} min-w-48 flex-1`}
            required
          />
          <select name="centro" defaultValue="" className={inputAdmin}>
            <option value="">Todo el grupo</option>
            {(centros ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <input name="desde" type="date" className={inputAdmin} required />
          <input name="hasta" type="date" className={inputAdmin} required />
          <input
            name="importe"
            type="number"
            step="0.01"
            min="0"
            placeholder="€"
            className={`${inputAdmin} w-28`}
            required
          />
          <button type="submit" className={botonAdmin}>
            Registrar
          </button>
        </form>

        {(gastos ?? []).length > 0 && (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Plataforma</th>
                  <th>Campaña</th>
                  <th>Centro</th>
                  <th>Periodo</th>
                  <th className="text-right">Importe</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(gastos ?? []).map((g) => (
                  <tr key={g.id}>
                    <td className="capitalize text-ink2">{g.plataforma}</td>
                    <td className="font-medium">{g.campana}</td>
                    <td className="text-ink2">{g.centro?.nombre ?? 'Grupo'}</td>
                    <td className="text-ink2">
                      {fecha(g.desde, false)} – {fecha(g.hasta, false)}
                    </td>
                    <td className="text-right font-semibold tabular-nums">{euros(g.importe)}</td>
                    <td className="text-right">
                      <form action={borrarGasto.bind(null, g.id)}>
                        <button
                          type="submit"
                          className="text-xs text-muted hover:text-danger hover:underline"
                        >
                          Borrar
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
