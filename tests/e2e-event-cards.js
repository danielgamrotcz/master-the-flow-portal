// Trvalý kontrakt: každá evidovaná akce má soukromí šetřící sdílecí náhled.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { chromium } = require('playwright');
const { BASE, authenticate } = require('./_auth.js');
const { ORIGIN, projectEvent } = require('../tools/event-card-model.js');
const ROOT = path.resolve(__dirname, '..');
const events = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/events.json'), 'utf8')).events;
let passed = 0;
function check(name, result) { assert.ok(result, name); console.log(`PASS  ${name}`); passed++; }

(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const seenImages = new Set();
    for (const event of events) {
      const card = projectEvent(event);
      const response = await ctx.request.get(BASE + card.pagePath);
      check(`${card.id}: veřejná HTTP stránka`, response.status() === 200);
      const html = await response.text();
      await page.setContent(html);
      const image = await page.locator('meta[property="og:image"]').getAttribute('content');
      check(`${card.id}: vlastní OG i Twitter obrázek`, image.startsWith(ORIGIN + card.imagePath + '?v=')
        && !seenImages.has(image) && await page.locator('meta[name="twitter:image"]').getAttribute('content') === image);
      seenImages.add(image);
      check(`${card.id}: shodný název a kanonická adresa`, await page.locator('meta[property="og:title"]').getAttribute('content') === card.title
        && await page.locator('meta[property="og:url"]').getAttribute('content') === ORIGIN + card.pagePath
        && await page.locator('link[rel="canonical"]').getAttribute('href') === ORIGIN + card.pagePath);
      check(`${card.id}: popis a rozměry obrázku`, await page.locator('meta[property="og:image:alt"]').getAttribute('content') === `${card.title} · ${card.date}`
        && await page.locator('meta[property="og:image:width"]').getAttribute('content') === '1200'
        && await page.locator('meta[property="og:image:height"]').getAttribute('content') === '630');
      const newMetadata = await page.locator('meta[property^="og:"], meta[name^="twitter:"]').evaluateAll(els => els.map(e => e.content).join('\n'));
      const publicProjection = JSON.stringify(card) + newMetadata + (card.landing ? '' : html);
      const sensitive = ['recording_url', 'recording_password', 'discount_code', 'registration_url'];
      check(`${card.id}: žádné citlivé údaje v novém náhledu`, sensitive.every(key => !event[key] || !publicProjection.includes(event[key]))
        && !/meet\.google\.com|calendar\.google\.com|drive\.google\.com/.test(publicProjection));
      const imageUrl = new URL(image);
      const pngResponse = await ctx.request.get(BASE + imageUrl.pathname + imageUrl.search);
      const png = await pngResponse.body();
      check(`${card.id}: veřejný správný PNG`, pngResponse.status() === 200
        && /image\/png/.test(pngResponse.headers()['content-type'])
        && png.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
        && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630
        && png.equals(fs.readFileSync(path.join(ROOT, card.imagePath)))
        && imageUrl.searchParams.get('v') === createHash('sha256').update(png).digest('hex').slice(0, 12));
      if (!card.landing) {
        check(`${card.id}: pokračování pouze do původního portálu`, await page.locator('a').getAttribute('href') === `/#event/${card.id}`
          && await page.locator('meta[http-equiv="refresh"]').count() === 0);
      }
    }
    // Testuje allowlist, ne skutečné přístupové údaje.
    const fixture = { ...events[0], recording_password: 'DO_NOT_EXPORT_TEST_VALUE', arbitrary: 'PRIVATE_TEST_VALUE' };
    const projected = JSON.stringify(projectEvent(fixture));
    check('Projekce nepřenáší dodatečná pole', !projected.includes('DO_NOT_EXPORT') && !projected.includes('PRIVATE_TEST'));
    assert.throws(() => projectEvent({ ...events[0], id: '../escape' }));
    check('ID nemůže opustit adresář výstupů', true);
    await ctx.close();

    // Skutečná interakce s portálem; share a clipboard jsou mock, nic se neodesílá.
    const member = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await authenticate(member);
    await member.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: async payload => { window.__shared = payload; } });
      Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async text => { window.__copied = text; } });
    });
    const portal = await member.newPage();
    for (const event of events.filter(e => e.portal_hidden !== true)) {
      await portal.goto(`${BASE}/#event/${event.id}`, { waitUntil: 'networkidle' });
      await portal.locator('[data-share-event]').click();
      const payload = await portal.evaluate(() => window.__shared);
      check(`${event.id}: tlačítko sdílí správnou adresu`, payload.url === BASE + projectEvent(event).pagePath
        && payload.title === event.title && Object.keys(payload).sort().join(',') === 'title,url');
    }
    await portal.evaluate(() => { Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }); });
    await portal.locator('[data-share-event]').click();
    check('Clipboard fallback kopíruje jen adresu akce', await portal.evaluate(() => window.__copied) === BASE + projectEvent(events.at(-1)).pagePath);
    const publicContext = await browser.newContext();
    const visitor = await publicContext.newPage();
    const modalOnly = events.find(e => !e.detail_url);
    await visitor.goto(BASE + projectEvent(modalOnly).pagePath);
    await visitor.getByRole('link', { name: 'Otevřít detail v portálu' }).click();
    await visitor.locator('#gate').waitFor({ state: 'visible' });
    check('Sdílení neobchází přístupovou bránu', visitor.url() === `${BASE}/#event/${modalOnly.id}`);
    console.log(`\nEVENT CARDS: ${passed} kontrol prošlo`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
