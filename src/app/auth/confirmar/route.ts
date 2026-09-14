import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rutaInternaSegura } from '@/lib/enlaces';

/**
 * Punto de aterrizaje de los enlaces de invitación y de recuperación. Canjea
 * el token por una sesión y manda a fijar la contraseña; el enlace es de un
 * solo uso, así que un segundo intento cae al login con su aviso.
 */
export async function GET(req: NextRequest) {
  const tokenHash = req.nextUrl.searchParams.get('token_hash');
  const tipo = req.nextUrl.searchParams.get('type');
  /**
   * `new URL('https://evil.com', base)` devuelve el destino externo, no la
   * base: sin filtrar, este parametro convertia el endpoint de invitacion en
   * una redireccion abierta con el dominio del grupo delante. Es el peor sitio
   * posible para tener una, porque quien llega aqui viene de un correo
   * legitimo y ya se ha fiado.
   */
  const siguiente = rutaInternaSegura(req.nextUrl.searchParams.get('next'), '/establecer-clave');

  if (!tokenHash || !tipo) {
    return NextResponse.redirect(new URL('/login?error=enlace', req.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type: tipo as 'invite' | 'recovery' | 'email',
    token_hash: tokenHash,
  });

  if (error) {
    return NextResponse.redirect(new URL('/login?error=enlace', req.url));
  }

  const respuesta = NextResponse.redirect(new URL(siguiente, req.url));

  /**
   * SE APUNTA A QUE VENIA, PORQUE EN MEDIO HAY UN PEAJE.
   *
   * Quien ya tiene verificacion en dos pasos no llega de aqui a elegir
   * contraseña: el middleware lo manda antes a dar su codigo —y hace bien, un
   * enlace de correo no puede saltarse el segundo factor, o quien te lea el
   * correo entra—. Pero al superarlo aterrizaba en el tablero, con la
   * contraseña vieja intacta y creyendo que ya la habia cambiado. Volveria a
   * quedarse fuera mañana, sin entender por que.
   *
   * La galleta guarda el destino durante el rato que dura el enlace. La borra
   * quien la usa, al guardar la contraseña.
   */
  if (siguiente.startsWith('/establecer-clave')) {
    respuesta.cookies.set('vd-elegir-clave', tipo === 'recovery' ? 'recuperacion' : 'invitacion', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60,
      path: '/',
    });
  }

  return respuesta;
}
