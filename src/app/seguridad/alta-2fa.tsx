'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Alta = { factorId: string; qr: string; secreto: string };

/**
 * Alta del segundo factor (TOTP). El código se genera en el móvil del usuario
 * con cualquier app de autenticación; el servidor nunca ve la contraseña ni el
 * secreto más allá del alta.
 */
export function Alta2FA({ obligatorio }: { obligatorio: boolean }) {
  const router = useRouter();
  const [alta, setAlta] = useState<Alta | null>(null);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function empezar() {
    setError(null);
    setOcupado(true);
    const supabase = createClient();

    // Un alta interrumpida deja un factor sin verificar que bloquea la
    // siguiente: se retiran antes de empezar de nuevo.
    const { data: existentes } = await supabase.auth.mfa.listFactors();
    for (const f of existentes?.all ?? []) {
      if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
    }

    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
    setOcupado(false);
    if (error || !data) {
      setError(error?.message ?? 'No se pudo iniciar el alta.');
      return;
    }
    setAlta({ factorId: data.id, qr: data.totp.qr_code, secreto: data.totp.secret });
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (!alta) return;
    setError(null);
    setOcupado(true);
    const supabase = createClient();

    const { data: reto, error: errorReto } = await supabase.auth.mfa.challenge({
      factorId: alta.factorId,
    });
    if (errorReto || !reto) {
      setOcupado(false);
      setError(errorReto?.message ?? 'No se pudo generar el reto.');
      return;
    }

    const { error: errorVerif } = await supabase.auth.mfa.verify({
      factorId: alta.factorId,
      challengeId: reto.id,
      code: codigo.trim(),
    });
    setOcupado(false);
    if (errorVerif) {
      setError('El código no es válido. Comprueba que la hora del móvil esté en hora.');
      return;
    }
    router.push('/mi-dia');
    router.refresh();
  }

  if (!alta) {
    return (
      <div className="panel p-5">
        <h3 className="text-[15px] font-bold">Activar la verificación en dos pasos</h3>
        <p className="mt-1 text-[13px] text-ink2">
          Necesitarás una app de autenticación en el móvil (Google Authenticator, Authy, 1Password o
          la que uses). Cada vez que entres te pedirá un código de seis dígitos.
        </p>
        {obligatorio && (
          <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">
            Es obligatoria: la plataforma maneja datos de salud, así que no se puede usar sin ella.
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>
        )}
        <button onClick={empezar} disabled={ocupado} className="btn btn-primary mt-4">
          {ocupado ? 'Preparando…' : 'Empezar'}
        </button>
      </div>
    );
  }

  return (
    <div className="panel p-5">
      <h3 className="text-[15px] font-bold">Escanea el código con tu app</h3>
      <p className="mt-1 text-[13px] text-ink2">
        Abre tu app de autenticación, añade una cuenta nueva y escanea este código.
      </p>

      <div className="mt-4 flex flex-wrap items-start gap-5">
        {/* Supabase devuelve el QR como SVG en un data URI: next/image no los
            admite, así que va como imagen normal. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={alta.qr}
          alt="Código QR para la app de autenticación"
          width={180}
          height={180}
          className="rounded-lg border border-line bg-surface p-2"
        />
        <div className="min-w-48 flex-1">
          <p className="text-[12.5px] text-ink2">
            ¿No puedes escanear? Introduce esta clave a mano:
          </p>
          <code className="mt-1 block break-all rounded-lg bg-surface2 px-3 py-2 text-[12.5px]">
            {alta.secreto}
          </code>

          <form onSubmit={confirmar} className="mt-4 flex flex-col gap-2">
            <label className="etiqueta-campo">
              Código de seis dígitos
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                className="campo num w-40 tracking-[0.3em]"
              />
            </label>
            {error && (
              <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>
            )}
            <button type="submit" disabled={ocupado} className="btn btn-primary self-start">
              {ocupado ? 'Comprobando…' : 'Activar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
