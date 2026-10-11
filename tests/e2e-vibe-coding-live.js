// E2E test veřejné landing page Master the Flow Live #1.
const { chromium } = require('playwright');
const { BASE } = require('./_auth.js');

let failures = 0;
function check(name, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : `  <-- ${detail}`}`);
  if (!condition) failures++;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const consoleErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => consoleErrors.push(`PAGEERROR: ${error.message}`));

  const response = await page.goto(`${BASE}/live/vibe-coding/`, { waitUntil: 'networkidle' });
  check('Stránka vrací úspěšnou odpověď', response && response.ok(), String(response && response.status()));
  check('Stránka je veřejná bez přístupové brány', await page.locator('#gate').count() === 0);
  check('Titulek nese hlavní myšlenku', (await page.locator('h1').innerText()).replace(/\s+/g, ' ') === 'Vibe coding nezačíná promptem.');

  const eventData = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'data', 'events.json'), 'utf8'));
  const portalEvent = eventData.events.find(event => event.id === 'evt-2026-10-21-vibe-coding-nezacina-promptem');
  check('Portálová karta má správný termín a interní registrační cestu', portalEvent?.date === '2026-10-21'
    && portalEvent?.time_from === '18:00'
    && portalEvent?.time_to === '19:30'
    && portalEvent?.registration_page_url === '/live/vibe-coding/'
    && portalEvent?.is_paid === false);

  const mainText = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  const facts = {
    date: /21\. října 2026/.test(mainText),
    day: /středa/i.test(mainText),
    time: /18:00–19:30/.test(mainText),
    duration: /90 minut/i.test(mainText),
    place: /Google Meet/.test(mainText),
    price: /Zdarma/i.test(mainText),
    recording: /Záznam (?:pošleme|dostanou) všem registrovaným/i.test(mainText),
  };
  check('Závazné údaje jsou konzistentní', Object.values(facts).every(Boolean), JSON.stringify(facts));
  check('Stránka míří na mírně pokročilé', /Lovable/.test(mainText) && /Codex/.test(mainText)
    && /Claude Code/.test(mainText) && /Ne od nuly/.test(mainText));
  check('Nosná myšlenka začíná před prvním promptem', /co promyslet a nastavit ještě před prvním promptem/i.test(mainText)
    && /Postup, který začíná dřív než generování/i.test(mainText));
  check('Pokročilý Alexův setup není vydáván za povinnost', /není povinný nákupní seznam/i.test(mainText)
    && /Co zatím klidně vynechat/i.test(mainText));
  check('Vizuální část má jasný příslib', /polovinu vysílání strávíme nad sdílenou obrazovkou/i.test(mainText)
    && /Připravené checkpointy místo čekání/i.test(mainText));
  check('Stránka neslibuje konkrétní aplikaci dema', !/postavíme (?:aplikaci|appku)|vyrobíme (?:aplikaci|appku)/i.test(mainText));

  const registrationLinks = page.locator('[data-registration-link]');
  const registrationHrefs = await registrationLinks.evaluateAll(links => links.map(link => link.href));
  check('Všechna tři registrační CTA vedou na tentýž publikovaný formulář', await registrationLinks.count() === 3
    && new Set(registrationHrefs).size === 1
    && registrationHrefs[0].startsWith('https://docs.google.com/forms/d/e/')
    && !registrationHrefs[0].includes('FORM_ID_PENDING'));

  const publicHrefs = await page.locator('a').evaluateAll(links => links.map(link => link.href));
  check('Veřejná stránka neodhaluje Meet, kalendář ani záznam', !publicHrefs.some(href => /meet\.google\.com|calendar\.google\.com|drive\.google\.com|\.ics(?:$|\?)/.test(href))
    && await page.locator('[data-calendar], .meet-link, .calendar-actions').count() === 0,
  publicHrefs.join(' | '));
  check('Eventová data neodhalují Meet ani záznam', !portalEvent?.links
    && portalEvent?.recording_url === null
    && portalEvent?.location === 'Online — odkaz přijde po registraci');

  check('Alexův profil stojí na ověřitelných zdrojích', /Alex Trejtnar/.test(mainText)
    && /dvacet let zkušeností/i.test(mainText)
    && /ARIBENA/.test(mainText)
    && await page.locator('.guest-links a').count() === 3);

  const programText = await page.locator('.topic-list').innerText();
  check('Stránka uvádí šest okruhů bez časového harmonogramu', await page.locator('.topic-list li').count() === 6
    && /prompt-first/i.test(programText)
    && /Alexův workflow/i.test(programText)
    && /otázky/i.test(programText)
    && !/18:\d{2}/.test(programText));

  const themeBefore = await page.locator('html').getAttribute('data-theme');
  await page.locator('#theme-toggle').click();
  const themeAfter = await page.locator('html').getAttribute('data-theme');
  check('Přepínač barevného režimu funguje', themeBefore !== themeAfter);

  check('Mobil v úvodu neduplikuje registrační tlačítko', await page.locator('.sticky-register').isHidden());
  await page.locator('#registrace').scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  check('Mobilní sticky registrace se ukáže až po odscrollování hero CTA', await page.locator('.sticky-register').isVisible());
  check('Stránka nemá vlastní JS chyby', consoleErrors.length === 0, consoleErrors.join(' | '));

  const widths = [320, 390, 744, 1024, 1440, 1920];
  const layoutProblems = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: width <= 430 ? 844 : 900 });
    await page.reload({ waitUntil: 'networkidle' });
    const state = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      heading: (() => {
        const rect = document.querySelector('h1').getBoundingClientRect();
        return rect.left >= 0 && rect.right <= window.innerWidth;
      })(),
      actions: [...document.querySelectorAll('.hero-actions a')].every(element => {
        const rect = element.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= window.innerWidth;
      }),
    }));
    if (state.overflow || !state.heading || !state.actions) layoutProblems.push(`${width}px=${JSON.stringify(state)}`);
  }
  check('Layout je bezpečný od telefonu po desktop', layoutProblems.length === 0, layoutProblems.join(' | '));

  await browser.close();
  console.log(failures === 0 ? '\nVŠECHNY TESTY VIBE CODING LIVE PROŠLY' : `\n${failures} TESTŮ VIBE CODING LIVE SELHALO`);
  process.exit(failures === 0 ? 0 : 1);
})();
