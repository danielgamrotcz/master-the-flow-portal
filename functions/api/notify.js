// VAPID public key is defined client-side in app.js — server derives it from the VAPID_PRIVATE JWK.

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

async function createVapidJWT(endpoint, subject, privateKey) {
  const aud = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 86400;
  const enc = s => b64urlEncode(new TextEncoder().encode(JSON.stringify(s)));
  const unsigned = enc({ typ: 'JWT', alg: 'ES256' }) + '.' + enc({ aud, exp, sub: subject });
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(unsigned)
  );
  return unsigned + '.' + b64urlEncode(sig);
}

async function sendPush(sub, privateKey, vapidPub, subject) {
  const jwt = await createVapidJWT(sub.endpoint, subject, privateKey);
  const auth = `vapid t=${jwt},k=${vapidPub}`;
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

  const vapidPub = env.VAPID_PUBLIC;
  const vapidSubject = env.VAPID_SUBJECT;
  if (!vapidPub || !vapidSubject) return new Response('VAPID env not set', { status: 500 });

  const pubBytes = b64urlDecode(vapidPub);
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
      const status = await sendPush(sub, privateKey, vapidPub, vapidSubject);
      if (status === 410 || status === 404) {
        // Odběr zanikl — smazat.
        await env.MTF_DATA.delete(name);
        failed++;
      } else if (status >= 200 && status < 300) {
        sent++;
      } else {
        // 403 (špatný VAPID), 400 atd. — neúspěch, odběr ale nemazat.
        failed++;
      }
    } catch { failed++; }
  }));

  return Response.json({ sent, failed, total: list.keys.length });
}
