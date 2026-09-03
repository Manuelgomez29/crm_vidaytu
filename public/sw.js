/**
 * Service worker de Vida y Tu DATA.
 *
 * Hace UNA cosa: recibir notificaciones push y abrir la pantalla que toca al
 * pulsarlas. No cachea nada a proposito — un CRM que muestra datos viejos
 * porque los sirvio de una cache es peor que uno que no carga: alguien
 * llamaria a un lead que otro ya atendio.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (evento) => evento.waitUntil(self.clients.claim()));

self.addEventListener('push', (evento) => {
  let datos = { titulo: 'Vida y Tu DATA', cuerpo: 'Tienes algo pendiente', url: '/leads' };
  try {
    if (evento.data) datos = { ...datos, ...evento.data.json() };
  } catch {
    // Carga no JSON: se muestra el aviso generico.
  }

  evento.waitUntil(
    self.registration.showNotification(datos.titulo, {
      body: datos.cuerpo,
      icon: '/icono.svg',
      badge: '/icono.svg',
      // Sin datos personales en la pantalla de bloqueo (regla 12).
      data: { url: datos.url || '/leads' },
      tag: datos.url || 'vidaytu',
    }),
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = (evento.notification.data && evento.notification.data.url) || '/leads';

  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      // Si la aplicacion ya esta abierta, se reutiliza esa ventana.
      for (const ventana of ventanas) {
        if (ventana.url.includes(self.location.origin) && 'focus' in ventana) {
          ventana.navigate(destino);
          return ventana.focus();
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});
