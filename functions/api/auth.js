const SITE_ORIGIN = 'https://master-the-flow-portal.pages.dev';
// 90 dní: kratší TTL nutilo členy přepisovat kód z WhatsAppu každý měsíc,
// což je největší tření vstupu (audit 2026-07-17, gate jako díra ve funnelu).
const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function corsHeaders(origin) {
  const allowed = origin && (origin === SITE_ORIGIN || /^http:\/\/localhost(:\d+)?$/.test(origin));
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
  if (allowed) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

async function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const ba = new Uint8Array(ha), bb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < 32; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
}

async function generateToken(secret, env) {
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = Array.from(nonceBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const payload = Date.now() + ':' + nonce;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  if (env?.MTF_DATA) {
    await env.MTF_DATA.put('token:' + nonce, '1', { expirationTtl: 90 * 86400 });
  }
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

    const valid = await timingSafeEqual(code.trim().toUpperCase(), env.GATE_CODE.trim().toUpperCase());

    if (!valid) {
      return Response.json({ ok: false }, { status: 401, headers });
    }

    const token = await generateToken(env.GATE_CODE, env);
    const expires = Date.now() + TOKEN_TTL_MS;

    return Response.json({ ok: true, token, expires }, {
      headers: { ...headers, 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json({ error: 'Internal error' }, { status: 500, headers });
  }
}
