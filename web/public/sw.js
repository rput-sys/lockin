// LOCK IN — Service Worker
const CACHE_NAME = 'lockin-v1';
const STATIC_ASSETS = ['/', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api') || url.hostname !== self.location.hostname) return;
  event.respondWith(
    fetch(event.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('push', (event) => {
  let data = { title: '⚡ LOCK IN', body: "It's time to plan your day." };
  try { data = event.data.json(); } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || '⚡ LOCK IN', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'lockin',
      data: data.url ? { url: data.url } : {},
      requireInteraction: data.persistent || false,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'NOTIFICATION_CLICK', url });
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'check-tasks') {
    event.waitUntil(checkUpcomingTasks());
  }
});

async function checkUpcomingTasks() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const settingsRes = await cache.match('/api/settings');
    if (!settingsRes) return;
    const { apiUrl } = await settingsRes.json();
    const res = await fetch(`${apiUrl}/schedule/today`);
    const plan = await res.json();
    if (!plan.schedule) return;
    const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
    const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const upcoming = plan.schedule.filter(t => {
      const diff = toMin(t.startTime) - nowMin();
      return diff >= 0 && diff <= 5;
    });
    for (const task of upcoming) {
      await self.registration.showNotification(`⏰ Starting in 5 min`, {
        body: `${task.emoji} ${task.title}`,
        icon: '/icon-192.png',
        tag: `task-${task.id}`,
        data: { url: '/?tab=today' },
      });
    }
  } catch {}
}
