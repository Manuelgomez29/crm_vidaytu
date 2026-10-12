import { CabeceraPagina } from './app-shell';

/**
 * Esqueletos de carga: la pantalla dibujada en gris mientras llegan sus datos.
 *
 * Los pinta el `loading.tsx` de cada ruta. Next los precarga para los enlaces
 * del menú, así que al pulsar aparecen en el mismo instante, con el menú y la
 * barra de arriba quietos, y los datos rellenan el hueco al llegar.
 *
 * Tres reglas, para que el esqueleto ayude en vez de estorbar:
 *
 *   · Misma retícula que la pantalla de verdad: mismas columnas, mismos
 *     paneles, misma altura aproximada. Si el esqueleto tiene otra forma, al
 *     llegar los datos todo salta, y eso se nota más que esperar.
 *   · La cabecera es la de verdad (`CabeceraPagina`), con el título real cuando
 *     no depende de datos. Lo primero que se lee ya es cierto.
 *   · Cada pantalla tiene el SUYO y solo el suyo. Un esqueleto de sección
 *     («leads») se colaría delante de las fichas que cuelgan de ella: abrir un
 *     caso enseñaría un instante el tablero en gris. Por eso las portadas de
 *     sección viven en un grupo `(inicio)` con su propio `loading.tsx`.
 *
 * Para quien usa lector de pantalla: el contenedor está `aria-busy` y anuncia
 * «Cargando…» una vez; las piezas grises son `aria-hidden`.
 */

type Cabecera = {
  /** El título real si es fijo. Si depende de datos, se omite y va una barra. */
  titulo?: string;
  /** Texto real si es fijo; `true` si la pantalla lleva subtítulo variable. */
  descripcion?: string | boolean;
};

/** Una pieza gris. `sobreGris` para las que van encima de un fondo ya gris. */
function B({ className = '', sobreGris }: { className?: string; sobreGris?: boolean }) {
  return (
    <span
      aria-hidden
      className={`esqueleto ${sobreGris ? 'esqueleto-sobre-gris' : ''} ${className}`}
    />
  );
}

function Marco({ titulo, descripcion, children }: Cabecera & { children: React.ReactNode }) {
  return (
    <div aria-busy="true" className="esqueleto-entrada">
      <p role="status" className="sr-only">
        Cargando…
      </p>
      <CabeceraPagina
        titulo={
          titulo ?? <B className="inline-block h-[0.95em] w-52 max-w-[55vw] align-[-0.1em]" />
        }
        descripcion={
          typeof descripcion === 'string' ? (
            descripcion
          ) : descripcion ? (
            <B className="inline-block h-[0.9em] w-80 max-w-[65vw] align-[-0.1em]" />
          ) : undefined
        }
      />
      {children}
    </div>
  );
}

/** Anchos de texto que no parezcan de imprenta: siempre los mismos, sin azar. */
const ANCHOS = ['w-3/5', 'w-2/5', 'w-4/5', 'w-1/2', 'w-2/3', 'w-1/3', 'w-3/4'];
const ancho = (i: number) => ANCHOS[i % ANCHOS.length];

/** Un panel con un titulillo y unas líneas: el ladrillo de casi todo. */
function PanelLineas({ lineas = 4, semilla = 0 }: { lineas?: number; semilla?: number }) {
  return (
    <div className="panel p-4">
      <B className="mb-4 h-3.5 w-36" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: lineas }, (_, i) => (
          <B key={i} className={`h-3 ${ancho(i + semilla)}`} />
        ))}
      </div>
    </div>
  );
}

