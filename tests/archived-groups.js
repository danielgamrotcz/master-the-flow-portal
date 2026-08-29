const BASE = process.env.MTF_BASE || 'http://localhost:8788';

let failures = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`✓ ${label}`);
    return;
  }
  failures++;
  console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

async function verifyRetiredRoute(path, init) {
  const response = await fetch(`${BASE}${path}`, init);
  const body = await response.text();
  check(`${init?.method || 'GET'} ${path} vrací 410`, response.status === 410, `HTTP ${response.status}`);
  check(`${path} se neukládá do cache`, /(?:^|,)\s*no-store(?:,|$)/i.test(response.headers.get('cache-control') || ''), response.headers.get('cache-control') || 'hlavička chybí');
  check(`${path} nevrací historický obsah`, body === '', `${body.length} znaků`);
}

await verifyRetiredRoute('/skupinky');
await verifyRetiredRoute('/skupinky/');
await verifyRetiredRoute('/skupinky/admin/');
await verifyRetiredRoute('/api/groups');
await verifyRetiredRoute('/api/groups/');
await verifyRetiredRoute('/api/groups', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ nickname: 'archivní kontrola', score: 10 }),
});

process.exitCode = failures ? 1 : 0;
