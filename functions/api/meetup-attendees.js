import { rateLimit, ipKey } from './_ratelimit.js';

const SITE_ORIGIN = 'https://master-the-flow-portal.pages.dev';
const SECRET_HEADER = 'x-attendees-secret';
const KV_KEY = 'event:2026-08-29:public-attendees';
const MAX_ATTENDEES = 200;
const MAX_NAME_LENGTH = 100;
const MAX_BIO_LENGTH = 1200;
const STORE_TTL_SECONDS = 60 * 24 * 60 * 60;
const SYNC_RATE_LIMIT_PER_HOUR = 120;
const ATTENDANCE_TYPES = new Set(['official', 'official_and_picnic', 'picnic_only', 'uncertain']);

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
  return {
    ...corsHeaders(origin),
    'Cache-Control': 'no-store',
  };
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
  for (let i = 0; i < firstBytes.length; i++) diff |= firstBytes[i] ^ secondBytes[i];
  return diff === 0;
}

function cleanInline(value, maxLength) {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean || clean.length > maxLength) return null;
  return clean;
}

function cleanBio(value) {
  if (typeof value !== 'string') return null;
  const clean = value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!clean || clean.length > MAX_BIO_LENGTH) return null;
  return clean;
}

function sanitizeAttendee(value, requireConsent = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if ('email' in value || 'e-mail' in value) return null;
  if (requireConsent && value.consent !== true) return null;
  const name = cleanInline(value.name, MAX_NAME_LENGTH);
  const bio = cleanBio(value.bio);
  const attendance = typeof value.attendance === 'string' ? value.attendance : '';
  if (!name || !bio || !ATTENDANCE_TYPES.has(attendance)) return null;
  return { name, bio, attendance };
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
  if (!env.MTF_DATA) return json({ attendees: [] }, { headers });
  try {
    const raw = await env.MTF_DATA.get(KV_KEY);
    const stored = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(stored)) return json({ attendees: [] }, { headers });
    const attendees = stored
      .slice(0, MAX_ATTENDEES)
      .map(value => sanitizeAttendee(value))
      .filter(Boolean);
    return json({ attendees }, { headers });
  } catch {
    return json({ attendees: [] }, { headers });
  }
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  const headers = { ...corsHeaders(origin, 'GET, POST, OPTIONS'), 'Cache-Control': 'no-store' };
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const providedSecret = request.headers.get(SECRET_HEADER);
  if (!providedSecret || !env.ATTENDEES_SYNC_SECRET || !await timingSafeEqual(providedSecret, env.ATTENDEES_SYNC_SECRET)) {
    // Limit je potřeba pro hádání tajemství, ale nesmí být závislostí úspěšné
    // registrace: legitimní synchronizace už tajemstvím prokázala oprávnění.
    if (await rateLimit(env, 'attendees-sync:' + ipKey(ip), SYNC_RATE_LIMIT_PER_HOUR, 3600)) {
      return new Response('Too Many Requests', { status: 429, headers });
    }
    return new Response('Unauthorized', { status: 401, headers });
  }
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return json({ error: 'Bad Request' }, { status: 400, headers });
  }
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 128000) return json({ error: 'Payload too large' }, { status: 413, headers });
  if (!env.MTF_DATA) return json({ error: 'Storage unavailable' }, { status: 503, headers });

  try {
    const payload = await request.json();
    if (!payload || !Array.isArray(payload.attendees) || payload.attendees.length > MAX_ATTENDEES) {
      return json({ error: 'Invalid attendees' }, { status: 400, headers });
    }
    const attendees = payload.attendees.map(value => sanitizeAttendee(value, true));
    if (attendees.some(value => !value)) {
      return json({ error: 'Invalid attendee' }, { status: 400, headers });
    }
    await env.MTF_DATA.put(KV_KEY, JSON.stringify(attendees), { expirationTtl: STORE_TTL_SECONDS });
    return json({ count: attendees.length }, { headers });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: 'Bad Request' }, { status: 400, headers });
    return json({ error: 'Internal error' }, { status: 500, headers });
  }
}
