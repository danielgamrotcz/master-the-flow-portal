// E2E test veřejné podstránky pražského srazu.
const { chromium } = require('playwright');
const { BASE } = require('./_auth.js');

let failures = 0;
function check(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  <-- ' + detail}`);
  if (!cond) failures++;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const consoleErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => consoleErrors.push('PAGEERROR: ' + error.message));

  const response = await page.goto(BASE + '/sraz/', { waitUntil: 'networkidle' });
  check('/sraz/ vrací úspěšnou odpověď', response && response.ok(), String(response && response.status()));
  check('Stránka je veřejná bez přístupové brány', await page.locator('#gate').count() === 0);
  const attendeesResponse = await page.request.get(BASE + '/api/meetup-attendees');
  const attendeesPayload = await attendeesResponse.json();
  check('Veřejné API účastníků vrací seznam a počet registrací bez cache', attendeesResponse.ok() && Array.isArray(attendeesPayload.attendees) && Number.isSafeInteger(attendeesPayload.registeredCount) && attendeesResponse.headers()['cache-control'] === 'no-store');
  const unauthorizedAttendeesWrite = await page.request.post(BASE + '/api/meetup-attendees', {
    data: { attendees: [] },
    headers: { 'Content-Type': 'application/json' }
  });
  check('API účastníků odmítá neautorizovaný zápis', unauthorizedAttendeesWrite.status() === 401, String(unauthorizedAttendeesWrite.status()));
  check('Titulek pojmenovává sraz v Praze', await page.locator('h1').textContent() === 'Sraz Master the Flow v Praze');
  const heroDate = page.locator('time[datetime="2026-08-29"]');
  check('Datum je viditelné a strojově čitelné', await heroDate.isVisible() && await heroDate.getAttribute('aria-label') === '29. srpna 2026');
  check('Oficiální čas je 13:00–18:00', (await page.locator('.hero').innerText()).includes('13:00–18:00'));
  check('Hero nemá zrušený nadpis komunitního setkání', await page.locator('.eyebrow').count() === 0);
  check('Hero neopakuje datum v úvodní větě', !(await page.locator('.hero-lede').innerText()).includes('29. srpna'));
  check('Hero neslibuje nepotvrzená témata', !/produktiv|automatiz|vibe coding/i.test(await page.locator('.hero-lede').innerText()));
  const heroLedeText = (await page.locator('.hero-lede').innerText()).replace(/\u00a0/g, ' ');
  const heroNoteText = (await page.locator('.hero-note').innerText()).replace(/\u00a0/g, ' ');
  check('Hero říká, proč přijít, a nezavírá se lidem mimo komunitu', /Poznejte osobně lidi z Master the Flow/.test(heroLedeText) && /Přijít může kdokoli/.test(heroLedeText));
  check('Hero snižuje tření registrace', /Google formulář.*přibližně 1 minuta.*zdarma/.test(heroNoteText));
  check('Hero potvrzuje registraci bez Google účtu', /bez Google účtu/.test(heroNoteText));
  const heroFactsText = (await page.locator('.hero-facts').innerText()).replace(/\u00a0/g, ' ');
  check('Hero uvádí potvrzené místo srazu', /Lampárna Lidická/.test(heroFactsText) && /Lidická 31.*Praha 5/.test(heroFactsText));
  check('Hero odkazuje na Lampárnu Lidická', await page.locator('.hero-fact-place a').getAttribute('href') === 'https://www.lamparnalidicka.cz/');
  check('Hero ukazuje počet registrací', await page.locator('#registered-count').innerText() !== '—');
  const shouldBeFull = attendeesPayload.registeredCount >= 30;
  check('Registrační tlačítka odpovídají aktuální kapacitě', await page.locator('[data-registration-link]').evaluateAll((links, full) => links.every(link => full
    ? link.getAttribute('aria-disabled') === 'true' && !link.hasAttribute('href')
    : link.getAttribute('aria-disabled') === 'false' && /^https:\/\/docs\.google\.com\/forms\//.test(link.getAttribute('href') || '')
  ), shouldBeFull));
  check('Značka Master the Flow se v titulku neláme', await page.locator('h1 .no-break').evaluate(el => getComputedStyle(el).whiteSpace === 'nowrap'));

  const buttonContrast = async () => page.locator('.hero .button-primary').evaluate(el => {
    const parse = value => value.match(/\d+(?:\.\d+)?/g).slice(0, 3).map(Number);
    const luminance = rgb => {
      const linear = rgb.map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const style = getComputedStyle(el);
    const first = luminance(parse(style.color));
    const second = luminance(parse(style.backgroundColor));
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  });
  const firstThemeLabel = await page.locator('#theme-toggle').getAttribute('aria-label');
  const firstThemeContrast = await buttonContrast();
  await page.locator('#theme-toggle').click();
  const secondThemeLabel = await page.locator('#theme-toggle').getAttribute('aria-label');
  const secondThemeContrast = await buttonContrast();
  check('Přepínač tématu popisuje cílový režim', firstThemeLabel !== secondThemeLabel && /Přepnout na (tmavý|světlý) režim/.test(firstThemeLabel || '') && /Přepnout na (tmavý|světlý) režim/.test(secondThemeLabel || ''));
  check('Primární CTA má AA kontrast v obou režimech', firstThemeContrast >= 4.5 && secondThemeContrast >= 4.5, `${firstThemeContrast.toFixed(2)} / ${secondThemeContrast.toFixed(2)}`);

  const timeline = await page.locator('.timeline-item').count();
  check('Harmonogram má čtyři navazující části', timeline === 4, `count=${timeline}`);
  const programText = (await page.locator('.program').innerText()).replace(/\u00a0/g, ' ');
  check('Program popisuje dvacetiminutové hostovské bloky', /Hostovská část poběží ve dvacetiminutových blocích/.test(programText) && /Ukázky, rozhovory a Q&A/.test(programText));
  check('Program uvádí potvrzený Tomášův blok', /14:30–14:50/.test(programText) && /Tomáš „Vilík“ Pospíchal/.test(programText) && /Od firemní rutiny k hotovému AI workflow/.test(programText));
  check('Tomášův medailonek odpovídá podpisu', /AI Solution Architect a Ničitel firemní rutiny v BeeAI/.test(programText));
  check('Tomášův medailonek neopakuje samozřejmý prostor na otázky', !/následovaná otázkami/.test(programText));
  check('Tři nepotvrzené bloky zůstávají anonymní', (programText.match(/Program připravujeme/g) || []).length === 3 && !/\b(?:Aneta|Vojta|Alex)\b/.test(programText));
  check('Úvod představuje sraz a úvodní moudra organizátora', /14:00–14:10[\s\S]*Daniel Gamrot[\s\S]*Představení celého srazu a úvodní moudra organizátora/.test(programText));
  check('Danielův blok vypráví vznik Uttera napříč platformami', /15:30–15:55[\s\S]*Jak jsem stavěl Uttero[\s\S]*macOS, iOS a Android/.test(programText));
  check('Oba potvrzené hlavní bloky mají zvýraznění', await page.locator('.program-slot-confirmed').count() === 2 && await page.locator('.program-slot-confirmed').filter({ hasText: 'Tomáš „Vilík“ Pospíchal' }).count() === 1 && await page.locator('.program-slot-confirmed').filter({ hasText: 'Jak jsem stavěl Uttero' }).count() === 1);
  check('Program uvádí instrukce ke skupinové výzvě', /15:55–16:00[\s\S]*Instrukce ke skupinové výzvě/.test(programText));
  check('Skupinová výzva míchá zkušenosti a má výstup', /skupinách po třech/.test(programText) && /různé úrovně zkušenosti/.test(programText) && /krátce ukáže/.test(programText));
  const deviceCopy = await page.locator('.timeline-item, .practical, .faq').allTextContents().then(x => x.join(' '));
  check('Skupinová aktivita zmiňuje zařízení', /notebook|mobil/i.test(deviceCopy));
  check('Zařízení je výslovně dobrovolné', /není povinn|není podmínkou|povinné nejsou|i bez něj/i.test(deviceCopy));
  check('Organizační text mluví v první osobě', /Potřebuju|abych vybral/.test(await page.locator('.registration-panel').innerText()));
  check('Registrace uvádí kapacitu 30 lidí', /Kapacita prvního srazu je 30 lidí/.test((await page.locator('.registration-panel').innerText()).replace(/\u00a0/g, ' ')));
  const registrationText = (await page.locator('.registration-panel').innerText()).replace(/\u00a0/g, ' ');
  check('Registrace vysvětluje dostupnost, ochranu e-mailu a změnu souhlasu', /Google účet nepotřebujete/.test(registrationText) && /e-mail se na web neposílá/.test(registrationText) && /odvolání souhlasu/.test(registrationText));
  check('Úvod nepopisuje sraz jako offline akci', !/offline/i.test(await page.locator('.manifesto-band').innerText()));
  check('Text se nevymezuje přes formálnost nebo konferenci', !/formáln|konferenci/i.test(await page.locator('main').innerText()));

  const calendarHref = await page.locator('a[download]').getAttribute('href');
  check('Kalendář má vlastní ICS soubor', calendarHref === '/sraz/sraz-master-the-flow-praha-2026.ics', String(calendarHref));
  const googleCalendarHref = await page.locator('#google-calendar-link').getAttribute('href');
  const googleCalendarUrl = new URL(googleCalendarHref);
  check('Google Kalendář má přímý odkaz', googleCalendarUrl.hostname === 'calendar.google.com' && googleCalendarUrl.searchParams.get('action') === 'TEMPLATE');
  check('Google Kalendář používá správný čas', googleCalendarUrl.searchParams.get('dates') === '20260829T130000/20260829T180000');
  check('Google Kalendář obsahuje potvrzené místo', googleCalendarUrl.searchParams.get('location') === 'Lampárna Lidická, Lidická 31, 150 00 Praha 5');
  const calendarResponse = await page.request.get(BASE + calendarHref);
  check('ICS soubor je dostupný', calendarResponse.ok());
  check('ICS používá správný termín', (await calendarResponse.text()).includes('DTSTART;TZID=Europe/Prague:20260829T130000'));
  check('ICS končí v 18:00', (await calendarResponse.text()).includes('DTEND;TZID=Europe/Prague:20260829T180000'));
  check('ICS obsahuje potvrzené místo', (await calendarResponse.text()).includes('LOCATION:Lampárna Lidická\\, Lidická 31\\, 150 00 Praha 5'));

  const sticky = page.locator('#sticky-register');
  check('Mobilní registrace má dostatečně velkou dotykovou plochu', await sticky.evaluate(el => el.getBoundingClientRect().height >= 44));
  check('Mobilní registrace nepřekrývá hlavní CTA', !(await sticky.evaluate(el => el.classList.contains('is-visible'))));
  await page.locator('#program-title').scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  check('Mobilní registrace se objeví až pod hero', await sticky.evaluate(el => el.classList.contains('is-visible')));
  await page.locator('#registrace').scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  check('Mobilní registrace se skryje u registrační sekce', !(await sticky.evaluate(el => el.classList.contains('is-visible'))));
  check('Mobilní stránka nemá vodorovný přesah', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('Sekce Proč přijít je na mobilu čitelně poskládaná', await page.locator('.manifesto').evaluate(el => {
    const [intro, copy] = el.children;
    return copy.getBoundingClientRect().top > intro.getBoundingClientRect().top;
  }));
  check('Seznam účastníků vysvětluje souhlas i ochranu e-mailu', /pouze lidi, kteří se zveřejněním souhlasili/.test((await page.locator('.attendees').innerText()).replace(/\u00a0/g, ' ')) && /E-mail ani další odpovědi/.test(await page.locator('.attendees').innerText()));
  check('Seznam účastníků je na mobilu v jednom sloupci', await page.locator('.attendees-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length === 1));
  const initialAttendeeCards = await page.locator('#attendees-list .attendee-card').count();
  check('Seznam účastníků má srozumitelný stav i s živými daty', initialAttendeeCards > 0 || /První účastníci se tu objeví/.test(await page.locator('#attendees-list').innerText()));
  check('Filtry odpovídají dostupným účastníkům', initialAttendeeCards > 0 ? await page.locator('#attendee-filters').isVisible() : await page.locator('#attendee-filters').isHidden());

  check('Stránka nevkládá Google Form do iframe', await page.locator('iframe').count() === 0);
  const registrationHref = await page.locator('#registration-link').getAttribute('href');
  check('Registrace je tlačítko s odkazem na Google Forms', /^https:\/\/docs\.google\.com\/forms\//.test(registrationHref || ''), String(registrationHref));
  check('Registrační blok má titulek Registrovat se', await page.locator('#registration-title').textContent() === 'Registrovat se');
  check('Akce je výslovně otevřená i mimo komunitu', /Přijít může kdokoli/.test(await page.locator('.practical').innerText()));
  const whatsappHref = await page.locator('#whatsapp-group-link').getAttribute('href');
  const whatsappUrl = new URL(whatsappHref);
  check('WhatsApp pozvánka vede do zadané skupiny', whatsappUrl.hostname === 'chat.whatsapp.com' && whatsappUrl.pathname === '/CYjDrgCPeq18wldgqScjFh' && whatsappUrl.searchParams.get('mode') === 'gi_t', String(whatsappHref));
  check('Vstup do skupiny není zaměněný za registraci', /nenahrazuje registraci na sraz/.test((await page.locator('.community-note').innerText()).replace(/\u00a0/g, ' ')));
  check('Členství ve WhatsApp skupině není podmínkou účasti', /členství ve WhatsApp skupině není podmínkou/.test((await page.locator('.faq').textContent()).replace(/\u00a0/g, ' ')));
  check('WhatsApp tlačítko má dostatečně velkou dotykovou plochu', await page.locator('#whatsapp-group-link').evaluate(el => el.getBoundingClientRect().height >= 44));
  check('WhatsApp sekce se na mobilu skládá pod sebe', await page.locator('.community-panel').evaluate(el => {
    const copy = el.querySelector('.community-copy').getBoundingClientRect();
    const qr = el.querySelector('.community-qr-link').getBoundingClientRect();
    return qr.top >= copy.bottom && qr.left >= 0 && qr.right <= window.innerWidth;
  }));
  const qrImage = page.locator('.community-qr');
  const qrResponse = await page.request.get(BASE + await qrImage.getAttribute('src'));
  check('QR kód má alternativní text a dostupný PNG soubor', /QR kód/.test(await qrImage.getAttribute('alt') || '') && qrResponse.ok() && /^image\/png/.test(qrResponse.headers()['content-type'] || ''));
  check('Informační sekce netvrdí, že jde o časté otázky', !(await page.locator('.faq').innerText()).includes('Časté otázky'));

  const mainText = await page.locator('main').evaluate(main => {
    const copy = main.cloneNode(true);
    copy.querySelector('.attendees')?.remove();
    return copy.innerText;
  });
  check('Jednopísmenné české předložky a spojky mají pevné mezery', !/(?:^|\s)[avikosuz] [A-Za-zÁ-ž]/im.test(mainText));
  check('Datum a hodina používají pevné mezery', await page.locator('.hero-date').textContent() === '29.\u00a0srpna 2026' && (await page.getByText('Co bude po 18. hodině?').textContent()).includes('po\u00a018.\u00a0hodině'));

  check('Stránka nemá vlastní JS chyby', consoleErrors.length === 0, consoleErrors.join(' | '));

  const phoneWidths = [320, 360, 375, 390, 393, 412, 430];
  const phoneProblems = [];
  for (const width of phoneWidths) {
    const phone = await browser.newPage({ viewport: { width, height: 844 } });
    await phone.goto(BASE + '/sraz/', { waitUntil: 'networkidle' });
    const state = await phone.evaluate(() => {
      const hero = document.querySelector('.hero');
      const brand = document.querySelector('.hero-title-brand').getBoundingClientRect();
      const place = document.querySelector('.hero-title-place').getBoundingClientRect();
      const cta = document.querySelector('.hero .button-primary').getBoundingClientRect();
      const facts = [...document.querySelectorAll('.hero-fact')].map(element => element.getBoundingClientRect());
      const stickyElement = document.getElementById('sticky-register');
      return {
        overflow: hero.scrollWidth > hero.clientWidth,
        brandFits: brand.left >= 0 && brand.right <= window.innerWidth,
        placeFits: place.left >= 0 && place.right <= window.innerWidth && parseFloat(getComputedStyle(document.querySelector('.hero-title-place')).fontSize) <= 14,
        placeAligned: Math.abs(place.right - brand.right) <= 1,
        factsFit: facts.every(rect => rect.left >= 0 && rect.right <= window.innerWidth),
        ctaFits: cta.left >= 0 && cta.right <= window.innerWidth && cta.height >= 44,
        stickyHidden: !stickyElement.classList.contains('is-visible')
      };
    });
    if (state.overflow || !state.brandFits || !state.placeFits || !state.placeAligned || !state.factsFit || !state.ctaFits || !state.stickyHidden) phoneProblems.push(`${width}px=${JSON.stringify(state)}`);
    await phone.close();
  }
  check('Hero je bezpečný na běžných šířkách telefonů 320–430 px', phoneProblems.length === 0, phoneProblems.join(' | '));

  const widerWidths = [600, 720, 744, 768, 810, 820, 834, 900, 1024, 1180, 1280, 1366, 1440, 1728, 1920];
  const widerProblems = [];
  for (const width of widerWidths) {
    const widerPage = await browser.newPage({ viewport: { width, height: 1000 } });
    await widerPage.goto(BASE + '/sraz/', { waitUntil: 'networkidle' });
    const state = await widerPage.evaluate(breakpoint => {
      const hero = document.querySelector('.hero');
      const brand = document.querySelector('.hero-title-brand').getBoundingClientRect();
      const place = document.querySelector('.hero-title-place').getBoundingClientRect();
      const facts = document.querySelector('.hero-facts');
      const factRects = [...document.querySelectorAll('.hero-fact')].map(element => element.getBoundingClientRect());
      const columns = getComputedStyle(facts).gridTemplateColumns.trim().split(/\s+/).length;
      return {
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        brandFits: brand.left >= 0 && brand.right <= window.innerWidth,
        placeAligned: Math.abs(place.right - brand.right) <= 1,
        factsFit: factRects.every(rect => rect.left >= 0 && rect.right <= window.innerWidth),
        correctGrid: breakpoint <= 720 ? columns === 2 : columns === 4
      };
    }, width);
    if (state.overflow || !state.brandFits || !state.placeAligned || !state.factsFit || !state.correctGrid) widerProblems.push(`${width}px=${JSON.stringify(state)}`);
    await widerPage.close();
  }
  check('Hero bezpečně přechází mezi telefonem, tabletem a desktopem', widerProblems.length === 0, widerProblems.join(' | '));

  const shallowViewports = [
    { width: 744, height: 650 },
    { width: 1024, height: 600 },
    { width: 1280, height: 600 },
    { width: 1280, height: 720 },
    { width: 1366, height: 768 },
    { width: 1440, height: 800 },
    { width: 1728, height: 900 }
  ];
  const shallowProblems = [];
  for (const viewport of shallowViewports) {
    const shallowPage = await browser.newPage({ viewport });
    await shallowPage.goto(BASE + '/sraz/', { waitUntil: 'networkidle' });
    const state = await shallowPage.evaluate(() => {
      const hero = document.querySelector('.hero').getBoundingClientRect();
      const calendar = document.querySelector('.hero-calendar-links').getBoundingClientRect();
      const cta = document.querySelector('.hero .button-primary').getBoundingClientRect();
      return {
        heroBottom: hero.bottom,
        viewportHeight: window.innerHeight,
        calendarVisible: calendar.bottom <= window.innerHeight + 1,
        ctaVisible: cta.bottom <= window.innerHeight + 1 && cta.height >= 44,
        fits: hero.bottom <= window.innerHeight + 1
      };
    });
    if (!state.fits || !state.calendarVisible || !state.ctaVisible) shallowProblems.push(`${viewport.width}x${viewport.height}=${JSON.stringify(state)}`);
    await shallowPage.close();
  }
  check('Hero je celé viditelné i v nízkých desktopových oknech', shallowProblems.length === 0, shallowProblems.join(' | '));

  const attendeePreview = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  const longBio = 'Delší testovací představení účastníka. '.repeat(30);
  await attendeePreview.route('**/api/meetup-attendees', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Cache-Control': 'no-store' },
    body: JSON.stringify({ registeredCount: 11, attendees: [
      { name: 'Účastník H', bio: 'Věnuje se testování a rád si popovídá o kvalitě.', attendance: 'official' },
      { name: 'Účastník A', bio: longBio, attendance: 'official_and_picnic' },
      { name: 'Účastník B', bio: 'Testovací profil B.', attendance: 'uncertain' },
      { name: 'Účastník D', bio: 'Testovací profil D.', attendance: 'official' },
      { name: 'Účastník E', bio: 'Testovací profil E.', attendance: 'official' },
      { name: 'Účastník F', bio: 'Testovací profil F.', attendance: 'official' },
      { name: 'Účastník G', bio: 'Dorazí jen na společný piknik.', attendance: 'picnic_only' },
      { name: 'Z <img src=x onerror=alert(1)>', bio: 'Bezpečnostní test vykreslení jako text.', attendance: 'official_and_picnic' }
    ] })
  }));
  await attendeePreview.goto(BASE + '/sraz/', { waitUntil: 'networkidle' });
  check('Hero počítá všechny registrace, nejen zveřejněné profily', await attendeePreview.locator('#registered-count').innerText() === '11' && /účastníků/.test(await attendeePreview.locator('#registered-count-note').innerText()));
  const renderedNames = await attendeePreview.locator('.attendee-card h3').allTextContents();
  check('Seznam vykreslí zveřejněné profily a rozsah účasti', await attendeePreview.locator('.attendee-card').count() === 8 && /Oficiální část 13:00–18:00/.test(await attendeePreview.locator('.attendee-card').filter({ hasText: 'Účastník H' }).innerText()) && /Oficiální část \+ piknik/.test(await attendeePreview.locator('.attendee-card').filter({ hasText: 'Účastník A' }).innerText()) && /Jen piknik po 18:00/.test(await attendeePreview.locator('.attendee-card').filter({ hasText: 'Účastník G' }).innerText()));
  check('Účastníci jsou seřazení abecedně', renderedNames.join('|') === [...renderedNames].sort((a, b) => a.localeCompare(b, 'cs', { sensitivity: 'base' })).join('|'), renderedNames.join(' | '));

  const fullCapacityPreview = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await fullCapacityPreview.route('**/api/meetup-attendees', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Cache-Control': 'no-store' },
    body: JSON.stringify({ registeredCount: 30, attendees: [] })
  }));
  await fullCapacityPreview.goto(BASE + '/sraz/', { waitUntil: 'networkidle' });
  check('Při naplněné kapacitě jsou všechna registrační tlačítka zneaktivněná', await fullCapacityPreview.locator('[data-registration-link]').evaluateAll(links => links.length === 4 && links.every(link => link.getAttribute('aria-disabled') === 'true' && !link.hasAttribute('href') && link.classList.contains('is-registration-unavailable'))));
  check('Naplněná kapacita je na tlačítkách srozumitelně popsána', await fullCapacityPreview.locator('[data-registration-link]').allTextContents().then(labels => labels.every(label => label.includes('Kapacita naplněna'))));
  await fullCapacityPreview.close();
  check('Údaje účastníků se vkládají jako text, ne jako HTML', await attendeePreview.locator('.attendee-card img').count() === 0 && renderedNames.includes('Z <img src=x onerror=alert(1)>'));
  check('Desktopový seznam účastníků používá dva sloupce', await attendeePreview.locator('.attendees-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length === 2));
  check('Desktop nejdřív ukáže šest profilů', await attendeePreview.locator('.attendee-card:visible').count() === 6);
  const attendeesToggle = attendeePreview.locator('#attendees-toggle');
  const filters = attendeePreview.locator('#attendee-filters');
  const allFilter = filters.locator('[data-attendee-filter="all"]');
  const officialFilter = filters.locator('[data-attendee-filter="official"]');
  const picnicFilter = filters.locator('[data-attendee-filter="picnic"]');
  const picnicOnlyFilter = filters.locator('[data-attendee-filter="picnic_only"]');
  const uncertainFilter = filters.locator('[data-attendee-filter="uncertain"]');
  check('Filtry ukazují počty včetně překryvu oficiální části a pikniku', await filters.isVisible() && /8/.test(await allFilter.innerText()) && /6/.test(await officialFilter.innerText()) && /3/.test(await picnicFilter.innerText()) && /1/.test(await picnicOnlyFilter.innerText()) && /1/.test(await uncertainFilter.innerText()) && await filters.locator('[data-attendee-filter="partial"]').count() === 0);
  await picnicFilter.click();
  check('Filtr pikniku ukáže všechny lidi, kteří dorazí po 18:00', await attendeePreview.locator('.attendee-card:visible').count() === 3 && await attendeesToggle.isHidden() && (await attendeePreview.locator('.attendee-card:visible').allTextContents()).every(text => /piknik/.test(text)) && await picnicFilter.getAttribute('aria-pressed') === 'true');
  await picnicOnlyFilter.click();
  check('Filtr Jen piknik ukáže pouze lidi bez oficiální části', await attendeePreview.locator('.attendee-card:visible').count() === 1 && /Jen piknik po 18:00/.test(await attendeePreview.locator('.attendee-card:visible').innerText()) && await picnicOnlyFilter.getAttribute('aria-pressed') === 'true');
  await officialFilter.click();
  check('Filtr oficiální části zahrnuje i lidi pokračující na piknik', await attendeePreview.locator('.attendee-card:visible').count() === 6 && await attendeesToggle.isHidden());
  await uncertainFilter.click();
  check('Filtr nejisté účasti ukáže odpovídající profil', await attendeePreview.locator('.attendee-card:visible').count() === 1 && /Účast ještě upřesní/.test(await attendeePreview.locator('.attendee-card:visible').innerText()));
  await allFilter.click();
  check('Filtr Všichni obnoví výchozí limit', await attendeePreview.locator('.attendee-card:visible').count() === 6 && await allFilter.getAttribute('aria-pressed') === 'true');
  check('Tlačítko uvádí celkový počet účastníků', await attendeesToggle.isVisible() && /\(8\)/.test(await attendeesToggle.innerText()));
  await attendeesToggle.click();
  check('Rozbalení zpřístupní všechny profily', await attendeePreview.locator('.attendee-card:visible').count() === 8 && await attendeesToggle.getAttribute('aria-expanded') === 'true');
  const longBioCard = attendeePreview.locator('.attendee-card').filter({ hasText: 'Účastník A' });
  const bioToggle = longBioCard.locator('.attendee-bio-toggle');
  check('Dlouhé představení má vlastní rozbalení', await bioToggle.isVisible() && await bioToggle.getAttribute('aria-expanded') === 'false');
  await bioToggle.click();
  check('Celé představení lze zpřístupnit a znovu zkrátit', await bioToggle.getAttribute('aria-expanded') === 'true' && /Zkrátit představení/.test(await bioToggle.innerText()));
  await attendeesToggle.click();
  check('Seznam lze znovu zkrátit', await attendeePreview.locator('.attendee-card:visible').count() === 6 && await attendeesToggle.getAttribute('aria-expanded') === 'false');
  await attendeePreview.setViewportSize({ width: 390, height: 844 });
  await attendeePreview.waitForTimeout(100);
  check('Mobil nejdřív ukáže čtyři profily', await attendeePreview.locator('.attendee-card:visible').count() === 4);
  check('Mobilní filtry nevytvářejí přesah celé stránky', await attendeePreview.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await attendeesToggle.click();
  check('Na mobilu lze zobrazit všechny profily', await attendeePreview.locator('.attendee-card:visible').count() === 8);
  await attendeePreview.close();

  await browser.close();
  console.log(failures === 0 ? '\nVŠECHNY TESTY SRAZU PROŠLY' : `\n${failures} TESTŮ SRAZU SELHALO`);
  process.exit(failures === 0 ? 0 : 1);
})();
