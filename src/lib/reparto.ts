/**
 * Reparto automático de leads sin propietario.
 *
 * OPCIONAL Y APAGADO POR DEFECTO. Mientras el equipo se está rodando, la
 * autoasignación con un clic desde la bandeja funciona mejor: el comercial ve
 * el caso, decide si puede con él y lo coge. Un reparto automático mal
 * calibrado reparte casos a quien no puede atenderlos, y eso se nota en el
 * SLA antes que en ningún sitio.
 *
 * Cuando se enciende, reparte con tres criterios, en este orden:
 *
 *   1. Solo a quien tiene el centro del lead asignado. Nadie recibe un caso
 *      de un centro que no lleva.
 *   2. Solo a quien está DISPONIBLE ahora, según sus franjas declaradas.
 *   3. Entre los disponibles, al que menos casos abiertos tiene.
 *
 * Y nunca a alguien ausente (regla 10). Si no hay nadie disponible, el lead se
 * queda sin propietario y sigue destacado en la bandeja: es mejor que se vea
 * que nadie lo ha cogido a que se lo coma la cola de quien está de vacaciones.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { ZONA } from '@/lib/fechas';

type Cliente = SupabaseClient<Database>;

export type ResultadoReparto = { asignados: number; sinCandidato: number };

/**
 * Día de la semana y hora HH:MM en Madrid.
 *
 * 0 = domingo … 6 = sábado, la misma convención que `Date.getDay()` y que la
 * tabla `disponibilidad`. Cambiarla aquí desalinearía en silencio las franjas
 * que el equipo ya tiene declaradas.
 */
function ahoraEnMadrid(): { dia: number; hora: string } {
  const partes = new Intl.DateTimeFormat('es-ES', {
    timeZone: ZONA,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
  const dias: Record<string, number> = { dom: 0, lun: 1, mar: 2, mié: 3, jue: 4, vie: 5, sáb: 6 };
  const abreviatura = valor('weekday').toLowerCase().slice(0, 3);

  return { dia: dias[abreviatura] ?? 1, hora: `${valor('hour')}:${valor('minute')}` };
}

export async function repartirLeadsSinPropietario(admin: Cliente): Promise<ResultadoReparto> {
  const { data: config } = await admin
    .from('configuracion')
    .select('valor')
    .eq('clave', 'reparto_automatico')
    .maybeSingle();
  if (config?.valor !== true) return { asignados: 0, sinCandidato: 0 };

  const { data: sinPropietario } = await admin
    .from('leads')
    .select('id, nombre, centro_id')
    .is('propietario_id', null)
    .not('estado', 'in', '(convertido,perdido,no_valido,derivado)')
    .order('created_at')
    .limit(50);

  if (!sinPropietario || sinPropietario.length === 0) return { asignados: 0, sinCandidato: 0 };

  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: ZONA });
  const { dia, hora } = ahoraEnMadrid();

  const [{ data: centrosPorPerfil }, { data: disponibilidad }, { data: ausentes }, { data: activos }] =
    await Promise.all([
      admin.from('perfil_centros').select('perfil_id, centro_id'),
      admin.from('disponibilidad').select('perfil_id, dia_semana, hora_inicio, hora_fin'),
      admin.from('ausencias').select('perfil_id').lte('desde', hoy).gte('hasta', hoy),
      admin.from('perfiles').select('id').eq('rol', 'admisiones').eq('activo', true),
    ]);

  const ausentesSet = new Set((ausentes ?? []).map((a) => a.perfil_id));
  const activosSet = new Set((activos ?? []).map((p) => p.id));

  const disponiblesAhora = new Set(
    (disponibilidad ?? [])
      .filter(
        (d) =>
          d.dia_semana === dia &&
          String(d.hora_inicio).slice(0, 5) <= hora &&
          String(d.hora_fin).slice(0, 5) > hora,
      )
      .map((d) => d.perfil_id),
  );

  // Carga actual: casos abiertos por comercial.
  const { data: abiertos } = await admin
    .from('leads')
    .select('propietario_id')
    .not('propietario_id', 'is', null)
    .not('estado', 'in', '(convertido,perdido,no_valido,derivado)');

  const carga = new Map<string, number>();
  for (const l of abiertos ?? []) {
    if (l.propietario_id) carga.set(l.propietario_id, (carga.get(l.propietario_id) ?? 0) + 1);
  }

  let asignados = 0;
  let sinCandidato = 0;

  for (const lead of sinPropietario) {
    const candidatos = (centrosPorPerfil ?? [])
      .filter((pc) => pc.centro_id === lead.centro_id)
      .map((pc) => pc.perfil_id)
      .filter(
        (id) => activosSet.has(id) && !ausentesSet.has(id) && disponiblesAhora.has(id),
      );

    if (candidatos.length === 0) {
      sinCandidato++;
      continue;
    }

    const elegido = candidatos.reduce((mejor, id) =>
      (carga.get(id) ?? 0) < (carga.get(mejor) ?? 0) ? id : mejor,
    );

    const { error } = await admin
      .from('leads')
      .update({ propietario_id: elegido })
      .eq('id', lead.id)
      // Carrera: si alguien se lo autoasignó entre la lectura y esta escritura,
      // el filtro no encaja y no se pisa su asignación.
      .is('propietario_id', null);
    if (error) continue;

    carga.set(elegido, (carga.get(elegido) ?? 0) + 1);
    asignados++;

    await admin.from('actividades').insert({
      lead_id: lead.id,
      tipo: 'cambio_estado',
      contenido: 'Asignado automáticamente por disponibilidad',
      usuario_id: null,
    });

    await admin
      .from('notificaciones')
      .upsert(
        {
          usuario_id: elegido,
          tipo: 'lead_asignado' as const,
          lead_id: lead.id,
          mensaje: `Te hemos asignado a ${lead.nombre}`,
          clave: `reparto:${lead.id}`,
        },
        { onConflict: 'clave', ignoreDuplicates: true },
      );
  }

  return { asignados, sinCandidato };
}
