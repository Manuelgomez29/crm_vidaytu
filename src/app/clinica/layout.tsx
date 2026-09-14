import { createClient } from '@/lib/supabase/server';
import { areasActivas } from '@/lib/areas';
import { AreaApagada } from '@/components/area-apagada';

/**
 * La puerta del area, en el SERVIDOR.
 *
 * Un layout cubre la ruta y todas las de debajo, asi que un solo fichero
 * protege `/clinica` y cada una de sus subpaginas. Esconder la entrada del menu
 * no basta: quedan los enlaces guardados y las direcciones escritas a mano, y
 * quien llegue por ahi tiene que encontrarse la puerta, no la pantalla.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const activas = await areasActivas(supabase);
  if (!activas.has('clinica')) return <AreaApagada area="clinica" />;
  return <>{children}</>;
}
