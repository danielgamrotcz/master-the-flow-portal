const SITE_ORIGIN = 'https://master-the-flow-portal.pages.dev';
const VOTE_ID_RE = /^[a-zA-Z0-9_-]{1,80}$/;
const RESERVED_PREFIXES = ['analytics', 'sub_', 'community_', 'voted_', 'vote_', 'v:'];
const CID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

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

// Hlas dedupujeme per zařízení (client ID z prohlížeče), ne per IP — sdílený
// NAT (firma, domácnost) by jinak sloučil víc lidí do jednoho hlasu. IP slouží
// jen na rate-limit. Fallback na IP, když klient ID nepošle (starší verze).
function voterKey(cid, ip) {
  return (typeof cid === 'string' && CID_RE.test(cid)) ? 'c:' + cid : 'i:' + ip;
}

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

async function dedupHash(voter, id) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(voter + ':' + id)
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

// Klíč jednoho hlasu: v:<karta>:<hash voliče>. Počet hlasů = počet těchto klíčů.
// Žádné měnitelné počítadlo → žádný read-modify-write race na KV (KV je
// eventually consistent, sdílené počítadlo by ztrácelo souběžné hlasy).
function voteKey(id, voterHash) {
  return 'v:' + id + ':' + voterHash;
}

// Spočítá hlasy karty vylistováním klíčů s prefixem v:<karta>: (s kurzorem).
async function countVotes(env, id) {
  let count = 0;
  let cursor;
  do {
    const res = await env.MTF_DATA.list({ prefix: 'v:' + id + ':', cursor, limit: 1000 });
    count += res.keys.length;
    cursor = res.list_complete ? null : res.cursor;
  } while (cursor);
  return count;
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
    const count = await countVotes(env, id);
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
    const { id, cid } = await request.json();
    if (!id || !isSafeVoteId(id)) {
      return Response.json({ error: 'invalid id' }, { status: 400, headers });
    }
    const key = voteKey(id, await dedupHash(voterKey(cid, ip), id));
    await env.MTF_DATA.delete(key);  // idempotentní
    const count = await countVotes(env, id);
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
    const { id, cid } = await request.json();
    if (!id || !isSafeVoteId(id)) {
      return Response.json({ error: 'invalid id' }, { status: 400, headers });
    }
    // Jeden hlas = jeden klíč. Idempotentní zápis (opakovaný hlas téhož voliče
    // jen přepíše vlastní klíč, počet se nemění). Dedup je v samotném klíči.
    const key = voteKey(id, await dedupHash(voterKey(cid, ip), id));
    await env.MTF_DATA.put(key, '1');
    const count = await countVotes(env, id);
    return Response.json({ id, count }, { headers });
  } catch {
    return Response.json({ error: 'Internal error' }, { status: 500, headers });
  }
}
