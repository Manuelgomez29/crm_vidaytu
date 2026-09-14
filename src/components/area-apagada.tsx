import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { AREAS, type Area } from '@/lib/areas';

/**
 * Lo que se ve al entrar en un área que todavía no está encendida.
 *
 * Existe porque esconderla del menú no es esconderla: quedan los enlaces
 * guardados, las direcciones escritas a mano y los correos antiguos con un
 * enlace dentro. Sin esto, quien llegara por ahí vería la pantalla a medio
 * terminar — que es justo lo que se quería evitar.
 *
 * No es un error y no se escribe como si lo fuera: no ha hecho nada mal, es que
 * todavía no le toca. Por eso dice cuándo y quién puede encenderlo.
 */
export async function AreaApagada({ area }: { area: Area }) {
  const { texto, etiqueta } = AREAS[area];

  return (
    <AppShell seccion="mi-dia" titulo={texto} descripcion="Todavía no está en marcha">
      <div className="panel max-w-[60ch] p-6">
        {etiqueta && <span className="chip chip-mut">{etiqueta}</span>}
        <h2 className="mt-3 text-[17px] font-bold">Esta parte llega más adelante</h2>
        <p className="mt-2 text-sm text-ink2">
          La plataforma se está poniendo en marcha por partes, empezando por el área comercial.{' '}
          <b className="text-ink">{texto}</b> está construida y sus datos están guardados: cuando se
          encienda, aparecerá con todo dentro.
        </p>
        <p className="mt-2 text-sm text-ink2">
          Si crees que ya deberíais estar usándola, díselo a dirección: se activa desde
          Configuración → Parámetros, sin esperar a nada.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/mi-dia" className="btn btn-primary">
            Volver a Mi día
          </Link>
          <Link href="/leads" className="btn btn-ghost">
            Ir al kanban
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
