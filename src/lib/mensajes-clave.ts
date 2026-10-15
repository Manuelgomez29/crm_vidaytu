/**
 * Lo que contesta Supabase, en castellano.
 *
 * `error.message` viene en ingles y se estaba enseñando tal cual, en la unica
 * pantalla por la que pasa TODO el mundo el primer dia. Y no es un detalle de
 * estilo: quien la ve es alguien que ya esta teniendo un problema para entrar,
 * y «New password should be different from the old password» no le dice que ha
 * escrito la de siempre.
 *
 * También lo usa el alta de usuarios de Administración → Equipo: con la
 * comprobación de contraseñas filtradas encendida, una contraseña inicial
 * conocida se rechaza, y dirección tiene que saber por qué.
 *
 * Lo que no este en la lista se enseña como venga, que es mejor que un «ha
 * habido un error» que no deja avanzar a nadie.
 */
export function enCastellano(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes('different from the old')) {
    return 'Esa es la contraseña que ya tenías. Elige otra distinta.';
  }
  if (m.includes('weak') || m.includes('easy to guess') || m.includes('pwned')) {
    return 'Esa contraseña aparece en filtraciones conocidas o es demasiado fácil de adivinar. Prueba con una más larga o menos común.';
  }
  if (m.includes('at least') || m.includes('too short')) {
    return 'La contraseña es demasiado corta: necesita al menos 10 caracteres.';
  }
  if (m.includes('session') || m.includes('jwt') || m.includes('token')) {
    return 'El enlace ha caducado o ya se había usado. Pide otro desde «¿Has olvidado tu contraseña?».';
  }
  if (m.includes('same_password'))
    return 'Esa es la contraseña que ya tenías. Elige otra distinta.';
  return mensaje;
}
