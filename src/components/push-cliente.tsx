'use client';

import { useEffect, useState } from 'react';

/**
 * Registro del service worker y alta de notificaciones push.
 *
 * El permiso NO se pide al cargar la página: un navegador que pregunta nada
 * más entrar consigue que la gente diga «no» por reflejo, y ese «no» es
 * difícil de revertir. Se pide cuando la persona pulsa el botón.
 */
export function PushCliente({ clavePublica }: { clavePublica: string | null }) {
  const [estado, setEstado] = useState<'cargando' | 'no_soportado' | 'activo' | 'inactivo' | 'bloqueado'>(
    'cargando',
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setEstado('no_soportado');
      return;
    }

    navigator.serviceWorker
      .register('/sw.js')
      .then((registro) => registro.pushManager.getSubscription())
      .then((suscripcion) => {
        if (Notification.permission === 'denied') setEstado('bloqueado');
        else setEstado(suscripcion ? 'activo' : 'inactivo');
      })
      .catch(() => setEstado('no_soportado'));
  }, []);

  async function activar() {
    if (!clavePublica) return;
    setError(null);

    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') {
        setEstado(permiso === 'denied' ? 'bloqueado' : 'inactivo');
        return;
      }

      const registro = await navigator.serviceWorker.ready;
      const suscripcion = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlABytes(clavePublica),
      });

      const datos = suscripcion.toJSON();
      const respuesta = await fetch('/api/push/suscribir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: suscripcion.endpoint,
          p256dh: datos.keys?.p256dh,
          auth: datos.keys?.auth,
        }),
      });

      if (!respuesta.ok) throw new Error(await respuesta.text());
      setEstado('activo');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo activar.');
    }
  }

  async function desactivar() {
    const registro = await navigator.serviceWorker.ready;
    const suscripcion = await registro.pushManager.getSubscription();
    if (suscripcion) {
      await fetch('/api/push/suscribir', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: suscripcion.endpoint }),
      });
      await suscripcion.unsubscribe();
    }
    setEstado('inactivo');
  }

  if (!clavePublica) {
    return (
      <p className="text-xs text-muted">
        Las notificaciones en el móvil no están configuradas en el servidor (faltan las claves
        VAPID).
      </p>
    );
  }

  if (estado === 'cargando') return null;

  if (estado === 'no_soportado') {
    return (
      <p className="text-xs text-muted">
        Este navegador no admite notificaciones. En iPhone hace falta añadir la aplicación a la
        pantalla de inicio primero.
      </p>
    );
  }

  if (estado === 'bloqueado') {
    return (
      <p className="text-xs text-warn">
        Bloqueaste las notificaciones para este sitio. Se reactivan desde los ajustes del navegador.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {estado === 'activo' ? (
        <>
          <span className="chip chip-ok">Avisos activos en este dispositivo</span>
          <button type="button" onClick={desactivar} className="text-xs text-muted hover:underline">
            Desactivar
          </button>
        </>
      ) : (
        <button type="button" onClick={activar} className="btn btn-ghost">
          Activar avisos en este dispositivo
        </button>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

/** La clave VAPID viaja en base64url; PushManager la quiere en bytes. */
function base64UrlABytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}
