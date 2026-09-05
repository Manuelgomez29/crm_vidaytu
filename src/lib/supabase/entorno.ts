/**
 * Comprueba que una variable de entorno obligatoria tenga valor.
 *
 * `process.env.X!` es una afirmación de TypeScript: en tiempo de ejecución no
 * comprueba nada. Si la variable llega vacía, el cliente de Supabase recibe
 * `undefined` y lo que ve el usuario es un 500 sin ninguna pista de la causa.
 *
 * Pasó al desplegar el entorno de vista previa con una variable guardada en
 * blanco: la aplicación entera caía y el error no decía cuál era. Costó más
 * encontrarlo que arreglarlo, así que ahora lo dice.
 *
 * IMPORTANTE: recibe el VALOR, no el nombre. Next.js solo sustituye las
 * variables `NEXT_PUBLIC_*` cuando se escriben literalmente
 * (`process.env.NEXT_PUBLIC_ALGO`); si se leyeran con una clave dinámica
 * (`process.env[nombre]`) llegarían vacías al navegador, que es justo el fallo
 * que esto pretende evitar.
 */
export function obligatoria(valor: string | undefined, nombre: string): string {
  if (valor) return valor;

  throw new Error(
    `Falta la variable de entorno ${nombre}. ` +
      'En local se define en .env.local. En Vercel, en Settings → Environment ' +
      'Variables, comprobando que esté marcada para ESTE entorno: una variable ' +
      'definida solo para Production deja las vistas previas sin ella.',
  );
}
