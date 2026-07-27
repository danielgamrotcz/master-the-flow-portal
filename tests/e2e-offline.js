// Offline test: SW cache musí po opravě ?v= reálně servírovat data
const { chromium } = require('playwright');
let failures = 0;
const check = (n, c, d='') => { console.log(`${c?'PASS':'FAIL'}  ${n}${c?'':'  <-- '+d}`); if(!c) failures++; };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await ctx.addInitScript(() => {
    localStorage.setItem('mtf_auth', JSON.stringify({ token: 'test', expires: Date.now() + 86400000 }));
  });

  // 1. online návštěva — SW se zaregistruje a nacachuje
  await page.goto('http://localhost:8788/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500); // čas na SW install + cache
  const swActive = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return !!(reg && reg.active);
  });
  check('Service worker aktivní', swActive);

  // Verzi cache čteme ze sw.js, ne natvrdo — jinak test spadne po každém
  // zvednutí verze, i když je všechno v pořádku.
  const swSrc = await (await fetch('http://localhost:8788/sw.js')).text();
  const CACHE_NAME = (swSrc.match(/CACHE\s*=\s*['"]([^'"]+)['"]/) || [])[1];
  check('sw.js má název cache', !!CACHE_NAME, swSrc.slice(0, 80));

  const cacheInfo = await page.evaluate(async (cacheName) => {
    const names = await caches.keys();
    const c = await caches.open(cacheName);
    const keys = await c.keys();
    return { names, count: keys.length, hasToday: keys.some(k => k.url.includes('today.json')), anyQuery: keys.some(k => k.url.includes('?v=')) };
  }, CACHE_NAME);
  check(`Cache ${CACHE_NAME} existuje`, cacheInfo.names.includes(CACHE_NAME), JSON.stringify(cacheInfo.names));
  check('today.json je v cache', cacheInfo.hasToday);
  check('Žádné ?v= záznamy v cache (dřív ~110/návštěvu)', !cacheInfo.anyQuery);

  // 2. offline reload
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1500);
  const offlineCards = await page.locator('#cards-today .card').count();
  check('Offline reload vykreslí karty ze SW cache', offlineCards > 0, `cards=${offlineCards}`);

  await ctx.setOffline(false);
  await browser.close();
  console.log(failures === 0 ? '\nOFFLINE: VŠE PROŠLO' : `\n${failures} SELHALO`);
  process.exit(failures ? 1 : 0);
})();
