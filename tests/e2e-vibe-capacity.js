const { chromium } = require('playwright');
const assert = require('assert/strict');
const BASE = process.env.MTF_BASE || 'http://localhost:8788';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    let count = 7;
    let stale = false;
    let fail = false;
    let requests = 0;
    await page.route('**/api/vibe-coding-registrations', route => {
      requests++;
      if (fail) return route.abort();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        registeredCount: count,
        updatedAt: new Date(Date.now() - (stale ? 16 * 60000 : 0)).toISOString(),
      }) });
    });

    await page.goto(`${BASE}/rozhovory/1-vibe-coding-s-alexem/`, { waitUntil: 'networkidle' });
    const rows = page.locator('[data-registration-availability]');
    const links = page.locator('[data-registration-link]');
    assert.equal(await rows.count(), 2);
    assert.equal(await rows.first().innerText(), 'Přihlášeno: 7');
    assert.equal(await rows.first().innerText(), await rows.last().innerText());
    assert.equal(await rows.first().getAttribute('aria-live'), 'polite');

    for (const value of [0, 98, 101, 10001]) {
      count = value;
      await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
      await page.waitForFunction(expected => document.querySelector('[data-registration-availability]').textContent === `Přihlášeno: ${expected}`, value);
      for (const link of await links.all()) {
        assert.equal(await link.getAttribute('aria-disabled'), null);
        assert.ok(await link.getAttribute('href'));
        assert.equal(await link.innerText(), 'Chci pozvánku zdarma');
      }
    }

    stale = true;
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
    await page.waitForFunction(() => document.querySelector('[data-registration-availability]').textContent.includes('není dostupný'));
    for (const link of await links.all()) assert.ok(await link.getAttribute('href'), 'stará data nesmí zavřít registraci');

    stale = false;
    fail = true;
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
    await page.waitForTimeout(100);
    assert.match(await rows.first().innerText(), /není dostupný/);
    for (const link of await links.all()) assert.ok(await link.getAttribute('href'), 'výpadek nesmí zavřít registraci');

    fail = false;
    count = 7;
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow ${width}/${theme}`);
      }
    }
    const before = requests;
    await page.waitForTimeout(30500);
    assert.ok(requests > before, 'automatická obnova po 30 s');
    assert.equal(await rows.first().innerText(), 'Přihlášeno: 7');
    const publicText = await page.locator('main').innerText();
    assert.ok(!/\b98\b|kapacit|zbývá|obsazen|z 98/i.test(publicText));
    console.log('PASS: jen počet registrovaných, CTA aktivní při 98+, čestný fallback, obnova, 4 viewporty a oba motivy');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
