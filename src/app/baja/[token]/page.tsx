import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Baja de marketing en un clic. Pública, sin sesión: quien recibe el correo no
 * tiene cuenta en la plataforma.
 *
 * El token identifica el ENVÍO, no a la persona: la URL nunca lleva un id de
 * contacto ni un email (regla 11). Y la baja se ejecuta al abrir la página,
 * sin pedir confirmación: exigir un segundo clic para dejar de recibir correos
 * es justo lo que el RGPD llama poner obstáculos.
 */
export default async function Baja({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data: hecho } = await createAdminClient().rpc('darse_de_baja', { p_token: token });

  return (
    <main className="flex min-h-screen items-center justify-center bg-ground px-4 py-16">
      <div className="panel w-full max-w-md px-6 py-8 text-center">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Vida y Tu</p>

        {hecho ? (
          <>
            <h1 className="mt-3 text-lg font-bold text-ink">Ya no recibirás más correos</h1>
            <p className="mt-2 text-sm text-ink2">
              Hemos retirado tu consentimiento. No hace falta que hagas nada más.
            </p>
            <p className="mt-4 text-sm text-ink2">
              Si algún día quieres volver a recibirlos, escríbenos y lo activamos.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-3 text-lg font-bold text-ink">Este enlace ya no es válido</h1>
            <p className="mt-2 text-sm text-ink2">
              Puede que ya te hubieras dado de baja. Si sigues recibiendo correos, respóndenos a
              cualquiera de ellos y lo resolvemos.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
