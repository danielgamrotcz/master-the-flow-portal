// E2E: krátkodobý podepsaný share ticket + gate
const { chromium } = require('playwright');
const { authenticate, fixtureCardId, BASE } = require('./_auth.js');
let failures = 0;
const check = (n, c, d='') => { console.log(`${c?'PASS':'FAIL'}  ${n}${c?'':'  <-- '+d}`); if(!c) failures++; };

(async () => {
  const browser = await chromium.launch();
  const cardId = fixtureCardId();
  check('máme id karty pro deep link', !!cardId, String(cardId));

  // 1. Cizí člověk bez auth a ticketu → gate + veřejný teaser.
  const ctx1 = await browser.newContext();
  const page1 = await ctx1.newPage();
  await page1.goto(BASE + '/#card/' + cardId, { waitUntil: 'networkidle' });
  await page1.waitForTimeout(1200);
  check('Gate viditelný bez auth', await page1.evaluate(() => !document.getElementById('gate').classList.contains('hidden')));
  const teaser = await page1.locator('#gate-card-teaser').textContent().catch(() => '');
  check('Teaser ukazuje titulek cílové karty', (teaser || '').includes('Za bránou'), teaser);
  check('Odkaz na komunitu (je zdarma)', await page1.locator('.gate-community a').count() === 1);

  // 2. Přihlášený člen si vyžádá ticket. Bez session endpoint odmítá.
  const denied = await ctx1.request.post(BASE + '/api/share', {
    headers: { 'Content-Type': 'application/json', Origin: BASE },
    data: { id: cardId },
  });
  check('Share ticket bez session odmítnut', denied.status() === 401, String(denied.status()));

  const creator = await browser.newContext();
  const { token } = await authenticate(creator);
  const shareRes = await creator.request.post(BASE + '/api/share', {
    headers: { 'Content-Type': 'application/json', 'x-mtf-token': token, Origin: BASE },
    data: { id: cardId },
  });
  check('Přihlášený člen získá share ticket', shareRes.ok(), String(shareRes.status()));
  const { ticket } = await shareRes.json();
  check('Ticket má bezpečný URL tvar', /^[0-9A-Za-z._-]{100,180}$/.test(ticket || ''), ticket?.length);

  // 3. Share link → auto-unlock bez globálního kódu v URL nebo localStorage.
  const ctx2 = await browser.newContext();
  await ctx2.addInitScript(() => localStorage.setItem('mtf_code', 'LEGACY-KOD'));
  const page2 = await ctx2.newPage();
  await page2.goto(`${BASE}/?s=${encodeURIComponent(ticket)}#card/${cardId}`, { waitUntil: 'networkidle' });
  await page2.waitForTimeout(1500);
  check('Share link: gate se nezobrazí', await page2.evaluate(() => document.getElementById('gate').classList.contains('hidden')));
  check('Share link: ticket zmizel z adresy', !page2.url().includes('s='), page2.url());
  check('Share link: karta se otevřela', await page2.evaluate(() => !document.getElementById('card-overlay').classList.contains('hidden')));
  check('Starý globální kód je z localStorage odstraněn', await page2.evaluate(() => localStorage.getItem('mtf_code') === null));
  const auth = await page2.evaluate(() => JSON.parse(localStorage.getItem('mtf_auth') || '{}'));
  const days = (auth.expires - Date.now()) / 86400000;
  check('Výsledná session platí ~90 dní', days > 85 && days < 95, days.toFixed(1));

  // 4. Pozměněný ticket nesmí projít.
  const tampered = ticket.slice(0, -1) + (ticket.endsWith('a') ? 'b' : 'a');
  const ctx3 = await browser.newContext();
  const page3 = await ctx3.newPage();
  await page3.goto(BASE + '/?s=' + encodeURIComponent(tampered), { waitUntil: 'networkidle' });
  await page3.waitForTimeout(1000);
  check('Pozměněný ticket: gate se zobrazí', await page3.evaluate(() => !document.getElementById('gate').classList.contains('hidden')));

  // 5. /card/ náhled zachová jen bezpečný ticket a atribuci.
  const resp = await fetch(`${BASE}/card/${cardId}?s=${encodeURIComponent(ticket)}&src=push&k=NESMIPROJIT`);
  const html = await resp.text();
  check('/card/ redirect nese ticket i src', html.includes('s=') && html.includes('src=push'));
  check('/card/ redirect nepřenáší globální kód', !html.includes('k=NESMIPROJIT'));
  check('/card/ se share ticketem se neukládá do cache', /private/.test(resp.headers.get('cache-control') || '') && /no-store/.test(resp.headers.get('cache-control') || ''), resp.headers.get('cache-control'));

  const publicResp = await fetch(`${BASE}/card/${cardId}`);
  check('/card/ bez ticketu zachovává krátkou veřejnou cache', /public/.test(publicResp.headers.get('cache-control') || ''), publicResp.headers.get('cache-control'));

  await browser.close();
  console.log(failures === 0 ? '\nSHARE TICKET: VŠE PROŠLO' : `\n${failures} SELHALO`);
  process.exit(failures ? 1 : 0);
})();
