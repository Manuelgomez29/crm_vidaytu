'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Alta = { factorId: string; qr: string; secreto: string };
type Dispositivo = { id: string; nombre: string; alta: string };

/**
 * Un segundo dispositivo, y poder retirar el que se perdió.
 *
 * El segundo factor es obligatorio, no hay códigos de recuperación y la única
 * salida documentada era «pide a dirección que te retire el factor». Eso deja
 * un agujero que solo se ve el día que pasa: si quien pierde el móvil es la
 * DIRECCIÓN DE GRUPO, no queda nadie por encima que pueda retirárselo —una
 * dirección de centro no manda sobre ella— y la administración del grupo se
 * queda cerrada para siempre.
 *
 * La solución no es un rescate mejor: es no necesitarlo. Con dos dispositivos
 * dados de alta —el móvil y, por ejemplo, el gestor de contraseñas del
 * portátil— perder uno es un incordio y no una encerrona. Y quien tiene dos
 * puede retirar el perdido él mismo, sin pedírselo a nadie.
 *
 * Nunca se deja retirar el último: eso equivaldría a apagar la verificación en
 * dos pasos desde dentro, que es justo lo que no puede pasar.
 */
export function Dispositivos2FA({ dispositivos }: { dispositivos: Dispositivo[] }) {
  const router = useRouter();
  const [alta, setAlta] = useState<Alta | null>(null);
  const [nombre, setNombre] = useState('');
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const soloUno = dispositivos.length < 2;

  async function empezar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOcupado(true);
    const supabase = createClient();

    // Un alta a medias de otra vez deja un factor sin verificar que bloquea la
    // siguiente. Se limpian los que quedaron colgando, nunca los verificados.
    const { data: existentes } = await supabase.auth.mfa.listFactors();
    for (const f of existentes?.all ?? []) {
      if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: nombre.trim() || `Dispositivo ${dispositivos.length + 1}`,
    });
    setOcupado(false);
    if (error || !data) {
      setError(
        error?.message?.includes('already exists')
          ? 'Ya tienes un dispositivo con ese nombre. Ponle otro.'
          : (error?.message ?? 'No se pudo empezar el alta.'),
      );
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
      setError('No se pudo pedir el código. Inténtalo otra vez.');
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
    setAlta(null);
    setNombre('');
    setCodigo('');
    router.refresh();
  }

  async function quitar(id: string, comoSeLlama: string) {
    if (soloUno) return;
    if (
      !confirm(
        `¿Retirar «${comoSeLlama}»? Dejará de servir para entrar. Te quedarán ${dispositivos.length - 1}.`,
      )
    ) {
      return;
    }
    setError(null);
    setOcupado(true);
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    setOcupado(false);
    if (error) {
      setError(`No se pudo retirar: ${error.message}`);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-4 border-t border-line pt-4">
      <h4 className="text-[13px] font-semibold">Tus dispositivos</h4>

      <ul className="mt-2 flex flex-col gap-1.5">
        {dispositivos.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 text-[13px]">
            <span>{d.nombre}</span>
            <span className="flex items-center gap-3">
              <span className="num text-muted">{d.alta}</span>
              <button
                type="button"
                onClick={() => quitar(d.id, d.nombre)}
                disabled={soloUno || ocupado}
                title={
                  soloUno
                    ? 'Es el único que tienes: retirarlo sería quedarte sin verificación en dos pasos'
                    : `Retirar ${d.nombre}`
                }
                className="text-xs text-muted enabled:hover:text-danger enabled:hover:underline disabled:opacity-40"
              >
                Retirar
              </button>
            </span>
          </li>
        ))}
      </ul>

      {soloUno && (
        <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">
          <b>Solo tienes un dispositivo.</b> Si lo pierdes o lo restauras de fábrica, no podrás
          entrar y tendrá que retirártelo la dirección de grupo. Da de alta un segundo —el gestor de
          contraseñas del ordenador sirve— y dejas de depender de que alguien te rescate.
        </p>
      )}

      {!alta ? (
        <form onSubmit={empezar} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="etiqueta-campo">
            Añadir otro dispositivo
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Portátil, iPad, gestor de contraseñas…"
              className="campo w-64"
            />
          </label>
          <button type="submit" disabled={ocupado} className="btn btn-ghost">
            {ocupado ? 'Preparando…' : 'Añadir'}
          </button>
        </form>
      ) : (
        <div className="mt-3 rounded-lg bg-surface2 p-3">
          <p className="text-[13px] font-semibold">Escanéalo con el dispositivo nuevo</p>
          <div className="mt-2 flex flex-wrap items-start gap-4">
            {/* El QR viene de Supabase como SVG en un data URI; next/image no los admite. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={alta.qr}
              alt="Código QR para la app de autenticación"
              width={150}
              height={150}
              className="rounded-lg border border-line bg-surface p-2"
            />
            <div className="min-w-48 flex-1">
              <p className="text-[12.5px] text-ink2">O introduce esta clave a mano:</p>
              <code className="mt-1 block break-all rounded-lg bg-surface px-3 py-2 text-[12.5px] ring-1 ring-line">
                {alta.secreto}
              </code>
              <form onSubmit={confirmar} className="mt-3 flex flex-wrap items-end gap-2">
                <label className="etiqueta-campo">
                  Código de seis dígitos
                  <input
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    className="campo num w-36 tracking-[0.3em]"
                  />
                </label>
                <button type="submit" disabled={ocupado} className="btn btn-primary">
                  {ocupado ? 'Comprobando…' : 'Confirmar'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAlta(null);
                    setError(null);
                  }}
                  className="btn btn-ghost"
                >
                  Cancelar
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>
      )}
    </div>
  );
}
