const fs = require('fs');
const path = require('path');

let failures = 0;
function check(name, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : '  <-- ' + detail}`);
  if (!condition) failures++;
}

(async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'functions', 'api', 'meetup-attendees.js'), 'utf8');
  const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  const { onRequestGet, onRequestPost } = await import(moduleUrl);
  const store = new Map();
  const env = {
    ATTENDEES_SYNC_SECRET: 'test-only-secret',
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
      ] }),
    }),
  });
  check('Platný opt-in seznam se uloží', accepted.status === 200 && (await accepted.json()).count === 2, String(accepted.status));

  const publicResponse = await onRequestGet({ env, request: new Request('http://localhost/api/meetup-attendees') });
  const publicPayload = await publicResponse.json();
  check('Veřejné API vrátí pouze bezpečná pole', publicPayload.attendees.length === 2 && Object.keys(publicPayload.attendees[0]).sort().join(',') === 'attendance,bio,name');
  check('Veřejná odpověď se neukládá do cache', publicResponse.headers.get('cache-control') === 'no-store');
  check('Uložená data neobsahují e-mail ani souhlas', !JSON.stringify([...store.values()]).includes('email') && !JSON.stringify([...store.values()]).includes('consent'));

  const noConsent = await onRequestPost({
    env,
    request: new Request('http://localhost/api/meetup-attendees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-attendees-secret': 'test-only-secret' },
      body: JSON.stringify({ attendees: [{ consent: false, name: 'Účastník C', bio: 'Test.', attendance: 'uncertain' }] }),
    }),
  });
  check('Záznam bez souhlasu je odmítnutý', noConsent.status === 400, String(noConsent.status));

  console.log(failures === 0 ? '\nAPI ÚČASTNÍKŮ: VŠE PROŠLO' : `\n${failures} TESTŮ API ÚČASTNÍKŮ SELHALO`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
