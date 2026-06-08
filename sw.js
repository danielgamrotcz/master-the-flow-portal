const CACHE = 'mtf-v4';
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

  // Archive date files — network-first, fall back to cache
  if (url.pathname.startsWith('/data/archive/') && url.pathname.endsWith('.json')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(url.pathname, res.clone()));
          return res;
        })
        .catch(() => caches.open(CACHE).then(c => c.match(url.pathname)))
    );
    return;
  }

  // today.json and archive index — network-first, fall back to cache
  if (url.pathname === '/data/today.json' || url.pathname === '/data/archive.json') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(url.pathname, res.clone()));
          return res;
        })
        .catch(() => caches.open(CACHE).then(c => c.match(url.pathname)))
    );
    return;
  }
});

self.addEventListener('push', e => {
  e.waitUntil(
    self.registration.showNotification('Master the Flow', {
      body: 'Nový digest je připraven. Podívej se, co se dnes řešilo.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'digest',
      renotify: true,
      vibrate: [200, 100, 200],
    })
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
