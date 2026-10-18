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

  const episodePath = '/rozhovory/1-vibe-coding-s-alexem/';
  for (const legacyPath of ['/live/vibe-coding', '/live/vibe-coding/', '/live/vibe-coding/index.html']) {
    const redirect = await page.request.get(`${BASE}${legacyPath}?src=pozvanka`, { maxRedirects: 0 });
    const target = new URL(redirect.headers().location || '/', BASE);
    check(`Původní cesta ${legacyPath} trvale přesměruje na první rozhovor`, redirect.status() === 301
      && target.origin === new URL(BASE).origin && target.pathname === episodePath && target.search === '?src=pozvanka');
  }
  await page.goto(`${BASE}/live/vibe-coding/?src=pozvanka#registrace`, { waitUntil: 'networkidle' });
  check('Přesměrování v prohlížeči zachová odkaz na registraci', page.url() === `${BASE}${episodePath}?src=pozvanka#registrace`);
  const response = await page.goto(`${BASE}${episodePath}`, { waitUntil: 'networkidle' });
  check('Stránka vrací úspěšnou odpověď', response && response.ok(), String(response && response.status()));
  check('Stránka je veřejná bez přístupové brány', await page.locator('#gate').count() === 0);
  check('Titulek pojmenovává díl s Alexem', (await page.locator('h1').innerText()).replace(/\s+/g, ' ') === 'Vibecoding s Alexem.');
  check('Sdílení používá kanonickou adresu nového dílu', await page.locator('link[rel="canonical"]').getAttribute('href') === `https://mastertheflow.cz${episodePath}`
    && await page.locator('meta[property="og:url"]').getAttribute('content') === `https://mastertheflow.cz${episodePath}`);

  const eventData = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'data', 'events.json'), 'utf8'));
  const portalEvent = eventData.events.find(event => event.id === 'evt-2026-10-21-vibe-coding-nezacina-promptem');
  check('Portálová karta má správný termín a interní registrační cestu', portalEvent?.date === '2026-10-21'
    && portalEvent?.time_from === '18:00'
    && portalEvent?.time_to === '20:00'
    && portalEvent?.registration_page_url === episodePath
    && portalEvent?.detail_url === episodePath
    && portalEvent?.portal_hidden === false
    && portalEvent?.is_paid === false);
  check('Portál nevydává otevřené otázky za pevný program', portalEvent?.program === null);

  const mainText = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  const pageMarkup = await page.content();
  const publicCopy = `${pageMarkup} ${JSON.stringify(portalEvent)}`;
  const naming = {
    type: portalEvent?.type === 'ROZHOVOR',
    title: portalEvent?.title === 'Vibecoding s Alexem | Rozhovory Master the Flow #1',
    pageTitle: await page.title() === portalEvent?.title,
    eyebrow: await page.locator('.eyebrow').textContent() === 'Rozhovory Master the Flow · 1. díl',
    guest: await page.locator('#guest-title').textContent() === 'Alex Trejtnar',
    legacyLabelAbsent: !/Master the Flow Live|Live #1|Host prvního/i.test(`${await page.title()} ${publicCopy}`),
  };
  check('Akce používá název série rozhovorů a číslo prvního dílu', Object.values(naming).every(Boolean), JSON.stringify(naming));
  const facts = {
    date: /21\. října 2026/.test(mainText),
    day: /středa/i.test(mainText),
    time: /18:00–20:00/.test(mainText),
    interview: /18:00–19:30 rozhovor/.test(mainText),
    audienceQuestions: /19:30–20:00 otázky a odpovědi diváků/.test(mainText),
    oldDurationAbsent: !/90 minut/i.test(mainText),
    place: /Živé online vysílání/.test(mainText),
    accessAfterRegistration: /odkaz po registraci/i.test(mainText),
    oldPlaceAbsent: !/Google Meet/i.test(mainText),
    price: /Zdarma/i.test(mainText),
    recording: /Záznam (?:pošleme všem registrovaným|dostanou všichni registrovaní)/i.test(mainText),
  };
  check('Závazné údaje jsou konzistentní', Object.values(facts).every(Boolean), JSON.stringify(facts));
  check('Živá účast nabízí vlastní otázky bez povinné přípravy', /Přijďte s vlastní otázkou/.test(mainText)
    && /Na otázky bude prostor i během vysílání/.test(mainText)
    && /Bez instalace a připraveného projektu/.test(mainText));
  const recordingPlacement = await page.locator('.registration-actions').evaluate(element => {
    const button = element.querySelector('[data-registration-link]');
    const note = element.querySelector('.registration-note');
    return Boolean(button && note && /Záznam dostanou všichni registrovaní/.test(note.textContent)
      && note.getBoundingClientRect().top >= button.getBoundingClientRect().bottom);
  });
  check('Záznam je zachovaný jako doplňková informace pod registračním tlačítkem', recordingPlacement);
  const startingPoint = {
    lovable: /Lovable/.test(mainText),
    codingAgent: /coding agenta/i.test(mainText),
    desiredOutput: /výsledek není ono/i.test(mainText),
  };
  check('Stránka vychází ze zkušenosti s coding nástroji', Object.values(startingPoint).every(Boolean), JSON.stringify(startingPoint));
  check('Nosná otázka odpovídá Alexovu tématu přemýšlení', /Vibecoding vás učí každý\. Přemýšlet málokdo\./.test(mainText)
    && /Jak uvidět problém dřív, než začnete zadávat/.test(mainText)
    && /Jak výsledek ověřit a používat v praxi/.test(mainText));
  check('Alexův setup není vydáván za povinnost', /Co si vzít z Alexova systému práce s agentem/.test(mainText));
  check('Alexova odbornost není postavená na shazování Daniela', /20 let digitalizuje firmy/i.test(mainText)
    && /Učí jejich týmy, jak o AI přemýšlet/i.test(mainText)
    && !/Mám to stejně|Nejsem vývojář|dál než (?:já|ten můj)|Co dělá jinak než já|co mi při stavění aplikací nefunguje|méně pokročil|o (?:několik|pár) úrovní přede mnou|teprve začínám|Daniel[^.]{0,80}(?:bastlí|nezvládá|trvá déle)/i.test(publicCopy));
  check('Ukázky jsou podmíněné užitečností pro odpověď', /Alex podle potřeby nasdílí obrazovku/i.test(mainText));
  check('Stránka neslibuje pevný program ani polovinu vysílání', /O čem se budeme bavit/i.test(mainText)
    && !/polovinu vysílání|připravené checkpointy|šest okruhů/i.test(mainText));
  check('Stránka neslibuje konkrétní aplikaci dema', !/postavíme (?:aplikaci|appku)|vyrobíme (?:aplikaci|appku)/i.test(mainText));

  const registrationLinks = page.locator('[data-registration-link]');
  const registrationHrefs = await registrationLinks.evaluateAll(links => links.map(link => link.href));
  check('Všechna tři registrační CTA vedou na tentýž publikovaný formulář', await registrationLinks.count() === 3
    && new Set(registrationHrefs).size === 1
    && registrationHrefs[0].startsWith('https://docs.google.com/forms/d/e/')
    && !registrationHrefs[0].includes('FORM_ID_PENDING'));

  const publicHrefs = await page.locator('a').evaluateAll(links => links.map(link => link.href));
  check('Veřejná stránka neodhaluje Meet, stream, kalendář ani záznam', !publicHrefs.some(href => /meet\.google\.com|(?:youtube\.com|youtu\.be)(?:\/|$)|calendar\.google\.com|drive\.google\.com|\.ics(?:$|\?)/.test(href))
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
  // Trvalý obsahový kontrakt: medailonek dodaný Alexem ve WhatsAppu 12. 10. 2026.
  const guestBio = '20 let digitalizuje firmy: vývoj, marketing, procesy, obchod, automatizace. Dnes hlavně s AI. S klienty spolupracuje dlouhodobě. Vytváří s nimi nástroje, systémy a aplikace, které šetří čas, náklady a pomáhají pracovat s AI bezpečně. Učí jejich týmy, jak o AI přemýšlet a jak s ní pracovat.';
  check('Alexův medailonek odpovídá jeho dodanému textu', await page.locator('.guest-copy > p').innerText() === guestBio
    && await page.locator('.guest-links a').count() === 3);

  const questionsText = await page.locator('.question-list').innerText();
  check('Stránka uvádí témata místo harmonogramu', /uvidět problém/i.test(questionsText)
    && /Alexova systému práce s agentem/i.test(questionsText)
    && /ověřit a používat/i.test(questionsText)
    && !/18:\d{2}/.test(questionsText));
  check('Stránka neopakuje samostatnou sekci o formátu', await page.locator('.format').count() === 0);
  check('Minimalistický rozsah nepřidává propagaci kurzu', await page.locator('main > section').count() === 4
    && await page.locator('.question-list li').count() === 3
    && !/leden 2027|do 15 lidí|Novum Organon/.test(mainText));

  const themeBefore = await page.locator('html').getAttribute('data-theme');
  await page.locator('#theme-toggle').click();
  const themeAfter = await page.locator('html').getAttribute('data-theme');
  check('Přepínač barevného režimu funguje', themeBefore !== themeAfter);

  check('Mobil v úvodu neduplikuje registrační tlačítko', await page.locator('.sticky-register').isHidden());
  await page.locator('.question-band').evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.waitForTimeout(100);
  check('Mobilní sticky registrace se ukáže až po odscrollování hero CTA', await page.locator('.sticky-register').isVisible());
  await page.locator('.registration-actions').scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  check('Mobilní sticky registrace neduplikuje závěrečné tlačítko', await page.locator('.sticky-register').isHidden()
    && await page.locator('.registration-actions [data-registration-link]').isVisible());
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
