import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { desdeDatetimeLocal, hoyMadrid, hace } from '@/lib/fechas';
import { euros } from '@/lib/metricas';
import { RefrescoVivo } from './refresco-vivo';

export const dynamic = 'force-dynamic';

const CHIP_CENTRO: Record<string, string> = {
  horizonte: 'chip-hz',
  eclipse: 'chip-ec',
  bellamar: 'chip-bm',
  'bandeja-grupo': 'chip-gr',
};

function Bloque({
  titulo,
  cuenta,
  urgente,
  vacio,
  children,
}: {
  titulo: string;
  cuenta: number;
  urgente?: boolean;
  vacio: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className={urgente && cuenta > 0 ? 'text-danger' : ''}>{titulo}</span>
        <span className={`chip ${urgente && cuenta > 0 ? 'chip-danger' : 'chip-mut'}`}>{cuenta}</span>
      </h2>
      {cuenta === 0 ? <p className="text-[13px] text-muted">{vacio}</p> : children}
    </section>
  );
}

function FilaCaso({
  id,
  nombre,
  pie,
  slug,
  alerta,
}: {
  id: string;
  nombre: string;
  pie: string;
  slug?: string;
  alerta?: string;
}) {
  return (
    <Link
      href={`/leads/${id}`}
      className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition hover:bg-ground focus-visible:bg-ground"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium">{nombre}</span>
        <span className="block truncate text-xs text-muted">{pie}</span>
      </span>
      {alerta && <span className="chip chip-danger shrink-0">{alerta}</span>}
      {slug && <span className={`chip ${CHIP_CENTRO[slug] ?? 'chip-mut'} shrink-0`}>&nbsp;</span>}
    </Link>
  );
}

/**
 * «Mi día»: la primera pantalla tras entrar.
 *
 * El kanban enseña el estado del embudo; esto enseña qué hay que hacer AHORA, y
 * en el orden en que hay que hacerlo: primero lo que incumple el SLA, luego lo
 * que vence hoy, luego lo que se está enfriando. El tablero queda a un clic.
 *
 * Todos los umbrales salen de `configuracion` (regla 13), los mismos que usa el
 * motor de alertas: si dirección cambia el SLA a 30 minutos, esta pantalla lo
 * respeta sin tocar código.
 */
