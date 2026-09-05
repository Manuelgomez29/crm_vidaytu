/**
 * Informe mensual del grupo.
 *
 * Los mismos números que el panel, pero congelados en un mes cerrado y
 * ordenados para leerse de un tirón. Se genera el día 1 y se manda a dirección
 * por correo con el enlace a la versión imprimible.
 *
 * Va aquí y no en la página porque lo usan dos sitios: la pantalla y el motor
 * que envía el correo. Que los dos calculen lo mismo no es una casualidad que
 * haya que mantener a mano.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { ZONA } from '@/lib/fechas';

type Cliente = SupabaseClient<Database>;

export type FilaCentro = {
  centro: string;
  leads: number;
  citas: number;
  conversiones: number;
  ingresos: number;
  perdidos: number;
};

export type InformeMensual = {
  mes: string;
  titulo: string;
  desde: string;
  hasta: string;
  leads: number;
  leadsPrevios: number;
  conversiones: number;
  ingresos: number;
  ticketMedio: number;
  citas: number;
  noShows: number;
  porCentro: FilaCentro[];
  porCanal: [string, number][];
  motivosPerdida: [string, number][];
  bandeja: number;
  pacientesAlta: number;
};

/** Primer día del mes anterior al de la fecha dada (o del mes indicado). */
export function mesAnterior(referencia = new Date()): string {
  const enMadrid = new Date(referencia.toLocaleString('en-US', { timeZone: ZONA }));
  const inicio = new Date(Date.UTC(enMadrid.getFullYear(), enMadrid.getMonth() - 1, 1));
  return inicio.toISOString().slice(0, 7);
}

