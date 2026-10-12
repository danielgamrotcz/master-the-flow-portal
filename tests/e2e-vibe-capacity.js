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
        capacity: 98, registeredCount: count, remaining: Math.max(0, 98 - count),
        updatedAt: new Date(Date.now() - (stale ? 16 * 60000 : 0)).toISOString(),
      }) });
    });
    await page.goto(`${BASE}/rozhovory/1-vibe-coding-s-alexem/`, { waitUntil: 'networkidle' });
    const rows = page.locator('[data-registration-availability]');
    assert.equal(await rows.count(), 2);
    assert.match(await rows.first().innerText(), /Zbývá 91 míst · Přihlášeno 7 z 98/);
    assert.equal(await rows.first().innerText(), await rows.last().innerText());
    assert.equal(await rows.first().getAttribute('aria-live'), 'polite');
    for (const [value, expected] of [[0, 'Zbývá 98 míst'], [94, 'Zbývají 4 místa'], [97, 'Zbývá 1 místo'], [98, 'kapacita je naplněná'], [101, 'kapacita je naplněná']]) {
      count = value;
      await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
      await page.waitForFunction(text => document.querySelector('[data-registration-availability]').textContent.includes(text), expected);
      assert.ok(!(await rows.first().innerText()).includes('Zbývá -'));
    }
    count = 7; stale = true;
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
    await page.waitForFunction(() => document.querySelector('[data-registration-availability]').textContent.includes('není dostupná'));
    stale = false; fail = true;
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
    await page.waitForTimeout(100);
    assert.match(await rows.first().innerText(), /není dostupná/);
    fail = false;
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
    assert.match(await rows.first().innerText(), /Přihlášeno 7 z 98/);
    console.log('PASS: kapacita, nula, plno, přesah, výpadek, stáří, obnova, 4 viewporty a oba motivy');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
