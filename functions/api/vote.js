const SITE_ORIGIN = 'https://master-the-flow-portal.pages.dev';
const VOTE_ID_RE = /^[a-zA-Z0-9_-]{1,80}$/;
const RESERVED_PREFIXES = ['analytics', 'sub_', 'community_', 'voted_', 'vote_'];

async function checkVoteRateLimit(env, ip) {
  if (!env.MTF_DATA) return false;
  const key = 'ratelimit:vote:' + ip;
  const raw = await env.MTF_DATA.get(key);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= 20) return true; // max 20 vote actions per 60s per IP
  await env.MTF_DATA.put(key, String(count + 1), { expirationTtl: 60 });
  return false;
}

function isSafeVoteId(id) {
  if (!VOTE_ID_RE.test(id)) return false;
  return !RESERVED_PREFIXES.some(p => id.startsWith(p));
}
const DEDUP_TTL = 30 * 24 * 3600; // 30 days

function corsHeaders(origin, methods = 'GET, OPTIONS') {
  const allowed = origin && (origin === SITE_ORIGIN || /^http:\/\/localhost(:\d+)?$/.test(origin));
  const headers = {
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type, x-mtf-token',
    'Vary': 'Origin',
  };
  if (allowed) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

async function ipHash(ip, id) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(ip + ':' + id)
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

export async function onRequestOptions({ request }) {
  const origin = request.headers.get('Origin');
  return new Response(null, { headers: corsHeaders(origin, 'GET, POST, DELETE, OPTIONS') });
}

export async function onRequestGet({ request, env }) {
  const origin = request.headers.get('Origin');
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !isSafeVoteId(id)) {
    return Response.json({ error: 'invalid id' }, { status: 400, headers: corsHeaders(origin) });
  }
  try {
    const raw = await env.MTF_DATA.get('vote_' + id);
    const count = raw ? parseInt(raw, 10) : 0;
    return Response.json({ id, count }, { headers: corsHeaders(origin) });
  } catch {
    return Response.json({ id, count: 0 }, { headers: corsHeaders(origin) });
  }
}

export async function onRequestDelete({ request, env }) {
  const origin = request.headers.get('Origin');
  const headers = corsHeaders(origin, 'GET, POST, DELETE, OPTIONS');

  if (!request.headers.get('content-type')?.includes('application/json')) {
    return Response.json({ error: 'Bad Request' }, { status: 400, headers });
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (await checkVoteRateLimit(env, ip)) {
    return Response.json({ error: 'Too Many Requests' }, { status: 429, headers });
  }

  try {
    const { id } = await request.json();
    if (!id || !isSafeVoteId(id)) {
      return Response.json({ error: 'invalid id' }, { status: 400, headers });
    }

    const dedupKey = 'voted_' + await ipHash(ip, id);
    const alreadyVoted = await env.MTF_DATA.get(dedupKey);
    if (!alreadyVoted) {
      const raw = await env.MTF_DATA.get('vote_' + id);
      return Response.json({ id, count: raw ? parseInt(raw, 10) : 0 }, { status: 409, headers });
    }

    const voteKey = 'vote_' + id;
    const raw = await env.MTF_DATA.get(voteKey);
    const count = Math.max(0, (raw ? parseInt(raw, 10) : 0) - 1);
    await Promise.all([
      env.MTF_DATA.put(voteKey, String(count)),
      env.MTF_DATA.delete(dedupKey),
    ]);
    return Response.json({ id, count }, { headers });
  } catch {
    return Response.json({ error: 'Internal error' }, { status: 500, headers });
  }
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  const headers = corsHeaders(origin, 'GET, POST, OPTIONS');

  if (!request.headers.get('content-type')?.includes('application/json')) {
    return Response.json({ error: 'Bad Request' }, { status: 400, headers });
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (await checkVoteRateLimit(env, ip)) {
    return Response.json({ error: 'Too Many Requests' }, { status: 429, headers });
  }

  try {
    const { id } = await request.json();
    if (!id || !isSafeVoteId(id)) {
      return Response.json({ error: 'invalid id' }, { status: 400, headers });
    }

    // Server-side dedup: one vote per IP per card per 30 days
    const dedupKey = 'voted_' + await ipHash(ip, id);
    const alreadyVoted = await env.MTF_DATA.get(dedupKey);
    if (alreadyVoted) {
      const raw = await env.MTF_DATA.get('vote_' + id);
      const count = raw ? parseInt(raw, 10) : 0;
      return Response.json({ id, count, duplicate: true }, { headers });
    }

    const voteKey = 'vote_' + id;
    const raw = await env.MTF_DATA.get(voteKey);
    const count = (raw ? parseInt(raw, 10) : 0) + 1;
    await Promise.all([
      env.MTF_DATA.put(voteKey, String(count)),
      env.MTF_DATA.put(dedupKey, '1', { expirationTtl: DEDUP_TTL }),
    ]);
    return Response.json({ id, count }, { headers });
  } catch {
    return Response.json({ error: 'Internal error' }, { status: 500, headers });
  }
}