export default async function MiDia() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('nombre, rol')
    .eq('id', user.id)
    .maybeSingle();

  // Cada rol tiene su pantalla de inicio; «Mi día» es la del área comercial.
  if (perfil?.rol === 'terapeuta') redirect('/agenda');
  if (perfil?.rol === 'administracion') redirect('/facturacion');

  const esDireccion = perfil?.rol === 'direccion';
  const hoy = hoyMadrid();
  const desdeHoy = desdeDatetimeLocal(`${hoy}T00:00`)!;
  const hastaHoy = desdeDatetimeLocal(`${hoy}T23:59`)!;

  const { data: config } = await supabase.from('configuracion').select('clave, valor');
  const parametro = new Map((config ?? []).map((c) => [c.clave, c.valor]));
  const slaMinutos = Number(parametro.get('sla_primera_respuesta_minutos')) || 60;
  const diasPresupuesto = Number(parametro.get('alerta_presupuesto_dias')) || 3;

  const ahora = Date.now();
  const limiteSla = new Date(ahora - slaMinutos * 60_000).toISOString();
  const limitePresupuesto = new Date(ahora - diasPresupuesto * 86_400_000).toISOString();

  const seleccionLead = 'id, nombre, telefono, estado, created_at, centro:centros (nombre, slug)';

  /**
   * Un comercial ve lo suyo; dirección ve todo lo del grupo. No es un filtro de
   * seguridad —de eso ya se encarga RLS— sino de utilidad: una lista con los
   * casos de otros no le dice a nadie qué tiene que hacer hoy.
   */
  const mios = <T extends { eq: (c: string, v: string) => T }>(q: T): T =>
    esDireccion ? q : q.eq('propietario_id', user.id);

  const [
    { data: sinResponder },
    { data: tareas },
    { data: citas },
    { data: presupuestos },
    { count: enBandeja },
    { data: pendientesValidar },
  ] = await Promise.all([
    // 1. SLA en riesgo: abiertos, sin primera respuesta y fuera de plazo.
    mios(
      supabase
        .from('leads')
        .select(seleccionLead)
        .is('primera_respuesta_at', null)
        .lt('created_at', limiteSla)
        .not('estado', 'in', '(perdido,no_valido,convertido)')
        // Por calor y no por antiguedad: si hay diez fuera de plazo, importa
        // cual se llama primero.
        .order('puntuacion', { ascending: false })
        .order('created_at')
        .limit(20) as never,
    ),
    // 2. Tareas de hoy (y lo vencido, que también es de hoy aunque no lo parezca).
    supabase
      .from('tareas')
      .select('id, titulo, vence_at, lead_id, lead:leads (nombre)')
      .eq('responsable_id', user.id)
      .is('completada_at', null)
      .lte('vence_at', hastaHoy)
      .order('vence_at')
      .limit(25),
    // 3. Citas de hoy en las que participo como profesional.
    supabase
      .from('citas')
      .select('id, inicio, tipo, estado, lead_id, lead:leads (nombre, telefono)')
      .eq('profesional_id', user.id)
      .gte('inicio', desdeHoy)
      .lte('inicio', hastaHoy)
      .order('inicio')
      .limit(20),
    // 4. Presupuestos propuestos que nadie ha contestado (mismo criterio que el
    //    motor de alertas: estado «propuesto», no «aceptado» ni «rechazado»).
    supabase
      .from('presupuestos')
      .select('id, importe, created_at, lead:leads (id, nombre, propietario_id)')
      .eq('estado', 'propuesto')
      .lt('created_at', limitePresupuesto)
      .order('created_at')
      .limit(20),
    // 5. Contador de la bandeja de grupo.
    supabase
      .from('leads')
      .select('id, centro:centros!inner (slug)', { count: 'exact', head: true })
      .is('propietario_id', null),
    // 6. Solo dirección: conversiones esperando validación (regla 7).
    esDireccion
      ? supabase
          .from('conversiones')
          .select('id, importe_primer_pago, created_at, lead:leads (id, nombre)')
          .eq('estado', 'pendiente_validacion')
          .order('created_at')
          .limit(15)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  type Caso = {
    id: string;
    nombre: string;
    telefono: string | null;
    estado: string;
    created_at: string;
    centro: { nombre: string; slug: string } | null;
  };

  const casosSla = (sinResponder ?? []) as unknown as Caso[];
  const misPresupuestos = (presupuestos ?? []).filter(
    (p) => esDireccion || (p.lead as { propietario_id: string } | null)?.propietario_id === user.id,
  );

  return (
    <AppShell
      seccion="mi-dia"
      titulo={`Hola, ${(perfil?.nombre ?? '').split(' ')[0] || 'buenos días'}`}
      descripcion="Lo que hay que atender hoy, en orden"
      acciones={
        <Link href="/leads" className="btn btn-ghost">
          Ver el tablero
        </Link>
      }
    >
      <RefrescoVivo />

      {/* Accesos rápidos */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href="/leads/nuevo" className="btn btn-coral">
          + Nuevo lead
        </Link>
        <Link href="/tareas" className="btn btn-ghost">
          Nueva tarea
        </Link>
        <Link href="/leads?propietario=sin" className="btn btn-ghost">
          Bandeja de grupo
          <span className={`chip ${enBandeja ? 'chip-gr' : 'chip-mut'}`}>{enBandeja ?? 0}</span>
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloque
          titulo="Sin responder"
          cuenta={casosSla.length}
          urgente
          vacio={`Ninguno fuera de plazo. El objetivo es contestar en ${slaMinutos} minutos.`}
        >
          <div className="flex flex-col">
            {casosSla.map((l) => (
              <FilaCaso
                key={l.id}
                id={l.id}
                nombre={l.nombre}
                pie={`${l.centro?.nombre ?? '—'} · entró ${hace(l.created_at)}`}
                slug={l.centro?.slug}
                alerta="Fuera de plazo"
              />
            ))}
          </div>
        </Bloque>

        <Bloque
          titulo="Mis tareas de hoy"
          cuenta={(tareas ?? []).length}
          vacio="Nada pendiente para hoy. Si un caso abierto no tiene próxima acción, ponsela desde su ficha."
        >
          <div className="flex flex-col">
            {(tareas ?? []).map((t) => {
              const vencida = new Date(t.vence_at).getTime() < ahora;
              return (
                <Link
                  key={t.id}
                  href={t.lead_id ? `/leads/${t.lead_id}` : '/tareas'}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition hover:bg-ground"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{t.titulo}</span>
                    <span className="block truncate text-xs text-muted">
                      {(t.lead as { nombre: string } | null)?.nombre ?? 'Sin caso'}
                    </span>
                  </span>
                  <span className={`chip shrink-0 ${vencida ? 'chip-danger' : 'chip-mut'}`}>
                    {new Date(t.vence_at).toLocaleTimeString('es-ES', {
                      timeZone: 'Europe/Madrid',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </Link>
              );
            })}
          </div>
        </Bloque>

        <Bloque
          titulo="Mis citas de hoy"
          cuenta={(citas ?? []).length}
          vacio="Sin citas hoy. Las que agendes aparecerán aquí con su hora."
        >
          <div className="flex flex-col">
            {(citas ?? []).map((c) => (
              <Link
                key={c.id}
                href={c.lead_id ? `/leads/${c.lead_id}` : '/agenda'}
                className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition hover:bg-ground"
              >
                <span className="chip chip-primary shrink-0">
                  {new Date(c.inicio).toLocaleTimeString('es-ES', {
                    timeZone: 'Europe/Madrid',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                  {(c.lead as { nombre: string } | null)?.nombre ?? 'Cita'}
                </span>
              </Link>
            ))}
          </div>
        </Bloque>

        <Bloque
          titulo="Presupuestos sin respuesta"
          cuenta={misPresupuestos.length}
          vacio={`Ninguno esperando. Se avisa a los ${diasPresupuesto} días sin contestar.`}
        >
          <div className="flex flex-col">
            {misPresupuestos.map((p) => {
              const lead = p.lead as { id: string; nombre: string } | null;
              return (
                <FilaCaso
                  key={p.id}
                  id={lead?.id ?? ''}
                  nombre={lead?.nombre ?? '—'}
                  pie={`${euros(Number(p.importe))} · propuesto ${hace(p.created_at)}`}
                  alerta="Sin respuesta"
                />
              );
            })}
          </div>
        </Bloque>

        {esDireccion && (
          <Bloque
            titulo="Conversiones por validar"
            cuenta={(pendientesValidar ?? []).length}
            urgente
            vacio="Nada por validar. Las métricas solo cuentan las conversiones validadas."
          >
            <div className="flex flex-col">
              {(pendientesValidar ?? []).map((c) => {
                const lead = c.lead as { id: string; nombre: string } | null;
                return (
                  <FilaCaso
                    key={c.id}
                    id={lead?.id ?? ''}
                    nombre={lead?.nombre ?? '—'}
                    pie={`${euros(Number(c.importe_primer_pago ?? 0))} · registrada ${hace(c.created_at)}`}
                    alerta="Validar"
                  />
                );
              })}
            </div>
          </Bloque>
        )}
      </div>

      <p className="mt-5 text-xs text-muted">
        Esta pantalla se actualiza sola cuando alguien mueve algo. Los plazos —
        {slaMinutos} minutos de primera respuesta, {diasPresupuesto} días para un presupuesto— los
        cambia dirección en Administración, no se tocan aquí.
      </p>
    </AppShell>
  );
}