function limites(mes: string): { desde: string; hasta: string } {
  const [anio, m] = mes.split('-').map(Number);
  const desde = new Date(Date.UTC(anio, m - 1, 1));
  const hasta = new Date(Date.UTC(anio, m, 1));
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

function contar(pares: (string | null)[]): [string, number][] {
  const mapa = new Map<string, number>();
  for (const p of pares) {
    if (!p) continue;
    mapa.set(p, (mapa.get(p) ?? 0) + 1);
  }
  return Array.from(mapa.entries()).sort((a, b) => b[1] - a[1]);
}

/**
 * `cliente` debe ser el de la sesión cuando lo pide una pantalla (para que
 * RLS filtre por centros) y la service role cuando lo pide el motor del
 * correo, que escribe a dirección y por tanto ve todo.
 */
export async function calcularInformeMensual(
  cliente: Cliente,
  mes: string,
): Promise<InformeMensual> {
  const { desde, hasta } = limites(mes);
  const previo = limites(mesAnterior(new Date(desde)));

  const [
    { data: leads },
    { data: leadsPrevios },
    { data: conversiones },
    { data: citas },
    { data: pacientes },
    { data: centros },
    { data: canales },
    { data: motivos },
  ] = await Promise.all([
    cliente
      .from('leads')
      .select('id, centro_id, canal_id, estado, motivo_perdida_id')
      .gte('created_at', desde)
      .lt('created_at', hasta),
    cliente
      .from('leads')
      .select('id', { count: 'exact' })
      .gte('created_at', previo.desde)
      .lt('created_at', previo.hasta),
    cliente
      .from('conversiones')
      .select('id, centro_id, importe_primer_pago, estado')
      .eq('estado', 'validada')
      .gte('created_at', desde)
      .lt('created_at', hasta),
    cliente
      .from('citas')
      .select('id, centro_id, estado')
      .gte('inicio', desde)
      .lt('inicio', hasta),
    cliente
      .from('pacientes')
      .select('id')
      .gte('fecha_ingreso', desde.slice(0, 10))
      .lt('fecha_ingreso', hasta.slice(0, 10)),
    cliente.from('centros').select('id, nombre, es_bandeja_grupo'),
    cliente.from('canales').select('id, nombre'),
    cliente.from('motivos_perdida').select('id, nombre'),
  ]);

  const nombreCanal = new Map((canales ?? []).map((c) => [c.id, c.nombre]));
  const nombreMotivo = new Map((motivos ?? []).map((m) => [m.id, m.nombre]));

  const porCentro: FilaCentro[] = (centros ?? []).map((c) => ({
    centro: c.nombre,
    leads: (leads ?? []).filter((l) => l.centro_id === c.id).length,
    citas: (citas ?? []).filter((x) => x.centro_id === c.id).length,
    conversiones: (conversiones ?? []).filter((x) => x.centro_id === c.id).length,
    ingresos: (conversiones ?? [])
      .filter((x) => x.centro_id === c.id)
      .reduce((s, x) => s + Number(x.importe_primer_pago ?? 0), 0),
    perdidos: (leads ?? []).filter((l) => l.centro_id === c.id && l.estado === 'perdido').length,
  }));

  const ingresos = (conversiones ?? []).reduce(
    (s, c) => s + Number(c.importe_primer_pago ?? 0),
    0,
  );

  const bandejaId = (centros ?? []).find((c) => c.es_bandeja_grupo)?.id;

  const [anio, m] = mes.split('-').map(Number);
  const titulo = new Date(Date.UTC(anio, m - 1, 1)).toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return {
    mes,
    titulo: titulo.charAt(0).toUpperCase() + titulo.slice(1),
    desde: desde.slice(0, 10),
    hasta: hasta.slice(0, 10),
    leads: (leads ?? []).length,
    leadsPrevios: (leadsPrevios ?? []).length,
    conversiones: (conversiones ?? []).length,
    ingresos,
    ticketMedio:
      (conversiones ?? []).length > 0 ? Math.round(ingresos / (conversiones ?? []).length) : 0,
    citas: (citas ?? []).length,
    noShows: (citas ?? []).filter((c) => c.estado === 'no_show').length,
    porCentro: porCentro.filter((f) => f.leads > 0 || f.conversiones > 0 || f.citas > 0),
    porCanal: contar((leads ?? []).map((l) => nombreCanal.get(l.canal_id) ?? null)),
    motivosPerdida: contar(
      (leads ?? [])
        .filter((l) => l.estado === 'perdido')
        .map((l) => (l.motivo_perdida_id ? (nombreMotivo.get(l.motivo_perdida_id) ?? null) : null)),
    ),
    bandeja: bandejaId ? (leads ?? []).filter((l) => l.centro_id === bandejaId).length : 0,
    pacientesAlta: (pacientes ?? []).length,
  };
}

/** Cuerpo del correo. Texto plano, sin un solo dato personal. */
export function cuerpoInformeMensual(informe: InformeMensual, url: string): string {
  const variacion =
    informe.leadsPrevios > 0
      ? ` (${informe.leads >= informe.leadsPrevios ? '+' : ''}${Math.round(
          ((informe.leads - informe.leadsPrevios) / informe.leadsPrevios) * 100,
        )}% vs mes anterior)`
      : '';

  return [
    `Informe de ${informe.titulo} — Grupo Vidaitu`,
    '',
    `· Leads nuevos: ${informe.leads}${variacion}`,
    `· Citas: ${informe.citas} (${informe.noShows} no presentados)`,
    `· Conversiones validadas: ${informe.conversiones}`,
    `· Ingresos validados: ${informe.ingresos.toFixed(2)} €`,
    `· Ticket medio: ${informe.ticketMedio} €`,
    `· Nacidos en la bandeja de grupo: ${informe.bandeja}`,
    `· Pacientes que empezaron tratamiento: ${informe.pacientesAlta}`,
    '',
    'Por centro:',
    ...informe.porCentro.map(
      (c) =>
        `  ${c.centro}: ${c.leads} leads · ${c.conversiones} conversiones · ${c.ingresos.toFixed(2)} €`,
    ),
    '',
    informe.motivosPerdida.length > 0
      ? `Motivos de pérdida: ${informe.motivosPerdida.map(([m, n]) => `${m} (${n})`).join(', ')}`
      : '',
    '',
    `Versión completa e imprimible: ${url}`,
  ]
    .filter((l) => l !== undefined)
    .join('\n');
}
