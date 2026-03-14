// NexusChat Service Worker — handles push notifications + offline caching
const CACHE_NAME = 'nexuschat-v1';
const VAPID_PUBLIC = 'BMjvEPIIfb0AVAWvOOjc1Lv3_Gf9Fo4q6mr9hkbx7hz9yewcG_R92jpqBxV4_SaS6irUm3sYDP5m3DAz8rbGImc';

// ── INSTALL ──
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(['/'])
    ).catch(() => {})
  );
});

// ── ACTIVATE ──
self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// ── FETCH — serve from cache when offline ──
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith(self.location.origin)) return;
  // Network first, fall back to cache
  e.respondWith(
    fetch(e.request)
      .then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});

// ── PUSH NOTIFICATIONS ──
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data?.json() || {}; } catch { data = { title: 'NexusChat', body: e.data?.text() || 'New notification' }; }

  const title = data.title || 'NexusChat';
  const options = {
    body: data.body || 'You have a new message',
    icon: data.icon || '/icon-192.png',
    badge: '/icon-96.png',
    tag: data.tag || 'nexuschat',
    data: data.data || {},
    vibrate: [200, 100, 200],
    requireInteraction: data.requireInteraction || false,
    actions: data.actions || [],
    silent: false,
  };

  e.waitUntil(self.registration.showNotification(title, options));
});

// ── NOTIFICATION CLICK ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const notifData = e.notification.data || {};
  const action = e.action;

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // If app is already open, focus it and send message
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.postMessage({ type: 'NOTIFICATION_CLICK', data: notifData, action });
          return;
        }
      }
      // Otherwise open the app
      const url = notifData.url || '/';
      return clients.openWindow(url).then(client => {
        if (client) {
          // Send data after short delay to let app initialise
          setTimeout(() => client.postMessage({ type: 'NOTIFICATION_CLICK', data: notifData, action }), 1500);
        }
      });
    })
  );
});

// ── NOTIFICATION CLOSE ──
self.addEventListener('notificationclose', e => {
  const notifData = e.notification.data || {};
  // Tell app the notification was dismissed (e.g. to mark call as missed)
  clients.matchAll({ type: 'window' }).then(windowClients => {
    windowClients.forEach(client => {
      client.postMessage({ type: 'NOTIFICATION_DISMISSED', data: notifData });
    });
  });
});

