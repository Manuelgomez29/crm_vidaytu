/**
 * El cruce de datos del panel: dos dimensiones cualesquiera y una métrica.
 *
 * Vivía dentro del JSX de la pantalla, así que se redefinía en cada render y no
 * había forma de probarlo sin abrir un navegador. Aquí se puede: son funciones
 * puras sobre una lista de casos, y `scripts/verificar-cruce.ts` las recorre
 * todas —cada dimensión contra cada dimensión, con cada métrica— comparando el
 * resultado con la cuenta hecha aparte.
 *
 * Se calcula en la aplicación y no en la base a propósito: las combinaciones son
 * pocas, los datos ya vienen filtrados por RLS, y pedirle a Postgres un pivote
 * dinámico obligaría a construir SQL con nombres de columna que vienen de la
 * URL. Eso no se hace.
 */
import { ETIQUETA_ESTADO, type EstadoLead } from '@/lib/estados';

export type Conversion = { importe_primer_pago: number | null; estado: string };

export type FilaCruce = {
  id: string;
  estado: string;
  urgencia: string | null;
  centro: { nombre: string } | null;
  canal: { nombre: string } | null;
  propietario: { nombre: string } | null;
  /*
   * Objeto O lista, y por eso está escrito así.
   *
   * PostgREST devuelve un objeto suelto cuando la relación incrustada resuelve a
   * una sola fila, y una lista cuando resuelve a varias. El código daba por
   * hecho que siempre era lista y llamaba a `.filter`, con lo que la pantalla
   * reventaba en producción en cuanto un caso tenía exactamente una conversión.
   * No lo cazó nadie porque la comprobación que hice miraba solo la primera fila
   * —que venía a null— y el `as unknown as` de entonces callaba a TypeScript.
   *
   * De aquí sale una sola conclusión práctica: NADIE lee `.conversiones`
   * directamente. Se lee con `conversionesDe`, que normaliza las dos formas.
   */
  conversiones: Conversion | Conversion[] | null;
};

/** Las conversiones de un caso, venga PostgREST con objeto o con lista. */
export function conversionesDe(fila: FilaCruce): Conversion[] {
  const c = fila.conversiones;
  if (!c) return [];
  return Array.isArray(c) ? c : [c];
}

export const DIMENSIONES: Record<string, { texto: string; de: (l: FilaCruce) => string }> = {
  centro: { texto: 'Centro', de: (l) => l.centro?.nombre ?? 'Sin centro' },
  canal: { texto: 'Canal', de: (l) => l.canal?.nombre ?? 'Sin canal' },
  estado: {
    texto: 'Estado',
    de: (l) => ETIQUETA_ESTADO[l.estado as EstadoLead]?.texto ?? l.estado,
  },
  propietario: { texto: 'Propietario', de: (l) => l.propietario?.nombre ?? 'Sin asignar' },
  urgencia: { texto: 'Urgencia', de: (l) => l.urgencia ?? 'Sin marcar' },
};

export const METRICAS: Record<string, { texto: string; de: (l: FilaCruce) => number }> = {
  casos: { texto: 'Casos', de: () => 1 },
  conversiones: {
    texto: 'Conversiones validadas',
    de: (l) => conversionesDe(l).filter((c) => c.estado === 'validada').length,
  },
  ingresos: {
    texto: 'Ingresos validados',
    de: (l) =>
      conversionesDe(l)
        .filter((c) => c.estado === 'validada')
        .reduce((s, c) => s + Number(c.importe_primer_pago ?? 0), 0),
  },
};

export const VISTAS: Record<string, string> = {
  tabla: 'Tabla',
  apiladas: 'Barras apiladas',
  columnas: 'Columnas',
  anillo: 'Anillo',
};

/**
 * Qué cruce se pide, a partir de lo que venga en la URL.
 *
 * Todo lo que no reconozca cae en un valor por defecto: los parámetros los
 * escribe cualquiera en la barra de direcciones, y una pantalla no puede
 * romperse porque alguien escriba `cruceFila=loquesea`.
 */
export function resolverCruce(filtros: {
  cruceFila?: string;
  cruceCol?: string;
  cruceMetrica?: string;
  cruceVista?: string;
}) {
  const claveFila = DIMENSIONES[filtros.cruceFila ?? ''] ? filtros.cruceFila! : 'centro';

  /*
   * Cruzar una dimensión consigo misma da una diagonal y nada más. En vez de
   * dejar elegirlo y que la pantalla salga vacía de sentido, se corrige sola a
   * la primera dimensión distinta.
   */
  const pedidaCol = DIMENSIONES[filtros.cruceCol ?? ''] ? filtros.cruceCol! : 'canal';
  const claveCol =
    pedidaCol === claveFila ? Object.keys(DIMENSIONES).find((d) => d !== claveFila)! : pedidaCol;

  const claveMetrica = METRICAS[filtros.cruceMetrica ?? ''] ? filtros.cruceMetrica! : 'casos';
  const vista = VISTAS[filtros.cruceVista ?? ''] ? filtros.cruceVista! : 'tabla';

  return { claveFila, claveCol, claveMetrica, vista };
}

export type Cruce = {
  /** Filas ordenadas de mayor a menor total. Comparar longitudes desordenadas no lo hace nadie. */
  filas: [string, Map<string, number>][];
  cols: string[];
  totalPorCol: number[];
  totalGeneral: number;
  /** El valor más alto de la tabla, para escalar las barras. Nunca cero. */
  maximo: number;
  /** El total de una fila. Va aquí porque depende de qué columnas hay. */
  totalDeFila: (m: Map<string, number>) => number;
};

export function cruzar(
  filas: FilaCruce[],
  claveFila: string,
  claveCol: string,
  claveMetrica: string,
): Cruce {
  const dimFila = DIMENSIONES[claveFila];
  const dimCol = DIMENSIONES[claveCol];
  const metrica = METRICAS[claveMetrica];

  const matriz = new Map<string, Map<string, number>>();
  const columnas = new Set<string>();

  for (const l of filas) {
    const f = dimFila.de(l);
    const c = dimCol.de(l);
    const v = metrica.de(l);
    columnas.add(c);
    if (!matriz.has(f)) matriz.set(f, new Map());
    const fila = matriz.get(f)!;
    fila.set(c, (fila.get(c) ?? 0) + v);
  }

  const cols = [...columnas].sort();
  const totalDeFila = (m: Map<string, number>) => cols.reduce((s, c) => s + (m.get(c) ?? 0), 0);
  const ordenadas = [...matriz.entries()].sort((a, b) => totalDeFila(b[1]) - totalDeFila(a[1]));
  const totalPorCol = cols.map((c) => ordenadas.reduce((s, [, m]) => s + (m.get(c) ?? 0), 0));

  return {
    filas: ordenadas,
    cols,
    totalPorCol,
    totalGeneral: totalPorCol.reduce((s, n) => s + n, 0),
    maximo: Math.max(1, ...ordenadas.flatMap(([, m]) => cols.map((c) => m.get(c) ?? 0))),
    totalDeFila,
  };
}
