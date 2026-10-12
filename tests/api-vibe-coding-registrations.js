const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

(async () => {
  const root = path.join(__dirname, '..');
  const rate = 'data:text/javascript;base64,' + Buffer.from(fs.readFileSync(path.join(root, 'functions/api/_ratelimit.js'))).toString('base64');
  const source = fs.readFileSync(path.join(root, 'functions/api/vibe-coding-registrations.js'), 'utf8').replace("'./_ratelimit.js'", JSON.stringify(rate));
  const { onRequestGet: get, onRequestPost: post } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  let stored = null;
  const env = { VIBE_CODING_SYNC_SECRET: 'fixture-secret', VOTES_DB: {
    prepare: () => ({ bind() { return this; }, run: async () => ({}), first: async () => ({ count: 1 }) }),
  }, MTF_DATA: {
    get: async () => stored,
    put: async (key, value) => { assert.equal(key, 'event:2026-10-21:registration-count'); stored = value; },
  } };
  const send = (body, secret = 'fixture-secret') => post({ env, request: new Request('https://example.test/api/vibe-coding-registrations', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-attendees-secret': secret }, body,
  }) });
  const payload = () => get({ env }).then(response => response.json());
  assert.equal((await payload()).registeredCount, null);
  assert.equal((await get({ env })).headers.get('cache-control'), 'no-store');
  assert.equal((await send('{"registeredCount":3}', 'wrong')).status, 401);
  for (const value of [-1, 1.1, '5', null, 10001]) assert.equal((await send(JSON.stringify({ registeredCount: value }))).status, 400);
  assert.equal((await send('{"registeredCount":3,"email":"private@example.test"}')).status, 400);
  assert.equal((await send('x'.repeat(129))).status, 413);
  assert.equal((await send('{')).status, 400);
  for (const count of [0, 1, 94, 97, 98, 101]) {
    assert.equal((await send(JSON.stringify({ registeredCount: count }))).status, 200);
    const result = await payload();
    assert.equal(result.registeredCount, count);
    assert.equal(result.remaining, Math.max(0, 98 - count));
    assert.equal(result.capacity, 98);
    assert.deepEqual(Object.keys(JSON.parse(stored)).sort(), ['registeredCount', 'updatedAt']);
    assert.deepEqual(Object.keys(result).sort(), ['capacity', 'registeredCount', 'remaining', 'updatedAt']);
  }
  for (const updatedAt of [new Date(Date.now() - 16 * 60000).toISOString(), 'bad-date', new Date(Date.now() + 120000).toISOString()]) {
    stored = JSON.stringify({ registeredCount: 42, updatedAt });
    assert.equal((await payload()).remaining, null);
  }
  stored = '{bad'; assert.equal((await payload()).registeredCount, null);
  assert.equal((await get({ env: {} }).then(response => response.json())).registeredCount, null);
  console.log('PASS: ochrana zápisu, allowlist, limity, deduplikovaný snapshot, kapacita a čerstvost API');
})().catch(error => { console.error(error); process.exit(1); });
