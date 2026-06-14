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

// Stabilní, neidentifikující otisk voliče (chrání IP před uložením v plain).
async function voterHash(voter) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(voter));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

// Počet hlasů z D1 (silně konzistentní — na rozdíl od KV vrátí přesné číslo
// hned po zápisu, žádný race ani propagační zpoždění).
async function countVotes(env, id) {
  const row = await env.VOTES_DB
    .prepare('SELECT COUNT(*) AS n FROM votes WHERE card_id = ?')
    .bind(id).first();
  return row ? row.n : 0;
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
    const voter = await voterHash(voterKey(cid, ip));
    await env.VOTES_DB
      .prepare('DELETE FROM votes WHERE card_id = ? AND voter = ?')
      .bind(id, voter).run();
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
    // INSERT OR IGNORE: dedup je v PRIMARY KEY (card_id, voter) — opakovaný hlas
    // téhož voliče nic nepřidá. Žádný read-modify-write, počet je vždy přesný.
    const voter = await voterHash(voterKey(cid, ip));
    await env.VOTES_DB
      .prepare('INSERT OR IGNORE INTO votes (card_id, voter) VALUES (?, ?)')
      .bind(id, voter).run();
    const count = await countVotes(env, id);
    return Response.json({ id, count }, { headers });
  } catch {
    return Response.json({ error: 'Internal error' }, { status: 500, headers });
  }
}
