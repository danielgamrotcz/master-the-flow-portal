const SITE_ORIGIN = 'https://master-the-flow-portal.pages.dev';
const SUB_RATE_LIMIT = 5; // max subscriptions per IP per hour

async function checkSubRateLimit(env, ip) {
  if (!env.MTF_DATA) return false;
  const key = 'ratelimit:sub:' + ip;
  const raw = await env.MTF_DATA.get(key);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= SUB_RATE_LIMIT) return true;
  await env.MTF_DATA.put(key, String(count + 1), { expirationTtl: 3600 });
  return false;
}

function corsHeaders(origin) {
  const allowed = !origin || origin === SITE_ORIGIN || origin.startsWith('http://localhost');
  return {
    'Access-Control-Allow-Origin': allowed ? (origin || '*') : 'null',
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function isValidSubscription(sub) {
  if (!sub || typeof sub !== 'object') return false;
  if (typeof sub.endpoint !== 'string') return false;
  if (sub.endpoint.length > 512) return false;
  try { new URL(sub.endpoint); } catch { return false; }
  if (!sub.keys || typeof sub.keys !== 'object') return false;
  if (typeof sub.keys.auth !== 'string' || sub.keys.auth.length > 64) return false;
  if (typeof sub.keys.p256dh !== 'string' || sub.keys.p256dh.length > 128) return false;
  return true;
}

export async function onRequestOptions({ request }) {
  const origin = request.headers.get('Origin');
  return new Response(null, { headers: corsHeaders(origin) });
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  const headers = corsHeaders(origin);

  if (!request.headers.get('content-type')?.includes('application/json')) {
    return new Response('Bad Request', { status: 400, headers });
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const blocked = await checkSubRateLimit(env, ip);
  if (blocked) {
    return new Response('Too Many Requests', { status: 429, headers });
  }

  try {
    const sub = await request.json();
    if (!isValidSubscription(sub)) return new Response('Bad request', { status: 400, headers });
    // Store only the fields we need — never store arbitrary data
    const clean = { endpoint: sub.endpoint, keys: { auth: sub.keys.auth, p256dh: sub.keys.p256dh } };
    const key = 'sub_' + btoa(sub.endpoint).replace(/[^a-zA-Z0-9]/g, '').slice(0, 48);
    await env.MTF_DATA.put(key, JSON.stringify(clean), { expirationTtl: 60 * 86400 });
    return new Response('OK', { headers });
  } catch {
    return new Response('Error', { status: 500, headers });
  }
}

export async function onRequestDelete({ request, env }) {
  const origin = request.headers.get('Origin');
  const headers = corsHeaders(origin);
  try {
    const sub = await request.json();
    if (!sub?.endpoint || typeof sub.endpoint !== 'string') {
      return new Response('Bad request', { status: 400, headers });
    }
    const key = 'sub_' + btoa(sub.endpoint).replace(/[^a-zA-Z0-9]/g, '').slice(0, 48);
    await env.MTF_DATA.delete(key);
    return new Response('OK', { headers });
  } catch {
    return new Response('Error', { status: 500, headers });
  }
}
