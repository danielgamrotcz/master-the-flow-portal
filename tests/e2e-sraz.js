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
  const workflowResponse = await page.request.get(BASE + '/.github/workflows/sraz-e2e.yml');
  check('Interní GitHub workflow není veřejně dostupný', workflowResponse.status() === 404, String(workflowResponse.status()));
  const attendeesResponse = await page.request.get(BASE + '/api/meetup-attendees');
  const attendeesPayload = await attendeesResponse.json();
  check('Veřejné API účastníků vrací seznam a oddělené počty bez cache', attendeesResponse.ok() && Array.isArray(attendeesPayload.attendees) && Number.isSafeInteger(attendeesPayload.officialRegisteredCount) && Number.isSafeInteger(attendeesPayload.picnicRegisteredCount) && attendeesResponse.headers()['cache-control'] === 'no-store');
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
  check('Hero odděluje plný program od otevřeného pikniku', /Hlavní program se naplnil/.test(heroLedeText) && /bez účasti na programu/.test(heroLedeText) && /bez členství/.test(heroLedeText));
  check('Hero snižuje tření registrace', /Google formulář.*1–2 minuty.*zdarma/.test(heroNoteText));
  check('Hero potvrzuje registraci bez Google účtu', /bez Google účtu/.test(heroNoteText));
  const heroFactsText = (await page.locator('.hero-facts').innerText()).replace(/\u00a0/g, ' ');
  check('Hero uvádí potvrzené místo srazu', /Lampárna Lidická/.test(heroFactsText) && /Lidická 31.*Praha 5/.test(heroFactsText));
  check('Hero odkazuje na Lampárnu Lidická', await page.locator('.hero-fact-place a').getAttribute('href') === 'https://www.lamparnalidicka.cz/');
  check('Hero ukazuje kapacitu hlavního programu', /\/30$/.test(await page.locator('#official-registered-count').innerText()));
  check('Hero ukazuje živý počet přihlášených na piknik', await page.locator('.hero-picnic-proof').isVisible() && await page.locator('#hero-picnic-registered-count').innerText() === String(attendeesPayload.picnicRegisteredCount) && /Na piknik už se přihlásil/.test(await page.locator('.hero-picnic-proof').innerText()));
  check('Pikniková registrace zůstává dostupná i při plném hlavním programu', await page.locator('[data-registration-link]').evaluateAll(links => links.length === 4 && links.every(link => /^https:\/\/docs\.google\.com\/forms\//.test(link.getAttribute('href') || '') && link.getAttribute('aria-disabled') !== 'true')));
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
  await page.waitForTimeout(200);
  const secondThemeLabel = await page.locator('#theme-toggle').getAttribute('aria-label');
  const secondThemeContrast = await buttonContrast();
  check('Přepínač tématu popisuje cílový režim', firstThemeLabel !== secondThemeLabel && /Přepnout na (tmavý|světlý) režim/.test(firstThemeLabel || '') && /Přepnout na (tmavý|světlý) režim/.test(secondThemeLabel || ''));
  check('Primární CTA má AA kontrast v obou režimech', firstThemeContrast >= 4.5 && secondThemeContrast >= 4.5, `${firstThemeContrast.toFixed(2)} / ${secondThemeContrast.toFixed(2)}`);

  const timeline = await page.locator('.timeline-item').count();
  check('Harmonogram má pět navazujících částí včetně pauzy', timeline === 5, `count=${timeline}`);
  const programText = (await page.locator('.program').innerText()).replace(/\u00a0/g, ' ');
  check('Program popisuje dvacetiminutové hostovské bloky', /Hostovská část poběží ve dvacetiminutových blocích/.test(programText) && /Ukázky, rozhovory a Q&A/.test(programText));
  check('Úvod programu shrnuje všechny potvrzené vstupy', /Potvrzené jsou bloky Alexe Trejtnara, Tomáše „Vilíka“ Pospíchala i moje vstupy/.test(programText) && /U dvou zbývajících hostů doplním jména a témata/.test(programText) && !/Tomášův blok je potvrzený/.test(programText));
  check('Program uvádí potvrzený Alexův blok', /14:10–14:30[\s\S]*Alex Trejtnar[\s\S]*AI radar od novinek k tomu, co má smysl zavést/.test(programText));
  check('Alexův medailonek uvádí pozici a popisuje výběr využitelných novinek', /Bořič stereotypů/.test(programText) && /automaticky sbírá AI novinky, vyhodnocuje jejich význam a ukazuje, co má smysl zavést, proč a kde začít/.test(programText));
  check('Program uvádí potvrzený Tomášův blok', /14:30–14:50/.test(programText) && /Tomáš „Vilík“ Pospíchal/.test(programText) && /Od firemní rutiny k hotovému AI workflow/.test(programText));
  check('Tomášův medailonek odpovídá podpisu', /AI Solution Architect a Ničitel firemní rutiny v BeeAI/.test(programText));
  check('Tomášův medailonek neopakuje samozřejmý prostor na otázky', !/následovaná otázkami/.test(programText));
  check('Dva nepotvrzené bloky zůstávají anonymní', (programText.match(/Program připravujeme/g) || []).length === 2 && !/\b(?:Aneta|Vojta)\b/.test(programText));
  check('Úvod představuje sraz a úvodní moudra organizátora', /14:00–14:10[\s\S]*Daniel Gamrot[\s\S]*Představení celého srazu a úvodní moudra organizátora/.test(programText));
  check('Danielův blok vypráví vznik Uttera napříč platformami', /15:30–15:55[\s\S]*Jak jsem stavěl Uttero[\s\S]*macOS, iOS a Android/.test(programText));
  check('Tři potvrzené hlavní bloky mají zvýraznění', await page.locator('.program-slot-confirmed').count() === 3 && await page.locator('.program-slot-confirmed').filter({ hasText: 'Alex Trejtnar' }).count() === 1 && await page.locator('.program-slot-confirmed').filter({ hasText: 'Tomáš „Vilík“ Pospíchal' }).count() === 1 && await page.locator('.program-slot-confirmed').filter({ hasText: 'Jak jsem stavěl Uttero' }).count() === 1);
  check('Program uvádí instrukce ke skupinové výzvě', /15:55–16:00[\s\S]*Instrukce ke skupinové výzvě/.test(programText));
  check('Před skupinovou výzvou je patnáctiminutová pauza', /16:00–16:15[\s\S]*Pauza[\s\S]*občerstvení/.test(programText));
  check('Skupinová výzva začíná v 16:15 a končí v 18:00', /16:15–18:00[\s\S]*Skupinová výzva/.test(programText));
  check('Skupinová výzva míchá zkušenosti a má výstup', /skupinách po třech/.test(programText) && /různé úrovně zkušenosti/.test(programText) && /krátce ukáže/.test(programText));
  const slotEdgeBorders = await page.locator('.program-slots').evaluate(slots => {
    const first = slots.firstElementChild;
    const last = slots.lastElementChild;
    return {
      beforeFirst: getComputedStyle(slots).borderTopWidth,
      afterLast: last ? getComputedStyle(last).borderBottomWidth : null,
      count: slots.children.length,
      firstExists: Boolean(first)
    };
  });
  check('Vnitřní program nemá linku před prvním ani za posledním vstupem', slotEdgeBorders.firstExists && slotEdgeBorders.count === 7 && slotEdgeBorders.beforeFirst === '0px' && slotEdgeBorders.afterLast === '0px', JSON.stringify(slotEdgeBorders));
  const deviceCopy = await page.locator('.timeline-item, .practical, .faq').allTextContents().then(x => x.join(' ').replace(/\u00a0/g, ' '));
  check('Skupinová aktivita zmiňuje zařízení', /notebook|mobil/i.test(deviceCopy));
  check('Zařízení je výslovně dobrovolné', /není povinn|není podmínkou|povinné nejsou|i bez něj/i.test(deviceCopy));
  check('Organizační text mluví v první osobě', /Potřebuju|přijímám|pošlu/.test(await page.locator('main').innerText()));
  const manifestoText = (await page.locator('.manifesto-band').innerText()).replace(/\u00a0/g, ' ');
  check('Stránka zachovává aktivní charakter srazu', /Nechci dělat akci, kterou si jen odsedíte/.test(manifestoText) && /jeden konkrétní nápad/.test(manifestoText) && /jméno člověka/.test(manifestoText));
  check('Aktivní charakter přechází do otevřené pozvánky na piknik', /Hlavní program je už plný/.test(manifestoText) && /na večerní piknik zvu i lidi mimo komunitu/.test(manifestoText));
  const registrationText = (await page.locator('.registration-panel').innerText()).replace(/\u00a0/g, ' ');
  check('Registrační karta odděluje naplněný hlavní program od pikniku', /Hlavní program[\s\S]*Naplněno[\s\S]*30 z 30 míst/i.test(registrationText) && /Piknik po 18:00/i.test(registrationText) && await page.locator('.registration-status-item').count() === 2);
  check('Registrace zve i lidi mimo program a komunitu', /nejste v Master the Flow/.test(registrationText) && /na hlavním programu nebudete/.test(registrationText));
  check('Registrace vysvětluje jednoduchý formulář a důvod pro e-mail', /Jméno a e-mail jsou povinné/.test(registrationText) && /pár slov o sobě přidáte dobrovolně/.test(registrationText) && /pošlu přesné místo/.test(registrationText) && /Google účet nepotřebujete/.test(registrationText));
  check('Registrace vysvětluje výslovný opt-in veřejné karty', /Na web se dostanou jen vaše jméno a popis/.test(registrationText) && /jen když to výslovně potvrdíte/.test(registrationText) && /e-mail se na web neposílá/.test(registrationText));
  check('Registrace popisuje piknik jako volné setkání bez elektroniky', /volné setkání bez programu/.test(registrationText) && /nepotřebujete notebook, telefon ani jinou elektroniku/.test(registrationText) && !/nemusíte nic nosit/.test(registrationText));
  check('Úvod nepopisuje sraz jako offline akci', !/offline/i.test(await page.locator('.manifesto-band').innerText()));
  check('Text se nevymezuje přes formálnost nebo konferenci', !/formáln|konferenci/i.test(await page.locator('main').innerText()));

  check('Hero nenabízí kalendář naplněného hlavního programu', await page.locator('.hero-calendar-links, #google-calendar-link, .hero a[download]').count() === 0 && !/kalendář/i.test(await page.locator('.hero').innerText()));

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
  check('Registrační blok má titulek Přidat se na piknik', (await page.locator('#registration-title').textContent()).replace(/\u00a0/g, ' ') === 'Přidat se na piknik');
  check('Piknik je výslovně otevřený i mimo komunitu', /Piknik je otevřený všem/.test(await page.locator('.practical').innerText()) && /Nemusíte být v Master the Flow/.test((await page.locator('.practical').innerText()).replace(/\u00a0/g, ' ')));
  const whatsappHref = await page.locator('#whatsapp-group-link').getAttribute('href');
  const whatsappUrl = new URL(whatsappHref);
  check('WhatsApp pozvánka vede do zadané skupiny', whatsappUrl.hostname === 'chat.whatsapp.com' && whatsappUrl.pathname === '/CYjDrgCPeq18wldgqScjFh' && whatsappUrl.searchParams.get('mode') === 'gi_t', String(whatsappHref));
  check('Vstup do skupiny není zaměněný za registraci', /nenahrazuje registraci na piknik/.test((await page.locator('.community-note').innerText()).replace(/\u00a0/g, ' ')));
  check('Členství v komunitě není podmínkou pikniku', /Piknik je otevřený i lidem mimo komunitu/.test((await page.locator('.faq').textContent()).replace(/\u00a0/g, ' ')));
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
  check('Datum a hodina používají pevné mezery', await page.locator('.hero-date').textContent() === '29.\u00a0srpna 2026' && (await page.locator('.closing-overline').textContent()).includes('od\u00a018:00'));

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
      const cta = document.querySelector('.hero .button-primary').getBoundingClientRect();
      return {
        heroBottom: hero.bottom,
        viewportHeight: window.innerHeight,
        ctaVisible: cta.bottom <= window.innerHeight + 1 && cta.height >= 44,
        fits: hero.bottom <= window.innerHeight + 1
      };
    });
    if (!state.fits || !state.ctaVisible) shallowProblems.push(`${viewport.width}x${viewport.height}=${JSON.stringify(state)}`);
    await shallowPage.close();
  }
  check('Hero je celé viditelné i v nízkých desktopových oknech', shallowProblems.length === 0, shallowProblems.join(' | '));

  const attendeePreview = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  const longBio = 'Delší testovací představení účastníka. '.repeat(30);
  await attendeePreview.route('**/api/meetup-attendees', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Cache-Control': 'no-store' },
    body: JSON.stringify({ registeredCount: 11, officialRegisteredCount: 11, picnicRegisteredCount: 4, attendees: [
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
  check('Hero počítá hlavní program nezávisle na zveřejněných profilech', await attendeePreview.locator('#official-registered-count').innerText() === '11/30' && /obsazených míst/.test(await attendeePreview.locator('#official-registered-count-note').innerText()));
  check('Hero přebírá úplný počet pikniku z API a správně jej skloňuje', await attendeePreview.locator('#hero-picnic-registered-count').innerText() === '4' && /přihlásili 4 lidé/.test((await attendeePreview.locator('.hero-picnic-proof').innerText()).replace(/\u00a0/g, ' ')));
  check('Registrační blok ukazuje samostatný úplný počet pikniku', await attendeePreview.locator('#picnic-registered-count').innerText() === '4' && await attendeePreview.locator('#picnic-registered-count-copy').isVisible());
  const renderedNames = await attendeePreview.locator('.attendee-card h3').allTextContents();
  check('Seznam vykreslí zveřejněné profily a rozsah účasti', await attendeePreview.locator('.attendee-card').count() === 8 && /Oficiální část 13:00–18:00/.test(await attendeePreview.locator('.attendee-card').filter({ hasText: 'Účastník H' }).innerText()) && /Oficiální část \+ piknik/.test(await attendeePreview.locator('.attendee-card').filter({ hasText: 'Účastník A' }).innerText()) && /Jen piknik po 18:00/.test(await attendeePreview.locator('.attendee-card').filter({ hasText: 'Účastník G' }).innerText()));
  check('Účastníci jsou seřazení abecedně', renderedNames.join('|') === [...renderedNames].sort((a, b) => a.localeCompare(b, 'cs', { sensitivity: 'base' })).join('|'), renderedNames.join(' | '));

  const fullCapacityPreview = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await fullCapacityPreview.route('**/api/meetup-attendees', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Cache-Control': 'no-store' },
    body: JSON.stringify({ registeredCount: 30, officialRegisteredCount: 30, picnicRegisteredCount: 19, attendees: [] })
  }));
  await fullCapacityPreview.goto(BASE + '/sraz/', { waitUntil: 'networkidle' });
  check('Při naplněném programu zůstávají všechna pikniková CTA aktivní', await fullCapacityPreview.locator('[data-registration-link]').evaluateAll(links => links.length === 4 && links.every(link => /^https:\/\/docs\.google\.com\/forms\//.test(link.getAttribute('href') || '') && link.getAttribute('aria-disabled') !== 'true')));
  check('Naplněná kapacita a počet pikniku jsou popsány odděleně', await fullCapacityPreview.locator('#official-registered-count').innerText() === '30/30' && /kapacita naplněná/.test(await fullCapacityPreview.locator('#official-registered-count-note').innerText()) && await fullCapacityPreview.locator('#hero-picnic-registered-count').innerText() === '19' && /přihlásilo 19 lidí/.test((await fullCapacityPreview.locator('.hero-picnic-proof').innerText()).replace(/\u00a0/g, ' ')) && await fullCapacityPreview.locator('#picnic-registered-count').innerText() === '19');
  check('Mobil skládá dva stavy registrační karty pod sebe', await fullCapacityPreview.locator('.registration-status').evaluate(element => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length === 1));
  await fullCapacityPreview.close();
  check('Údaje účastníků se vkládají jako text, ne jako HTML', await attendeePreview.locator('.attendee-card img').count() === 0 && renderedNames.includes('Z <img src=x onerror=alert(1)>'));
  check('Desktop zobrazuje stav programu a pikniku vedle sebe', await attendeePreview.locator('.registration-status').evaluate(element => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length === 2));
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
