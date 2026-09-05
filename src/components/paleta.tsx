'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { buscarRapido, type ResultadoRapido } from '@/app/buscar/acciones';

type Accion = {
  id: string;
  texto: string;
  pista?: string;
  href: string;
  roles?: string[];
};

const ACCIONES: Accion[] = [
  { id: 'nuevo-lead', texto: 'Nuevo lead', pista: 'N', href: '/leads/nuevo' },
  { id: 'nueva-tarea', texto: 'Nueva tarea', pista: 'T', href: '/tareas' },
  { id: 'ir-mi-dia', texto: 'Ir a Mi día', href: '/mi-dia' },
  { id: 'ir-kanban', texto: 'Ir al kanban', pista: 'G K', href: '/leads' },
  { id: 'ir-contactos', texto: 'Ir a contactos', pista: 'G C', href: '/contactos' },
  { id: 'ir-agenda', texto: 'Ir a la agenda', pista: 'G A', href: '/agenda' },
  {
    id: 'ir-panel',
    texto: 'Ir al dashboard',
    pista: 'G D',
    href: '/panel',
    roles: ['direccion'],
  },
  { id: 'ir-admin', texto: 'Ir a administración', href: '/admin', roles: ['direccion'] },
  { id: 'ir-tareas', texto: 'Ir a mis tareas', href: '/tareas' },
];

/** ¿El foco está en un sitio donde la persona está escribiendo? */
function escribiendo(destino: EventTarget | null): boolean {
  const el = destino as HTMLElement | null;
  if (!el) return false;
  const etiqueta = el.tagName;
  return (
    etiqueta === 'INPUT' ||
    etiqueta === 'TEXTAREA' ||
    etiqueta === 'SELECT' ||
    el.isContentEditable
  );
}

/**
 * Paleta de comandos (Ctrl+K / Cmd+K).
 *
 * Busca casos y personas mientras se teclea y ejecuta las acciones de siempre
 * sin soltar el teclado. La búsqueda va por Server Action con la sesión de
 * quien busca, así que RLS decide qué aparece: alguien de Horizonte no
 * encuentra un caso de Eclipse ni escribiendo su nombre exacto.
 */
