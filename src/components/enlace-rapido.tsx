'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * Un enlace que empieza a cargar la pantalla antes de que se pulse.
 *
 * Entre que el ratón se posa sobre un enlace y el dedo hace clic pasan, de
 * media, dos o tres décimas. Si en ese tiempo se le pide al servidor la pantalla
 * entera, al pulsar ya está aquí y se abre al instante. En el móvil no hay
 * ratón, pero el `touchstart` llega unas décimas antes que el clic, y también se
 * aprovecha.
 *
 * Lo que NO se hace es precargar todo lo visible: cada precarga completa es un
 * renderizado en el servidor con sus consultas, y una tabla de cincuenta casos
 * serían cincuenta fichas pedidas sin que nadie las vaya a abrir. Por eso se
 * espera a que el ratón se DETENGA encima (`PAUSA_MS`): cruzar la tabla de
 * camino a otro sitio no precarga nada. Y cada enlace precarga una sola vez.
 *
 * Por qué `router.prefetch` y no la precarga del propio `<Link>`: la de `<Link>`
 * solo actúa si el enlace está «visible» según un IntersectionObserver, y la
 * primera versión se apoyaba en eso. Al probarla con la pestaña en segundo
 * plano el observador no respondía y no precargaba nada. Si el ratón está
 * encima, el enlace se ve: esa medición sobra. `router.prefetch(href)` sin
 * opciones hace en esta versión de Next una precarga COMPLETA, directa a la
 * caché, sin mirar visibilidad. Es API pública. (Si un día se activa la «caché
 * de segmentos» de Next, su valor por defecto pasa a ser una precarga parcial:
 * peor, pero nunca dañina.)
 *
 * Se usa igual que `Link`: mismo nombre, mismas propiedades.
 *
 * Y una diferencia con `Link`: por defecto NO precarga al entrar en pantalla.
 * Desde que cada pantalla tiene esqueleto de carga, esa precarga de Next ya no
 * es inútil —se trae el esqueleto—, pero cada una es una petición con su
 * comprobación de sesión, y un kanban con cuarenta tarjetas a la vista serían
 * cuarenta peticiones cada vez que se abre. Quien sí la quiere (el menú: pocos
 * enlaces, siempre visibles) la pide con `prefetch={null}`.
 */

/** Lo que tiene que quedarse el ratón encima para que cuente como intención. */
const PAUSA_MS = 90;

type Props = React.ComponentProps<typeof Link>;

export default function EnlaceRapido(props: Props) {
  const { prefetch, href, onMouseEnter, onMouseLeave, onTouchStart, onFocus, onBlur } = props;
  const router = useRouter();
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hecha = useRef(false);

  useEffect(
    () => () => {
      if (reloj.current) clearTimeout(reloj.current);
    },
    [],
  );

  // Quien pidió explícitamente no precargar, o un destino que no es una ruta
  // de aquí, no precarga.
  const destino = typeof href === 'string' ? href : null;
  if (prefetch === false || !destino || !destino.startsWith('/')) return <Link {...props} />;

  const precargar = () => {
    if (hecha.current) return;
    hecha.current = true;
    router.prefetch(destino);
  };
  const esperar = () => {
    if (hecha.current || reloj.current) return;
    reloj.current = setTimeout(() => {
      reloj.current = null;
      precargar();
    }, PAUSA_MS);
  };
  const cancelar = () => {
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = null;
  };

  return (
    <Link
      {...props}
      prefetch={prefetch === undefined ? false : prefetch}
      onMouseEnter={(e) => {
        onMouseEnter?.(e);
        esperar();
      }}
      onMouseLeave={(e) => {
        onMouseLeave?.(e);
        cancelar();
      }}
      onTouchStart={(e) => {
        onTouchStart?.(e);
        // Tocar es intención: aquí no hay pausa que esperar.
        precargar();
      }}
      onFocus={(e) => {
        onFocus?.(e);
        // Con el teclado, llegar con el tabulador a un enlace es apuntarle.
        esperar();
      }}
      onBlur={(e) => {
        onBlur?.(e);
        cancelar();
      }}
    />
  );
}
