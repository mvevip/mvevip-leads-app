// Service Worker para MVEVIP Lead App (Web Push & Caching)
const CACHE_NAME = 'mvevip-leads-v1.0.4';

self.addEventListener('install', (event) => {
  console.log('[SW] Instalando versión', CACHE_NAME);
  // No llamamos auto skipWaiting para permitir que la app muestre el aviso de actualización
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Mensaje SKIP_WAITING recibido. Activando inmediatamente...');
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activado. Reclamando clientes y limpiando cachés previas...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Eliminando caché obsoleta:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Evento PUSH: Se activa cuando el backend despacha un recordatorio VAPID
self.addEventListener('push', (event) => {
  let data = {
    title: '🔔 Recordatorio de Lead',
    body: 'Tienes un compromiso pendiente por gestionar.',
    url: '/',
    icon: '/icons/icon-192.png'
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/badge-72.png',
    vibrate: [200, 100, 200, 100, 200], // Patrón de vibración en el móvil
    data: {
      url: data.url || '/'
    },
    actions: [
      { action: 'open', title: 'Abrir Lead' },
      { action: 'dismiss', title: 'Entendido' }
    ],
    requireInteraction: true // Mantiene la notificación visible en pantalla bloqueada
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Evento CLICK en la Notificación
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
