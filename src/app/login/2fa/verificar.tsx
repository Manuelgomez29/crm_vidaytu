'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { anotarSegundoFactor } from './actions';

export function Verificar2FA({
  factores,
  siguiente = '/mi-dia',
}: {
  factores: { id: string; nombre: string }[];
  /** Normalmente el tablero; si venía de un enlace, a terminar lo que venía a hacer. */
  siguiente?: string;
}) {
  const [factorId, setFactorId] = useState(factores[0].id);
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
      // El registro no puede hacer esperar a nadie: se manda y se sigue.
      void anotarSegundoFactor(false);
      setError(
        factores.length > 1
          ? 'Código incorrecto o caducado. Comprueba que has elegido abajo el dispositivo del que lo estás copiando.'
          : 'Código incorrecto o caducado. Prueba con el siguiente que muestre la app.',
      );
      setCodigo('');
      return;
    }
    void anotarSegundoFactor(true);
    /*
     * Navegacion completa, no `router.push` + `refresh`.
     *
     * Acaba de cambiar la sesion —del primer factor al segundo— y con ella lo
     * que el servidor va a contestar en TODAS las rutas. Las dos llamadas del
     * router corren a la vez: el refresco puede pedir todavia la ruta vieja,
     * que ahora redirige a otro sitio, y dejarte en una pantalla que no habias
     * pedido. Con el destino de siempre no se notaba, porque casualmente era
     * el mismo; al mandar a alguien a elegir contraseña, si.
     *
     * Esto pasa una vez por acceso: una carga entera no le cuesta nada a nadie
     * y hace que el servidor pinte desde cero con la sesion nueva.
     */
    window.location.assign(siguiente);
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
      {factores.length > 1 && (
        <label className="etiqueta-campo text-[12.5px]">
          ¿De qué dispositivo es el código?
          <select value={factorId} onChange={(e) => setFactorId(e.target.value)} className="campo">
            {factores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nombre}
              </option>
            ))}
          </select>
        </label>
      )}
    </form>
  );
}
