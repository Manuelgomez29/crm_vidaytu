import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fecha } from '@/lib/fechas';
import { Alta2FA } from './alta-2fa';
import { PushCliente } from '@/components/push-cliente';

/**
 * Seguridad de la cuenta. La verificación en dos pasos es obligatoria: la
 * plataforma trata datos de categoría especial, así que sin ella no se entra.
 */
export default async function Seguridad() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: factores } = await supabase.auth.mfa.listFactors();
  const verificados = (factores?.totp ?? []).filter((f) => f.status === 'verified');

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-center text-2xl font-bold tracking-tight">
        Vida y Tu <span className="text-coral">DATA</span>
      </h1>
      <p className="mt-1 text-center text-[11px] uppercase tracking-[0.14em] text-muted">
        Seguridad de la cuenta
      </p>

      <p className="mt-6 text-sm text-ink2">
        Sesión de <b className="text-ink">{user.email}</b>
      </p>

      <div className="mt-4">
        {verificados.length === 0 ? (
          <Alta2FA obligatorio />
        ) : (
          <div className="panel p-5">
            <h3 className="text-[15px] font-bold text-ok">✓ Verificación en dos pasos activa</h3>
            <ul className="mt-3 flex flex-col gap-1.5 text-[13px] text-ink2">
              {verificados.map((f) => (
                <li key={f.id} className="flex justify-between gap-3">
                  <span>{f.friendly_name ?? 'App de autenticación'}</span>
                  <span className="num text-muted">{fecha(f.created_at, false)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              Para cambiar de dispositivo, pide a dirección que retire el factor actual y vuelve a
              darlo de alta.
            </p>
            <div className="mt-4 border-t border-line pt-4">
              <h4 className="mb-1 text-[13px] font-semibold">Avisos en el móvil</h4>
              <p className="mb-2 text-xs text-ink2">
                Instala la plataforma en la pantalla de inicio y recibe los avisos aunque no la
                tengas abierta. El texto nunca menciona el motivo de consulta: se lee en la pantalla
                de bloqueo.
              </p>
              <PushCliente clavePublica={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
            </div>

            <Link href="/leads" className="btn btn-primary mt-4">
              Ir a la plataforma
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
