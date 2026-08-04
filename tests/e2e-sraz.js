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
  check('Hero vysvětluje, jak se lidé dozvědí adresu', /adresu pošlu e-mailem/.test(await page.locator('.hero-facts').innerText()));
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
  const deviceCopy = await page.locator('.timeline-item, .practical, .faq').allTextContents().then(x => x.join(' '));
  check('Skupinová aktivita zmiňuje zařízení', /notebook|mobil/i.test(deviceCopy));
  check('Zařízení je výslovně dobrovolné', /není povinn|není podmínkou|povinné nejsou|i bez něj/i.test(deviceCopy));
  check('Organizační text mluví v první osobě', /Potřebuju|abych vybral/.test(await page.locator('.registration-panel').innerText()));
  check('Úvod nepopisuje sraz jako offline akci', !/offline/i.test(await page.locator('.manifesto-band').innerText()));
  check('Text se nevymezuje přes formálnost nebo konferenci', !/formáln|konferenci/i.test(await page.locator('main').innerText()));

  const calendarHref = await page.locator('a[download]').getAttribute('href');
  check('Kalendář má vlastní ICS soubor', calendarHref === '/sraz/sraz-master-the-flow-praha-2026.ics', String(calendarHref));
  const googleCalendarHref = await page.locator('#google-calendar-link').getAttribute('href');
  const googleCalendarUrl = new URL(googleCalendarHref);
  check('Google Kalendář má přímý odkaz', googleCalendarUrl.hostname === 'calendar.google.com' && googleCalendarUrl.searchParams.get('action') === 'TEMPLATE');
  check('Google Kalendář používá správný čas', googleCalendarUrl.searchParams.get('dates') === '20260829T130000/20260829T180000');
  const calendarResponse = await page.request.get(BASE + calendarHref);
  check('ICS soubor je dostupný', calendarResponse.ok());
  check('ICS používá správný termín', (await calendarResponse.text()).includes('DTSTART;TZID=Europe/Prague:20260829T130000'));
  check('ICS končí v 18:00', (await calendarResponse.text()).includes('DTEND;TZID=Europe/Prague:20260829T180000'));

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

  const mainText = await page.locator('main').innerText();
  check('Jednopísmenné české předložky a spojky mají pevné mezery', !/(?:^|\s)[avikosuz] [A-Za-zÁ-ž]/im.test(mainText));
  check('Datum a hodina používají pevné mezery', await page.locator('.hero-date').textContent() === '29.\u00a0srpna 2026' && (await page.getByText('Co bude po 18. hodině?').textContent()).includes('po\u00a018.\u00a0hodině'));

  check('Stránka nemá vlastní JS chyby', consoleErrors.length === 0, consoleErrors.join(' | '));

  const phoneWidths = [320, 360, 375, 390, 393, 412, 430];
  const phoneProblems = [];
  for (const width of phoneWidths) {
    const phone = await browser.newPage({ viewport: { width, height: 844 } });
    await phone.goto(BASE + '/sraz/', { waitUntil: 'networkidle' });
    const state = await phone.evaluate(() => {
      const brand = document.querySelector('.hero-title-brand').getBoundingClientRect();
      const place = document.querySelector('.hero-title-place').getBoundingClientRect();
      const cta = document.querySelector('.hero .button-primary').getBoundingClientRect();
      const facts = [...document.querySelectorAll('.hero-fact')].map(element => element.getBoundingClientRect());
      const stickyElement = document.getElementById('sticky-register');
      return {
        overflow: document.documentElement.scrollWidth > window.innerWidth,
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
        correctGrid: breakpoint <= 720 ? columns === 2 : columns === 3
      };
    }, width);
    if (state.overflow || !state.brandFits || !state.placeAligned || !state.factsFit || !state.correctGrid) widerProblems.push(`${width}px=${JSON.stringify(state)}`);
    await widerPage.close();
  }
  check('Hero bezpečně přechází mezi telefonem, tabletem a desktopem', widerProblems.length === 0, widerProblems.join(' | '));

  await browser.close();
  console.log(failures === 0 ? '\nVŠECHNY TESTY SRAZU PROŠLY' : `\n${failures} TESTŮ SRAZU SELHALO`);
  process.exit(failures === 0 ? 0 : 1);
})();
