// E2E test veřejného archivu pražského srazu.
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

  const response = await page.goto(`${BASE}/sraz/`, { waitUntil: 'networkidle' });
  check('/sraz/ vrací úspěšnou odpověď', response && response.ok(), String(response && response.status()));
  check('Stránka je veřejná bez přístupové brány', await page.locator('#gate').count() === 0);
  const workflowResponse = await page.request.get(`${BASE}/.github/workflows/sraz-e2e.yml`);
  check('Interní GitHub workflow není veřejně dostupný', workflowResponse.status() === 404, String(workflowResponse.status()));

  const attendeesResponse = await page.request.get(`${BASE}/api/meetup-attendees`);
  const attendeesPayload = await attendeesResponse.json();
  check('Veřejné API účastníků vrací bezpečný seznam bez cache', attendeesResponse.ok()
    && Array.isArray(attendeesPayload.attendees)
    && attendeesResponse.headers()['cache-control'] === 'no-store');
  const unauthorizedWrite = await page.request.post(`${BASE}/api/meetup-attendees`, {
    data: { attendees: [] },
    headers: { 'Content-Type': 'application/json' },
  });
  check('API účastníků odmítá neautorizovaný zápis', unauthorizedWrite.status() === 401, String(unauthorizedWrite.status()));

  check('Titulek pojmenovává sraz v Praze', await page.locator('h1').textContent() === 'Sraz Master the Flow v Praze');
  const heroDate = page.locator('time[datetime="2026-08-29"]');
  check('Datum je viditelné a strojově čitelné', await heroDate.isVisible() && await heroDate.getAttribute('aria-label') === '29. srpna 2026');
  const heroText = (await page.locator('.hero').innerText()).replace(/\u00a0/g, ' ');
  check('Hero jasně říká, že akce proběhla', /Stav\s+Proběhlo/i.test(heroText) && /registrace je uzavřená/.test(heroText) && /sraz Master the Flow je za námi/.test(heroText));
  check('Hero uvádí čas a potvrzené místo', /13:00–18:00/.test(heroText) && /Lampárna Lidická/.test(heroText) && /Lidická 31.*Praha 5/.test(heroText));
  check('Hero odkazuje na Lampárnu Lidická', await page.locator('.hero-fact-place a').getAttribute('href') === 'https://www.lamparnalidicka.cz/');
  check('Značka Master the Flow se v titulku neláme', await page.locator('h1 .no-break').evaluate(element => getComputedStyle(element).whiteSpace === 'nowrap'));

  const registrationLinks = await page.locator('[data-registration-link], a[href*="docs.google.com/forms"], a[href*="forms.gle"]').count();
  check('Stránka neobsahuje registrační odkazy ani Google Forms', registrationLinks === 0, `count=${registrationLinks}`);
  check('Stránka nemá registrační sekci, CTA ani sticky lištu', await page.locator('#registrace, #registration-link, #sticky-register, .registration-panel, .hero-actions').count() === 0);
  check('Stránka po akci nenabízí přidání do kalendáře', await page.locator('#google-calendar-link, a[download$=".ics"], .hero-calendar-links').count() === 0);

  const firstThemeLabel = await page.locator('#theme-toggle').getAttribute('aria-label');
  await page.locator('#theme-toggle').click();
  const secondThemeLabel = await page.locator('#theme-toggle').getAttribute('aria-label');
  check('Přepínač tématu popisuje cílový režim', firstThemeLabel !== secondThemeLabel
    && /Přepnout na (tmavý|světlý) režim/.test(firstThemeLabel || '')
    && /Přepnout na (tmavý|světlý) režim/.test(secondThemeLabel || ''));

  const programText = (await page.locator('.program').innerText()).replace(/\u00a0/g, ' ');
  check('Harmonogram má pět navazujících částí včetně pauzy', await page.locator('.timeline-item').count() === 5);
  check('Program je popsaný v minulém čase', /Jak odpoledne proběhlo/.test(programText) && /Vystoupení proběhla/.test(programText) && /uprostřed byla dvacetiminutová přestávka/.test(programText));
  check('Program shrnuje pět vystupujících bez Vojtěcha', /vystoupili Alex Trejtnar, Martin Pavlíček, Tomáš „Vilík“ Pospíchal, Aneta Martinek a Ondřej Tyl/.test(programText) && !/Vojtěch|Vojta/.test(programText));
  check('Přestávka nahradila původní blok 15:05–15:25', /15:05–15:25[\s\S]*Přestávka[\s\S]*Občerstvení a rozhovory/.test(programText));
  check('Anetin blok má správný čas a téma', /15:25–15:45[\s\S]*Aneta Martinek[\s\S]*AI brain fry a jak si nastavit AI hygienu/.test(programText));
  check('Ondřejův blok má potvrzený čas, téma a odkaz', /15:45–16:05[\s\S]*Ondřej Tyl[\s\S]*Hraju si s GrokBotem/.test(programText)
    && await page.locator('.program-slot-speaker a[href="https://ondrejtyl.cz/"]').getAttribute('target') === '_blank');
  check('Danielův blok zachovává příběh Uttera', /16:05–16:15[\s\S]*Jak jsem stavěl Uttero[\s\S]*macOS, iOS a Android/.test(programText));
  check('Skupinová výzva uvádí skutečné zadání a výsledek', /malých týmů/.test(programText)
    && /různou úrovní zkušeností/.test(programText)
    && /Nasyť mě\. Seznam mě\. Pobav mě\./.test(programText)
    && /během půl hodiny společně vytvořili 6 vibe coded aplikací/.test(programText)
    && !/vlastní hru|hratelnou verzi|bez návodu otestovat jiným týmem/.test(programText));
  check('Technika byla výslovně dobrovolná', /Notebook nebo mobil.*nebyly ale podmínkou zapojení/.test(programText));

  const manifestoText = (await page.locator('.manifesto-band').innerText()).replace(/\u00a0/g, ' ');
  check('Retrospektiva zachovává smysl srazu', /Nebyla to akce, kterou si jen odsedíte/.test(manifestoText)
    && /jeden konkrétní nápad/.test(manifestoText)
    && /jméno člověka/.test(manifestoText));
  check('Seznam účastníků vysvětluje souhlas i ochranu e-mailu', /pouze lidi, kteří se zveřejněním souhlasili/.test((await page.locator('.attendees').innerText()).replace(/\u00a0/g, ' '))
    && /E-mail ani další odpovědi/.test(await page.locator('.attendees').innerText()));

  const attendeeCards = await page.locator('#attendees-list .attendee-card').count();
  check('Seznam účastníků má srozumitelný stav', attendeeCards > 0 || /Seznam účastníků teď není dostupný/.test(await page.locator('#attendees-list').innerText()));
  check('Seznam účastníků je na mobilu v jednom sloupci', await page.locator('.attendees-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length === 1));
  check('Mobilní stránka nemá vodorovný přesah', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

  const whatsappHref = await page.locator('#whatsapp-group-link').getAttribute('href');
  const whatsappUrl = new URL(whatsappHref);
  check('WhatsApp pozvánka zůstává funkční', whatsappUrl.hostname === 'chat.whatsapp.com'
    && whatsappUrl.pathname === '/CYjDrgCPeq18wldgqScjFh'
    && whatsappUrl.searchParams.get('mode') === 'gi_t', String(whatsappHref));
  check('WhatsApp sekce potvrzuje konec registrace', /Sraz už skončil a registrace je uzavřená/.test((await page.locator('.community-note').innerText()).replace(/\u00a0/g, ' ')));
  check('WhatsApp tlačítko má dostatečnou dotykovou plochu', await page.locator('#whatsapp-group-link').evaluate(element => element.getBoundingClientRect().height >= 44));
  const qrImage = page.locator('.community-qr');
  const qrResponse = await page.request.get(BASE + await qrImage.getAttribute('src'));
  check('QR kód má alternativní text a dostupný PNG soubor', /QR kód/.test(await qrImage.getAttribute('alt') || '')
    && qrResponse.ok()
    && /^image\/png/.test(qrResponse.headers()['content-type'] || ''));

  const mainText = await page.locator('main').evaluate(main => {
    const copy = main.cloneNode(true);
    copy.querySelector('.attendees')?.remove();
    return copy.innerText;
  });
  check('Jednopísmenné české předložky a spojky mají pevné mezery', !/(?:^|\s)[avikosuz] [A-Za-zÁ-ž]/m.test(mainText));
  check('Stránka nemá vlastní JS chyby', consoleErrors.length === 0, consoleErrors.join(' | '));

  const widths = [320, 360, 390, 430, 744, 1024, 1440, 1920];
  const layoutProblems = [];
  for (const width of widths) {
    const viewportPage = await browser.newPage({ viewport: { width, height: width <= 430 ? 844 : 900 } });
    await viewportPage.route('**/api/meetup-attendees', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Cache-Control': 'no-store' },
      body: JSON.stringify({ attendees: [
        { name: 'Alena', bio: 'Testovací profil.', attendance: 'official' },
        { name: 'Boris', bio: 'Testovací profil.', attendance: 'official_and_picnic' },
        { name: 'Cyril', bio: 'Testovací profil.', attendance: 'picnic_only' },
        { name: 'Dana', bio: 'Testovací profil.', attendance: 'uncertain' },
      ] }),
    }));
    await viewportPage.goto(`${BASE}/sraz/`, { waitUntil: 'networkidle' });
    const state = await viewportPage.evaluate(() => {
      const brand = document.querySelector('.hero-title-brand').getBoundingClientRect();
      const place = document.querySelector('.hero-title-place').getBoundingClientRect();
      const facts = [...document.querySelectorAll('.hero-fact')].map(element => element.getBoundingClientRect());
      return {
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        brandFits: brand.left >= 0 && brand.right <= window.innerWidth,
        placeFits: place.left >= 0 && place.right <= window.innerWidth,
        factsFit: facts.every(rect => rect.left >= 0 && rect.right <= window.innerWidth),
      };
    });
    if (state.overflow || !state.brandFits || !state.placeFits || !state.factsFit) {
      layoutProblems.push(`${width}px=${JSON.stringify(state)}`);
    }
    await viewportPage.close();
  }
  check('Archiv srazu je bezpečný od telefonu po desktop', layoutProblems.length === 0, layoutProblems.join(' | '));

  const attendeePreview = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  const longBio = 'Delší testovací představení účastníka. '.repeat(30);
  await attendeePreview.route('**/api/meetup-attendees', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Cache-Control': 'no-store' },
    body: JSON.stringify({ attendees: [
      { name: 'Účastník H', bio: 'Věnuje se testování a rád si popovídá o kvalitě.', attendance: 'official' },
      { name: 'Účastník A', bio: longBio, attendance: 'official_and_picnic' },
      { name: 'Účastník B', bio: 'Testovací profil B.', attendance: 'uncertain' },
      { name: 'Účastník D', bio: 'Testovací profil D.', attendance: 'official' },
      { name: 'Účastník E', bio: 'Testovací profil E.', attendance: 'official' },
      { name: 'Účastník F', bio: 'Testovací profil F.', attendance: 'official' },
      { name: 'Účastník G', bio: 'Dorazil jen na společný piknik.', attendance: 'picnic_only' },
      { name: 'Z <img src=x onerror=alert(1)>', bio: 'Bezpečnostní test vykreslení jako text.', attendance: 'official_and_picnic' },
    ] }),
  }));
  await attendeePreview.goto(`${BASE}/sraz/`, { waitUntil: 'networkidle' });
  const renderedNames = await attendeePreview.locator('.attendee-card h3').allTextContents();
  check('Seznam vykreslí zveřejněné profily a rozsah účasti', await attendeePreview.locator('.attendee-card').count() === 8
    && /Oficiální část 13:00–18:00/.test(await attendeePreview.locator('.attendee-card').filter({ hasText: 'Účastník H' }).innerText())
    && /Jen piknik po 18:00/.test(await attendeePreview.locator('.attendee-card').filter({ hasText: 'Účastník G' }).innerText()));
  check('Účastníci jsou seřazení abecedně', renderedNames.join('|') === [...renderedNames].sort((a, b) => a.localeCompare(b, 'cs', { sensitivity: 'base' })).join('|'), renderedNames.join(' | '));
  check('Údaje účastníků se vkládají jako text, ne jako HTML', await attendeePreview.locator('.attendee-card img').count() === 0 && renderedNames.includes('Z <img src=x onerror=alert(1)>'));
  check('Desktopový seznam účastníků používá dva sloupce', await attendeePreview.locator('.attendees-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length === 2));
  check('Desktop nejdřív ukáže šest profilů', await attendeePreview.locator('.attendee-card:visible').count() === 6);
  const filters = attendeePreview.locator('#attendee-filters');
  await filters.locator('[data-attendee-filter="picnic"]').click();
  check('Filtr pikniku ukáže všechny tři relevantní profily', await attendeePreview.locator('.attendee-card:visible').count() === 3);
  await filters.locator('[data-attendee-filter="all"]').click();
  const attendeesToggle = attendeePreview.locator('#attendees-toggle');
  await attendeesToggle.click();
  check('Rozbalení zpřístupní všech osm profilů', await attendeePreview.locator('.attendee-card:visible').count() === 8 && await attendeesToggle.getAttribute('aria-expanded') === 'true');
  const bioToggle = attendeePreview.locator('.attendee-card').filter({ hasText: 'Účastník A' }).locator('.attendee-bio-toggle');
  check('Dlouhé představení má vlastní rozbalení', await bioToggle.isVisible());
  await attendeePreview.close();

  await browser.close();
  console.log(failures === 0 ? '\nVŠECHNY TESTY SRAZU PROŠLY' : `\n${failures} TESTŮ SRAZU SELHALO`);
  process.exit(failures === 0 ? 0 : 1);
})();
