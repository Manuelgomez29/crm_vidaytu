import Link from 'next/link';
import { pedirEnlaceDeAcceso } from './actions';

/**
 * «He olvidado mi contraseña».
 *
 * Faltaba, y el agujero solo se ve cuando ya estás dentro de él: quien no
 * puede entrar dependía de que otra persona con mando le reenviara el enlace
 * desde Administración. Eso se sostiene mientras haya dos direcciones; el día
 * que solo quede una, esa persona no tiene a quien pedírselo.
 */
export default async function ClaveOlvidada({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; enviado?: string }>;
}) {
  const { error, enviado } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="panel p-8">
          <h1 className="text-center text-2xl font-bold tracking-tight">
            Vidaitu <span className="text-coral">DATA</span>
          </h1>
          <p className="mt-1 text-center text-[11px] uppercase tracking-[0.14em] text-muted">
            Volver a entrar
          </p>

          {enviado ? (
            <>
              {/*
                El mensaje es el mismo exista o no la cuenta: ver la cabecera de
                `actions.ts`. Por eso está escrito en condicional —«si esa
                dirección es de una cuenta»— y no promete un correo que quizá
                no se ha mandado.
              */}
              <p className="mt-5 rounded-lg bg-ok-soft px-3 py-3 text-sm text-ok-ink ring-1 ring-ok/25">
                Si esa dirección corresponde a una cuenta activa, le acaba de llegar un correo con
                un enlace para elegir contraseña nueva.
              </p>
              <p className="mt-3 text-sm text-ink2">
                Caduca en una hora y solo sirve una vez. Mira también en «correo no deseado». Si
                tienes verificación en dos pasos, te la pedirá antes de dejarte cambiarla.
              </p>
              <Link href="/login" className="btn btn-ghost mt-5 w-full py-2.5">
                Volver al acceso
              </Link>
            </>
          ) : (
            <>
              <p className="mt-4 text-sm text-ink2">
                Escribe tu correo de trabajo y te mandamos un enlace para elegir una contraseña
                nueva.
              </p>

              {error === 'demasiados' && (
                <p
                  role="alert"
                  className="mt-4 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn ring-1 ring-warn/25"
                >
                  Ya se han pedido varios enlaces para esa cuenta hace poco. Espera un rato y
                  vuelve a probar: el último que te llegó sigue valiendo durante una hora.
                </p>
              )}
              {error === 'vacio' && (
                <p
                  role="alert"
                  className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger ring-1 ring-danger/25"
                >
                  Escribe tu correo.
                </p>
              )}

              <form action={pedirEnlaceDeAcceso} className="mt-5 flex flex-col gap-4">
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Email
                  <input
                    type="email"
                    name="email"
                    required
                    autoFocus
                    autoComplete="email"
                    className="campo !text-base"
                  />
                </label>
                <button type="submit" className="btn btn-primary py-2.5">
                  Mandarme el enlace
                </button>
              </form>

              <p className="mt-5 text-center text-[12.5px] text-muted">
                <Link href="/login" className="underline underline-offset-2 hover:text-ink2">
                  Volver al acceso
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
