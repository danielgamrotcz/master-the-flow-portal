const fs = require('fs');
const path = require('path');

let failures = 0;
function check(name, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : '  <-- ' + detail}`);
  if (!condition) failures++;
}

(async () => {
  const rateLimitSource = fs.readFileSync(path.join(__dirname, '..', 'functions', 'api', '_ratelimit.js'), 'utf8');
  const rateLimitModuleUrl = 'data:text/javascript;base64,' + Buffer.from(rateLimitSource).toString('base64');
  const source = fs.readFileSync(path.join(__dirname, '..', 'functions', 'api', 'meetup-attendees.js'), 'utf8')
    .replace("'./_ratelimit.js'", `'${rateLimitModuleUrl}'`);
  const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  const { onRequestGet, onRequestPost } = await import(moduleUrl);
  const store = new Map();

  function createD1Mock() {
    const counters = new Map();
    return {
      prepare(sql) {
        const statement = {
          bindings: [],
          bind(...values) {
            this.bindings = values;
            return this;
          },
          async run() {
            return { success: true };
          },
          async first() {
            if (!sql.includes('INSERT INTO rate_limits')) return null;
            const [key, expires, now] = this.bindings;
            const previous = counters.get(key);
            const count = !previous || previous.expires <= now ? 1 : previous.count + 1;
            counters.set(key, { count, expires: !previous || previous.expires <= now ? expires : previous.expires });
            return { count };
          },
        };
        return statement;
      },
    };
  }

  const env = {
    ATTENDEES_SYNC_SECRET: 'test-only-secret',
    VOTES_DB: createD1Mock(),
    MTF_DATA: {
      get: async key => store.get(key) || null,
      put: async (key, value) => store.set(key, value),
    },
  };

  const unauthorized = await onRequestPost({
    env,
    request: new Request('http://localhost/api/meetup-attendees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendees: [] }),
    }),
  });
  check('Zápis bez tajemství je odmítnutý', unauthorized.status === 401, String(unauthorized.status));

  const syncWithoutD1Store = new Map();
  const syncWithoutD1 = await onRequestPost({
    env: {
      ATTENDEES_SYNC_SECRET: 'test-only-secret',
      MTF_DATA: {
        get: async key => syncWithoutD1Store.get(key) || null,
        put: async (key, value) => syncWithoutD1Store.set(key, value),
      },
    },
    request: new Request('http://localhost/api/meetup-attendees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-attendees-secret': 'test-only-secret' },
      body: JSON.stringify({
        attendees: [{ consent: true, name: 'Účastník pro synchronizaci', bio: 'Bez D1.', attendance: 'official' }],
        registeredCount: 1,
        officialRegisteredCount: 1,
        picnicRegisteredCount: 0,
      }),
    }),
  });
  check('Ověřená synchronizace nezávisí na D1 rate limitu', syncWithoutD1.status === 200, String(syncWithoutD1.status));

  const leakedEmail = await onRequestPost({
    env,
    request: new Request('http://localhost/api/meetup-attendees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-attendees-secret': 'test-only-secret' },
      body: JSON.stringify({ attendees: [{ consent: true, name: 'Účastník A', bio: 'Testovací profil.', attendance: 'official', email: 'never@example.test' }] }),
    }),
  });
  check('Payload s e-mailem je odmítnutý', leakedEmail.status === 400, String(leakedEmail.status));

  const accepted = await onRequestPost({
    env,
    request: new Request('http://localhost/api/meetup-attendees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-attendees-secret': 'test-only-secret' },
      body: JSON.stringify({ attendees: [
        { consent: true, name: '  Účastník A  ', bio: 'Pár vět\n\no testování.', attendance: 'official' },
        { consent: true, name: 'Účastnice B', bio: 'Delší testovací profil.', attendance: 'official_and_picnic' },
        { consent: true, name: 'Účastník C', bio: 'Dorazí jen na piknik.', attendance: 'picnic_only' },
      ], registeredCount: 6, officialRegisteredCount: 6, picnicRegisteredCount: 3 }),
    }),
  });
  check('Platný opt-in seznam včetně účasti jen na pikniku se uloží', accepted.status === 200 && (await accepted.json()).count === 3, String(accepted.status));

  const publicResponse = await onRequestGet({ env, request: new Request('http://localhost/api/meetup-attendees') });
  const publicPayload = await publicResponse.json();
  check('Veřejné API vrátí pouze bezpečná pole', publicPayload.attendees.length === 3 && Object.keys(publicPayload.attendees[0]).sort().join(',') === 'attendance,bio,name');
  check('Veřejné API vrátí kapacitu hlavního programu odděleně', publicPayload.registeredCount === 6 && publicPayload.officialRegisteredCount === 6, JSON.stringify(publicPayload));
  check('Veřejné API vrátí samostatný počet lidí na piknik', publicPayload.picnicRegisteredCount === 3, JSON.stringify(publicPayload));
  check('Veřejné API zachová účast pouze na pikniku', publicPayload.attendees.some(attendee => attendee.attendance === 'picnic_only'));
  check('Veřejná odpověď se neukládá do cache', publicResponse.headers.get('cache-control') === 'no-store');
  check('Uložená data neobsahují e-mail ani souhlas', !JSON.stringify([...store.values()]).includes('email') && !JSON.stringify([...store.values()]).includes('consent'));

  const invalidPicnicCount = await onRequestPost({
    env,
    request: new Request('http://localhost/api/meetup-attendees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-attendees-secret': 'test-only-secret' },
      body: JSON.stringify({ attendees: [], registeredCount: 0, officialRegisteredCount: 0, picnicRegisteredCount: -1 }),
    }),
  });
  check('Neplatný počet piknikových registrací je odmítnutý', invalidPicnicCount.status === 400, String(invalidPicnicCount.status));

  const foreignOriginResponse = await onRequestGet({
    env,
    request: new Request('http://localhost/api/meetup-attendees', { headers: { Origin: 'https://evil.example' } }),
  });
  check('Cizí origin nedostane CORS oprávnění', !foreignOriginResponse.headers.has('access-control-allow-origin'));

  const siteOriginResponse = await onRequestGet({
    env,
    request: new Request('http://localhost/api/meetup-attendees', { headers: { Origin: 'https://master-the-flow-portal.pages.dev' } }),
  });
  check('Produkční origin dostane CORS oprávnění', siteOriginResponse.headers.get('access-control-allow-origin') === 'https://master-the-flow-portal.pages.dev');

  const retiredPartialAttendance = await onRequestPost({
    env,
    request: new Request('http://localhost/api/meetup-attendees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-attendees-secret': 'test-only-secret' },
      body: JSON.stringify({ attendees: [{ consent: true, name: 'Účastník D', bio: 'Test.', attendance: 'partial' }] }),
    }),
  });
  check('Zrušený neurčitý rozsah účasti je odmítnutý', retiredPartialAttendance.status === 400, String(retiredPartialAttendance.status));

  const noConsent = await onRequestPost({
    env,
    request: new Request('http://localhost/api/meetup-attendees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-attendees-secret': 'test-only-secret' },
      body: JSON.stringify({ attendees: [{ consent: false, name: 'Účastník C', bio: 'Test.', attendance: 'uncertain' }] }),
    }),
  });
  check('Záznam bez souhlasu je odmítnutý', noConsent.status === 400, String(noConsent.status));

  const limitedEnv = { ...env, VOTES_DB: createD1Mock() };
  const limitedStatuses = [];
  for (let i = 0; i < 121; i++) {
    const response = await onRequestPost({
      env: limitedEnv,
      request: new Request('http://localhost/api/meetup-attendees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.10',
          'x-attendees-secret': 'wrong-secret',
        },
        body: JSON.stringify({ attendees: [] }),
      }),
    });
    limitedStatuses.push(response.status);
  }
  check('Hádání tajemství je po bezpečné rezervě omezené', limitedStatuses.slice(0, 120).every(status => status === 401) && limitedStatuses[120] === 429, limitedStatuses.join(','));

  console.log(failures === 0 ? '\nAPI ÚČASTNÍKŮ: VŠE PROŠLO' : `\n${failures} TESTŮ API ÚČASTNÍKŮ SELHALO`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
