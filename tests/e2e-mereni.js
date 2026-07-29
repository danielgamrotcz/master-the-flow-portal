// E2E test měření: ?src= atribuce a session_visit payload
const { chromium } = require('playwright');
const { authenticate, BASE } = require('./_auth.js');
let failures = 0;
function check(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  <-- ' + detail}`);
  if (!cond) failures++;
}
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await authenticate(ctx);
  const page = await ctx.newPage();

  // Zachytit track requesty
  const tracked = [];
  page.on('request', r => {
    if (r.url().includes('/api/track') && r.method() === 'POST') {
      try { tracked.push(JSON.parse(r.postData())); } catch {}
    }
  });

  await page.goto(BASE + '/?src=digest', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // src se odstranil z URL
  check('?src= se po přečtení odstraní z adresy', !page.url().includes('src='), page.url());

  const sv = tracked.find(t => t.event === 'session_visit');
  check('session_visit se poslal', !!sv);
  check('session_visit nese src=digest', sv && sv.data.src === 'digest', JSON.stringify(sv && sv.data));
  check('session_visit nese is_new=true (čerstvý profil)', sv && sv.data.is_new === true, JSON.stringify(sv && sv.data));
  check('session_visit NEobsahuje žádné ID (privacy)', sv && !('visitor_id' in sv.data) && !('id' in sv.data));

  // Druhá návštěva tentýž den — session_visit se NEposílá znovu
  tracked.length = 0;
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  check('Druhá návštěva tentýž den neposílá session_visit', !tracked.find(t => t.event === 'session_visit'));

  // Gate flow: bez auth → gate_shown. Tenhle kontext zůstává schválně
  // nepřihlášený, jinak by se brána nezobrazila a test by neměřil, co má.
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  const tracked2 = [];
  page2.on('request', r => {
    if (r.url().includes('/api/track') && r.method() === 'POST') {
      try { tracked2.push(JSON.parse(r.postData())); } catch {}
    }
  });
  await page2.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page2.waitForTimeout(800);
  const gateVisible = await page2.evaluate(() => !document.getElementById('gate').classList.contains('hidden'));
  check('Gate se zobrazí bez auth', gateVisible);
  check('gate_shown event se poslal', !!tracked2.find(t => t.event === 'gate_shown'));

  await browser.close();
  console.log(failures === 0 ? '\nMĚŘENÍ: VŠE PROŠLO' : `\n${failures} SELHALO`);
  process.exit(failures === 0 ? 0 : 1);
})();
