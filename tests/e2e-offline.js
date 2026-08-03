// Offline test: SW cache musí po opravě ?v= reálně servírovat data
const { chromium } = require('playwright');
const { authenticate, BASE } = require('./_auth.js');
const fs = require('fs');
const path = require('path');
const MEDIA_URL = (() => {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards-index.json'), 'utf8'));
  const cards = Array.isArray(raw) ? raw : (raw.cards || []);
  const image = cards.flatMap(card => card.images || []).find(item => item?.file);
  if (!image) throw new Error('cards-index.json neobsahuje mediální fixture');
  return '/data/media/' + image.file;
})();
let failures = 0;
const check = (n, c, d='') => { console.log(`${c?'PASS':'FAIL'}  ${n}${c?'':'  <-- '+d}`); if(!c) failures++; };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await authenticate(ctx);
  const page = await ctx.newPage();

  // 1. online návštěva — SW se zaregistruje a nacachuje
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500); // čas na SW install + cache
  const swActive = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return !!(reg && reg.active);
  });
  check('Service worker aktivní', swActive);

  // Verzi cache čteme ze sw.js, ne natvrdo — jinak test spadne po každém
  // zvednutí verze, i když je všechno v pořádku.
  const swSrc = await (await fetch(BASE + '/sw.js')).text();
  const CACHE_NAME = (swSrc.match(/CACHE\s*=\s*['"]([^'"]+)['"]/) || [])[1];
  check('sw.js má název cache', !!CACHE_NAME, swSrc.slice(0, 80));

  const mediaOnline = await page.evaluate(async url => {
    const response = await fetch(url);
    return response.ok && (await response.arrayBuffer()).byteLength > 0;
  }, MEDIA_URL);
  check('Mediální fixture se načte online', mediaOnline);
  await page.waitForFunction(async ([cacheName, url]) => {
    const c = await caches.open(cacheName);
    return !!(await c.match(url));
  }, [CACHE_NAME, MEDIA_URL], { timeout: 5000 }).catch(() => {});

  const cacheInfo = await page.evaluate(async (cacheName) => {
    const names = await caches.keys();
    const c = await caches.open(cacheName);
    const keys = await c.keys();
    return {
      names,
      count: keys.length,
      hasToday: keys.some(k => k.url.includes('today.json')),
      hasCardsIndex: keys.some(k => k.url.includes('cards-index.json')),
      hasFuse: keys.some(k => k.url.endsWith('/fuse.min.js')),
      hasMedia: keys.some(k => k.url.includes('/data/media/')),
      anyQuery: keys.some(k => k.url.includes('?v=')),
    };
  }, CACHE_NAME);
  check(`Cache ${CACHE_NAME} existuje`, cacheInfo.names.includes(CACHE_NAME), JSON.stringify(cacheInfo.names));
  check('today.json je v cache', cacheInfo.hasToday);
  check('cards-index.json je v cache pro klidný den', cacheInfo.hasCardsIndex);
  check('Fuse dependency je v app-shell cache', cacheInfo.hasFuse);
  check('Načtené médium je v runtime cache', cacheInfo.hasMedia);
  check('Žádné ?v= záznamy v cache (dřív ~110/návštěvu)', !cacheInfo.anyQuery);

  // Offline větev musí být deterministicky klidný den bez nové i resurfacing
  // karty. Fixture mění jen izolovanou Cache Storage tohoto browser contextu;
  // data v repozitáři ani na serveru se nedotknou.
  const quietFixtureReady = await page.evaluate(async (cacheName) => {
    const c = await caches.open(cacheName);
    const response = await c.match('/data/today.json');
    if (!response) return false;
    const data = await response.json();
    data.cards = [];
    data.resurfacing = null;
    await c.put('/data/today.json', new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    return true;
  }, CACHE_NAME);
  check('Offline fixture klidného dne připravena', quietFixtureReady);

  // 2. offline reload
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1500);
  const offlineCards = await page.locator('#cards-today .card').count();
  check('Offline klidný den vykreslí archivní karty ze SW cache', offlineCards > 0, `cards=${offlineCards}`);
  check('Fuse je po offline reloadu dostupný', await page.evaluate(() => typeof Fuse === 'function'));
  const mediaOffline = await page.evaluate(async url => {
    const response = await fetch(url);
    return response.ok && (await response.arrayBuffer()).byteLength > 0;
  }, MEDIA_URL).catch(() => false);
  check('Médium se po offline reloadu načte z cache', mediaOffline);

  await ctx.setOffline(false);
  await browser.close();
  console.log(failures === 0 ? '\nOFFLINE: VŠE PROŠLO' : `\n${failures} SELHALO`);
  process.exit(failures ? 1 : 0);
})();
