import Link from 'next/link';

/**
 * Lo que se ve cuando algo no está.
 *
 * Sin esta pantalla, Next enseña un «404 — This page could not be found» en
 * blanco y en inglés, sin barra lateral y sin ningún sitio al que ir. En una
 * plataforma que solo habla castellano y que usa gente que no es informática,
 * eso parece la aplicación rota, no un enlace viejo.
 *
 * Y pasa más de lo que parece, porque aquí llegan dos casos distintos que desde
 * fuera son el mismo:
 *
 *   - lo que ya no existe: un caso borrado, un enlace de hace meses, una
 *     dirección mal copiada de un WhatsApp;
 *   - lo que existe pero NO es tuyo: `notFound()` es también la respuesta
 *     cuando las políticas de la base ocultan una ficha. Es a propósito —si
 *     dijera «no tienes permiso» estaría confirmando que ese caso existe—, así
 *     que el texto tiene que servir para las dos situaciones sin insinuar
 *     ninguna.
 *
 * De ahí «no está o no es tuyo»: es la verdad completa, y no revela cuál de las
 * dos.
 */
export default function NoEncontrado() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="panel w-[min(92vw,32rem)] p-6">
        <p className="num text-[13px] font-semibold text-muted">404</p>
        <h1 className="mb-2 mt-1 text-[17px] font-bold">Esto no está aquí</h1>
        <p className="mb-4 text-sm text-ink2">
          La página o la ficha que buscas no existe, o no es de las que tú puedes ver. Si te ha
          llegado el enlace de un compañero, puede que sea de un centro al que no tienes acceso:
          pídeselo a él o a dirección.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/mi-dia" className="btn btn-primary">
            Volver a Mi día
          </Link>
          <Link href="/leads" className="btn btn-ghost">
            Ir al kanban
          </Link>
          <Link href="/buscar" className="btn btn-ghost">
            Buscar
          </Link>
        </div>
      </div>
    </main>
  );
}
