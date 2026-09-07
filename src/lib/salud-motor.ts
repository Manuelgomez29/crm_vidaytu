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

/** Cada cuánto está previsto que corra el cron. Está en `vercel.json`. */
export const MINUTOS_ENTRE_PASADAS = 15;

/**
 * Qué significa cada número que devuelve una pasada.
 *
 * El registro guarda `{"sla": 2, "repartidos": 1}` y eso no se lee. Aquí cada
 * clave tiene su frase, en el orden en que ocurren las cosas: primero repartir,
 * luego avisar, luego lo que se propone, y al final lo de mantenimiento.
 *
 * Lo que no esté en esta lista sencillamente no se enseña. Es a propósito: si
 * alguien añade un contador nuevo, aparecerá aquí cuando le ponga nombre, no
 * como una sigla suelta en una pantalla que mira dirección.
 */
export const QUE_HACE: { clave: string; texto: string; unidad: string; unidades: string }[] = [
  {
    clave: 'repartidos',
    texto: 'Leads sin propietario repartidos',
    unidad: 'lead',
    unidades: 'leads',
  },
  {
    clave: 'sla',
    texto: 'Avisos de SLA de primera respuesta',
    unidad: 'aviso',
    unidades: 'avisos',
  },
  {
    clave: 'cadencia',
    texto: 'Avisos de «toca el siguiente intento»',
    unidad: 'aviso',
    unidades: 'avisos',
  },
  {
    clave: 'agotados',
    texto: 'Cadencias agotadas sin respuesta',
    unidad: 'aviso',
    unidades: 'avisos',
  },
  {
    clave: 'presupuestos',
    texto: 'Presupuestos sin respuesta reclamados',
    unidad: 'aviso',
    unidades: 'avisos',
  },
  {
    clave: 'tareasVencidas',
    texto: 'Tareas vencidas avisadas',
    unidad: 'aviso',
    unidades: 'avisos',
  },
  { clave: 'citasProximas', texto: 'Citas próximas avisadas', unidad: 'aviso', unidades: 'avisos' },
  {
    clave: 'recordatorios',
    texto: 'Recordatorios de cita enviados',
    unidad: 'recordatorio',
    unidades: 'recordatorios',
  },
  {
    clave: 'reactivaciones',
    texto: 'Reactivaciones de «no es el momento»',
    unidad: 'caso',
    unidades: 'casos',
  },
  { clave: 'resenas', texto: 'Reseñas propuestas', unidad: 'propuesta', unidades: 'propuestas' },
  { clave: 'puntuados', texto: 'Puntuaciones recalculadas', unidad: 'caso', unidades: 'casos' },
  {
    clave: 'etiquetasAplicadas',
    texto: 'Etiquetas automáticas aplicadas',
    unidad: 'etiqueta',
    unidades: 'etiquetas',
  },
  {
    clave: 'duplicadosDetectados',
    texto: 'Duplicados entre centros detectados',
    unidad: 'aviso',
    unidades: 'avisos',
  },
  {
    clave: 'seguimientosProgramados',
    texto: 'Seguimientos post-alta programados',
    unidad: 'hito',
    unidades: 'hitos',
  },
  {
    clave: 'seguimientosAvisados',
    texto: 'Seguimientos post-alta avisados',
    unidad: 'aviso',
    unidades: 'avisos',
  },
  {
    clave: 'riesgosRecaida',
    texto: 'Avisos de riesgo de recaída',
    unidad: 'aviso',
    unidades: 'avisos',
  },
  {
    clave: 'campanasProcesadas',
    texto: 'Campañas de correo procesadas',
    unidad: 'campaña',
    unidades: 'campañas',
  },
  {
    clave: 'enviados',
    texto: 'Correos de campaña enviados',
    unidad: 'correo',
    unidades: 'correos',
  },
  {
    clave: 'fallidos',
    texto: 'Correos de campaña fallidos',
    unidad: 'correo',
    unidades: 'correos',
  },
  {
    clave: 'correosEnviados',
    texto: 'Resúmenes por correo enviados',
    unidad: 'correo',
    unidades: 'correos',
  },
  {
    clave: 'resumenes',
    texto: 'Resúmenes diarios preparados',
    unidad: 'resumen',
    unidades: 'resúmenes',
  },
  { clave: 'push', texto: 'Avisos empujados al móvil', unidad: 'aviso', unidades: 'avisos' },
  {
    clave: 'informeMensual',
    texto: 'Informes mensuales generados',
    unidad: 'informe',
    unidades: 'informes',
  },
  {
    clave: 'anonimizados',
    texto: 'Casos anonimizados por retención',
    unidad: 'caso',
    unidades: 'casos',
  },
];

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
    supabase.from('configuracion').select('valor').eq('clave', 'motor_aviso_minutos').maybeSingle(),
  ]);

  const umbralMinutos = Number(config?.valor) || UMBRAL_POR_DEFECTO;
  const fin = ultimaBuena?.fin ?? null;
  const minutosDesdeBuena = fin
    ? Math.floor((Date.now() - new Date(fin).getTime()) / 60_000)
    : null;

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

