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
  const { supabase, user } = await exigirDireccion();

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

  return (
    <AppShell
      seccion="admin"
      subseccion="/admin/parametros"
      titulo="Parámetros"
      descripcion="SLA, cadencia, alertas y plantillas"
      ancho="estrecho"
    >
        <Avisos error={errorMsg} aviso={aviso} />
        <p className="mb-4 text-sm text-slate-500">
          Estos valores no están escritos en el código: la plataforma los lee de aquí cada vez que
          los necesita, así que cualquier cambio se aplica de inmediato.
        </p>

        <form action={guardarParametros} className="flex flex-col gap-5 rounded-xl bg-white p-5 ring-1 ring-slate-200">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            SLA de primera respuesta (minutos)
            <input
              name="sla_primera_respuesta_minutos"
              type="number"
              min="1"
              defaultValue={sla}
              className={`${inputAdmin} w-40`}
            />
            <span className="text-xs font-normal text-slate-500">
              Tiempo máximo para dar la primera respuesta a un lead. Marca el vencimiento de la tarea
              inicial y el cumplimiento que se ve en el panel.
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Cadencia de contacto (días)
            <input name="cadencia_dias" defaultValue={cadencia} className={`${inputAdmin} w-64`} />
            <span className="text-xs font-normal text-slate-500">
              Días de los intentos, separados por comas. Cinco intentos en dos semanas alternando
              llamada y WhatsApp; tras el último sin respuesta se propone perdido «no respondió».
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Alerta de presupuesto sin respuesta (días)
            <input
              name="alerta_presupuesto_dias"
              type="number"
              min="1"
              defaultValue={alerta}
              className={`${inputAdmin} w-40`}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Plantilla del recordatorio de cita
            <textarea
              name="plantilla_recordatorio_cita"
              rows={3}
              defaultValue={plantilla}
              className={inputAdmin}
            />
            <span className="text-xs font-normal text-slate-500">
              Marcadores disponibles: <code>{'{nombre}'}</code> <code>{'{dia}'}</code>{' '}
              <code>{'{hora}'}</code> <code>{'{lugar}'}</code> <code>{'{profesional}'}</code>.
            </span>
            <span className="text-xs font-normal text-amber-700">
              Discreción obligatoria: el mensaje va a un teléfono que puede leer cualquiera de la
              familia. No puede mencionar adicciones ni motivos clínicos — la plataforma rechaza la
              plantilla si lo hace.
            </span>
          </label>

          <button type="submit" className={`${botonAdmin} self-start`}>
            Guardar parámetros
          </button>
        </form>

        <p className="mt-3 text-xs text-slate-400">
          Última modificación del SLA: {fecha(actualizado.get('sla_primera_respuesta_minutos') ?? null)}
        </p>
      </AppShell>
  );
}
