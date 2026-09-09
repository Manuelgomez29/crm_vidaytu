'use client';

import { useEffect, useRef } from 'react';
import { useAviso } from './avisos';

/**
 * Un formulario que sobrevive a que se caiga la red.
 *
 * Medido antes de escribir esto: con una nota de 233 caracteres escrita en la
 * ficha de un caso, cortando la conexión y pulsando Guardar, la pantalla entera
 * se sustituía por «Esta pantalla no ha podido cargarse» y la nota desaparecía.
 * Y el mensaje decía «No se ha perdido nada de lo que ya estuviera guardado»,
 * que era literalmente cierto y prácticamente una burla: acababas de perder
 * veinticinco minutos de llamada con una madre.
 *
 * Pasa porque un formulario de React cuyo action revienta propaga el error hasta
 * el límite de error más cercano, y ahí se desmonta el árbol entero —incluido el
 * campo donde estaba lo escrito—. Un comercial atiende desde el móvil, dentro de
 * un centro, con dos rayas: esto no es un caso raro, es un martes.
 *
 * Aquí se hacen dos cosas:
 *
 *   1. El fallo de RED se atrapa y se cuenta con un aviso. La pantalla no se
 *      cae, así que lo escrito sigue en su sitio y se puede reintentar. Solo el
 *      de red: cualquier otro error sigue subiendo como siempre, porque taparlos
 *      todos sería cambiar una pantalla fea por un fallo invisible.
 *
 *   2. Con `borrador`, lo tecleado se guarda en el navegador mientras se
 *      escribe. Eso cubre lo que el punto 1 no puede: que se cierre la pestaña,
 *      que el móvil se quede sin batería, que la aplicación se recargue.
 */

/** ¿Esto es «no hay red», o es un fallo de verdad? */
function esFalloDeRed(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (!(e instanceof Error)) return false;
  // Chrome: «Failed to fetch». Firefox: «NetworkError…». Safari: «Load failed».
  return e instanceof TypeError && /fetch|network|load failed/i.test(e.message);
}

/**
 * Una redirección de Next viaja como excepción con este distintivo.
 *
 * Se mira para saber que la acción SÍ llegó al servidor y el borrador ya no hace
 * falta. Es un detalle interno de Next, así que si algún día cambia lo peor que
 * pasa es que quede un borrador de más — nunca que se pierda uno.
 */
function esRedireccion(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT');
}

const PREFIJO = 'borrador:';
/** Un día. Un borrador más viejo que eso ya no lo quiere nadie, y estorba. */
const CADUCIDAD_MS = 24 * 60 * 60 * 1000;

/** Los campos donde alguien escribe algo que sentiría perder. */
function camposDeTexto(form: HTMLFormElement): (HTMLInputElement | HTMLTextAreaElement)[] {
  return [...form.querySelectorAll('input, textarea')].filter(
    (el): el is HTMLInputElement | HTMLTextAreaElement => {
      if (el instanceof HTMLTextAreaElement) return !!el.name;
      if (!(el instanceof HTMLInputElement)) return false;
      // Nunca contraseñas, y nada sin nombre: no hay dónde devolverlo.
      return !!el.name && ['text', 'search', 'tel', 'email', 'url', ''].includes(el.type);
    },
  );
}

function leerAlmacen(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    // Navegación privada, o el navegador con el almacenamiento bloqueado.
    return null;
  }
}