export type Pasada = {
  id: string;
  inicio: string;
  fin: string | null;
  ok: boolean;
  duracion_ms: number | null;
  resultado: Record<string, number>;
  fallos: FalloDeFase[];
};

export type Historico = {
  pasadas: Pasada[];
  /** Cuántas pasadas hubo en la ventana y cuántas fallaron. */
  total: number;
  conFallo: number;
  /** Duración típica. La mediana, no la media: una pasada lenta no debe teñir el resto. */
  medianaMs: number | null;
  /**
   * El hueco más largo entre dos pasadas seguidas, en minutos.
   *
   * Es el número que de verdad contesta «¿lleva semanas corriendo bien?». Que
   * no haya fallos no dice nada si el cron estuvo dos días sin llamar: no
   * fallar y no ejecutarse se parecen mucho mirando solo los errores.
   */
  huecoMaximoMin: number | null;
  /**
   * Cuántas pasadas se esperaban, al ritmo previsto y DESDE QUE HAY REGISTRO.
   *
   * No desde el principio de la ventana: si el registro tiene una semana y se
   * miran treinta días, contar 2.880 previstas daría un 23 % en rojo por una
   * instalación que en realidad no se ha saltado ni una. Una alarma que salta
   * cuando no pasa nada malo se deja de mirar, y entonces tampoco se mira la
   * que importa.
   */
  esperadas: number;
  /** Desde cuándo hay registro en esta ventana. */
  desde: string | null;
  /** Todo lo que hizo el motor en la ventana, sumado y con su nombre. */
  totales: { texto: string; cantidad: number; unidad: string; unidades: string }[];
  /** Las fases que fallaron, con cuántas veces. */
  fasesConFallo: { fase: string; veces: number; ultimoError: string }[];
  dias: number;
};

/**
 * Cuántas pasadas tocaban entre la primera registrada y ahora.
 *
 * Nunca más de las que caben en la ventana pedida, y nunca menos de las que ya
 * hay: si el registro empieza hace dos días, en la vista de treinta se compara
 * contra dos días, no contra treinta.
 */
function pasadasPrevistas(primera: string | null, dias: number): number {
  const ventanaMin = dias * 24 * 60;
  if (!primera) return Math.round(ventanaMin / MINUTOS_ENTRE_PASADAS);
  const desdeLaPrimera = (Date.now() - Date.parse(primera)) / 60_000;
  return Math.max(1, Math.round(Math.min(ventanaMin, desdeLaPrimera) / MINUTOS_ENTRE_PASADAS));
}

/** Cuántas pasadas se enseñan una a una. Lo demás se resume, no se lista. */
export const PASADAS_EN_DETALLE = 60;

/**
 * El histórico de los últimos días, ya masticado.
 *
 * Los totales de la ventana los calcula Postgres (`resumen_motor`), no el
 * navegador: a una pasada cada quince minutos, treinta días son 2.880 filas con
 * un jsonb cada una, y traérselas para enseñar seis números es cerca de un mega
 * por una pantalla que se mira de refilón. En crudo solo vienen las últimas
 * sesenta, que son las que se listan.
 *
 * Lo que hay que poder contestar de un vistazo es: ¿ha corrido siempre?, ¿ha
 * fallado algo?, y ¿para qué ha servido?
 */
export async function historicoDelMotor(supabase: Cliente, dias = 7): Promise<Historico> {
  const [{ data: resumen }, { data }] = await Promise.all([
    supabase.rpc('resumen_motor', { dias }),
    supabase
      .from('ejecuciones_motor')
      .select('id, inicio, fin, ok, duracion_ms, resultado, fallos')
      .gte('inicio', new Date(Date.now() - dias * 86_400_000).toISOString())
      .order('inicio', { ascending: false })
      .limit(PASADAS_EN_DETALLE),
  ]);

  const r = (resumen ?? {}) as {
    total?: number;
    conFallo?: number;
    medianaMs?: number | null;
    huecoMaximoMin?: number | null;
    primera?: string | null;
    totales?: Record<string, number>;
    fases?: { fase: string; veces: number; ultimoError: string }[];
  };

  const pasadas: Pasada[] = (data ?? []).map((p) => ({
    id: p.id,
    inicio: p.inicio,
    fin: p.fin,
    ok: p.ok,
    duracion_ms: p.duracion_ms,
    resultado: (p.resultado ?? {}) as Record<string, number>,
    fallos: Array.isArray(p.fallos) ? (p.fallos as unknown as FalloDeFase[]) : [],
  }));

  const suma = r.totales ?? {};

  return {
    pasadas,
    total: r.total ?? 0,
    conFallo: r.conFallo ?? 0,
    medianaMs: r.medianaMs ?? null,
    huecoMaximoMin: r.huecoMaximoMin ?? null,
    esperadas: pasadasPrevistas(r.primera ?? null, dias),
    desde: r.primera ?? null,
    totales: QUE_HACE.filter((q) => Number(suma[q.clave] ?? 0) > 0).map((q) => ({
      texto: q.texto,
      cantidad: Number(suma[q.clave]),
      unidad: q.unidad,
      unidades: q.unidades,
    })),
    fasesConFallo: r.fases ?? [],
    dias,
  };
}
