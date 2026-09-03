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
  const source = fs.readFileSync(path.join(__dirname, '..', 'functions', 'api', 'show-and-tell-registrations.js'), 'utf8')
    .replace("'./_ratelimit.js'", `'${rateLimitModuleUrl}'`);
  const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  const { onRequestGet, onRequestPost } = await import(moduleUrl);
  const store = new Map();
  const counters = new Map();
  const env = {
    SHOW_AND_TELL_SYNC_SECRET: 'test-only-secret',
    VOTES_DB: {
      prepare: () => ({
        bindings: [],
        bind(...values) { this.bindings = values; return this; },
        async run() { return { success: true }; },
        async first() {
          const [key, expires, now] = this.bindings;
          const previous = counters.get(key);
          const count = !previous || previous.expires <= now ? 1 : previous.count + 1;
          counters.set(key, { count, expires: !previous || previous.expires <= now ? expires : previous.expires });
          return { count };
        },
      }),
    },
    MTF_DATA: {
      get: async key => store.get(key) || null,
      put: async (key, value) => store.set(key, value),
    },
  };

  const empty = await onRequestGet({ env, request: new Request('http://localhost/api/show-and-tell-registrations') });
  check('Chybějící synchronizace se nevydává za nula registrací', (await empty.json()).registeredCount === null);
  check('Veřejná odpověď se neukládá do cache', empty.headers.get('cache-control') === 'no-store');

  const unauthorized = await onRequestPost({
    env,
    request: new Request('http://localhost/api/show-and-tell-registrations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"registeredCount":3}',
    }),
  });
  check('Zápis bez tajemství je odmítnutý', unauthorized.status === 401, String(unauthorized.status));

  const leakedEmail = await onRequestPost({
    env,
    request: new Request('http://localhost/api/show-and-tell-registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-attendees-secret': 'test-only-secret' },
      body: JSON.stringify({ registeredCount: 3, email: 'never@example.test' }),
    }),
  });
  check('API odmítne i platný počet doplněný o e-mail', leakedEmail.status === 400, String(leakedEmail.status));

  const accepted = await onRequestPost({
    env,
    request: new Request('http://localhost/api/show-and-tell-registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-attendees-secret': 'test-only-secret' },
      body: JSON.stringify({ registeredCount: 7 }),
    }),
  });
  const acceptedPayload = await accepted.json();
  check('Platný anonymní počet se uloží', accepted.status === 200 && acceptedPayload.registeredCount === 7, JSON.stringify(acceptedPayload));
  check('KV obsahuje pouze počet a serverový čas', [...store.values()].every(value => {
    const parsed = JSON.parse(value);
    return Object.keys(parsed).sort().join(',') === 'registeredCount,updatedAt';
  }));

  const publicResponse = await onRequestGet({ env, request: new Request('http://localhost/api/show-and-tell-registrations') });
  const publicPayload = await publicResponse.json();
  check('Veřejné API vrací pouze anonymní agregát', publicPayload.registeredCount === 7
    && Object.keys(publicPayload).sort().join(',') === 'registeredCount,updatedAt', JSON.stringify(publicPayload));

  const foreignOrigin = await onRequestGet({ env, request: new Request('http://localhost/api/show-and-tell-registrations', {
    headers: { Origin: 'https://evil.example' },
  }) });
  check('Cizí origin nedostane CORS oprávnění', !foreignOrigin.headers.has('access-control-allow-origin'));

  console.log(failures === 0 ? '\nSHOW & TELL COUNT API: VŠE PROŠLO' : `\n${failures} TESTŮ API SELHALO`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