export function FormularioSeguro({
  accion,
  borrador,
  className,
  children,
}: {
  accion: (formData: FormData) => void | Promise<void>;
  /** Clave para recordar lo escrito. Sin ella, no se guarda nada. */
  borrador?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { mostrar } = useAviso();
  const formRef = useRef<HTMLFormElement>(null);

  const clave = borrador ? PREFIJO + borrador : null;

  const limpiarBorrador = () => {
    const almacen = leerAlmacen();
    if (clave && almacen) almacen.removeItem(clave);
  };

  // Recuperar lo que quedara escrito, y barrer lo viejo de todos los formularios.
  useEffect(() => {
    const almacen = leerAlmacen();
    if (!almacen) return;

    for (let i = almacen.length - 1; i >= 0; i--) {
      const k = almacen.key(i);
      if (!k?.startsWith(PREFIJO)) continue;
      try {
        const { t } = JSON.parse(almacen.getItem(k) ?? '{}');
        if (!t || Date.now() - t > CADUCIDAD_MS) almacen.removeItem(k);
      } catch {
        almacen.removeItem(k);
      }
    }

    if (!clave || !formRef.current) return;
    try {
      const guardado = JSON.parse(almacen.getItem(clave) ?? 'null');
      if (!guardado?.campos) return;
      let algo = false;
      for (const campo of camposDeTexto(formRef.current)) {
        const valor = guardado.campos[campo.name];
        if (valor && !campo.value) {
          campo.value = valor;
          algo = true;
        }
      }
      if (algo) {
        mostrar({
          texto: 'Se ha recuperado lo que estabas escribiendo.',
          tono: 'ok',
        });
      }
    } catch {
      almacen.removeItem(clave);
    }
    // Solo al montar: recuperar dos veces pisaría lo que se esté escribiendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guardarBorrador = () => {
    const almacen = leerAlmacen();
    if (!clave || !almacen || !formRef.current) return;
    const campos: Record<string, string> = {};
    for (const campo of camposDeTexto(formRef.current)) {
      if (campo.value) campos[campo.name] = campo.value;
    }
    try {
      if (Object.keys(campos).length === 0) almacen.removeItem(clave);
      else almacen.setItem(clave, JSON.stringify({ t: Date.now(), campos }));
    } catch {
      // Almacenamiento lleno o bloqueado. El formulario sigue funcionando.
    }
  };

  return (
    <form
      ref={formRef}
      className={className}
      onInput={clave ? guardarBorrador : undefined}
      action={async (formData) => {
        /*
         * Lo escrito se apunta ANTES de enviar, porque React vacía el formulario
         * en cuanto se envía —no cuando la acción termina—. Se comprobó a mano:
         * el evento `reset` llega antes de que la acción resuelva, así que
         * cancelarlo no sirve de nada; para cuando se sabe que ha fallado la red,
         * el campo ya está en blanco.
         *
         * Por eso lo que hay que hacer no es evitar el vaciado, sino deshacerlo.
         */
        const escrito = new Map<string, string>();
        if (formRef.current) {
          for (const campo of camposDeTexto(formRef.current)) {
            if (campo.value) escrito.set(campo.name, campo.value);
          }
        }

        /** Devuelve lo escrito, sin pisar nada que se haya tecleado después. */
        const devolverLoEscrito = () => {
          if (!formRef.current) return;
          for (const campo of camposDeTexto(formRef.current)) {
            const valor = escrito.get(campo.name);
            if (valor && !campo.value) campo.value = valor;
          }
        };

        try {
          await accion(formData);
          limpiarBorrador();
        } catch (e) {
          if (esFalloDeRed(e)) {
            mostrar({
              texto: 'Sin conexión: no se ha guardado. Lo escrito sigue aquí, inténtalo otra vez.',
              tono: 'error',
            });
            /*
             * Varias veces durante el segundo siguiente.
             *
             * React vacía el campo DESPUÉS de que la acción se resuelva, y no
             * hay evento que avise: se comprobó a mano —el nodo es el mismo, no
             * lo reemplaza— y restaurar una sola vez, aunque sea en el `catch`,
             * llega antes del vaciado y se pierde igual.
             *
             * Repetir es feo y no lo escondo. Es lo que hay mientras React no dé
             * forma de decir «esta acción ha fallado, no vacíes»; lo único que
             * importa es que no puede hacer daño: cada intento solo rellena un
             * campo que esté VACÍO, así que jamás pisa lo que se esté tecleando.
             */
            for (const ms of [0, 50, 150, 300, 600, 1000]) setTimeout(devolverLoEscrito, ms);
            return;
          }
          // La acción llegó al servidor: el borrador ya no hace falta.
          if (esRedireccion(e)) limpiarBorrador();
          throw e;
        }
      }}
    >
      {children}
    </form>
  );
}
