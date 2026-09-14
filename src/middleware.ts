import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { obligatoria } from '@/lib/supabase/entorno';
import { nuevoNonce, politicaCSP } from '@/lib/csp';

/** ¿El fallo es de sesión (token caducado, revocado o de otro proyecto)? */
function esErrorDeSesion(error: { message?: string; status?: number } | null): boolean {
  if (!error) return false;
  const mensaje = (error.message ?? '').toLowerCase();
  return (
    mensaje.includes('refresh token') ||
    mensaje.includes('jwt') ||
    mensaje.includes('session') ||
    error.status === 401
  );
}

export async function middleware(request: NextRequest) {
  /*
   * El nonce de esta peticion. Va en DOS sitios y hacen falta los dos:
   *
   *   · en las cabeceras que se reenvian hacia dentro, porque de ahi lo lee
   *     Next para ponerselo a sus propios <script>;
   *   · en la respuesta, porque es la instruccion que recibe el navegador.
   *
   * Y se clonan las cabeceras EN CADA respuesta, no una vez al principio: en
   * medio, el refresco de sesion de Supabase escribe cookies con
   * `request.cookies.set`, y una copia hecha antes se las dejaria fuera. Es el
   * mismo cuidado que ya avisaba el comentario de `redirigirA`.
   */
  const nonce = nuevoNonce();
  const csp = politicaCSP(nonce);
  const haciaDentro = () => {
    const cabeceras = new Headers(request.headers);
    cabeceras.set('x-nonce', nonce);
    cabeceras.set('Content-Security-Policy', csp);
    return cabeceras;
  };
  const conCSP = <T extends NextResponse>(respuesta: T): T => {
    respuesta.headers.set('Content-Security-Policy', csp);
    return respuesta;
  };

  let supabaseResponse = conCSP(NextResponse.next({ request: { headers: haciaDentro() } }));

  const supabase = createServerClient(
    obligatoria(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL'),
    obligatoria(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = conCSP(NextResponse.next({ request: { headers: haciaDentro() } }));
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANTE: no ejecutar código entre createServerClient y getUser.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  const esLogin = request.nextUrl.pathname.startsWith('/login');

  /**
   * Rutas públicas sin sesión. Las abre gente que no tiene cuenta (el enlace
   * de baja de una campaña) o que aún no la ha terminado de crear (el enlace
   * de invitación): mandarlas al login las dejaría sin salida.
   */
  const PUBLICAS = ['/baja', '/auth/confirmar'];
  const esPublica = PUBLICAS.some((ruta) => request.nextUrl.pathname.startsWith(ruta));
  if (esPublica) return supabaseResponse;

  // Un redirect crea una respuesta nueva: hay que arrastrarle las cookies que
  // el refresco de sesión acaba de escribir, o el usuario se queda sin sesión.
  const redirigirA = (ruta: string) => {
    const url = request.nextUrl.clone();
    url.pathname = ruta;
    const respuesta = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => respuesta.cookies.set(cookie));
    return conCSP(respuesta);
  };

  /**
   * Sesión inservible (refresh token revocado o de otro proyecto): si no se
   * borran sus cookies, cada petición vuelve a fallar y el login queda
   * atascado. Se limpian y se manda al login una sola vez.
   */
  if (!user && esErrorDeSesion(error)) {
    const respuesta = esLogin
      ? conCSP(NextResponse.next({ request: { headers: haciaDentro() } }))
      : redirigirA('/login');
    for (const cookie of request.cookies.getAll()) {
      if (cookie.name.startsWith('sb-')) respuesta.cookies.delete(cookie.name);
    }
    return respuesta;
  }

  if (!user && !esLogin) return redirigirA('/login');

  if (user) {
    /**
     * Verificación en dos pasos OBLIGATORIA (datos de categoría especial):
     * quien no tenga segundo factor va a darlo de alta, y quien lo tenga debe
     * superarlo antes de ver nada. Las dos pantallas quedan exentas para no
     * encerrar al usuario en un bucle.
     */
    const ruta = request.nextUrl.pathname;
    const esVerificacion = ruta.startsWith('/login/2fa');
    const esAltaSegundoFactor = ruta.startsWith('/seguridad');
    /*
     * ELEGIR CONTRASEÑA VA ANTES QUE EL SEGUNDO FACTOR.
     *
     * Y esta ruta tiene que estar exenta o no se llega nunca. Un invitado
     * abre su enlace, entra con sesion y SIN contraseña, y la regla de abajo
     * —«quien no tenga segundo factor, a darlo de alta»— se lo llevaba a
     * `/seguridad` desde cualquier sitio, incluida esta pantalla. Resultado:
     * entraba esa vez y no podia poner contraseña; al cerrar sesion se
     * quedaba fuera de su propia cuenta, y no hay «he olvidado mi contraseña».
     *
     * Le paso a la primera persona a la que invitamos de verdad.
     */
    const esElegirClave = ruta.startsWith('/establecer-clave');

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const tieneSegundoFactor = aal?.nextLevel === 'aal2';
    const yaVerificado = aal?.currentLevel === 'aal2';

    if (tieneSegundoFactor && !yaVerificado && !esVerificacion) {
      return redirigirA('/login/2fa');
    }
    if (!tieneSegundoFactor && !esAltaSegundoFactor && !esElegirClave) {
      return redirigirA('/seguridad');
    }
    if (esLogin && !esVerificacion) return redirigirA('/leads');
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
