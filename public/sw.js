/* Shikshantar Academy PWA Service Worker — App Notifications & Lifecycle */
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Shikshantar Academy', body: event.data.text() };
  }

  const title = payload.title || 'Shikshantar Academy Portal';
  const body = payload.body || payload.message || 'You have a new portal notification.';
  const link = payload.link || '/';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/logo.png',
      badge: '/logo.png',
      tag: payload.tag || 'shikshantar-alert',
      data: { link }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawLink = (event.notification.data && event.notification.data.link) || '/';
  const targetUrl = rawLink.startsWith('/') ? `${self.location.origin}${rawLink}` : self.location.origin;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          if ('navigate' in client && rawLink.startsWith('/')) {
            return client.navigate(targetUrl).then((navClient) => (navClient || client).focus());
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
