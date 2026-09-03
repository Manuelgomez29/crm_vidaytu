/**
 * Asistente de IA de la plataforma.
 *
 * LA GARANTÍA CENTRAL: el asistente hereda los permisos de quien pregunta, y
 * lo hace por construcción, no por confianza.
 *
 * El contexto se lee SIEMPRE con el cliente de la sesión del usuario, nunca
 * con la service role. Si un terapeuta pregunta por un paciente que no es
 * suyo, la base de datos no devuelve la fila, así que ese dato jamás llega al
 * modelo. No hay ninguna instrucción del sistema que pueda saltarse eso,
 * porque no es una instrucción: es que el dato no existe en la petición.
 *
 * Consecuencia práctica: el modelo solo puede equivocarse sobre lo que la
 * persona ya podía ver por su cuenta.
 *
 * Toda consulta queda en `ia_consultas` (quién, qué, con qué ámbito). Es
 * requisito de la evaluación de impacto.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

type Cliente = SupabaseClient<Database>;

export type Ambito = 'clinica' | 'psicologia' | 'direccion';

export type RespuestaIA = {
  ok: boolean;
  texto?: string;
  error?: string;
  filas?: number;
  /** Id de la fila de `ia_consultas`. La pantalla lee la respuesta de ahí en
   *  lugar de recibirla por la URL: un dato clínico jamás va en un query
   *  string (regla 11), que acaba en historiales, logs y capturas. */
  consultaId?: string;
};

const MODELO_POR_DEFECTO = 'claude-sonnet-5';

