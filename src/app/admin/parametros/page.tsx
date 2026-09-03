import { AppShell } from '@/components/app-shell';
import { fecha } from '@/lib/fechas';
import { exigirDireccion } from '../guard';
import { Avisos, botonAdmin, inputAdmin } from '../nav';
import { guardarParametros } from '../actions';

export default async function AdminParametros({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; aviso?: string }>;
}) {
  const { error: errorMsg, aviso } = await searchParams;
  const { supabase } = await exigirDireccion();

  const { data: filas } = await supabase
    .from('configuracion')
    .select('clave, valor, descripcion, updated_at');

  const valor = new Map((filas ?? []).map((f) => [f.clave, f.valor]));
  const actualizado = new Map((filas ?? []).map((f) => [f.clave, f.updated_at]));

  const sla = Number(valor.get('sla_primera_respuesta_minutos') ?? 60);
  const alerta = Number(valor.get('alerta_presupuesto_dias') ?? 3);
  const cadencia = Array.isArray(valor.get('cadencia_dias'))
    ? (valor.get('cadencia_dias') as number[]).join(', ')
    : '0, 1, 3, 7, 14';
  const plantilla =
    typeof valor.get('plantilla_recordatorio_cita') === 'string'
      ? (valor.get('plantilla_recordatorio_cita') as string)
      : '';

  const cadena = (clave: string) =>
    typeof valor.get(clave) === 'string' ? (valor.get(clave) as string) : '';
  const json = (clave: string) =>
    valor.get(clave) ? JSON.stringify(valor.get(clave), null, 2) : '';

  const fiscales = (valor.get('datos_fiscales') ?? {}) as {
    razon_social?: string;
    nif?: string;
    direccion?: string;
    email?: string;
  };

  return (
    <AppShell
      seccion="admin"
      subseccion="/admin/parametros"
      titulo="Parámetros"
      descripcion="SLA, cadencia, alertas y plantillas"
    >
        <Avisos error={errorMsg} aviso={aviso} />
        <p className="mb-4 text-sm text-ink2">
          Estos valores no están escritos en el código: la plataforma los lee de aquí cada vez que
          los necesita, así que cualquier cambio se aplica de inmediato.
        </p>

        <form action={guardarParametros} className="flex flex-col gap-5 rounded-xl bg-surface p-5 ring-1 ring-line">
          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            SLA de primera respuesta (minutos)
            <input
              name="sla_primera_respuesta_minutos"
              type="number"
              min="1"
              defaultValue={sla}
              className={`${inputAdmin} w-40`}
            />
            <span className="text-xs font-normal text-ink2">
              Tiempo máximo para dar la primera respuesta a un lead. Marca el vencimiento de la tarea
              inicial y el cumplimiento que se ve en el panel.
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            Cadencia de contacto (días)
            <input name="cadencia_dias" defaultValue={cadencia} className={`${inputAdmin} w-64`} />
            <span className="text-xs font-normal text-ink2">
              Días de los intentos, separados por comas. Cinco intentos en dos semanas alternando
              llamada y WhatsApp; tras el último sin respuesta se propone perdido «no respondió».
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            Alerta de presupuesto sin respuesta (días)
            <input
              name="alerta_presupuesto_dias"
              type="number"
              min="1"
              defaultValue={alerta}
              className={`${inputAdmin} w-40`}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            Plantilla del recordatorio de cita
            <textarea
              name="plantilla_recordatorio_cita"
              rows={3}
              defaultValue={plantilla}
              className={inputAdmin}
            />
            <span className="text-xs font-normal text-ink2">
              Marcadores disponibles: <code>{'{nombre}'}</code> <code>{'{dia}'}</code>{' '}
              <code>{'{hora}'}</code> <code>{'{lugar}'}</code> <code>{'{profesional}'}</code>.
            </span>
            <span className="text-xs font-normal text-warn">
              Discreción obligatoria: el mensaje va a un teléfono que puede leer cualquiera de la
              familia. No puede mencionar adicciones ni motivos clínicos — la plataforma rechaza la
              plantilla si lo hace.
            </span>
          </label>

          <hr className="border-line" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink2">
            Automatizacion
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-ink">
              Reactivar «no es el momento» (dias)
              <input
                name="reactivacion_dias"
                type="number"
                min="1"
                defaultValue={Number(valor.get('reactivacion_dias') ?? 90)}
                className={`${inputAdmin} w-40`}
              />
              <span className="text-xs font-normal text-ink2">
                Un «ahora no» no es un no: pasado ese plazo se crea la tarea de retomar el contacto.
              </span>
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-ink">
              Faltas seguidas que avisan de riesgo
              <input
                name="riesgo_recaida_faltas"
                type="number"
                min="1"
                defaultValue={Number(valor.get('riesgo_recaida_faltas') ?? 2)}
                className={`${inputAdmin} w-40`}
              />
              <span className="text-xs font-normal text-ink2">
                Area clinica. Es una senal para el terapeuta referente, nunca un diagnostico.
              </span>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            Pesos del lead scoring (JSON)
            <textarea
              name="scoring_pesos"
              rows={5}
              defaultValue={json('scoring_pesos')}
              className={`${inputAdmin} font-mono text-xs`}
            />
            <span className="text-xs font-normal text-ink2">
              Cuanto suma cada senal a la puntuacion de un caso. Cambiarlos recalcula todo en la
              siguiente pasada del motor. La puntuacion prioriza la cola: no oculta ni cierra nada.
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            Probabilidad de cierre por estado (JSON)
            <textarea
              name="prevision_probabilidad"
              rows={4}
              defaultValue={json('prevision_probabilidad')}
              className={`${inputAdmin} font-mono text-xs`}
            />
            <span className="text-xs font-normal text-ink2">
              Alimenta la prevision de ingresos del panel. Al principio es una estimacion; con
              conversiones reales se puede recalibrar mirando que porcentaje cerro de verdad.
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-ink">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="resena_activa"
                  defaultChecked={valor.get('resena_activa') !== false}
                />
                Proponer resena tras conversion validada
              </span>
              <span className="text-xs font-normal text-ink2">
                Crea una tarea para el comercial, no un envio: la plataforma nunca escribe sola a un
                paciente.
              </span>
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-ink">
              Enlace de resenas de Google
              <input
                name="resena_url"
                defaultValue={cadena('resena_url')}
                placeholder="https://g.page/r/..."
                className={inputAdmin}
              />
            </label>
          </div>

          <hr className="border-line" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink2">
            Email marketing
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-ink">
              Remitente de las campanas
              <input
                name="marketing_remitente"
                defaultValue={cadena('marketing_remitente')}
                placeholder="Vida y Tu <hola@dominio.es>"
                className={inputAdmin}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-ink">
              Destinatarios por lote
              <input
                name="marketing_lote"
                type="number"
                min="1"
                defaultValue={Number(valor.get('marketing_lote') ?? 40)}
                className={`${inputAdmin} w-40`}
              />
              <span className="text-xs font-normal text-ink2">
                Cuantos correos salen en cada pasada del motor, para no chocar con el limite del
                proveedor.
              </span>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            Pie obligatorio de las campanas
            <textarea
              name="marketing_pie"
              rows={2}
              defaultValue={cadena('marketing_pie')}
              className={inputAdmin}
            />
            <span className="text-xs font-normal text-warn">
              Debe contener el marcador de baja. Es el enlace para darse de baja en un clic, y sin
              el la plataforma rechaza el cambio.
            </span>
          </label>

          <hr className="border-line" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink2">Facturacion</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-ink">
              Razon social
              <input
                name="fiscal_razon_social"
                defaultValue={fiscales.razon_social ?? ''}
                className={inputAdmin}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-ink">
              NIF
              <input name="fiscal_nif" defaultValue={fiscales.nif ?? ''} className={inputAdmin} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-ink">
              Direccion fiscal
              <input
                name="fiscal_direccion"
                defaultValue={fiscales.direccion ?? ''}
                className={inputAdmin}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-ink">
              Email de facturacion
              <input
                name="fiscal_email"
                type="email"
                defaultValue={fiscales.email ?? ''}
                className={inputAdmin}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-ink">
              IVA por defecto (%)
              <input
                name="iva_porcentaje"
                type="number"
                step="0.01"
                min="0"
                defaultValue={Number(valor.get('iva_porcentaje') ?? 0)}
                className={`${inputAdmin} w-40`}
              />
              <span className="text-xs font-normal text-ink2">
                Los servicios sanitarios suelen ir exentos. Confirmalo con la gestoria antes de
                emitir en serie.
              </span>
            </label>
          </div>

          <hr className="border-line" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink2">
            Asistente de IA
          </h2>

          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                name="ia_activa"
                defaultChecked={valor.get('ia_activa') === true}
              />
              Asistente encendido
            </span>
            <span className="text-xs font-normal text-warn">
              Enciendelo solo despues de firmar el acuerdo de tratamiento de datos con el proveedor.
              El asistente responde unicamente con lo que quien pregunta ya puede ver, y cada
              consulta queda auditada.
            </span>
          </label>

          <button type="submit" className={`${botonAdmin} self-start`}>
            Guardar parametros
          </button>
        </form>

        <p className="mt-3 text-xs text-muted">
          Última modificación del SLA: {fecha(actualizado.get('sla_primera_respuesta_minutos') ?? null)}
        </p>
      </AppShell>
  );
}
