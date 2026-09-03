// E2E test veřejné stránky online Show & Tell.
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
  await page.route('**/api/show-and-tell-registrations', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ registeredCount: 7, updatedAt: '2026-09-03T10:00:00Z' }),
  }));
  const consoleErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => consoleErrors.push(`PAGEERROR: ${error.message}`));

  const response = await page.goto(`${BASE}/show-and-tell/`, { waitUntil: 'networkidle' });
  check('Stránka vrací úspěšnou odpověď', response && response.ok(), String(response && response.status()));
  check('Stránka je veřejná bez přístupové brány', await page.locator('#gate').count() === 0);
  check('Titulek pojmenovává formát i téma', (await page.locator('h1').innerText()).replace(/\s+/g, ' ') === 'AI, která mi fakt funguje.');

  const eventData = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'data', 'events.json'), 'utf8'));
  const portalEvent = eventData.events.find(event => event.id === 'evt-2026-09-22-ai-ktera-mi-fakt-funguje');
  check('Portálová karta má správný termín a registrační cestu', portalEvent?.date === '2026-09-22'
    && portalEvent?.time_from === '18:00'
    && portalEvent?.time_to === '19:30'
    && portalEvent?.registration_page_url === '/show-and-tell/'
    && portalEvent?.is_paid === false);

  const mainText = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  const facts = {
    date: /22\. září 2026/.test(mainText),
    time: /18:00–19:30/.test(mainText),
    duration: /90 minut/i.test(mainText),
    place: /online setkání/i.test(mainText),
    price: /Zdarma/i.test(mainText),
    audience: /pouze pro (?:členy )?Master the Flow/i.test(mainText),
  };
  check('Závazné údaje jsou konzistentní', Object.values(facts).every(Boolean), JSON.stringify(facts));
  check('Vystoupení je výslovně nepovinné', /Můžete se jen připojit a sledovat/.test(mainText)
    && /Vystoupení není podmínkou registrace/.test(mainText));
  check('Veřejný text nepoužívá zakázané výrazy', !/\b(?:opravdu|skutečně|věc|věci)\b/i.test(mainText));
  check('Stránka uvádí 5–6 desetiminutových ukázek', /5–6/.test(mainText) && /deset minut/i.test(mainText));
  check('Stránka upozorňuje na nahrávání', /Setkání se nahrává/.test(mainText) && /záznam je určený pro komunitu/.test(mainText));
  check('Hero ukáže anonymní počet přihlášených', await page.locator('#registered-count').innerText() === '7'
    && await page.locator('#registered-count-note').innerText() === 'účastníků');

  const registrationLinks = page.locator('[data-registration-link]');
  check('Všechna tři registrační CTA vedou na tentýž publikovaný formulář', await registrationLinks.count() === 3
    && new Set(await registrationLinks.evaluateAll(links => links.map(link => link.href))).size === 1
    && (await registrationLinks.first().getAttribute('href') || '').startsWith('https://docs.google.com/forms/d/e/'));

  const publicHrefs = await page.locator('a').evaluateAll(links => links.map(link => link.href));
  check('Veřejná stránka nenabízí Meet ani přidání do kalendáře', !publicHrefs.some(href => /meet\.google\.com|calendar\.google\.com|outlook\.office\.com|\.ics(?:$|\?)/.test(href))
    && await page.locator('[data-calendar], .meet-link, .calendar-actions').count() === 0,
  publicHrefs.join(' | '));
  check('Portálová eventová data nezpřístupňují Meet ani kalendář', !portalEvent?.links
    && portalEvent?.location === 'Online — odkaz přijde po registraci');
  const legacyIcsResponse = await page.request.get(`${BASE}/show-and-tell/ai-ktera-mi-fakt-funguje.ics`);
  const legacyIcsBody = await legacyIcsResponse.text();
  check('Dříve publikovaný ICS už neumožní obejít registraci', legacyIcsResponse.ok()
    && !/meet\.google\.com/i.test(legacyIcsBody)
    && /Registrace je povinná/.test(legacyIcsBody));
  check('Stránka vysvětluje doručení pozvánky po registraci', /Po registraci vám přijde pozvánka do kalendáře/.test(mainText));
  const programText = await page.locator('.timeline').innerText();
  check('Program má čtyři navazující bloky bez pauzy', await page.locator('.timeline li').count() === 4
    && /18:00–18:10/.test(programText)
    && /18:10–19:10/.test(programText)
    && /19:10–19:25/.test(programText)
    && /19:25–19:30/.test(programText)
    && /rezerva/i.test(programText)
    && !/pauza/i.test(programText));

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
  console.log(failures === 0 ? '\nVŠECHNY TESTY SHOW & TELL PROŠLY' : `\n${failures} TESTŮ SHOW & TELL SELHALO`);
  process.exit(failures === 0 ? 0 : 1);
})();
