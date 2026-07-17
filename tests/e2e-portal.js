// E2E test fáze 1 (dávky A-C) proti wrangler pages dev na :8788
const { chromium } = require('playwright');

const BASE = 'http://localhost:8788';
let failures = 0;
function check(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  <-- ' + detail}`);
  if (!cond) failures++;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); // mobil
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + e.message));

  // Obejít gate (lokální test, data JSONy nejsou za server auth)
  await ctx.addInitScript(() => {
    localStorage.setItem('mtf_auth', JSON.stringify({ token: 'test-token', expires: Date.now() + 86400000 }));
  });

  // ===== 1. Načtení + dnešek =====
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  const gateHidden = await page.evaluate(() => document.getElementById('gate').classList.contains('hidden') || getComputedStyle(document.getElementById('gate')).display === 'none');
  check('Gate skrytý (auth-ok)', gateHidden);

  const cardCount = await page.locator('#cards-today .card').count();
  check('Dnešek renderuje karty (3 + resurfacing = 4)', cardCount === 4, `count=${cardCount}`);

  const resurfacedVisible = await page.locator('#cards-today .card.resurfaced').count();
  check('Resurfacing karta „Z archivu" viditelná (dřív mrtvá)', resurfacedVisible === 1, `count=${resurfacedVisible}`);

  const sectionHeader = await page.locator('#cards-today .section-header').textContent().catch(() => '');
  // pevná mezera (U+00A0) je správná česká typografie
  check('Sekce „Z archivu" má nadpis', /Z[\s ]archivu/.test(sectionHeader || ''), sectionHeader);

  // theme-color je light
  const themeColor = await page.evaluate(() => document.querySelector('meta[name="theme-color"]').getAttribute('content'));
  check('theme-color odpovídá light defaultu', themeColor === '#faf6f2', themeColor);

  // ===== 2. Karta: otevřít → hardwarové zpět =====
  await page.locator('#cards-today .card').first().click();
  await page.waitForTimeout(400);
  let overlayOpen = await page.evaluate(() => !document.getElementById('card-overlay').classList.contains('hidden'));
  check('Karta se otevře v overlayi', overlayOpen);
  check('Hash je #card/...', await page.evaluate(() => location.hash.startsWith('#card/')));

  await page.goBack();
  await page.waitForTimeout(400);
  overlayOpen = await page.evaluate(() => !document.getElementById('card-overlay').classList.contains('hidden'));
  check('Hardwarové zpět zavře kartu (neopustí web)', !overlayOpen);
  check('Po zpět jsme pořád na portálu', page.url().startsWith(BASE));

  // ===== 3. Karta: otevřít → křížek (musí zkonzumovat history entry) =====
  await page.locator('#cards-today .card').first().click();
  await page.waitForTimeout(300);
  await page.locator('#overlay-close').click().catch(async () => {
    await page.evaluate(() => document.querySelector('.overlay-close, #overlay-close, [data-close]')?.click());
  });
  await page.waitForTimeout(400);
  overlayOpen = await page.evaluate(() => !document.getElementById('card-overlay').classList.contains('hidden'));
  check('Křížek zavře kartu', !overlayOpen);
  const hashAfterClose = await page.evaluate(() => location.hash);
  check('Hash po zavření není #card/', !hashAfterClose.startsWith('#card/'), hashAfterClose);

  // ===== 4. Views: dnešek → hledání → zpět =====
  await page.locator('.nav-btn[data-view="search"]').click();
  await page.waitForTimeout(300);
  let searchVisible = await page.evaluate(() => !document.getElementById('view-search').classList.contains('hidden'));
  check('Přepnutí na hledání', searchVisible);

  await page.goBack();
  await page.waitForTimeout(400);
  const todayVisible = await page.evaluate(() => !document.getElementById('view-today').classList.contains('hidden'));
  check('Zpět mezi views srovná view s adresou (dřív rozjeté)', todayVisible);

  // ===== 5. Hledání: diakritika + fallback + sdílitelné URL =====
  await page.locator('.nav-btn[data-view="search"]').click();
  await page.waitForTimeout(200);
  await page.locator('#search-input').fill('nastroje');
  // index se načítá lazy — počkat na výsledky
  await page.waitForSelector('#cards-search .card', { timeout: 15000 }).catch(() => {});
  const resultsNoDia = await page.locator('#cards-search .card').count();
  check('„nastroje" (bez diakritiky) najde výsledky', resultsNoDia > 0, `count=${resultsNoDia}`);

  const searchHash = await page.evaluate(() => location.hash);
  check('Sdílitelné URL dotazu (#search/nastroje)', searchHash === '#search/nastroje', searchHash);

  await page.locator('#search-input').fill('nástroje');
  await page.waitForTimeout(600);
  const resultsDia = await page.locator('#cards-search .card').count();
  check('„nástroje" (s diakritikou) vrací stejně', resultsDia === resultsNoDia, `${resultsDia} vs ${resultsNoDia}`);

  // fallback na překlep
  await page.locator('#search-input').fill('obsidain');
  await page.waitForTimeout(600);
  const fallbackNote = await page.locator('.search-fallback-note').count();
  const fallbackCards = await page.locator('#cards-search .card').count();
  check('Překlep „obsidain" ukáže fuzzy fallback', fallbackNote === 1 && fallbackCards > 0, `note=${fallbackNote} cards=${fallbackCards}`);

  // ===== 6. Deep link na hledání =====
  await page.goto(BASE + '/#search/diktov%C3%A1n%C3%AD', { waitUntil: 'networkidle' });
  await page.waitForSelector('#cards-search .card', { timeout: 15000 }).catch(() => {});
  const deepLinkResults = await page.locator('#cards-search .card').count();
  const deepLinkInput = await page.locator('#search-input').inputValue();
  check('Deep link #search/diktování funguje', deepLinkResults > 0 && deepLinkInput === 'diktování', `count=${deepLinkResults} input=${deepLinkInput}`);

  // ===== 7. Deep link na kartu → zpět neopustí web (pushed=false → replaceState) =====
  const cardId = await page.evaluate(async () => {
    const d = await fetch('/data/today.json').then(r => r.json());
    return d.cards[0].id;
  });
  await page.goto(BASE + '/#card/' + cardId, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  overlayOpen = await page.evaluate(() => !document.getElementById('card-overlay').classList.contains('hidden'));
  check('Deep link na kartu otevře overlay', overlayOpen);
  // křížek u deep linku nesmí volat history.back (žádná entry) — jen replaceState
  await page.evaluate(() => document.getElementById('overlay-close')?.click() || document.querySelector('.overlay-close')?.click());
  await page.waitForTimeout(400);
  check('Křížek u deep linku zůstane na webu', page.url().startsWith(BASE));

  // ===== Konzolové chyby =====
  const realErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('404'));
  check('Žádné JS chyby v konzoli', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

  await browser.close();
  console.log(failures === 0 ? '\nVŠECHNY TESTY PROŠLY' : `\n${failures} TESTŮ SELHALO`);
  process.exit(failures === 0 ? 0 : 1);
})();
