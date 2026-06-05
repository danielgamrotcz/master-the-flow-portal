const CACHE = 'mtf-v1';
const STATIC = ['/', '/index.html', '/app.js', '/styles.css', '/favicon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('push', e => {
  e.waitUntil(
    self.registration.showNotification('Master the Flow', {
      body: 'Nový digest je připraven. Podívej se, co se dnes řešilo.',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
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
