const { chromium } = require('playwright');
let failures = 0;
const check = (n, c, d='') => { console.log(`${c?'PASS':'FAIL'}  ${n}${c?'':'  <-- '+d}`); if(!c) failures++; };
// Test si sám podvrhne 0-karet today.json a po doběhu ho vrátí.
const fs = require('fs');
const path = require('path');
const TODAY = path.join(__dirname, '..', 'data', 'today.json');
const BACKUP = TODAY + '.e2e-backup';

(async () => {
  fs.copyFileSync(TODAY, BACKUP);
  const data = JSON.parse(fs.readFileSync(TODAY, 'utf8'));
  data.cards = [];
  fs.writeFileSync(TODAY, JSON.stringify(data, null, 2));
  process.on('exit', () => {
    try { fs.copyFileSync(BACKUP, TODAY); fs.unlinkSync(BACKUP); } catch {}
  });

  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await ctx.addInitScript(() => {
    localStorage.setItem('mtf_auth', JSON.stringify({ token: 'test', expires: Date.now() + 86400000 }));
  });
  await page.goto('http://localhost:8788/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500); // ensureSearchAll stahuje archiv

  const note = await page.locator('.quiet-day-note').textContent().catch(() => '');
  check('Klidný den: poznámka viditelná', (note||'').includes('Klidný den'), note);
  const resurfaced = await page.locator('#cards-today .card.resurfaced').count();
  check('Resurfacing karta zobrazená', resurfaced === 1, String(resurfaced));
  const picks = await page.locator('#cards-today .card:not(.resurfaced)').count();
  check('Archivní výběr (1-3 karty)', picks >= 1 && picks <= 3, String(picks));
  const headers = await page.locator('#cards-today .section-header').allTextContents();
  check('Sekce „Co jste možná minuli"', headers.some(h => h.includes('minuli')), headers.join('|'));
  // karty jsou klikatelné
  await page.locator('#cards-today .card:not(.resurfaced)').first().click();
  await page.waitForTimeout(400);
  check('Archivní karta se otevře', await page.evaluate(() => !document.getElementById('card-overlay').classList.contains('hidden')));

  await browser.close();
  console.log(failures === 0 ? '\nKLIDNÝ DEN: VŠE PROŠLO' : `\n${failures} SELHALO`);
  process.exit(failures ? 1 : 0);
})();
