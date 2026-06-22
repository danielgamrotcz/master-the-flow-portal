const CACHE = 'mtf-v19';
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

  // today.json, archive index, events, notification — network-first, fall back to cache
  if (url.pathname === '/data/today.json' || url.pathname === '/data/archive.json'
      || url.pathname === '/data/events.json' || url.pathname === '/data/notification.json') {
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

// Notifikace z digestu (today.json) — titulek = počet, text = výčet karet.
async function digestNotification() {
  let title = 'Master the Flow';
  let body = 'Mrkni, co je v komunitě nového.';
  let url = '/';
  try {
    const r = await fetch('/data/today.json');
    const data = r.ok ? await r.json() : null;
    const cards = (data?.cards || []);
    if (cards.length > 0) {
      title = pocetPoznatku(cards.length);
      const titles = cards.map(c => c.title).filter(Boolean);
      const shown = titles.slice(0, 6);
      body = shown.join(' · ') + (titles.length > shown.length ? ' a další' : '');
    }
  } catch {}
  return { title, body, tag: 'digest', url };
}

self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let n;
    try {
      // notification.json řídí, co se má zobrazit (digest vs nová akce).
      const r = await fetch('/data/notification.json');
      const cfg = r.ok ? await r.json() : null;
      if (cfg && cfg.kind === 'event' && cfg.title) {
        n = { title: cfg.title, body: cfg.body || '', tag: 'event', url: cfg.url || '#events' };
      }
    } catch {}
    if (!n) n = await digestNotification();
    return self.registration.showNotification(n.title, {
      body: n.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: n.tag,
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: n.url },
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const raw = e.notification.data?.url || '/';
  // Povol jen vlastní cesty/hashe, ať klik nikam neodskočí.
  const target = raw.startsWith('#') ? '/' + raw : (raw.startsWith('/') ? raw : '/');
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const open = cs.find(c => c.url.includes(self.location.origin));
      if (open) {
        open.navigate(self.location.origin + target).catch(() => {});
        return open.focus();
      }
      return clients.openWindow(target);
    })
  );
});
