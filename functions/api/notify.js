// Vapid public: BCub7WYDQt5wX2Jj0HUUMhK-T8VATzn4rvfc108akt7VCh8qGd_rgw6lQRJGKPIAsBDrPHwt7pagUYia1WIyEYY
const VAPID_SUBJECT = 'mailto:daniel@gamrot.cz';
const VAPID_PUB_B64 = 'BCub7WYDQt5wX2Jj0HUUMhK-T8VATzn4rvfc108akt7VCh8qGd_rgw6lQRJGKPIAsBDrPHwt7pagUYia1WIyEYY';

function b64urlEncode(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function b64urlDecode(s) {
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}

async function importVapidPrivate(d, x, y) {
  return crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d, x, y, key_ops: ['sign'] },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

async function createVapidJWT(endpoint, privateKey) {
  const aud = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 86400;
  const enc = s => b64urlEncode(new TextEncoder().encode(JSON.stringify(s)));
  const unsigned = enc({ typ: 'JWT', alg: 'ES256' }) + '.' + enc({ aud, exp, sub: VAPID_SUBJECT });
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(unsigned)
  );
  return unsigned + '.' + b64urlEncode(sig);
}

async function sendPush(sub, privateKey) {
  const jwt = await createVapidJWT(sub.endpoint, privateKey);
  const auth = `vapid t=${jwt},k=${VAPID_PUB_B64}`;
  const resp = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: auth,
      TTL: '86400',
      'Content-Length': '0',
    },
    body: null,
  });
  return resp.status;
}

export async function onRequestPost({ request, env }) {
  const secret = request.headers.get('x-notify-secret');
  if (!env.NOTIFY_SECRET || secret !== env.NOTIFY_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const pubBytes = b64urlDecode(VAPID_PUB_B64);
  const x = b64urlEncode(pubBytes.slice(1, 33));
  const y = b64urlEncode(pubBytes.slice(33, 65));
  const d = env.VAPID_PRIVATE;
  if (!d) return new Response('VAPID_PRIVATE not set', { status: 500 });

  const privateKey = await importVapidPrivate(d, x, y);

  const list = await env.MTF_DATA.list({ prefix: 'sub_' });
  let sent = 0, failed = 0;

  await Promise.all(list.keys.map(async ({ name }) => {
    try {
      const raw = await env.MTF_DATA.get(name);
      if (!raw) return;
      const sub = JSON.parse(raw);
      const status = await sendPush(sub, privateKey);
      if (status === 410 || status === 404) {
        await env.MTF_DATA.delete(name);
        failed++;
      } else {
        sent++;
      }
    } catch { failed++; }
  }));

  return Response.json({ sent, failed, total: list.keys.length });
}
