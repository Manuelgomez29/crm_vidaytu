import { cerrarSesion } from '@/app/leads/actions';

/**
 * La salida de las dos pantallas que son una puerta cerrada.
 *
 * El segundo factor y su alta se atraviesan obligatoriamente: mientras no se
 * superan, el middleware devuelve a ellas cualquier ruta que se pida. Ninguna
 * de las dos tenía forma de salir, porque el botón de cerrar sesión vive en la
 * barra lateral y la barra lateral solo aparece cuando ya has entrado.
 *
 * Eso deja atrapado a quien se equivoca de cuenta, a quien se ha dejado el
 * móvil en casa y a quien simplemente cambia de idea. Y en un ordenador
 * compartido —recepción, sala de equipo— deja ahí una sesión a medias con el
 * correo de otra persona a la vista hasta que alguien borre las cookies.
 *
 * No es un enlace a `/login`: eso vuelve aquí. Tiene que cerrar la sesión de
 * verdad, que además es lo que deja constancia de la salida en el registro de
 * accesos.
 */
export function SalirDeLaPuerta({ texto = 'Salir y entrar con otra cuenta' }: { texto?: string }) {
  return (
    <form action={cerrarSesion} className="mt-4 text-center">
      <button
        type="submit"
        className="text-xs text-muted underline underline-offset-2 transition hover:text-ink2"
      >
        {texto}
      </button>
    </form>
  );
}
