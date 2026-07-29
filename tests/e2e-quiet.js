const { chromium } = require('playwright');
const { authenticate } = require('./_auth.js');
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
  // Resurfacing kartu si test dosadí sám. Digest ji má jen některé dny (za
  // sledované období čtyři z dvanácti), takže spoléhat na ostrá data znamená
  // padat každý čtvrtý den na něčem, co se vůbec nerozbilo.
  if (!data.resurfacing) {
    const idx = JSON.parse(fs.readFileSync(
      path.join(__dirname, '..', 'data', 'cards-index.json'), 'utf8'));
    const pool = Array.isArray(idx) ? idx : (idx.cards || Object.values(idx));
    data.resurfacing = { ...pool[0], resurfaced_from: pool[0].date || pool[0].source_date };
  }
  fs.writeFileSync(TODAY, JSON.stringify(data, null, 2));
  process.on('exit', () => {
    try { fs.copyFileSync(BACKUP, TODAY); fs.unlinkSync(BACKUP); } catch {}
  });

  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await authenticate(ctx);
  const page = await ctx.newPage();
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
  // Regrese 29. 7. 2026: rerenderCurrentView() volal renderCards() s prázdným
  // polem karet, takže z klidného dne zbyl jen resurfacing. Spouští se hned po
  // načtení (loadVoteMap), při hlasu, filtru i návratu do panelu — úvodní věta
  // a celá sekce „Co jste možná minuli“ jen probliknuly a zmizely.
  // Test volá překreslení napřímo, aby nezáviselo na tom, kdo vyhraje závod.
  const idsBefore = await page.locator('#cards-today .card:not(.resurfaced)')
    .evaluateAll(els => els.map(e => e.dataset.id || e.id));
  await page.evaluate(() => rerenderCurrentView());
  await page.waitForTimeout(600);

  const noteAfter = await page.locator('.quiet-day-note').textContent().catch(() => '');
  check('překreslení nesmaže poznámku o klidném dni', (noteAfter || '').includes('Klidný den'), noteAfter);
  const headersAfter = await page.locator('#cards-today .section-header').allTextContents();
  check('překreslení nesmaže sekci „Co jste možná minuli“',
    headersAfter.some(h => h.includes('minuli')), headersAfter.join('|'));
  const idsAfter = await page.locator('#cards-today .card:not(.resurfaced)')
    .evaluateAll(els => els.map(e => e.dataset.id || e.id));
  check('překreslení nepřelosuje výběr',
    idsAfter.join(',') === idsBefore.join(','), `${idsBefore.join(',')} → ${idsAfter.join(',')}`);

  // karty jsou klikatelné
  await page.locator('#cards-today .card:not(.resurfaced)').first().click();
  await page.waitForTimeout(400);
  check('Archivní karta se otevře', await page.evaluate(() => !document.getElementById('card-overlay').classList.contains('hidden')));

  await browser.close();
  console.log(failures === 0 ? '\nKLIDNÝ DEN: VŠE PROŠLO' : `\n${failures} SELHALO`);
  process.exit(failures ? 1 : 0);
})();
