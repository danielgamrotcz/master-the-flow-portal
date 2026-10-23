// Trvalý archivní kontrakt: historické count odpovědi nesmí znovu otevřít registraci.
const { chromium } = require('playwright');
const assert = require('assert/strict');
const BASE = process.env.MTF_BASE || 'http://localhost:8788';
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    let requests = 0;
    await page.route('**/api/vibe-coding-registrations', route => {
      requests++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        registeredCount: 0, updatedAt: new Date().toISOString(),
      }) });
    });
    await page.goto(`${BASE}/rozhovory/1-vibe-coding-s-alexem/`, { waitUntil: 'networkidle' });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
        await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
        await page.locator('#registrace').scrollIntoViewIfNeeded();
        assert.equal(await page.locator('[data-registration-link], [data-registration-availability], .sticky-register, a[href*="docs.google.com/forms"]').count(), 0);
        assert.match(await page.locator('#registrace').innerText(), /Registrace jsou uzavřené/);
        assert.match(await page.locator('#registrace').innerText(), /Záznam připravujeme/);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow ${width}/${theme}`);
      }
    }
    assert.equal(requests, 0, 'archiv již nevolá počítadlo registrací');
    console.log('PASS: uzavřený archiv, žádná count API volání ani CTA, pageshow, 4 viewporty a oba motivy');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
