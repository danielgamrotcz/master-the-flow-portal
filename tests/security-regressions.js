// Cílené negativní a pozitivní testy bezpečnostní opravy z 2026-08-07.
const { chromium } = require('playwright');
const { authenticate, BASE } = require('./_auth.js');
const fs = require('fs');
const path = require('path');

let failures = 0;
const check = (n, c, d='') => { console.log(`${c?'PASS':'FAIL'}  ${n}${c?'':'  <-- '+d}`); if(!c) failures++; };
const today = () => new Date().toISOString().slice(0, 10);

(async () => {
  const browser = await chromium.launch();
  const anonymous = await browser.newContext();

  const corpusDenied = await anonymous.request.get(BASE + '/data/chat-corpus.json');
  check('Chat corpus bez session vrací 403', corpusDenied.status() === 403, String(corpusDenied.status()));
  check('403 nevrací tělo komunitních dat', (await corpusDenied.body()).length === 0);

  const searchDenied = await anonymous.request.post(BASE + '/api/track', {
    headers: { 'Content-Type': 'application/json', Origin: BASE },
    data: { event: 'search', data: { query: 'podvržený dotaz', result_count: 0, date: today() } },
  });
  check('Členská analytika bez session vrací 401', searchDenied.status() === 401, String(searchDenied.status()));

  const gateAllowed = await anonymous.request.post(BASE + '/api/track', {
    headers: { 'Content-Type': 'application/json', Origin: BASE },
    data: { event: 'gate_shown', data: { query: 'ignorovat', date: today() } },
  });
  check('Veřejný gate_shown zůstává povolen', gateAllowed.ok(), String(gateAllowed.status()));

  const sub = {
    endpoint: `https://fcm.googleapis.com/mtf-security-${Date.now()}`,
    keys: { auth: 'test-auth', p256dh: 'test-p256dh' },
  };
  // Wrangler local respektuje tuto hlavičku; unikátní TEST-NET adresa drží
  // opakované lokální běhy mimo hodinový limiter z předchozího běhu.
  const subHeaders = {
    'Content-Type': 'application/json', Origin: BASE,
    'CF-Connecting-IP': `192.0.2.${1 + (Date.now() % 200)}`,
  };
  const subDenied = await anonymous.request.post(BASE + '/api/subscribe', {
    headers: subHeaders, data: sub,
  });
  check('Push subscribe bez session vrací 401', subDenied.status() === 401, String(subDenied.status()));

  const member = await browser.newContext();
  await authenticate(member);
  const corpusAllowed = await member.request.get(BASE + '/data/chat-corpus.json');
  check('Chat corpus s platnou session projde', corpusAllowed.ok(), String(corpusAllowed.status()));
  check('Chráněný corpus je private, no-store', /private/.test(corpusAllowed.headers()['cache-control'] || '') && /no-store/.test(corpusAllowed.headers()['cache-control'] || ''), corpusAllowed.headers()['cache-control']);

  const searchAllowed = await member.request.post(BASE + '/api/track', {
    headers: { 'Content-Type': 'application/json', Origin: BASE },
    data: { event: 'search', data: { query: 'bezpečnostní test', result_count: 1, date: today() } },
  });
  check('Členská analytika s platnou session projde', searchAllowed.ok(), String(searchAllowed.status()));

  const subAllowed = await member.request.post(BASE + '/api/subscribe', {
    headers: subHeaders, data: sub,
  });
  check('Push subscribe s platnou session projde', subAllowed.ok(), String(subAllowed.status()));
  const subDelete = await member.request.delete(BASE + '/api/subscribe', {
    headers: subHeaders, data: sub,
  });
  check('Push unsubscribe s platnou session projde', subDelete.ok(), String(subDelete.status()));

  const mediaDir = path.join(__dirname, '..', 'data', 'media');
  const media = fs.readdirSync(mediaDir).find(name => !name.startsWith('.'));
  const mediaRes = media ? await anonymous.request.get(BASE + '/data/media/' + encodeURIComponent(media)) : null;
  check('Veřejná média zůstávají immutable', !!mediaRes && /public/.test(mediaRes.headers()['cache-control'] || '') && /immutable/.test(mediaRes.headers()['cache-control'] || ''), mediaRes?.headers()['cache-control'] || 'bez média');

  const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const chatSource = fs.readFileSync(path.join(__dirname, '..', 'functions', 'api', 'chat.js'), 'utf8');
  check('Klient mtf_code pouze maže, nikdy ho nečte ani neukládá', appSource.includes("removeItem('mtf_code')") && !appSource.includes("getItem('mtf_code')") && !appSource.includes("setItem('mtf_code')"));
  check('Klient už nevytváří ?k= magic link', !appSource.includes('?k='));
  check('Serverový chat čte chráněná data přes ASSETS', chatSource.includes('loadJsonAsset') && !/fetch\([^\n]*\/data\//.test(chatSource));

  await browser.close();
  console.log(failures === 0 ? '\nSECURITY REGRESSIONS: VŠE PROŠLO' : `\n${failures} SELHALO`);
  process.exit(failures ? 1 : 0);
})();
