import { Armazon } from '@/components/app-shell';

/**
 * Todas las pantallas con sesión comparten este layout, y por eso el menú y la
 * barra de arriba se pintan una vez y se quedan quietos al navegar.
 *
 * El paréntesis de `(app)` no forma parte de la dirección: `/leads` sigue
 * siendo `/leads`. Fuera se quedan las pantallas sin armazón (el login, la
 * baja de un boletín, establecer la clave) y las de la API.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <Armazon>{children}</Armazon>;
}
