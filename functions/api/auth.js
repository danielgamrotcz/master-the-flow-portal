import { rateLimit, rateLimitPeek, ipKey } from './_ratelimit.js';
import { generateToken, gateCookie, TOKEN_TTL_MS } from '../_token.js';
const SITE_ORIGIN = 'https://master-the-flow-portal.pages.dev';

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

export async function onRequestOptions({ request }) {
  const origin = request.headers.get('Origin');
  return new Response(null, { headers: corsHeaders(origin) });
}

// 10 NEÚSPĚŠNÝCH pokusů na 15 minut. Atomicky přes D1 — KV tenhle limit pod
// souběhem vůbec nezapojilo (audit 27. 7. 2026).
//
// Počítají se jen neúspěchy. Když se počítala i úspěšná přihlášení, narazila
// na strop běžná situace, kdy se z jedné sítě přihlásí víc lidí za sebou
// (a spolehlivě i vlastní testovací sada, která se hlásí devětkrát).
const AUTH_LIMIT = 10, AUTH_WINDOW = 900;
const authKey = ip => 'auth:' + ipKey(ip);

async function isLockedOut(env, ip) {
  return rateLimitPeek(env, authKey(ip), AUTH_LIMIT);
}

async function noteFailedAttempt(env, ip) {
  return rateLimit(env, authKey(ip), AUTH_LIMIT, AUTH_WINDOW);
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
  const blocked = await isLockedOut(env, ip);
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
      await noteFailedAttempt(env, ip);
      return Response.json({ ok: false }, { status: 401, headers });
    }

    const token = await generateToken(env.GATE_CODE, env);
    const expires = Date.now() + TOKEN_TTL_MS;

    // Token jde ven dvakrát: v těle pro localStorage (hlavička u API volání)
    // a v cookie pro datové soubory, které načítá i service worker.
    return Response.json({ ok: true, token, expires }, {
      headers: {
        ...headers,
        'Cache-Control': 'no-store',
        'Set-Cookie': gateCookie(request, token),
      },
    });
  } catch {
    return Response.json({ error: 'Internal error' }, { status: 500, headers });
  }
}
