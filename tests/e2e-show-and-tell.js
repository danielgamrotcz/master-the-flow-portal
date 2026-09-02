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
    place: /Google Meet/.test(mainText),
    price: /Zdarma/i.test(mainText),
    audience: /pouze pro (?:členy )?Master the Flow/i.test(mainText),
  };
  check('Závazné údaje jsou konzistentní', Object.values(facts).every(Boolean), JSON.stringify(facts));
  check('Vystoupení je výslovně nepovinné', /Můžete se jen připojit a sledovat/.test(mainText)
    && /Vystoupení není podmínkou registrace/.test(mainText));
  check('Stránka uvádí 5–6 desetiminutových ukázek', /5–6/.test(mainText) && /deset minut/i.test(mainText));
  check('Stránka upozorňuje na nahrávání', /Setkání se nahrává/.test(mainText) && /záznam je určený pro komunitu/.test(mainText));

  const registrationLinks = page.locator('[data-registration-link]');
  check('Všechna tři registrační CTA vedou na tentýž publikovaný formulář', await registrationLinks.count() === 3
    && new Set(await registrationLinks.evaluateAll(links => links.map(link => link.href))).size === 1
    && (await registrationLinks.first().getAttribute('href') || '').startsWith('https://docs.google.com/forms/d/e/'));

  const calendarHref = await page.locator('[data-calendar="google"]').getAttribute('href');
  const calendarUrl = new URL(calendarHref);
  check('Kalendářní CTA má správný interval v UTC', calendarUrl.hostname === 'calendar.google.com'
    && calendarUrl.searchParams.get('action') === 'TEMPLATE'
    && calendarUrl.searchParams.get('dates') === '20260922T160000Z/20260922T173000Z');

  const outlookUrl = new URL(await page.locator('[data-calendar="outlook"]').getAttribute('href'));
  check('Outlook CTA má správný interval v UTC', outlookUrl.hostname === 'outlook.office.com'
    && outlookUrl.pathname === '/calendar/deeplink/compose'
    && outlookUrl.searchParams.get('rru') === 'addevent'
    && outlookUrl.searchParams.get('startdt') === '2026-09-22T16:00:00Z'
    && outlookUrl.searchParams.get('enddt') === '2026-09-22T17:30:00Z');

  const icsLink = page.locator('[data-calendar="ics"]');
  const icsHref = await icsLink.getAttribute('href');
  const icsResponse = await page.request.get(`${BASE}${icsHref}`);
  const icsBody = await icsResponse.text();
  const icsLines = icsBody.split('\r\n');
  const usesOnlyCrLf = icsLines.length > 1 && !icsBody.replace(/\r\n/g, '').includes('\n');
  const foldedToRfcLimit = icsLines.every(line => Buffer.byteLength(line, 'utf8') <= 75);
  check('Apple / ICS CTA stahuje validní kalendářní soubor', await icsLink.getAttribute('download') !== null
    && icsResponse.ok()
    && /^text\/calendar/.test(icsResponse.headers()['content-type'] || '')
    && /BEGIN:VCALENDAR/.test(icsBody)
    && /DTSTART:20260922T160000Z/.test(icsBody)
    && /DTEND:20260922T173000Z/.test(icsBody)
    && /https:\/\/meet\.google\.com\//.test(icsBody));
  check('ICS používá CRLF a řádky splňují limit 75 oktetů', usesOnlyCrLf && foldedToRfcLimit,
    `CRLF=${usesOnlyCrLf}, max=${Math.max(...icsLines.map(line => Buffer.byteLength(line, 'utf8')))}`);

  const meetUrl = new URL(await page.locator('.meet-link').getAttribute('href'));
  check('Meet CTA vede na Google Meet', meetUrl.hostname === 'meet.google.com' && /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(meetUrl.pathname));
  const programText = await page.locator('.timeline').innerText();
  check('Program má pět navazujících bloků bez pauzy', await page.locator('.timeline li').count() === 5
    && /18:00/.test(await page.locator('.timeline li').first().innerText())
    && /19:25/.test(await page.locator('.timeline li').last().innerText())
    && /19:30/.test(await page.locator('.timeline li').last().innerText())
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