/** Filas de tabla dentro de un panel, con su cabecera. */
function PanelTabla({ filas = 8, columnas = 5 }: { filas?: number; columnas?: number }) {
  const cols = Array.from({ length: columnas }, (_, c) => c);
  return (
    <div className="panel">
      <div className="flex gap-4 border-b border-line bg-surface2/50 px-4 py-3">
        {cols.map((c) => (
          <B
            key={c}
            className={`h-2.5 flex-1 ${c === 0 ? 'max-w-40' : 'max-w-24'} ${c > 2 ? 'hidden sm:block' : ''}`}
          />
        ))}
      </div>
      {Array.from({ length: filas }, (_, f) => (
        <div
          key={f}
          className="flex items-center gap-4 border-b border-line px-4 py-3.5 last:border-b-0"
        >
          {cols.map((c) => (
            <div key={c} className={`flex-1 ${c > 2 ? 'hidden sm:block' : ''}`}>
              <B className={`h-3 ${c === 0 ? ancho(f) : ancho(f + c + 2)}`} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Una fila de campos de filtro, del alto de un `.campo`. */
function Campos({ anchos, className = '' }: { anchos: string[]; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {anchos.map((w, i) => (
        <B key={i} className={`h-9 max-w-full rounded-lg ${w} ${i > 1 ? 'hidden sm:block' : ''}`} />
      ))}
    </div>
  );
}

/** Un selector segmentado (Tablero/Tabla, Mes/Semana…): cápsula gris con huecos. */
function Segmentado({ piezas = 2, className = '' }: { piezas?: number; className?: string }) {
  return (
    <div className={`inline-flex gap-1 rounded-lg bg-surface2 p-1 ${className}`}>
      {Array.from({ length: piezas }, (_, i) => (
        <B key={i} sobreGris className="h-7 w-16" />
      ))}
    </div>
  );
}

/** El panel de alta que encabeza varias listas: título, explicación y campos. */
function PanelAlta({ filas = 2 }: { filas?: number }) {
  return (
    <div className="panel mb-5 p-4">
      <B className="mb-2.5 h-3.5 w-36" />
      <B className="mb-1.5 h-2.5 w-full max-w-2xl" />
      <B className="mb-4 h-2.5 w-2/3 max-w-xl" />
      <div className="flex flex-col gap-3">
        <Campos anchos={['flex-1 min-w-48', 'w-44', 'w-44']} />
        {filas > 2 && <Campos anchos={['w-48', 'w-48']} />}
        {filas > 1 && <Campos anchos={['w-48', 'w-24']} />}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Por pantalla. Cada una medida contra la pantalla real: mismas piezas, en el
   mismo orden y a la misma altura aproximada.
   --------------------------------------------------------------------------- */

/** Cualquier pantalla de ajustes o formulario: paneles con líneas. */
export function EsqueletoGenerico(props: Cabecera) {
  return (
    <Marco {...props}>
      <div className="flex max-w-4xl flex-col gap-4">
        <PanelLineas lineas={3} />
        <PanelLineas lineas={5} semilla={2} />
        <PanelLineas lineas={4} semilla={4} />
      </div>
    </Marco>
  );
}

/** Listados: un panel de alta o una fila de filtros arriba, y una tabla. */
export function EsqueletoTabla({
  formulario,
  filas,
  columnas,
  ...props
}: Cabecera & { formulario?: boolean; filas?: number; columnas?: number }) {
  return (
    <Marco {...props}>
      {formulario ? <PanelAlta /> : <Campos className="mb-4" anchos={['w-56', 'w-28', 'w-28']} />}
      <PanelTabla filas={filas} columnas={columnas} />
    </Marco>
  );
}

/** El kanban: columnas grises con tarjetas blancas. En el móvil, una columna. */
export function EsqueletoKanban(props: Cabecera) {
  const tarjetasPorColumna = [4, 3, 5, 2, 3];
  return (
    <Marco {...props}>
      <Segmentado className="mb-6" />
      {/* Los filtros: en el ordenador, dos filas y «Filtrar»; en el móvil van plegados. */}
      <div className="mb-4 hidden flex-col gap-2 sm:flex">
        <Campos anchos={['w-48', 'w-36', 'w-36']} />
        <Campos anchos={['w-48', 'w-40', 'w-28', 'w-28']} />
        <B className="h-8 w-16 rounded-lg" />
      </div>
      <B className="mb-4 h-9 w-full rounded-lg sm:hidden" />
      <div className="flex items-start gap-3 overflow-hidden pb-4">
        {tarjetasPorColumna.map((n, col) => (
          <div
            key={col}
            className={`${col === 0 ? 'flex' : 'hidden sm:flex'} w-full shrink-0 flex-col rounded-xl bg-surface2 p-2.5 ring-1 ring-line sm:w-72`}
          >
            <div className="mb-2.5 flex items-center justify-between">
              <B sobreGris className="h-2.5 w-24" />
              <B sobreGris className="h-4 w-6 rounded-full" />
            </div>
            <div className="flex flex-col gap-2">
              {Array.from({ length: n }, (_, i) => (
                <div key={i} className="tarjeta">
                  <B className={`mb-2.5 h-3.5 ${ancho(i + col)}`} />
                  <div className="mb-2.5 flex gap-1.5">
                    <B className="h-4 w-20 rounded-full" />
                    <B className="h-4 w-14 rounded-full" />
                  </div>
                  <B className="mb-2 h-3 w-1/2" />
                  <B className="mb-3 h-3 w-2/3" />
                  <div className="flex items-center justify-between">
                    <B className="h-3 w-1/2" />
                    <B className="h-6 w-6 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Marco>
  );
}

/** La ficha de un caso o de un contacto: nombre y botones, y dos columnas. */
export function EsqueletoFicha(props: Cabecera) {
  return (
    <Marco {...props}>
      <B className="mb-3 h-3 w-28" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <B className="h-6 w-40" />
            {['w-14', 'w-28', 'w-48'].map((w, i) => (
              <B key={w} className={`h-5 rounded-full ${w} ${i > 1 ? 'hidden sm:block' : ''}`} />
            ))}
          </div>
          <B className="mb-1.5 h-5 w-44" />
          <B className="h-3 w-56 max-w-full" />
        </div>
        <div className="flex gap-2">
          <B className="h-9 w-28 rounded-lg" />
          <B className="h-9 w-36 rounded-lg" />
        </div>
      </div>
      <B className="mt-4 h-10 w-full rounded-lg" />
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <PanelLineas lineas={3} />
          <PanelLineas lineas={6} semilla={3} />
        </div>
        <div className="flex flex-col gap-4">
          <PanelLineas lineas={8} semilla={1} />
          <PanelLineas lineas={3} semilla={5} />
        </div>
      </div>
    </Marco>
  );
}

/** Mis tareas: los dos selectores, el alta y las filas con su botón. */
export function EsqueletoLista(props: Cabecera) {
  return (
    <Marco {...props}>
      <div className="mb-4 flex flex-wrap gap-3">
        <Segmentado />
        <Segmentado />
      </div>
      {/* Su alta lleva etiqueta encima de cada campo: una fila más de alto. */}
      <PanelAlta filas={3} />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="panel flex flex-wrap items-center gap-3 p-3">
            <B className="h-5 w-5 rounded-md" />
            <div className="min-w-0 flex-1">
              <B className={`mb-2 h-3.5 ${ancho(i)}`} />
              <B className="h-2.5 w-1/4" />
            </div>
            <B className="h-8 w-20 rounded-lg" />
          </div>
        ))}
      </div>
    </Marco>
  );
}

/** El directorio de contactos: vistas a la izquierda; filtros y tabla a la derecha. */
export function EsqueletoDirectorio(props: Cabecera) {
  return (
    <Marco {...props}>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[230px_1fr]">
        <div className="panel order-last p-2.5 lg:order-none">
          <B className="mb-2.5 ml-1.5 h-2.5 w-12" />
          <B className="mb-3 h-8 w-full rounded-md" />
          <B className="ml-1.5 h-3 w-36" />
        </div>
        <div className="min-w-0">
          <Campos className="mb-2" anchos={['w-60', 'w-44', 'w-44']} />
          <B className="mb-4 h-8 w-20 rounded-lg" />
          <B className="mb-2.5 h-3 w-48" />
          <PanelTabla filas={10} columnas={5} />
        </div>
      </div>
    </Marco>
  );
}

/** La agenda: la semana, con la columna de horas a la izquierda. */
export function EsqueletoAgenda(props: Cabecera) {
  return (
    <Marco {...props}>
      <div className="mb-3 flex">
        <Segmentado piezas={3} className="ml-auto" />
      </div>
      <div className="mb-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <B className="h-9 w-10 rounded-lg" />
          <B className="h-9 w-14 rounded-lg" />
          <B className="h-9 w-10 rounded-lg" />
          <B className="ml-1 h-3.5 w-56 max-w-[40vw]" />
        </div>
        <Campos anchos={['w-56', 'w-56', 'w-20']} />
      </div>
      <div className="panel overflow-hidden">
        <div className="grid grid-cols-[44px_repeat(7,minmax(0,1fr))] border-b border-line">
          <span />
          {Array.from({ length: 7 }, (_, d) => (
            <div key={d} className="flex flex-col items-center gap-1.5 border-l border-line py-2.5">
              <B className="h-2.5 w-8" />
              <B className="h-3 w-4" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[44px_repeat(7,minmax(0,1fr))]">
          <div className="flex flex-col items-center gap-[46px] pt-2">
            {Array.from({ length: 7 }, (_, h) => (
              <B key={h} className="h-2.5 w-7" />
            ))}
          </div>
          {Array.from({ length: 7 }, (_, d) => (
            <div key={d} className="flex min-h-96 flex-col gap-2 border-l border-line p-1.5 sm:p-2">
              {Array.from({ length: [2, 1, 2, 0, 1, 0, 0][d] }, (_, i) => (
                <B key={i} className={`h-12 w-full rounded-md ${i ? 'mt-10' : 'mt-4'}`} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </Marco>
  );
}

/** El dashboard: periodo, filtro, fila de cifras y paneles de gráficos. */
export function EsqueletoCuadro(props: Cabecera) {
  return (
    <Marco {...props}>
      <div className="mb-3 flex">
        <Segmentado piezas={5} className="ml-auto max-w-full overflow-hidden" />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <B className="h-9 w-56 rounded-lg" />
        <B className="h-9 w-20 rounded-lg" />
        <B className="h-3 w-24" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={`panel p-4 ${i > 1 ? 'hidden sm:block' : ''}`}>
            <B className="mb-3 h-2.5 w-24" />
            <B className="mb-2 h-7 w-16" />
            <B className="h-2.5 w-28" />
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="panel p-4">
            <B className="mb-4 h-3.5 w-40" />
            <div className="flex h-44 items-end gap-2">
              {[55, 80, 40, 95, 65, 75, 30, 60].map((h, j) => (
                <span key={j} className="flex-1" style={{ height: `${(h + i * 7) % 100}%` }}>
                  <B className="h-full rounded-b-none" />
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Marco>
  );
}

/** Mi día: los atajos y las listas de lo que toca hoy. */
export function EsqueletoMiDia(props: Cabecera) {
  return (
    <Marco {...props}>
      <div className="mb-4 flex flex-wrap gap-2">
        <B className="h-9 w-28 rounded-lg" />
        <B className="h-9 w-28 rounded-lg" />
        <B className="h-9 w-28 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((p) => (
          <div key={p} className="panel p-4">
            <B className="mb-4 h-3.5 w-36" />
            <div className="flex flex-col gap-3.5">
              {Array.from({ length: [5, 2, 3, 2][p] }, (_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <B className={`mb-1.5 h-3 ${ancho(i + p)}`} />
                    <B className="h-2.5 w-1/3" />
                  </div>
                  <B className="hidden h-5 w-24 rounded-full sm:block" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Marco>
  );
}

/** La portada de Configuración: rejilla de tarjetas-enlace. */
export function EsqueletoTarjetas(props: Cabecera) {
  return (
    <Marco {...props}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="panel p-4">
            <B className="mb-3 h-2.5 w-28" />
            <B className="mb-2 h-4 w-24" />
            <B className="mb-1.5 h-2.5 w-full" />
            <B className={`h-2.5 ${ancho(i)}`} />
          </div>
        ))}
      </div>
    </Marco>
  );
}
