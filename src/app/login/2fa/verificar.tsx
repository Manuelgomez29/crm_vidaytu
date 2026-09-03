'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function Verificar2FA({ factorId }: { factorId: string }) {
  const router = useRouter();
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function verificar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOcupado(true);
    const supabase = createClient();

    const { data: reto, error: errorReto } = await supabase.auth.mfa.challenge({ factorId });
    if (errorReto || !reto) {
      setOcupado(false);
      setError('No se pudo pedir el código. Inténtalo de nuevo.');
      return;
    }

    const { error: errorVerif } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: reto.id,
      code: codigo.trim(),
    });
    setOcupado(false);
    if (errorVerif) {
      setError('Código incorrecto o caducado. Prueba con el siguiente que muestre la app.');
      setCodigo('');
      return;
    }
    router.push('/leads');
    router.refresh();
  }

  return (
    <form onSubmit={verificar} className="mt-6 flex flex-col gap-3">
      <label className="etiqueta-campo">
        Código de tu app de autenticación
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          required
          className="campo num text-center text-lg tracking-[0.4em]"
        />
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" disabled={ocupado} className="btn btn-primary py-2.5">
        {ocupado ? 'Comprobando…' : 'Entrar'}
      </button>
    </form>
  );
}
