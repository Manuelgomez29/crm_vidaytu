import { ZONA } from '@/lib/fechas';

/** Rango de fechas de un periodo, en clave YYYY-MM-DD de Madrid. */
export type Periodo = { desde: string; hasta: string; titulo: string };

export function clave(fecha: Date): string {
  return fecha.toLocaleDateString('sv-SE', { timeZone: ZONA });
}

/** Periodos predefinidos del panel. `hasta` es exclusivo. */
export function periodoDesdeFiltros(filtros: {
  periodo?: string;
  desde?: string;
  hasta?: string;
}): Periodo {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const mes = ahora.getMonth();

  switch (filtros.periodo) {
    case 'mes_anterior': {
      const inicio = new Date(anio, mes - 1, 1, 12);
      return {
        desde: clave(inicio),
        hasta: clave(new Date(anio, mes, 1, 12)),
        titulo: inicio.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
      };
    }
    case 'trimestre': {
      const inicio = new Date(anio, mes - 2, 1, 12);
      return {
        desde: clave(inicio),
        hasta: clave(new Date(anio, mes + 1, 1, 12)),
        titulo: 'Últimos 3 meses',
      };
    }
    case 'anio': {
      return {
        desde: clave(new Date(anio, 0, 1, 12)),
        hasta: clave(new Date(anio + 1, 0, 1, 12)),
        titulo: String(anio),
      };
    }
    case 'rango': {
      const desde = filtros.desde || clave(new Date(anio, mes, 1, 12));
      const hastaInclusive = filtros.hasta || clave(ahora);
      const siguiente = new Date(`${hastaInclusive}T12:00:00`);
      siguiente.setDate(siguiente.getDate() + 1);
      return {
        desde,
        hasta: clave(siguiente),
        titulo: `Del ${new Date(`${desde}T12:00:00`).toLocaleDateString('es-ES', {
          day: 'numeric',
          month: 'short',
        })} al ${new Date(`${hastaInclusive}T12:00:00`).toLocaleDateString('es-ES', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}`,
      };
    }
    default: {
      const inicio = new Date(anio, mes, 1, 12);
      return {
        desde: clave(inicio),
        hasta: clave(new Date(anio, mes + 1, 1, 12)),
        titulo: inicio.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
      };
    }
  }
}

/** Primer día del mes al que pertenece el periodo (para casar con `objetivos.mes`). */
export function mesDelPeriodo(periodo: Periodo): string {
  const d = new Date(`${periodo.desde}T12:00:00`);
  return clave(new Date(d.getFullYear(), d.getMonth(), 1, 12));
}

export function euros(importe: number): string {
  return importe.toLocaleString('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
}

export function porcentaje(parte: number, total: number): string {
  if (total === 0) return '—';
  return `${Math.round((parte / total) * 100)}%`;
}

/** Minutos transcurridos entre dos instantes. */
export function minutosEntre(desde: string, hasta: string): number {
  return (new Date(hasta).getTime() - new Date(desde).getTime()) / 60_000;
}

/**
 * Periodo inmediatamente anterior y de la misma duración, para comparar.
 * Un mes se compara con el mes anterior; un rango de N días, con los N días
 * previos.
 */
export function periodoAnterior(periodo: Periodo): { desde: string; hasta: string; titulo: string } {
  const desde = new Date(`${periodo.desde}T12:00:00`);
  const hasta = new Date(`${periodo.hasta}T12:00:00`);

  // Si el periodo es un mes natural completo, el anterior es el mes previo.
  const esMesNatural =
    desde.getDate() === 1 && hasta.getDate() === 1 && hasta.getMonth() !== desde.getMonth();

  if (esMesNatural) {
    const inicio = new Date(desde.getFullYear(), desde.getMonth() - 1, 1, 12);
    return {
      desde: clave(inicio),
      hasta: periodo.desde,
      titulo: inicio.toLocaleDateString('es-ES', { month: 'long' }),
    };
  }

  const dias = Math.round((hasta.getTime() - desde.getTime()) / 86_400_000);
  const inicio = new Date(desde);
  inicio.setDate(inicio.getDate() - dias);
  return { desde: clave(inicio), hasta: periodo.desde, titulo: `los ${dias} días previos` };
}

/** Variación porcentual entre dos cifras, o null si no hay base con la que comparar. */
export function variacion(actual: number, anterior: number): number | null {
  if (anterior === 0) return actual === 0 ? 0 : null;
  return Math.round(((actual - anterior) / anterior) * 100);
}
