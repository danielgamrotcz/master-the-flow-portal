// E2E: push primer + iOS sheet
const { chromium, webkit } = require('playwright');
const { authenticate } = require('./_auth.js');
let failures = 0;
const check = (n, c, d='') => { console.log(`${c?'PASS':'FAIL'}  ${n}${c?'':'  <-- '+d}`); if(!c) failures++; };
(async () => {
  const browser = await chromium.launch();

  // 1. Primer se NEukáže první den
  const ctx1 = await browser.newContext();
  await authenticate(ctx1);
  const p1 = await ctx1.newPage();
  await p1.goto('http://localhost:8788/', { waitUntil: 'networkidle' });
  await p1.waitForTimeout(1200);
  check('Primer skrytý 1. den', await p1.evaluate(() => document.getElementById('push-primer').classList.contains('hidden')));

  // 2. Primer se ukáže od 2. návštěvního dne (bez subscription)
  const ctx2 = await browser.newContext({ permissions: ['notifications'] });
  await authenticate(ctx2);
  const p2 = await ctx2.newPage();
  await ctx2.addInitScript(() => {
    localStorage.setItem('mtf_visit_days', '3');
    // headless hlásí denied bez ohledu na grantPermissions — stub na default
    Object.defineProperty(Notification, 'permission', { get: () => 'default' });
  });
  await p2.goto('http://localhost:8788/', { waitUntil: 'networkidle' });
  await p2.waitForTimeout(1500);
  const primerVisible = await p2.evaluate(() => !document.getElementById('push-primer').classList.contains('hidden'));
  check('Primer viditelný od 2. dne', primerVisible);

  // 3. „Teď ne" zavře natrvalo
  await p2.locator('#push-primer-off').click();
  await p2.waitForTimeout(300);
  check('„Teď ne" skryje primer', await p2.evaluate(() => document.getElementById('push-primer').classList.contains('hidden')));
  await p2.reload({ waitUntil: 'networkidle' });
  await p2.waitForTimeout(1200);
  check('Po reloadu se primer nevrací', await p2.evaluate(() => document.getElementById('push-primer').classList.contains('hidden')));

  // 4. iOS Safari simulace (webkit + iPhone UA, bez PushManager v hlavním kontextu nejde
  //    plně simulovat — testujeme aspoň isIOS větev přes UA override v chromiu)
  const ctx3 = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  });
  await authenticate(ctx3);
  const p3 = await ctx3.newPage();
  await ctx3.addInitScript(() => {
    // simulace iOS Safari: PushManager neexistuje
    delete window.PushManager;
  });
  await p3.goto('http://localhost:8788/', { waitUntil: 'networkidle' });
  await p3.waitForTimeout(1200);
  const bellVisible = await p3.evaluate(() => {
    const b = document.getElementById('btn-bell');
    return b && b.style.display !== 'none';
  });
  check('iOS bez PWA: zvoneček viditelný (dřív skrytý)', bellVisible);
  await p3.locator('#btn-bell').click();
  await p3.waitForTimeout(400);
  check('iOS: klik na zvoneček otevře instruktáž', await p3.evaluate(() => !document.getElementById('ios-push-sheet').classList.contains('hidden')));
  const steps = await p3.locator('.ios-push-steps li').count();
  check('Instruktáž má 3 kroky', steps === 3, String(steps));
  await p3.locator('#ios-push-close').click();
  await p3.waitForTimeout(300);
  check('„Rozumím" zavře instruktáž', await p3.evaluate(() => document.getElementById('ios-push-sheet').classList.contains('hidden')));

  await browser.close();
  console.log(failures === 0 ? '\nPUSH: VŠE PROŠLO' : `\n${failures} SELHALO`);
  process.exit(failures ? 1 : 0);
})();