export function Paleta({ rol }: { rol: string | undefined }) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [termino, setTermino] = useState('');
  const [resultados, setResultados] = useState<ResultadoRapido[]>([]);
  const [buscando, empezarBusqueda] = useTransition();
  const [chuleta, setChuleta] = useState(false);
  const ultimaPeticion = useRef(0);
  /** Momento en que se pulsó «G»: los saltos son en dos tiempos, como en Gmail. */
  const gPulsada = useRef(0);

  const acciones = ACCIONES.filter((a) => !a.roles || (rol && a.roles.includes(rol)));

  /**
   * Atajos globales.
   *
   * Ninguno responde mientras se escribe: dentro de un campo, «n» es una letra.
   * Es la diferencia entre un atajo y una trampa, y por eso se comprueba el
   * foco antes que la tecla.
   *
   * Los saltos van en dos tiempos («G» y luego la inicial) para no gastar
   * letras sueltas que hacen falta al escribir en cualquier sitio.
   */
  useEffect(() => {
    function alPulsar(e: KeyboardEvent) {
      // Ctrl+K funciona siempre, también escribiendo: es la salida de emergencia.
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setAbierta((v) => !v);
        return;
      }
      if (e.key === 'Escape') {
        setChuleta(false);
        return;
      }
      if (escribiendo(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

      // Segundo tiempo de un salto: G seguido de la inicial, dentro de 1,5 s.
      if (Date.now() - gPulsada.current < 1500) {
        const destinos: Record<string, string> = {
          k: '/leads',
          c: '/contactos',
          a: '/agenda',
          d: '/panel',
          m: '/mi-dia',
        };
        const destino = destinos[e.key.toLowerCase()];
        if (destino) {
          e.preventDefault();
          gPulsada.current = 0;
          router.push(destino);
          return;
        }
      }

      switch (e.key.toLowerCase()) {
        case 'g':
          gPulsada.current = Date.now();
          break;
        case 'n':
          e.preventDefault();
          router.push('/leads/nuevo');
          break;
        case 't':
          e.preventDefault();
          router.push('/tareas');
          break;
        case '/':
          e.preventDefault();
          setAbierta(true);
          break;
        case '?':
          e.preventDefault();
          setChuleta((v) => !v);
          break;
      }
    }
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [router]);

  /**
   * Rebote de 140 ms: se busca mientras se teclea, pero no en cada tecla. El
   * contador descarta respuestas que lleguen tarde —una búsqueda corta puede
   * contestar después de una larga y pisar los resultados buenos.
   */
  useEffect(() => {
    const texto = termino.trim();
    if (texto.length < 2) {
      setResultados([]);
      return;
    }
    const mio = ++ultimaPeticion.current;
    const t = setTimeout(() => {
      empezarBusqueda(async () => {
        const r = await buscarRapido(texto);
        if (mio === ultimaPeticion.current) setResultados(r);
      });
    }, 140);
    return () => clearTimeout(t);
  }, [termino]);

  const ir = useCallback(
    (href: string) => {
      setAbierta(false);
      setTermino('');
      setResultados([]);
      router.push(href);
    },
    [router],
  );

  const accionesVisibles = acciones.filter((a) =>
    a.texto.toLowerCase().includes(termino.trim().toLowerCase()),
  );

  return (
    <>
      {chuleta && <Chuleta alCerrar={() => setChuleta(false)} />}
    <Command.Dialog
      open={abierta}
      onOpenChange={setAbierta}
      label="Buscar o ejecutar una acción"
      shouldFilter={false}
      className="fixed inset-0 z-50"
    >
      <div
        className="absolute inset-0 bg-ink/35 motion-safe:transition-opacity"
        onClick={() => setAbierta(false)}
        aria-hidden
      />
      <div className="panel absolute left-1/2 top-[12vh] w-[min(92vw,34rem)] -translate-x-1/2 overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span aria-hidden className="text-muted">
            ⌕
          </span>
          <Command.Input
            value={termino}
            onValueChange={setTermino}
            placeholder="Busca un caso o una persona, o escribe una acción…"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          />
          <kbd className="chip chip-mut hidden sm:inline-flex">Esc</kbd>
        </div>

        <Command.List className="max-h-[min(60vh,26rem)] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-muted">
            {termino.trim().length < 2
              ? 'Escribe al menos dos letras.'
              : buscando
                ? 'Buscando…'
                : 'Nada por aquí. Prueba con el teléfono, con o sin prefijo.'}
          </Command.Empty>

          {accionesVisibles.length > 0 && (
            <Command.Group
              heading="Acciones"
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.1em] [&_[cmdk-group-heading]]:text-muted"
            >
              {accionesVisibles.map((a) => (
                <Command.Item
                  key={a.id}
                  value={`accion-${a.id}`}
                  onSelect={() => ir(a.href)}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink data-[selected=true]:bg-primary-soft data-[selected=true]:text-primary"
                >
                  <span className="flex-1">{a.texto}</span>
                  {a.pista && <kbd className="chip chip-mut">{a.pista}</kbd>}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {resultados.length > 0 && (
            <Command.Group
              heading="Casos y personas"
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.1em] [&_[cmdk-group-heading]]:text-muted"
            >
              {resultados.map((r) => (
                <Command.Item
                  key={`${r.tipo}-${r.id}`}
                  value={`${r.tipo}-${r.id}`}
                  onSelect={() => ir(r.href)}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink data-[selected=true]:bg-primary-soft"
                >
                  <span className={`chip ${r.tipo === 'caso' ? 'chip-primary' : 'chip-mut'}`}>
                    {r.tipo === 'caso' ? 'Caso' : 'Persona'}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{r.nombre}</span>
                  {r.detalle && (
                    <span className="hidden shrink-0 truncate text-xs text-muted sm:block">
                      {r.detalle}
                    </span>
                  )}
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </div>
    </Command.Dialog>
    </>
  );
}

const ATAJOS: [string, string][] = [
  ['Ctrl K', 'Buscar o ejecutar una acción'],
  ['/', 'Lo mismo, sin modificador'],
  ['N', 'Nuevo lead'],
  ['T', 'Mis tareas'],
  ['G luego M', 'Ir a Mi día'],
  ['G luego K', 'Ir al kanban'],
  ['G luego C', 'Ir a contactos'],
  ['G luego A', 'Ir a la agenda'],
  ['G luego D', 'Ir al dashboard'],
  ['↑ ↓', 'Caso anterior / siguiente, con la ficha abierta'],
  ['Esc', 'Cerrar lo que esté abierto'],
  ['?', 'Esta chuleta'],
];

/**
 * La chuleta de atajos.
 *
 * Un atajo que nadie conoce no existe. Esto es lo que hace que el resto del
 * teclado se use: se abre con «?», que es donde la busca cualquiera que venga
 * de Gmail o de Linear.
 */
function Chuleta({ alCerrar }: { alCerrar: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Atajos de teclado"
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-ink/35" onClick={alCerrar} aria-hidden />
      <div className="panel relative w-[min(92vw,26rem)] p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Atajos de teclado</h2>
          <button
            type="button"
            onClick={alCerrar}
            aria-label="Cerrar la chuleta"
            className="text-muted transition hover:text-ink"
          >
            ✕
          </button>
        </div>
        <dl className="flex flex-col gap-1.5 text-[13px]">
          {ATAJOS.map(([tecla, que]) => (
            <div key={tecla} className="flex items-center gap-3">
              <dt className="w-24 shrink-0">
                <kbd className="chip chip-mut">{tecla}</kbd>
              </dt>
              <dd className="text-ink2">{que}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted">
          Ninguno responde mientras escribes en un campo: dentro de un formulario, «n» es una letra.
        </p>
      </div>
    </div>
  );
}
