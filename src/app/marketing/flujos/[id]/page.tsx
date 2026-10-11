import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import {
  alternarFlujo,
  borrarFlujo,
  guardarFlujo,
  guardarPasos,
  inscribirPorTelefono,
  sacarInscripcion,
} from '../actions';
import { ESTADOS_LEAD, type PasoEnviado, type TipoPaso } from '../modelo';
import {
  CHIP_INSCRIPCION,
  describirDisparador,
  ETIQUETA_ESTADO,
  NOMBRE_PASO,
  type Disparador,
} from '../describir';
import { Constructor } from './constructor';

/**
 * La ficha de un flujo: su disparador, sus pasos, quién está dentro y qué ha
 * pasado. Todo en una pantalla porque las preguntas van juntas: «¿por qué a
 * esta persona no le llegó el segundo correo?» se contesta mirando su fila, el
 * paso en el que está y sus eventos, sin cambiar de sitio.
 */

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

export default async function FichaFlujo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string; error?: string }>;
}) {
  const { id } = await params;
  const { aviso, error } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .maybeSingle();
  if (perfil?.rol !== 'direccion') redirect('/leads');

  const { data: flujo } = await supabase
    .from('flujos')
    .select('*, centro:centros (nombre)')
    .eq('id', id)
    .maybeSingle();
  if (!flujo) notFound();

  const [
    { data: pasos },
    { data: plantillas },
    { data: etiquetas },
    { data: listas },
    { data: canales },
    { data: fuentes },
    { data: inscripciones },
  ] = await Promise.all([
    supabase
      .from('flujo_pasos')
      .select('id, tipo, config, es_inicio, orden, siguiente_id, siguiente_si_id, siguiente_no_id')
      .eq('flujo_id', id)
      .order('orden'),
    supabase.from('plantillas_email').select('id, nombre').eq('activa', true).order('nombre'),
    supabase.from('etiquetas').select('id, nombre, color').order('nombre'),
    flujo.centro_id
      ? supabase.from('listas').select('id, nombre').or(`centro_id.eq.${flujo.centro_id},centro_id.is.null`).order('nombre')
      : supabase.from('listas').select('id, nombre').order('nombre'),
    supabase.from('canales').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('fuentes_captacion').select('id, nombre').eq('activa', true).order('nombre'),
    supabase
      .from('flujo_inscripciones')
      .select('id, estado, motivo, siguiente_at, updated_at, paso_actual_id, contacto:contactos (nombre)')
      .eq('flujo_id', id)
      .order('updated_at', { ascending: false })
      .limit(60),
  ]);

  const pasosEnviados: PasoEnviado[] = (pasos ?? []).map((p) => ({
    id: p.id,
    clave: p.id,
    tipo: p.tipo as TipoPaso,
    config: (p.config ?? {}) as Record<string, unknown>,
    es_inicio: p.es_inicio,
    orden: p.orden,
    siguiente: p.siguiente_id,
    siguiente_si: p.siguiente_si_id,
    siguiente_no: p.siguiente_no_id,
  }));

  // Estadísticas por paso: cuánta gente está ahora en cada uno, y los correos.
  const pasoIds = (pasos ?? []).map((p) => p.id);
  const [{ data: enCadaPaso }, { data: campanas }, { data: eventos }] = await Promise.all([
    supabase.from('flujo_inscripciones').select('paso_actual_id').eq('flujo_id', id).eq('estado', 'activa'),
    pasoIds.length
      ? supabase
          .from('campanas_email')
          .select('flujo_paso_id, total_enviados, total_aperturas, total_clics, total_bajas')
          .in('flujo_paso_id', pasoIds)
      : Promise.resolve({ data: [] as { flujo_paso_id: string | null; total_enviados: number; total_aperturas: number; total_clics: number; total_bajas: number }[] }),
    (inscripciones ?? []).length
      ? supabase
          .from('flujo_eventos')
          .select('inscripcion_id, paso_id, tipo, detalle, created_at')
          .in('inscripcion_id', (inscripciones ?? []).map((i) => i.id))
          .order('created_at', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as { inscripcion_id: string; paso_id: string | null; tipo: string; detalle: string | null; created_at: string }[] }),
  ]);

  const dentro = new Map<string, number>();
  for (const i of enCadaPaso ?? []) if (i.paso_actual_id) dentro.set(i.paso_actual_id, (dentro.get(i.paso_actual_id) ?? 0) + 1);
  const campanaDe = new Map((campanas ?? []).map((c) => [c.flujo_paso_id, c]));
  const numeroDe = new Map((pasos ?? []).map((p) => [p.id, p.orden + 1]));
  const nombreInscripcion = new Map(
    (inscripciones ?? []).map((i) => [i.id, (i.contacto as { nombre: string } | null)?.nombre ?? '—']),
  );

  const nombres = {
    etiquetas: new Map((etiquetas ?? []).map((e) => [e.id, e.nombre])),
    canales: new Map((canales ?? []).map((c) => [c.id, c.nombre])),
    fuentes: new Map((fuentes ?? []).map((f) => [f.id, f.nombre])),
  };
  const disparador = flujo.disparador as Disparador;
  const salida = (flujo.salida ?? {}) as { al_convertir?: boolean; sin_consentimiento?: boolean; etiqueta_id?: string };
  const centro = (flujo.centro as { nombre: string } | null)?.nombre ?? 'Todo el grupo';
  const activas = (inscripciones ?? []).filter((i) => i.estado === 'activa').length;

  return (
    <AppShell
      seccion="marketing"
      subseccion="/marketing/flujos"
      titulo={flujo.nombre}
      descripcion={`${flujo.activo ? 'Activo' : 'En pausa'} · ${centro} · ${describirDisparador(disparador, nombres)}`}
      acciones={
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/marketing/flujos" className="btn btn-ghost">
            Todos los flujos
          </Link>
          <form action={alternarFlujo.bind(null, id, !flujo.activo)}>
            <button type="submit" className={`btn ${flujo.activo ? 'btn-ghost' : 'btn-coral'}`}>
              {flujo.activo ? 'Pausar' : 'Activar'}
            </button>
          </form>
        </div>
      }
    >
      {aviso && (
        <p className="mb-4 rounded-lg bg-ok-soft px-4 py-3 text-sm text-ok ring-1 ring-ok/25">{aviso}</p>
      )}
      {error && (
        <p className="mb-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-danger/25">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ------------------------------------------------ Columna principal */}
        <div className="flex min-w-0 flex-col gap-4">
          <section className="panel p-4">
            <h2 className="mb-1 text-sm font-semibold">Pasos</h2>
            <p className="mb-3 text-xs text-ink2">
              Añade pasos con «+ paso». Una condición abre dos caminos. Nada se guarda hasta pulsar
              «Guardar pasos», y al guardar se revisan las plantillas contra los términos que no pueden
              salir en un correo.
            </p>
            <Constructor
              pasosIniciales={pasosEnviados}
              plantillas={plantillas ?? []}
              etiquetas={etiquetas ?? []}
              listas={listas ?? []}
              activo={flujo.activo}
              guardar={guardarPasos.bind(null, id)}
            />
          </section>

          <section className="panel p-4">
            <h2 className="mb-1 text-sm font-semibold">Quién está dónde</h2>
            <p className="mb-3 text-xs text-ink2">
              {activas} persona(s) dentro ahora mismo. Se muestran las 60 últimas en moverse.
            </p>
            {(inscripciones ?? []).length === 0 ? (
              <p className="rounded-lg bg-surface2 px-3 py-4 text-center text-sm text-ink2">
                Nadie ha entrado todavía.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="tabla w-full text-sm">
                  <thead>
                    <tr>
                      <th>Persona</th>
                      <th>Estado</th>
                      <th>Paso</th>
                      <th>Siguiente</th>
                      <th>Motivo</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(inscripciones ?? []).map((i) => {
                      const chip = CHIP_INSCRIPCION[i.estado] ?? { texto: i.estado, clase: 'chip-mut' };
                      const paso = (pasos ?? []).find((p) => p.id === i.paso_actual_id);
                      return (
                        <tr key={i.id}>
                          <td className="font-medium">{nombreInscripcion.get(i.id)}</td>
                          <td>
                            <span className={`chip ${chip.clase}`}>{chip.texto}</span>
                          </td>
                          <td className="text-ink2">
                            {paso ? `${paso.orden + 1} · ${NOMBRE_PASO[paso.tipo] ?? paso.tipo}` : '—'}
                          </td>
                          <td className="num text-ink2">{i.estado === 'activa' ? cuando(i.siguiente_at) : '—'}</td>
                          <td className="max-w-56 truncate text-xs text-ink2" title={i.motivo ?? ''}>
                            {i.motivo ?? ''}
                          </td>
                          <td className="text-right">
                            {i.estado === 'activa' && (
                              <form action={sacarInscripcion.bind(null, id, i.id)}>
                                <button type="submit" className="text-xs text-muted hover:text-danger">
                                  sacar
                                </button>
                              </form>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* ------------------------------------------------ Lateral */}
        <aside className="flex flex-col gap-4">
          <section className="panel p-4">
            <h2 className="mb-3 text-sm font-semibold">Disparador y salida</h2>
            <form action={guardarFlujo.bind(null, id)} className="flex flex-col gap-2 text-sm">
              <input name="nombre" defaultValue={flujo.nombre} className="campo" required />
              <textarea
                name="descripcion"
                defaultValue={flujo.descripcion ?? ''}
                placeholder="Para qué es este flujo (lo verá el equipo)"
                rows={2}
                className="campo"
              />

              <label className="mt-1 text-xs text-ink2">Se dispara</label>
              <select name="disparador_tipo" defaultValue={disparador.tipo} className="campo">
                <option value="etiqueta_aplicada">cuando se le pone una etiqueta</option>
                <option value="lead_creado">cuando entra un caso nuevo</option>
                <option value="estado_lead">cuando su caso cambia de estado</option>
                <option value="consentimiento">cuando da su consentimiento</option>
                <option value="manual">solo a mano</option>
              </select>
              <select name="disparador_etiqueta" defaultValue={disparador.etiqueta_id ?? ''} className="campo">
                <option value="">— etiqueta (si es por etiqueta) —</option>
                {(etiquetas ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </select>
              <select name="disparador_canal" defaultValue={disparador.canal_id ?? ''} className="campo">
                <option value="">— cualquier canal (si es por caso nuevo) —</option>
                {(canales ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              <select name="disparador_fuente" defaultValue={disparador.fuente_id ?? ''} className="campo">
                <option value="">— cualquier fuente (si es por caso nuevo) —</option>
                {(fuentes ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nombre}
                  </option>
                ))}
              </select>
              <select name="disparador_estado" defaultValue={disparador.estado ?? ''} className="campo">
                <option value="">— estado (si es por cambio de estado) —</option>
                {ESTADOS_LEAD.map((e) => (
                  <option key={e} value={e}>
                    {ETIQUETA_ESTADO[e]}
                  </option>
                ))}
              </select>

              <label className="mt-2 text-xs text-ink2">Sale del flujo</label>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" name="salida_convertir" defaultChecked={salida.al_convertir !== false} />
                si su caso convierte
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" name="salida_consentimiento" defaultChecked={salida.sin_consentimiento !== false} />
                si retira el consentimiento (solo si el flujo manda correos)
              </label>
              <select name="salida_etiqueta" defaultValue={salida.etiqueta_id ?? ''} className="campo">
                <option value="">— y con esta etiqueta: ninguna —</option>
                {(etiquetas ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    si se le pone «{e.nombre}»
                  </option>
                ))}
              </select>

              <button type="submit" className="btn btn-primary mt-1">
                Guardar
              </button>
            </form>
          </section>

          <section className="panel p-4">
            <h2 className="mb-1 text-sm font-semibold">Inscribir a mano</h2>
            <p className="mb-2 text-xs text-ink2">
              Por teléfono, entre las personas que puedes ver. Entra por el primer paso en la
              siguiente pasada del motor.
            </p>
            <form action={inscribirPorTelefono.bind(null, id)} className="flex gap-2">
              <input name="telefono" placeholder="+34 600 000 000" className="campo flex-1" required />
              <button type="submit" className="btn btn-ghost">
                Inscribir
              </button>
            </form>
          </section>

          <section className="panel p-4">
            <h2 className="mb-2 text-sm font-semibold">Por paso</h2>
            {(pasos ?? []).length === 0 ? (
              <p className="text-xs text-ink2">Sin pasos todavía.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-xs">
                {(pasos ?? []).map((p) => {
                  const c = campanaDe.get(p.id);
                  return (
                    <li key={p.id} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="num w-5 text-ink2">{p.orden + 1}</span>
                      <span className="font-medium">{NOMBRE_PASO[p.tipo] ?? p.tipo}</span>
                      <span className="num text-ink2">{dentro.get(p.id) ?? 0} aquí</span>
                      {c && (
                        <span className="num text-ink2">
                          · {c.total_enviados} enviados · {c.total_aperturas} abiertos · {c.total_clics} clics
                          {c.total_bajas ? ` · ${c.total_bajas} bajas` : ''}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="panel p-4">
            <h2 className="mb-2 text-sm font-semibold">Últimos eventos</h2>
            {(eventos ?? []).length === 0 ? (
              <p className="text-xs text-ink2">Nada todavía.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-xs">
                {(eventos ?? []).map((e, n) => (
                  <li key={n} className="flex gap-2">
                    <span className="num shrink-0 text-muted">{cuando(e.created_at)}</span>
                    <span className="min-w-0">
                      <span className="font-medium">{nombreInscripcion.get(e.inscripcion_id)}</span>{' '}
                      <span className="text-ink2">
                        {e.tipo.replace('_', ' ')}
                        {e.paso_id && numeroDe.get(e.paso_id) ? ` (paso ${numeroDe.get(e.paso_id)})` : ''}
                        {e.detalle ? ` — ${e.detalle}` : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <form action={borrarFlujo.bind(null, id)} className="text-right">
            <button type="submit" className="text-xs text-muted hover:text-danger">
              Borrar este flujo
            </button>
          </form>
        </aside>
      </div>
    </AppShell>
  );
}
