import { rateLimit, ipKey } from './_ratelimit.js';

const SITE_ORIGIN = 'https://master-the-flow-portal.pages.dev';
const SECRET_HEADER = 'x-attendees-secret';
const KV_KEY = 'event:2026-09-22:registration-count';
const MAX_REGISTERED_COUNT = 10000;
const SYNC_RATE_LIMIT_PER_HOUR = 120;

function corsHeaders(origin, methods = 'GET, OPTIONS') {
  const allowed = origin && (origin === SITE_ORIGIN || /^http:\/\/localhost(:\d+)?$/.test(origin));
  const headers = {
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': `Content-Type, ${SECRET_HEADER}`,
    'Vary': 'Origin',
  };
  if (allowed) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function responseHeaders(origin) {
  return { ...corsHeaders(origin), 'Cache-Control': 'no-store' };
}

async function timingSafeEqual(a, b) {
  const encoder = new TextEncoder();
  const [first, second] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const firstBytes = new Uint8Array(first);
  const secondBytes = new Uint8Array(second);
  let diff = 0;
  for (let index = 0; index < firstBytes.length; index++) diff |= firstBytes[index] ^ secondBytes[index];
  return diff === 0;
}

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_REGISTERED_COUNT;
}

function json(data, init = {}) {
  return Response.json(data, init);
}

export async function onRequestOptions({ request }) {
  return new Response(null, {
    headers: corsHeaders(request.headers.get('Origin'), 'GET, POST, OPTIONS'),
  });
}

export async function onRequestGet({ request, env }) {
  const headers = responseHeaders(request.headers.get('Origin'));
  if (!env.MTF_DATA) return json({ registeredCount: null }, { headers });

  try {
    const raw = await env.MTF_DATA.get(KV_KEY);
    const stored = raw ? JSON.parse(raw) : null;
    if (!stored || !isCount(stored.registeredCount)) {
      return json({ registeredCount: null }, { headers });
    }
    return json({
      registeredCount: stored.registeredCount,
      updatedAt: typeof stored.updatedAt === 'string' ? stored.updatedAt : undefined,
    }, { headers });
  } catch {
    return json({ registeredCount: null }, { headers });
  }
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  const headers = responseHeaders(origin);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const providedSecret = request.headers.get(SECRET_HEADER);

  if (!providedSecret || !env.SHOW_AND_TELL_SYNC_SECRET || !await timingSafeEqual(providedSecret, env.SHOW_AND_TELL_SYNC_SECRET)) {
    if (await rateLimit(env, 'show-tell-count-sync:' + ipKey(ip), SYNC_RATE_LIMIT_PER_HOUR, 3600)) {
      return new Response('Too Many Requests', { status: 429, headers });
    }
    return new Response('Unauthorized', { status: 401, headers });
  }
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return json({ error: 'Bad Request' }, { status: 400, headers });
  }
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 256) return json({ error: 'Payload too large' }, { status: 413, headers });
  if (!env.MTF_DATA) return json({ error: 'Storage unavailable' }, { status: 503, headers });

  try {
    const payload = await request.json();
    const keys = payload && typeof payload === 'object' && !Array.isArray(payload) ? Object.keys(payload) : [];
    if (keys.length !== 1 || keys[0] !== 'registeredCount' || !isCount(payload.registeredCount)) {
      return json({ error: 'Invalid registration count' }, { status: 400, headers });
    }
    const stored = { registeredCount: payload.registeredCount, updatedAt: new Date().toISOString() };
    await env.MTF_DATA.put(KV_KEY, JSON.stringify(stored));
    return json(stored, { headers });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: 'Bad Request' }, { status: 400, headers });
    return json({ error: 'Internal error' }, { status: 500, headers });
  }
}
