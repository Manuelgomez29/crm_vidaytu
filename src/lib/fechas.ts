/** Utilidades de fecha. El negocio opera SIEMPRE en Europe/Madrid. */
export const ZONA = 'Europe/Madrid';

/** Desfase real de Madrid (ms) en un instante dado, respetando el cambio de hora. */
function desfaseMadrid(ts: number): number {
  const formato = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const p = Object.fromEntries(
    formato.formatToParts(new Date(ts)).map((parte) => [parte.type, parte.value]),
  );
  const comoUTC = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second),
  );
  return comoUTC - ts;
}

/**
 * Convierte el valor de un <input type="datetime-local"> ("2026-08-29T10:00")
 * a ISO, interpretándolo en Europe/Madrid — no en la zona del servidor.
 */
export function desdeDatetimeLocal(valor: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(valor);
  if (!m) return null;
  const [, a, mes, d, h, min] = m.map(Number) as unknown as number[];
  const nominal = Date.UTC(a, mes - 1, d, h, min);
  let ts = nominal;
  // Dos pasadas: la primera estima el desfase, la segunda lo corrige en los saltos de DST.
  for (let i = 0; i < 2; i++) ts = nominal - desfaseMadrid(ts);
  return new Date(ts).toISOString();
}

/** Fecha (y hora, opcional) legible en castellano y hora de Madrid. */
export function fecha(iso: string | null, conHora = true): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(conHora ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone: ZONA,
  });
}

/** Fecha corta para listados densos (notificaciones). */
export function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ZONA,
  });
}

/** "hoy" / "hace N días", contando días naturales en Madrid. */
export function hace(iso: string): string {
  const diaDe = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: ZONA });
  const dias = Math.round(
    (Date.parse(`${diaDe(new Date())}T00:00:00Z`) - Date.parse(`${diaDe(new Date(iso))}T00:00:00Z`)) /
      86_400_000,
  );
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'hace 1 día';
  return `hace ${dias} días`;
}

/** Fecha de hoy (YYYY-MM-DD) en Madrid, para comparar con columnas `date`. */
export function hoyMadrid(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: ZONA });
}
