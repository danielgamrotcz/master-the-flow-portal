const { chromium } = require('playwright');
const { BASE } = require('./_auth.js');

const ADMIN_SECRET = process.env.GROUPS_TEST_ADMIN_SECRET;
let failures = 0;
function check(name, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : '  <-- ' + detail}`);
  if (!condition) failures++;
}

function token(index) {
  return `test-participant-${String(index).padStart(40, '0')}`;
}

(async () => {
  if (!ADMIN_SECRET) throw new Error('GROUPS_TEST_ADMIN_SECRET není nastavený');
  const browser = await chromium.launch();
  const participantContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const participantPage = await participantContext.newPage();
  const consoleErrors = [];
  participantPage.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  participantPage.on('pageerror', error => consoleErrors.push(error.message));

  const pageResponse = await participantPage.goto(BASE + '/skupinky/', { waitUntil: 'networkidle' });
  check('Mobilní stránka je veřejná a načte formulář', pageResponse?.ok() && await participantPage.locator('#participant-form').isVisible());
  check('Mobilní formulář má přezdívku, škálu 1–10 a notebook', await participantPage.locator('#nickname').count() === 1 && await participantPage.locator('#experience').getAttribute('max') === '10' && await participantPage.locator('#has-laptop').count() === 1);
  check('Mobilní stránka nemá vodorovný přesah', await participantPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

  await participantPage.locator('#nickname').fill('Ada');
  await participantPage.locator('#experience').fill('9');
  await participantPage.locator('.laptop-option').click();
  await participantPage.locator('#submit-button').click();
  await participantPage.locator('#waiting-card').waitFor({ state: 'visible' });
  check('Odeslání zobrazí čekací stav a ponechá možnost úpravy', await participantPage.locator('#waiting-card').isVisible() && await participantPage.locator('#submit-button').textContent() === 'Upravit odpověď');

  await participantPage.locator('#nickname').fill('Ada upravená');
  await participantPage.locator('#experience').fill('8');
  await participantPage.locator('.laptop-option').click();
  await participantPage.locator('#submit-button').click();
  await participantPage.waitForTimeout(150);
  await participantPage.reload({ waitUntil: 'networkidle' });
  check('Upravená odpověď se po novém načtení skutečně vrátí',
    await participantPage.locator('#nickname').inputValue() === 'Ada upravená'
      && await participantPage.locator('#experience').inputValue() === '8'
      && !await participantPage.locator('#has-laptop').isChecked());

  const request = participantContext.request;
  const invalid = await request.post(BASE + '/api/groups', {
    headers: { Origin: BASE, 'x-groups-participant': token(90) },
    data: { action: 'register', nickname: '<script>', experience: 11, hasLaptop: false },
  });
  check('API odmítne neplatnou úroveň a HTML v přezdívce', invalid.status() === 400, String(invalid.status()));

  const duplicate = await request.post(BASE + '/api/groups', {
    headers: { Origin: BASE, 'x-groups-participant': token(91) },
    data: { action: 'register', nickname: 'ADA UPRAVENÁ', experience: 2, hasLaptop: false },
  });
  check('API odmítne duplicitní přezdívku bez ohledu na velikost písmen', duplicate.status() === 409, String(duplicate.status()));

  const fixtures = [
    ['Bára', 2, false], ['Cyril', 8, true], ['Dana', 3, false],
    ['Emil', 7, true], ['Fany', 5, false], ['Gita', 6, true], ['Hugo', 4, false],
  ];
  for (let index = 0; index < fixtures.length; index++) {
    const [nickname, experience, hasLaptop] = fixtures[index];
    const response = await request.post(BASE + '/api/groups', {
      headers: { Origin: BASE, 'x-groups-participant': token(index + 2) },
      data: { action: 'register', nickname, experience, hasLaptop },
    });
    check(`API uloží účastníka ${nickname}`, response.ok(), String(response.status()));
  }

  const unauthorized = await request.post(BASE + '/api/groups', {
    headers: { Origin: BASE, 'x-groups-admin': 'wrong-secret' },
    data: { action: 'finalize' },
  });
  check('Rozdělení bez správného kódu je odmítnuté', unauthorized.status() === 401, String(unauthorized.status()));

  const adminContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const adminPage = await adminContext.newPage();
  await adminPage.goto(BASE + '/skupinky/admin/', { waitUntil: 'networkidle' });
  check('Admin stránka zobrazuje funkční QR PNG', await adminPage.locator('.join-qr').evaluate(image => image.complete && image.naturalWidth > 0));
  await adminPage.locator('#admin-code').fill(ADMIN_SECRET);
  await adminPage.locator('#admin-connect').click();
  await adminPage.locator('#roster-list').waitFor({ state: 'visible' });
  check('Admin po ověření vidí osm odpovědí a notebooky', await adminPage.locator('.roster-row').count() === 8 && await adminPage.locator('.laptop-badge').count() === 3);
  check('Admin desktop nemá vodorovný přesah', await adminPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

  await adminPage.locator('#finalize-button').click();
  const [racingRegistration] = await Promise.all([
    request.post(BASE + '/api/groups', {
      headers: { Origin: BASE, 'x-groups-participant': token(92) },
      data: { action: 'register', nickname: 'Iva', experience: 10, hasLaptop: false },
    }),
    adminPage.locator('#confirm-dialog button[value="confirm"]').click(),
  ]);
  await adminPage.locator('.team-card').first().waitFor({ state: 'visible' });
  const expectedMembers = racingRegistration.ok() ? 9 : 8;
  const expectedTeams = racingRegistration.ok() ? 3 : 2;
  check('Souběžné poslední odeslání je buď celé zahrnuté, nebo odmítnuté', [200, 409].includes(racingRegistration.status()) && await adminPage.locator('.team-card').count() === expectedTeams && await adminPage.locator('.team-card li').count() === expectedMembers, `registrace=${racingRegistration.status()}, členů=${await adminPage.locator('.team-card li').count()}`);

  await participantPage.reload({ waitUntil: 'networkidle' });
  check('Po zveřejnění mobil skryje formulář a zvýrazní vlastní tým', await participantPage.locator('#form-card').isHidden() && await participantPage.locator('.team-card.is-mine').count() === 1);
  const publicResponse = await request.get(BASE + '/api/groups', { headers: { 'x-groups-participant': token(2) } });
  const publicPayload = await publicResponse.json();
  check('Veřejný výsledek neobsahuje skóre, notebook ani interní identifikátory', publicResponse.ok() && Array.isArray(publicPayload.groups) && !/experience|hasLaptop|participant_hash|"id"/i.test(JSON.stringify(publicPayload)));

  const lateWrite = await request.post(BASE + '/api/groups', {
    headers: { Origin: BASE, 'x-groups-participant': token(99) },
    data: { action: 'register', nickname: 'Pozdě', experience: 10, hasLaptop: true },
  });
  check('Po rozdělení už nejde odpověď přidat ani změnit', lateWrite.status() === 409, String(lateWrite.status()));

  const repeated = await request.post(BASE + '/api/groups', {
    headers: { Origin: BASE, 'x-groups-admin': ADMIN_SECRET },
    data: { action: 'finalize' },
  });
  const repeatedPayload = await repeated.json();
  check('Opakované kliknutí nemění zveřejněné rozdělení', repeated.ok() && repeatedPayload.alreadyFinalized === true && JSON.stringify(repeatedPayload.groups) === JSON.stringify(publicPayload.groups));
  check('Mobilní scénář nemá vlastní JavaScript chyby', consoleErrors.length === 0, consoleErrors.join(' | '));

  await browser.close();
  if (failures) {
    console.error(`\n${failures} KONTROL SKUPINEK SELHALO`);
    process.exit(1);
  }
  console.log('\nSKUPINKY E2E: VŠE PROŠLO');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
