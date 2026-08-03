// v26: dokončené runtime zápisy + offline klidný den a Fuse dependency.
// v23: úklid cache po odstranění ?v= cache-bustingu (nasypal do Cache Storage
// stovky unikátních záznamů) + today.json v precache. Bump verze při aktivaci
// všechny staré záznamy smaže.
const CACHE = 'mtf-v26';
const STATIC = ['/', '/index.html', '/app.js', '/styles.css', '/favicon.svg',
  '/fuse.min.js', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png',
  '/apple-touch-icon.png'];
// Datové minimum se předcachuje zvlášť a smí selhat. Při první návštěvě service
// worker ještě nemusí řídit stránku; bez instalační cache by offline režim
// fungoval až od další návštěvy. Klidný den bere náhradní karty z agregovaného
// indexu, proto potřebuje oba soubory. U nepřihlášeného návštěvníka mohou vrátit
// 403; oddělení od addAll zabrání pádu celé instalace a po přihlášení je doplní
// runtime network-first větev.
const STATIC_OPTIONAL = ['/data/today.json', '/data/cards-index.json'];
// App shell — vždy zkus síť, fallback cache (offline). Brání stale verzi appky
// bez nutnosti bumpovat CACHE při každé změně app.js/styles.css/index.html.
const SHELL = new Set(['/', '/index.html', '/app.js', '/styles.css', '/fuse.min.js']);

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(async c => {
        await c.addAll(STATIC);
        await Promise.all(STATIC_OPTIONAL.map(u => c.add(u).catch(() => {})));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache zápis navázat na životnost fetch eventu, ale neblokovat jím odpověď.
// Fire-and-forget c.put() může prohlížeč po vrácení sítě ukončit a offline
// kopie pak nikdy nevznikne. Selhání pomocné cache nesmí shodit online fetch.
function fetchAndCache(event) {
  const network = fetch(event.request);
  event.waitUntil(
    network.then(async response => {
      if (!response.ok) return;
      const cache = await caches.open(CACHE);
      await cache.put(event.request, response.clone());
    }).catch(() => {})
  );
  return network;
}

// U cache-first větve nevíme synchronně, zda síť vůbec bude potřeba. Celý
// lookup proto sestavíme předem a jeho případný zápis registrujeme přes
// waitUntil ještě během obsluhy eventu, ne až v pozdějším callbacku.
function cacheFirst(event) {
  const lookup = caches.open(CACHE).then(async cache => {
    const hit = await cache.match(event.request);
    if (hit) return { response: hit };
    const response = await fetch(event.request);
    return { response, cache, copy: response.ok ? response.clone() : null };
  });
  event.waitUntil(
    lookup.then(async ({ cache, copy }) => {
      if (cache && copy) await cache.put(event.request, copy);
    }).catch(() => {})
  );
  return lookup.then(({ response }) => response);
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept API calls — streaming SSE would break
  if (url.pathname.startsWith('/api/')) return;

  // App shell — network-first so app.js/styles.css/index.html stay fresh
  if (url.origin === location.origin && SHELL.has(url.pathname)) {
    e.respondWith(
      fetchAndCache(e)
        .catch(() => caches.open(CACHE).then(c => c.match(e.request)))
    );
    return;
  }

  // Obrázky — cache-first, jména jsou neměnná UUID, takže se nemění obsah.
  if (url.pathname.startsWith('/data/media/')) {
    e.respondWith(cacheFirst(e));
    return;
  }

  // Archive date files — network-first, fall back to cache
  if (url.pathname.startsWith('/data/archive/') && url.pathname.endsWith('.json')) {
    e.respondWith(
      fetchAndCache(e)
        .catch(() => caches.open(CACHE).then(c => c.match(e.request)))
    );
    return;
  }

  // today.json, archive index, events, notification — network-first, fall back to cache
  if (url.pathname === '/data/today.json' || url.pathname === '/data/archive.json'
      || url.pathname === '/data/cards-index.json'
      || url.pathname === '/data/events.json' || url.pathname === '/data/notification.json'
      || url.pathname === '/data/glossary.json') {
    e.respondWith(
      fetchAndCache(e)
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
// Deep link vede na první kartu (s ?src=push atribucí), ne jen na homepage.
// Klidný den (0 karet): poctivě označit „Z archivu", ať push neslibuje
// novinky, které tam nejsou — to je nejrychlejší cesta k vypnutí notifikací.
async function digestNotification() {
  let title = 'Master the Flow';
  let body = 'Mrkněte, co je v komunitě nového.';
  let url = '/?src=push';
  try {
    const r = await fetch('/data/today.json');
    const data = r.ok ? await r.json() : null;
    const cards = (data?.cards || []);
    if (cards.length > 0) {
      title = pocetPoznatku(cards.length);
      const titles = cards.map(c => c.title).filter(Boolean);
      const shown = titles.slice(0, 6);
      body = shown.join(' · ') + (titles.length > shown.length ? ' a další' : '');
      if (cards[0].id) url = '/?src=push#card/' + cards[0].id;
    } else if (data?.resurfacing?.title) {
      title = 'Z archivu';
      body = data.resurfacing.title;
      if (data.resurfacing.id) url = '/?src=push#card/' + data.resurfacing.id;
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

// Prohlížeč může subscription obměnit (rotace endpointu, obnova permission).
// Bez tohoto handleru se změna nikdy nedostala na server a odběratel zmizel.
const VAPID_PUBLIC = 'BEZFl-_nPGP_1u49UExtRaDl9kc6A9fKzrvUaA-mJTCKx-_LpoaxVw1bkh4Wtf1MeabUVa2vJCnUkv-uCaK4sEs';
function urlBase64ToUint8Array(b64) {
  const p = '='.repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/'));
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
}

self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil((async () => {
    try {
      const sub = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });
      await fetch('/api/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
    } catch { /* zkusí se při další změně / re-POSTu z klienta */ }
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
