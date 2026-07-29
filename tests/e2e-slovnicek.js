// E2E test slovníčku: navigace, hledání, kategorie, detail výrazu,
// propojení s hledáním v poznatcích a výrazy v detailu karty.
const { chromium } = require('playwright');
const { authenticate } = require('./_auth.js');
let failures = 0;
function check(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  <-- ' + detail}`);
  if (!cond) failures++;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await authenticate(ctx);
  const page = await ctx.newPage();

  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));

  // ---- data ----
  const res = await page.goto('http://localhost:8788/data/glossary.json');
  const data = await res.json();
  check('glossary.json se servíruje', res.status() === 200, String(res.status()));
  check('obsahuje termíny', Array.isArray(data.terms) && data.terms.length >= 50, `${data.terms?.length}`);
  check('každý termín má slug, popis a kategorii',
    data.terms.every(t => t.slug && t.term && t.short && t.plain && t.category));
  const slugs = new Set(data.terms.map(t => t.slug));
  check('odkazy „souvisí s" míří na existující výrazy',
    data.terms.every(t => (t.related || []).every(r => slugs.has(r))));
  check('všechny termíny mají doložený výskyt v přepisech',
    data.terms.every(t => typeof t.mentions === 'number' && t.mentions > 0));
  check('termíny nesou počet dotčených karet',
    data.terms.every(t => typeof t.card_hits === 'number'));

  // Tlačítko „Najít v poznatcích" nesmí vést do prázdna.
  const noCards = data.terms.find(t => t.card_hits === 0);
  if (noCards) {
    await page.goto('http://localhost:8788/#term/' + noCards.slug);
    await page.waitForSelector('#term-overlay:not(.hidden)', { timeout: 8000 });
    check(`výraz bez karet (${noCards.term}) nenabízí hledání`,
      await page.locator('.term-cta').count() === 0);
  }

  // ---- navigace ----
  await page.goto('http://localhost:8788/#glossary');
  await page.waitForSelector('#view-glossary:not(.hidden)', { timeout: 8000 });
  check('#glossary otevře pohled', true);
  await page.waitForSelector('.gloss-item', { timeout: 8000 });
  const count = await page.locator('.gloss-item').count();
  check('vykreslí všechny výrazy', count === data.terms.length, `${count} vs ${data.terms.length}`);

  const cats = await page.locator('#gloss-cats .chip').count();
  check('vykreslí kategorie', cats >= 5, String(cats));

  // ---- vstupní cesta pro nováčky ----
  const startN = await page.locator('.gloss-start-item').count();
  check('vstupní cesta je vidět', startN >= 4, String(startN));
  const nums = await page.locator('.gloss-start-num').allTextContents();
  check('cesta je číslovaná po pořadí',
    nums.join(',') === nums.map((_, i) => i + 1).join(','), nums.join(','));
  await page.locator('.gloss-start-item').first().click();
  await page.waitForSelector('#term-overlay:not(.hidden)', { timeout: 5000 });
  check('kliknutí ve vstupní cestě otevře výraz', true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // ---- hledání ----
  await page.fill('#gloss-input', 'harness');
  await page.waitForTimeout(150);
  const found = await page.locator('.gloss-item').count();
  check('hledání zúží seznam', found >= 1 && found < count, String(found));
  const firstTerm = (await page.locator('.gloss-item-term').first().textContent()).trim();
  check('najde hledaný výraz', /harness/i.test(firstTerm), firstTerm);

  // hledání bez diakritiky
  await page.fill('#gloss-input', 'kontextove okno');
  await page.waitForTimeout(150);
  check('hledání ignoruje diakritiku', await page.locator('.gloss-item').count() >= 1);

  await page.click('#gloss-clear');
  await page.waitForTimeout(150);
  check('křížek vrátí plný seznam', await page.locator('.gloss-item').count() === count);

  // ---- filtr kategorie ----
  await page.locator('#gloss-cats .chip').nth(1).click();
  await page.waitForTimeout(150);
  const inCat = await page.locator('.gloss-item').count();
  check('filtr kategorie zúží seznam', inCat > 0 && inCat < count, String(inCat));
  await page.locator('#gloss-cats .chip').first().click();
  await page.waitForTimeout(150);

  // ---- detail výrazu ----
  await page.locator('.gloss-item').first().click();
  await page.waitForSelector('#term-overlay:not(.hidden)', { timeout: 5000 });
  check('detail výrazu se otevře', true);
  check('detail má nadpis', (await page.locator('#term-ov-title').textContent()).trim().length > 0);
  check('detail má vysvětlení', (await page.locator('.term-plain').textContent()).trim().length > 30);
  check('adresa je sdílitelná (#term/)', page.url().includes('#term/'), page.url());

  // souvisejicí výraz přepne detail
  if (await page.locator('.term-rel').count() > 0) {
    const before = await page.locator('#term-ov-title').textContent();
    await page.locator('.term-rel').first().click();
    await page.waitForTimeout(250);
    check('„souvisí s" přepne na jiný výraz',
      (await page.locator('#term-ov-title').textContent()) !== before);
  }

  // ---- ze slovníčku do poznatků ----
  await page.locator('.term-cta').first().click();
  await page.waitForSelector('#view-search:not(.hidden)', { timeout: 5000 });
  check('„Najít v poznatcích" přepne na hledání', true);
  check('dotaz je předvyplněný', (await page.inputValue('#search-input')).length > 0);

  // ---- slovníček ve výsledcích hledání ----
  await page.fill('#search-input', 'harness');
  await page.waitForTimeout(900);
  const hit = await page.locator('.search-gloss-hit').count();
  check('hledání nabídne výraz ze slovníčku', hit >= 1, String(hit));
  if (hit) {
    await page.locator('.search-gloss-hit').first().click();
    await page.waitForSelector('#term-overlay:not(.hidden)', { timeout: 5000 });
    check('nález ze slovníčku otevře detail', true);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    check('Escape zavře detail výrazu',
      await page.locator('#term-overlay.hidden').count() === 1);
  }

  // ---- deep link na výraz ----
  await page.goto('http://localhost:8788/#term/harness');
  await page.waitForSelector('#term-overlay:not(.hidden)', { timeout: 8000 });
  check('deep link #term/harness otevře výraz',
    /harness/i.test(await page.locator('#term-ov-title').textContent()));

  // ---- výrazy v detailu karty ----
  await page.goto('http://localhost:8788/');
  await page.waitForSelector('#cards-today .card:not(.card-skeleton)', { timeout: 10000 });
  const cardsN = await page.locator('#cards-today .card:not(.card-skeleton)').count();
  if (cardsN > 0) {
    await page.locator('#cards-today .card:not(.card-skeleton)').first().click();
    await page.waitForSelector('#card-overlay:not(.hidden)', { timeout: 5000 });
    await page.waitForTimeout(600);   // slovníček se dotahuje líně
    const terms = await page.locator('.card-terms [data-term]').count();
    console.log(`      (v detailu karty nabídnuto výrazů: ${terms})`);
    check('detail karty se otevře i se slovníčkem', true);

    // Regrese 29. 7. 2026: #term-overlay a #card-overlay měly stejný z-index
    // a karta je v DOM později, takže se výraz otevřel neviditelně POD kartou
    // a vykoukl až po jejím zavření. Samotné „není hidden" to nechytí —
    // musí se ptát, co je na tom místě opravdu vidět.
    if (terms > 0) {
      await page.locator('.card-terms [data-term]').first().click();
      await page.waitForSelector('#term-overlay:not(.hidden)', { timeout: 5000 });
      await page.waitForTimeout(250);
      const onTop = await page.evaluate(() => {
        const sheet = document.querySelector('#term-overlay .overlay-sheet');
        if (!sheet) return 'chybí sheet';
        const r = sheet.getBoundingClientRect();
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + 8);
        if (!el) return 'nic';
        if (el.closest('#term-overlay')) return 'nahoře';
        if (el.closest('#card-overlay')) return 'pod kartou';
        return 'jinde';
      });
      check('výraz otevřený z poznatku leží nad kartou', onTop === 'nahoře', onTop);

      await page.locator('#term-overlay-close').click();
      await page.waitForTimeout(250);
      check('zavření výrazu vrátí zpět na otevřený poznatek',
        await page.locator('#card-overlay:not(.hidden)').count() === 1);
      check('adresa se vrátí na kartu',
        /#card\//.test(page.url()), page.url());

      // Zavření karty musí pořád projít přes history (příznak pushed), jinak
      // by v historii zůstala viset položka karty.
      const entriesBefore = await page.evaluate(() => history.length);
      await page.locator('#overlay-close').click();
      await page.waitForTimeout(300);
      check('karta jde po výrazu normálně zavřít',
        await page.locator('#card-overlay.hidden').count() === 1);
      const entriesAfter = await page.evaluate(() => history.length);
      check('zavření karty nepřidalo položku do historie',
        entriesAfter <= entriesBefore, `${entriesBefore} → ${entriesAfter}`);
    }
  }

  check('žádné chyby v konzoli', jsErrors.length === 0, jsErrors.join(' | '));

  await browser.close();
  console.log(failures ? `\n${failures} selhání` : '\nvše prošlo');
  process.exit(failures ? 1 : 0);
})();
