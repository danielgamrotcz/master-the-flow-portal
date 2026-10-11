// E2E test veřejné landing page série Rozhovory Master the Flow.
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
  check('Portál nevydává otevřené otázky za pevný program', portalEvent?.program === null);

  const mainText = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  const pageMarkup = await page.content();
  const publicCopy = `${pageMarkup} ${JSON.stringify(portalEvent)}`;
  const naming = {
    type: portalEvent?.type === 'ROZHOVOR',
    title: portalEvent?.title === 'Vibe coding nezačíná promptem | Alex Trejtnar',
    eyebrow: await page.locator('.eyebrow').textContent() === 'Rozhovory Master the Flow · online · zdarma',
    guest: await page.locator('.guest-intro .section-kicker').textContent() === 'Host rozhovoru',
    legacyLabelAbsent: !/Master the Flow Live|Live #1|Host prvního/i.test(`${await page.title()} ${publicCopy}`),
  };
  check('Akce používá název série rozhovorů bez falešného číslování', Object.values(naming).every(Boolean), JSON.stringify(naming));
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
  const startingPoint = {
    lovable: /Lovable/.test(mainText),
    codingAgent: /coding agentem/i.test(mainText),
    desiredOutput: /výsledek není takový, jaký jste chtěli/i.test(mainText),
  };
  check('Stránka vychází ze zkušenosti s coding nástroji', Object.values(startingPoint).every(Boolean), JSON.stringify(startingPoint));
  check('Nosná otázka není redukovaná na lepší prompt', /co rozhoduje ještě před prvním promptem/i.test(mainText)
    && /Co si připravit před prvním promptem/i.test(mainText));
  check('Alexův setup není vydáván za povinnost', /co z Alexova systému má smysl převzít jako první/i.test(mainText)
    && /co má smysl přidat až později/i.test(mainText));
  check('Alexova odbornost není postavená na shazování Daniela', /propracovaný systém/i.test(mainText)
    && /digitálu přes dvacet let/i.test(mainText)
    && /ARIBENA/i.test(mainText)
    && !/Mám to stejně|Nejsem vývojář|dál než (?:já|ten můj)|Co dělá jinak než já|co mi při stavění aplikací nefunguje|méně pokročil|o (?:několik|pár) úrovní přede mnou|teprve začínám|Daniel[^.]{0,80}(?:bastlí|nezvládá|trvá déle)/i.test(publicCopy));
  const faqText = await page.locator('.faq-list').textContent();
  check('Ukázky jsou podmíněné užitečností pro odpověď', /Když bude odpověď lépe vidět než popsat/i.test(faqText)
    && /ukázky vybereme až při přípravě/i.test(faqText));
  check('Stránka neslibuje pevný program ani polovinu vysílání', /Není to program/i.test(mainText)
    && !/polovinu vysílání|připravené checkpointy|šest okruhů/i.test(mainText));
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
    && portalEvent?.location === 'Online, odkaz přijde po registraci');

  check('Landing page ani data této akce neobsahují dlouhou pomlčku', !pageMarkup.includes('—')
    && !JSON.stringify(portalEvent).includes('—'));

  const portrait = page.locator('.guest-band .guest-portrait img');
  const portraitData = await portrait.evaluate(image => ({
    src: image.getAttribute('src'),
    alt: image.getAttribute('alt'),
    complete: image.complete,
    width: image.naturalWidth,
    height: image.naturalHeight,
  }));
  check('Alexova fotografie je lokální, popsaná a načtená', portraitData.src === '/live/vibe-coding/alex-trejtnar.jpg'
    && portraitData.alt === 'Alex Trejtnar'
    && portraitData.complete
    && portraitData.width === 600
    && portraitData.height === 600,
  JSON.stringify(portraitData));
  const portraitBox = await page.locator('.guest-portrait').boundingBox();
  check('Alexova fotografie není v hero a v oranžové sekci je čtvercová', await page.locator('.hero .guest-portrait').count() === 0
    && await page.locator('.guest-band .guest-portrait').count() === 1
    && portraitBox
    && Math.abs(portraitBox.width - portraitBox.height) < 1,
  JSON.stringify(portraitBox));
  check('Alexův profil stojí na ověřitelných zdrojích', /Alex Trejtnar/.test(mainText)
    && /digitálu přes dvacet let/i.test(mainText)
    && /ARIBENA/.test(mainText)
    && await page.locator('.guest-links a').count() === 3);

  const questionsText = await page.locator('.question-grid').innerText();
  check('Stránka používá čtyři otevřené otázky místo harmonogramu', await page.locator('.question-grid article').count() === 4
    && /z nápadu vznikne dobrá aplikace/i.test(questionsText)
    && /Co má být nastavené v projektu/i.test(questionsText)
    && /Alexova systému.*převzít jako první/i.test(questionsText)
    && !/18:\d{2}/.test(questionsText));
  check('Stránka neopakuje samostatnou sekci o formátu', await page.locator('.format').count() === 0);

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
      portrait: (() => {
        const rect = document.querySelector('.guest-portrait').getBoundingClientRect();
        return rect.left >= 0 && rect.right <= window.innerWidth;
      })(),
    }));
    if (state.overflow || !state.heading || !state.actions || !state.portrait) layoutProblems.push(`${width}px=${JSON.stringify(state)}`);
  }
  check('Layout je bezpečný od telefonu po desktop', layoutProblems.length === 0, layoutProblems.join(' | '));

  await browser.close();
  console.log(failures === 0 ? '\nVŠECHNY TESTY VIBE CODING LIVE PROŠLY' : `\n${failures} TESTŮ VIBE CODING LIVE SELHALO`);
  process.exit(failures === 0 ? 0 : 1);
})();
