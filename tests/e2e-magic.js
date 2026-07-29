// E2E: magic link + gate vylepšení
const { chromium } = require('playwright');
const { BASE } = require('./_auth.js');
const fs = require('fs');
const path = require('path');
// GATE_CODE se čte z .dev.vars za běhu — nikdy ho nehardcodovat do testu.
const CODE = (() => {
  const f = path.join(__dirname, '..', '.dev.vars');
  const m = fs.readFileSync(f, 'utf8').match(/^GATE_CODE=(.+)$/m);
  if (!m) { console.error('GATE_CODE nenalezen v .dev.vars'); process.exit(1); }
  return m[1].trim();
})();
let failures = 0;
const check = (n, c, d='') => { console.log(`${c?'PASS':'FAIL'}  ${n}${c?'':'  <-- '+d}`); if(!c) failures++; };
(async () => {
  const browser = await chromium.launch();

  // 1. Cizí člověk BEZ auth, BEZ magic klíče → gate + teaser karty + community link
  const ctx1 = await browser.newContext();
  const page1 = await ctx1.newPage();
  // today.json je za přihlašovací cookie; id karty si vezmeme rovnou
  // ze souboru, je to jen vstup do testu, ne testovaná věc.
  // V klidný den je cards prázdné, ale resurfacing karta tam je vždycky.
  const _today = JSON.parse(require('fs').readFileSync(
    require('path').join(__dirname, '..', 'data', 'today.json'), 'utf8'));
  const cardId = _today.cards?.[0]?.id || _today.resurfacing?.id;
  check('máme id karty pro deep link', !!cardId, String(cardId));
  await page1.goto(BASE + '/#card/' + cardId, { waitUntil: 'networkidle' });
  await page1.waitForTimeout(1200);
  check('Gate viditelný bez auth', await page1.evaluate(() => !document.getElementById('gate').classList.contains('hidden')));
  const teaser = await page1.locator('#gate-card-teaser').textContent().catch(() => '');
  check('Teaser ukazuje titulek cílové karty', (teaser||'').includes('Za bránou'), teaser);
  check('Odkaz na komunitu (je zdarma)', await page1.locator('.gate-community a').count() === 1);
  const hint = await page1.locator('.gate-hint').textContent();
  check('Hint říká 90 dní', /90/.test(hint), hint);

  // 2. Magic link → auto-unlock bez gate
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await page2.goto(`${BASE}/?k=${CODE}#card/${cardId}`, { waitUntil: 'networkidle' });
  await page2.waitForTimeout(1500);
  check('Magic link: gate se nezobrazí', await page2.evaluate(() => document.getElementById('gate').classList.contains('hidden')));
  check('Magic link: ?k= zmizel z adresy', !page2.url().includes('k='), page2.url());
  check('Magic link: karta se otevřela', await page2.evaluate(() => !document.getElementById('card-overlay').classList.contains('hidden')));
  check('Magic link: kód uložen pro shareCard', await page2.evaluate(() => localStorage.getItem('mtf_code') !== null));
  const auth = await page2.evaluate(() => JSON.parse(localStorage.getItem('mtf_auth') || '{}'));
  const days = (auth.expires - Date.now()) / 86400000;
  check('Token platí ~90 dní', days > 85 && days < 95, days.toFixed(1));

  // 3. Špatný magic klíč → gate se ukáže normálně
  const ctx3 = await browser.newContext();
  const page3 = await ctx3.newPage();
  await page3.goto(BASE + '/?k=SPATNYKOD', { waitUntil: 'networkidle' });
  await page3.waitForTimeout(1500);
  check('Špatný kód: gate se zobrazí', await page3.evaluate(() => !document.getElementById('gate').classList.contains('hidden')));

  // 4. /card/ redirect zachová k parametr
  const resp = await fetch(`${BASE}/card/${cardId}?k=${CODE}&src=push`);
  const html = await resp.text();
  check('/card/ redirect nese ?k= i ?src=', html.includes('k=' + CODE) && html.includes('src=push'), html.match(/url=[^"]*/)?.[0]);

  await browser.close();
  console.log(failures === 0 ? '\nMAGIC LINK: VŠE PROŠLO' : `\n${failures} SELHALO`);
  process.exit(failures ? 1 : 0);
})();