export function iaConfigurada(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Instrucciones por ámbito. Las tres comparten dos límites duros: no inventar
 * lo que no está en el contexto, y no hacer clínica por su cuenta.
 */
function instrucciones(ambito: Ambito, nombre: string): string {
  const comunes = [
    'Eres el asistente de Vida y Tu DATA, la plataforma del Grupo Vida y Tu.',
    `Hablas con ${nombre}. Respondes SIEMPRE en castellano, de forma breve y directa.`,
    '',
    'REGLAS QUE NO PUEDES SALTARTE:',
    '· Responde ÚNICAMENTE con los datos del contexto que se te ha pasado. Si la respuesta no está ahí, di que no consta y para. No completes con conocimiento general ni con suposiciones plausibles.',
    '· El contexto ya viene filtrado por los permisos de esta persona. Si te preguntan por alguien que no aparece, la respuesta correcta es «no tengo acceso a esa ficha», no una disculpa larga.',
    '· No emites diagnósticos, ni pronósticos, ni decisiones de tratamiento.',
    '· Si citas cifras, que sean literalmente las del contexto.',
  ];

  if (ambito === 'clinica') {
    return [
      ...comunes,
      '',
      'Tu trabajo aquí es consultar datos: fechas de ingreso, fases, sesiones, seguimientos. Contesta lo que se pregunta, sin añadir interpretación clínica.',
    ].join('\n');
  }

  if (ambito === 'psicologia') {
    return [
      ...comunes,
      '',
      'Aquí apoyas al profesional en la preparación de su trabajo: ordenar la evolución de un caso, sugerir marcos o técnicas que podría valorar, redactar borradores de informe a partir de lo registrado.',
      'Todo lo que produces es un BORRADOR subordinado al juicio clínico de quien te lee. Cuando sugieras un enfoque, dilo como opción a valorar, nunca como indicación.',
      'No propongas pautas farmacológicas.',
    ].join('\n');
  }

  return [
    ...comunes,
    '',
    'Aquí respondes preguntas de dirección sobre los números del grupo: leads, conversiones, ingresos validados, ocupación. Da la cifra y, si ayuda, la comparación que esté en el contexto.',
  ].join('\n');
}

/**
 * Contexto clínico: los pacientes que ESTA sesión puede ver, con lo esencial
 * de cada uno. Se limita a 40 fichas para no mandar la base entera.
 */
async function contextoClinico(supabase: Cliente): Promise<{ texto: string; filas: number }> {
  const { data: pacientes } = await supabase
    .from('pacientes')
    .select(
      'id, nombre, estado, fecha_ingreso, fecha_alta, notas, centro:centros (nombre), fase:fases_metodo (nombre), modalidad:modalidades (nombre), adiccion:adicciones (nombre)',
    )
    .order('created_at', { ascending: false })
    .limit(40);

  if (!pacientes || pacientes.length === 0) {
    return { texto: 'No hay ninguna ficha de paciente accesible para esta persona.', filas: 0 };
  }

  const ids = pacientes.map((p) => p.id);
  const [{ data: sesiones }, { data: seguimientos }] = await Promise.all([
    supabase
      .from('sesiones')
      .select('paciente_id, tipo, estado, inicio, notas_clinicas')
      .in('paciente_id', ids)
      .order('inicio', { ascending: false })
      .limit(200),
    supabase
      .from('seguimientos_post_alta')
      .select('paciente_id, hito_meses, fecha_prevista, completado_at')
      .in('paciente_id', ids),
  ]);

  const sesionesPorPaciente = new Map<string, string[]>();
  for (const s of sesiones ?? []) {
    const lista = sesionesPorPaciente.get(s.paciente_id) ?? [];
    if (lista.length < 8) {
      lista.push(
        `${s.inicio.slice(0, 10)} ${s.tipo} ${s.estado}${s.notas_clinicas ? ` — ${s.notas_clinicas}` : ''}`,
      );
    }
    sesionesPorPaciente.set(s.paciente_id, lista);
  }

  const bloques = pacientes.map((p) => {
    const susSesiones = sesionesPorPaciente.get(p.id) ?? [];
    const susSeguimientos = (seguimientos ?? []).filter((s) => s.paciente_id === p.id);
    return [
      `PACIENTE: ${p.nombre}`,
      `  centro: ${p.centro?.nombre ?? '—'} | estado: ${p.estado} | fase: ${p.fase?.nombre ?? '—'}`,
      `  modalidad: ${p.modalidad?.nombre ?? '—'} | adicción: ${p.adiccion?.nombre ?? '—'}`,
      `  ingreso: ${p.fecha_ingreso}${p.fecha_alta ? ` | alta: ${p.fecha_alta}` : ''}`,
      p.notas ? `  notas: ${p.notas}` : '',
      susSesiones.length > 0
        ? `  sesiones (${susSesiones.length} más recientes):\n${susSesiones.map((s) => `    - ${s}`).join('\n')}`
        : '  sesiones: ninguna registrada',
      susSeguimientos.length > 0
        ? `  seguimiento post-alta: ${susSeguimientos
            .map((s) => `${s.hito_meses}m ${s.completado_at ? 'hecho' : `previsto ${s.fecha_prevista}`}`)
            .join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  });

  return { texto: bloques.join('\n\n'), filas: pacientes.length };
}

/** Contexto de dirección: los números del grupo, sin datos personales. */
async function contextoDireccion(supabase: Cliente): Promise<{ texto: string; filas: number }> {
  const desde = new Date(Date.now() - 90 * 86_400_000).toISOString();

  const [{ data: leads }, { data: conversiones }, { data: centros }, { data: pacientes }] =
    await Promise.all([
      supabase
        .from('leads')
        .select('estado, created_at, centro:centros (nombre), canal:canales (nombre)')
        .gte('created_at', desde)
        .limit(2000),
      supabase
        .from('conversiones')
        .select('importe_primer_pago, estado, created_at, centro:centros (nombre)')
        .gte('created_at', desde)
        .limit(1000),
      supabase.from('centros').select('nombre').eq('activo', true),
      supabase.from('pacientes').select('estado, centro:centros (nombre)').limit(1000),
    ]);

  const contar = <T>(filas: T[], clave: (f: T) => string) => {
    const mapa = new Map<string, number>();
    for (const f of filas) mapa.set(clave(f), (mapa.get(clave(f)) ?? 0) + 1);
    return Array.from(mapa.entries())
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
  };

  const validadas = (conversiones ?? []).filter((c) => c.estado === 'validada');
  const ingresos = validadas.reduce((s, c) => s + Number(c.importe_primer_pago ?? 0), 0);

  return {
    texto: [
      'DATOS DEL GRUPO — últimos 90 días',
      `Centros activos: ${(centros ?? []).map((c) => c.nombre).join(', ')}`,
      '',
      `Leads: ${(leads ?? []).length}`,
      `  por estado — ${contar(leads ?? [], (l) => l.estado)}`,
      `  por centro — ${contar(leads ?? [], (l) => l.centro?.nombre ?? 'sin centro')}`,
      `  por canal — ${contar(leads ?? [], (l) => l.canal?.nombre ?? 'sin canal')}`,
      '',
      `Conversiones registradas: ${(conversiones ?? []).length} (validadas: ${validadas.length})`,
      `Ingresos validados (primer pago): ${ingresos.toFixed(2)} €`,
      `  por centro — ${contar(validadas, (c) => c.centro?.nombre ?? 'sin centro')}`,
      '',
      `Pacientes en ficha: ${(pacientes ?? []).length}`,
      `  por estado — ${contar(pacientes ?? [], (p) => p.estado)}`,
    ].join('\n'),
    filas: (leads ?? []).length + (conversiones ?? []).length,
  };
}

/**
 * Pregunta al asistente. `supabase` DEBE ser el cliente de la sesión del
 * usuario: si se le pasa la service role, la garantía de permisos se pierde.
 */
export async function preguntar(
  supabase: Cliente,
  opciones: { ambito: Ambito; pregunta: string; usuarioId: string; nombre: string },
): Promise<RespuestaIA> {
  const { ambito, pregunta, usuarioId, nombre } = opciones;

  const registrar = async (respuesta: RespuestaIA): Promise<RespuestaIA> => {
    const { data } = await supabase
      .from('ia_consultas')
      .insert({
        usuario_id: usuarioId,
        ambito,
        pregunta,
        respuesta: respuesta.texto ?? null,
        filas_consultadas: respuesta.filas ?? null,
        error: respuesta.error ?? null,
      })
      .select('id')
      .single();
    return { ...respuesta, consultaId: data?.id };
  };

  const { data: activa } = await supabase
    .from('configuracion')
    .select('valor')
    .eq('clave', 'ia_activa')
    .maybeSingle();
  if (activa?.valor !== true) {
    return registrar({
      ok: false,
      error:
        'El asistente está desactivado. Dirección lo activa en Parámetros, y solo debería hacerlo tras firmar el acuerdo de tratamiento de datos con el proveedor.',
    });
  }

  if (!iaConfigurada()) {
    return registrar({
      ok: false,
      error: 'Falta ANTHROPIC_API_KEY en el servidor. Sin esa clave el asistente no puede responder.',
    });
  }

  const { data: modeloConfig } = await supabase
    .from('configuracion')
    .select('valor')
    .eq('clave', 'ia_modelo')
    .maybeSingle();
  const modelo =
    typeof modeloConfig?.valor === 'string' ? modeloConfig.valor : MODELO_POR_DEFECTO;

  const contexto =
    ambito === 'direccion' ? await contextoDireccion(supabase) : await contextoClinico(supabase);

  try {
    const respuesta = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY as string,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: modelo,
        max_tokens: 1200,
        system: instrucciones(ambito, nombre),
        messages: [
          {
            role: 'user',
            content: `CONTEXTO (todo lo que esta persona puede ver):\n\n${contexto.texto}\n\n---\n\nPREGUNTA: ${pregunta}`,
          },
        ],
      }),
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text();
      return registrar({
        ok: false,
        error: `El proveedor respondió ${respuesta.status}: ${detalle.slice(0, 300)}`,
        filas: contexto.filas,
      });
    }

    const datos = (await respuesta.json()) as { content?: { type: string; text?: string }[] };
    const texto = (datos.content ?? [])
      .filter((bloque) => bloque.type === 'text')
      .map((bloque) => bloque.text ?? '')
      .join('\n')
      .trim();

    if (!texto) {
      return registrar({ ok: false, error: 'El asistente no devolvió texto.', filas: contexto.filas });
    }

    return registrar({ ok: true, texto, filas: contexto.filas });
  } catch (e) {
    return registrar({
      ok: false,
      error: e instanceof Error ? e.message : 'Error desconocido al consultar al asistente.',
      filas: contexto.filas,
    });
  }
}
