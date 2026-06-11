const CACHE = 'mtf-v7';
const STATIC = ['/', '/index.html', '/app.js', '/styles.css', '/favicon.svg',
  '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept API calls — streaming SSE would break
  if (url.pathname.startsWith('/api/')) return;

  // Archive date files — network-first, fall back to cache
  if (url.pathname.startsWith('/data/archive/') && url.pathname.endsWith('.json')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.open(CACHE).then(c => c.match(e.request)))
    );
    return;
  }

  // today.json and archive index — network-first, fall back to cache
  if (url.pathname === '/data/today.json' || url.pathname === '/data/archive.json') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.open(CACHE).then(c => c.match(e.request)))
    );
    return;
  }
});

self.addEventListener('push', e => {
  e.waitUntil(
    fetch('/data/today.json')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const cards = (data?.cards || []);
        const top = cards.slice().sort((a, b) => (b.votes || 0) - (a.votes || 0))[0] || cards[0];
        const title = top ? top.title : 'Master the Flow';
        const body = top ? top.excerpt : 'Nový digest je připraven.';
        return self.registration.showNotification(title, {
          body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: 'digest',
          renotify: true,
          vibrate: [200, 100, 200],
        });
      })
      .catch(() => self.registration.showNotification('Master the Flow', {
        body: 'Nový digest je připraven.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'digest',
        renotify: true,
        vibrate: [200, 100, 200],
      }))
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const open = cs.find(c => c.url.includes(self.location.origin));
      if (open) return open.focus();
      return clients.openWindow('/');
    })
  );
});
