const SITE_ORIGIN = 'https://master-the-flow-portal.pages.dev';
const SUB_RATE_LIMIT = 5; // max subscriptions per IP per hour
const SUB_GLOBAL_CAP = 500; // hard cap on total stored subscriptions
const PUSH_ENDPOINT_RE = /\.(googleapis\.com|mozilla\.com|windows\.com|apple\.com|w3\.org)$/;

async function endpointHash(endpoint) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 48);
}

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
  const allowed = origin && (origin === SITE_ORIGIN || /^http:\/\/localhost(:\d+)?$/.test(origin));
  const headers = {
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
  if (allowed) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function isValidSubscription(sub) {
  if (!sub || typeof sub !== 'object') return false;
  if (typeof sub.endpoint !== 'string') return false;
  if (sub.endpoint.length > 512) return false;
  try {
    const u = new URL(sub.endpoint);
    if (u.protocol !== 'https:') return false;
    if (!PUSH_ENDPOINT_RE.test(u.hostname)) return false;
  } catch { return false; }
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

    const clean = { endpoint: sub.endpoint, keys: { auth: sub.keys.auth, p256dh: sub.keys.p256dh } };
    const hash = await endpointHash(sub.endpoint);
    const key = 'sub_' + hash;

    // Global cap — prevent subscription flood. Re-POST existujícího odběru
    // (denní TTL obnova z klienta) cap neblokuje, jen přepisuje vlastní klíč.
    const already = await env.MTF_DATA.get(key);
    if (!already) {
      const existing = await env.MTF_DATA.list({ prefix: 'sub_', limit: SUB_GLOBAL_CAP + 1 });
      if (existing.keys.length >= SUB_GLOBAL_CAP) {
        return new Response('Service unavailable', { status: 503, headers });
      }
    }

    await env.MTF_DATA.put(key, JSON.stringify(clean), { expirationTtl: 60 * 86400 });
    return new Response('OK', { headers });
  } catch (e) {
    if (e instanceof SyntaxError) return new Response('Bad Request', { status: 400, headers });
    return new Response('Error', { status: 500, headers });
  }
}

export async function onRequestDelete({ request, env }) {
  const origin = request.headers.get('Origin');
  const headers = corsHeaders(origin);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (await checkSubRateLimit(env, ip)) {
    return new Response('Too Many Requests', { status: 429, headers });
  }
  try {
    const sub = await request.json();
    if (!sub?.endpoint || typeof sub.endpoint !== 'string') {
      return new Response('Bad request', { status: 400, headers });
    }
    const hash = await endpointHash(sub.endpoint);
    const key = 'sub_' + hash;
    await env.MTF_DATA.delete(key);
    return new Response('OK', { headers });
  } catch (e) {
    if (e instanceof SyntaxError) return new Response('Bad Request', { status: 400, headers });
    return new Response('Error', { status: 500, headers });
  }
}
