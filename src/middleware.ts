import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

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
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
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

  // Un redirect crea una respuesta nueva: hay que arrastrarle las cookies que
  // el refresco de sesión acaba de escribir, o el usuario se queda sin sesión.
  const redirigirA = (ruta: string) => {
    const url = request.nextUrl.clone();
    url.pathname = ruta;
    const respuesta = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => respuesta.cookies.set(cookie));
    return respuesta;
  };

  /**
   * Sesión inservible (refresh token revocado o de otro proyecto): si no se
   * borran sus cookies, cada petición vuelve a fallar y el login queda
   * atascado. Se limpian y se manda al login una sola vez.
   */
  if (!user && esErrorDeSesion(error)) {
    const respuesta = esLogin ? NextResponse.next({ request }) : redirigirA('/login');
    for (const cookie of request.cookies.getAll()) {
      if (cookie.name.startsWith('sb-')) respuesta.cookies.delete(cookie.name);
    }
    return respuesta;
  }

  if (!user && !esLogin) return redirigirA('/login');
  if (user && esLogin) return redirigirA('/leads');

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
