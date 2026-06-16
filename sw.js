const CACHE = 'mtf-v9';
const STATIC = ['/', '/index.html', '/app.js', '/styles.css', '/favicon.svg',
  '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];
// App shell — vždy zkus síť, fallback cache (offline). Brání stale verzi appky
// bez nutnosti bumpovat CACHE při každé změně app.js/styles.css/index.html.
const SHELL = new Set(['/', '/index.html', '/app.js', '/styles.css']);

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

  // App shell — network-first so app.js/styles.css/index.html stay fresh
  if (url.origin === location.origin && SHELL.has(url.pathname)) {
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

// České skloňování počtu poznatků (service worker nemá přístup k app.js).
function pocetPoznatku(n) {
  if (n === 1) return '1 nový poznatek';
  if (n >= 2 && n <= 4) return n + ' nové poznatky';
  return n + ' nových poznatků';
}

self.addEventListener('push', e => {
  e.waitUntil(
    fetch('/data/today.json')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const cards = (data?.cards || []);
        let title, body;
        if (cards.length === 0) {
          title = 'Master the Flow';
          body = 'Mrkni, co je v komunitě nového.';
        } else {
          // Titulek = počet, text = stručný výčet karet (proč kliknout).
          title = pocetPoznatku(cards.length) + ' dnes';
          const titles = cards.map(c => c.title).filter(Boolean);
          const shown = titles.slice(0, 6);
          body = shown.join(' · ') + (titles.length > shown.length ? ' a další' : '');
        }
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
