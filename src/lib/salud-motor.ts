/**
 * Saber si el motor de automatizaciones sigue vivo.
 *
 * El área comercial funciona sola gracias a un cron cada quince minutos: el
 * reparto de leads sin propietario, la alerta de SLA, la cadencia de cinco
 * intentos, el aviso de presupuesto sin respuesta, los recordatorios de cita,
 * la reactivación de perdidos y la propuesta de reseña. Todo eso.
 *
 * Si ese cron deja de correr, nada se rompe de forma visible: simplemente dejan
 * de llegar avisos. Y como los avisos son justo lo que le dice a un comercial
 * que tiene algo pendiente, no llegar ninguno se parece muchísimo a no tener
 * nada pendiente. Por eso hace falta mirarlo desde fuera y decirlo en voz alta.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

type Cliente = SupabaseClient<Database>;

/** Lo que salió mal en una fase, sin tumbar las demás. */
export type FalloDeFase = { fase: string; error: string };

export type EstadoDelMotor = {
  /** Cuándo terminó la última pasada correcta. Nulo si no hay ninguna. */
  ultimaBuena: string | null;
  /** Cuándo empezó la última pasada, saliera bien o mal. */
  ultimaCualquiera: string | null;
  /** Minutos desde la última pasada correcta. Nulo si nunca ha habido una. */
  minutosDesdeBuena: number | null;
  /** Umbral configurado, para poder decirlo en el aviso. */
  umbralMinutos: number;
  /** Verdadero cuando hay que dar la voz de alarma. */
  parado: boolean;
  /** No hay ninguna pasada correcta registrada. Nunca ha arrancado aquí. */
  nuncaHaCorrido: boolean;
  /** Lo que falló en la última pasada, si falló algo. */
  fallos: FalloDeFase[];
};

const UMBRAL_POR_DEFECTO = 60;

/**
 * Ejecuta una fase sin dejar que se lleve por delante a las demás.
 *
 * Antes las siete automatizaciones corrían en un `Promise.all`: bastaba que una
 * fallara para que la pasada entera se cayera y las otras seis no llegaran a
 * ejecutarse. Una avería en las reseñas no puede dejar los leads sin repartir.
 */
export async function fase<T>(
  nombre: string,
  fallos: FalloDeFase[],
  trabajo: () => Promise<T>,
  siFalla: T,
): Promise<T> {
  try {
    return await trabajo();
  } catch (e) {
    fallos.push({ fase: nombre, error: e instanceof Error ? e.message : String(e) });
    return siFalla;
  }
}

/**
 * Deja constancia de la pasada.
 *
 * Se llama con la clave de servicio, que se salta RLS: en la tabla nadie más
 * puede escribir, precisamente para que no se pueda fabricar una pasada falsa
 * que tape que el motor lleva días parado.
 */
export async function registrarEjecucion(
  admin: Cliente,
  datos: {
    inicio: Date;
    resultado: Record<string, unknown>;
    fallos: FalloDeFase[];
  },
): Promise<void> {
  const fin = new Date();
  try {
    await admin.from('ejecuciones_motor').insert({
      inicio: datos.inicio.toISOString(),
      fin: fin.toISOString(),
      ok: datos.fallos.length === 0,
      duracion_ms: fin.getTime() - datos.inicio.getTime(),
      resultado: datos.resultado as never,
      fallos: datos.fallos as never,
    });

    /*
     * Se guardan treinta días. Es un registro de salud, no un histórico: lo
     * único que se pregunta es «¿cuándo fue la última buena?», y para eso
     * sobra con un mes. Sin esta poda la tabla crece 35.000 filas al año sin
     * que nadie las mire nunca.
     */
    const limite = new Date(Date.now() - 30 * 86_400_000).toISOString();
    await admin.from('ejecuciones_motor').delete().lt('inicio', limite);
  } catch {
    /*
     * Si no se puede registrar, la pasada ya ha hecho su trabajo y eso es lo
     * que importa. Tirar aquí convertiría un fallo del registro en un fallo del
     * motor, que es exactamente al revés de para lo que sirve esto.
     */
  }
}

/**
 * Cómo está el motor, para enseñarlo en el panel.
 *
 * Lee con la sesión de quien mira: la política de la tabla lo reserva a
 * dirección, así que para cualquier otro rol esto devuelve «nunca ha corrido»
 * y el panel no enseña nada. Es lo correcto —un comercial no puede hacer nada
 * con esta información— y no hace falta comprobar el rol aquí.
 */
export async function estadoDelMotor(supabase: Cliente): Promise<EstadoDelMotor> {
  const [{ data: ultimaBuena }, { data: ultima }, { data: config }] = await Promise.all([
    supabase
      .from('ejecuciones_motor')
      .select('fin')
      .eq('ok', true)
      .order('inicio', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('ejecuciones_motor')
      .select('inicio, fallos')
      .order('inicio', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('configuracion')
      .select('valor')
      .eq('clave', 'motor_aviso_minutos')
      .maybeSingle(),
  ]);

  const umbralMinutos = Number(config?.valor) || UMBRAL_POR_DEFECTO;
  const fin = ultimaBuena?.fin ?? null;
  const minutosDesdeBuena = fin ? Math.floor((Date.now() - new Date(fin).getTime()) / 60_000) : null;

  /*
   * «Parado» y «no ha arrancado nunca» son dos cosas distintas y se dicen
   * distinto.
   *
   * Al principio esto callaba cuando no había ninguna pasada, para no dejar un
   * aviso rojo permanente en staging —donde no hay cron y nunca lo habrá—. Pero
   * ese silencio tapaba justo el caso peor: que en producción el cron no se
   * llegara a activar nunca. El aviso más importante era el único que no salía.
   *
   * Así que se dicen los dos, con distinto tono: rojo si venía funcionando y ha
   * dejado de hacerlo, y un apunte tranquilo si es que aún no ha arrancado, que
   * en staging es lo normal y explica por qué allí no pasa nada solo.
   */
  const nuncaHaCorrido = minutosDesdeBuena === null;
  const parado = minutosDesdeBuena !== null && minutosDesdeBuena > umbralMinutos;

  return {
    ultimaBuena: fin,
    ultimaCualquiera: ultima?.inicio ?? null,
    minutosDesdeBuena,
    umbralMinutos,
    parado,
    nuncaHaCorrido,
    fallos: Array.isArray(ultima?.fallos) ? (ultima.fallos as unknown as FalloDeFase[]) : [],
  };
}
