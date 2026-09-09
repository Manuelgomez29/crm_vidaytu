'use client';

import { useEffect } from 'react';

/**
 * Los borradores no sobreviven a un cierre de sesión.
 *
 * Los formularios guardan en el navegador lo que se está escribiendo, para que
 * quedarse sin cobertura o sin batería no se lleve una nota de veinticinco
 * minutos. Eso está bien mientras sea TUYO.
 *
 * En un centro los equipos se comparten. Sin esto, quien cerraba sesión dejaba
 * su borrador en el disco y la siguiente persona que abría la misma ficha se lo
 * encontraba escrito en el campo —con el nombre de la familia, lo que se habló y
 * lo que quedó pendiente—. Lo detecté auditando lo que yo mismo había añadido el
 * día anterior.
 *
 * Se limpia aquí, en la pantalla de entrada, porque es el único momento en que
 * se sabe con certeza que la sesión anterior ha terminado: `cerrarSesion` corre
 * en el servidor y desde ahí no se toca el almacenamiento del navegador.
 */
export function LimpiarBorradores() {
  useEffect(() => {
    try {
      const almacen = window.localStorage;
      for (let i = almacen.length - 1; i >= 0; i--) {
        const clave = almacen.key(i);
        if (clave?.startsWith('borrador:')) almacen.removeItem(clave);
      }
    } catch {
      // Navegación privada o almacenamiento bloqueado: no hay nada que limpiar.
    }
  }, []);

  return null;
}
