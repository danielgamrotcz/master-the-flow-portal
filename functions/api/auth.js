const SITE_ORIGIN = 'https://master-the-flow-portal.pages.dev';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function corsHeaders(origin) {
  const allowed = origin && (origin === SITE_ORIGIN || origin.startsWith('http://localhost'));
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

async function generateToken(secret) {
  const payload = Date.now() + ':' + Math.random().toString(36).slice(2);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return payload + ':' + sigHex;
}

export async function onRequestOptions({ request }) {
  const origin = request.headers.get('Origin');
  return new Response(null, { headers: corsHeaders(origin) });
}

async function checkRateLimit(env, ip) {
  if (!env.MTF_DATA) return false;
  const key = 'ratelimit:auth:' + ip;
  const raw = await env.MTF_DATA.get(key);
  const attempts = raw ? parseInt(raw, 10) : 0;
  if (attempts >= 10) return true; // 10 attempts per 15 min window
  await env.MTF_DATA.put(key, String(attempts + 1), { expirationTtl: 900 });
  return false;
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  const headers = corsHeaders(origin);

  if (!env.GATE_CODE) {
    return Response.json({ error: 'Server misconfigured' }, { status: 500, headers });
  }

  if (!request.headers.get('content-type')?.includes('application/json')) {
    return Response.json({ error: 'Bad Request' }, { status: 400, headers });
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const blocked = await checkRateLimit(env, ip);
  if (blocked) {
    return Response.json({ ok: false, error: 'Too many attempts' }, { status: 429, headers });
  }

  try {
    const { code } = await request.json();
    if (!code || typeof code !== 'string' || code.length > 40) {
      return Response.json({ ok: false }, { status: 401, headers });
    }

    const provided = code.trim().toUpperCase();
    const valid = env.GATE_CODE.trim().toUpperCase() === provided;

    if (!valid) {
      return Response.json({ ok: false }, { status: 401, headers });
    }

    const token = await generateToken(env.GATE_CODE);
    const expires = Date.now() + TOKEN_TTL_MS;

    return Response.json({ ok: true, token, expires }, {
      headers: { ...headers, 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json({ error: 'Internal error' }, { status: 500, headers });
  }
}
