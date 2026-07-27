import { rateLimit, ipKey } from './_ratelimit.js';
const SITE_ORIGIN = 'https://master-the-flow-portal.pages.dev';
const VOTE_ID_RE = /^[a-zA-Z0-9_-]{1,80}$/;
const RESERVED_PREFIXES = ['analytics', 'sub_', 'community_', 'voted_', 'vote_', 'v:'];
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Ověří přístupový token (HMAC + KV nonce) a vrátí jeho nonce, jinak null.
// Hlas vážeme na nonce vydaný serverem, ne na volně volitelné klientské cid —
// nafouknout hlasy tak jde jen mintěním tokenů (gate kód + auth, rate-limited).
async function tokenNonce(token, gateCode, env) {
  if (!token || typeof token !== 'string') return null;
  const lastColon = token.lastIndexOf(':');
  if (lastColon < 1) return null;
  const payload = token.slice(0, lastColon);
  const sigHex = token.slice(lastColon + 1);
  if (sigHex.length !== 64) return null;
  const parts = payload.split(':');
  const ts = parseInt(parts[0], 10);
  if (isNaN(ts) || Date.now() > ts + TOKEN_TTL_MS) return null;
  try {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(gateCode),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sigBytes = new Uint8Array(sigHex.match(/.{2}/g).map(b => parseInt(b, 16)));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(payload));
    if (!valid) return null;
    const nonce = parts[1];
    if (env?.MTF_DATA && !(await env.MTF_DATA.get('token:' + nonce))) return null;
    return nonce || null;
  } catch { return null; }
}

async function checkVoteRateLimit(env, ip) {
  // max 20 hlasovacích akcí za 60 s na IP
  return rateLimit(env, 'vote:' + ipKey(ip), 20, 60);
}

function isSafeVoteId(id) {
  if (!VOTE_ID_RE.test(id)) return false;
  return !RESERVED_PREFIXES.some(p => id.startsWith(p));
}

// Hlas dedupujeme per přihlašovací token (nonce vydaný serverem). Token drží
// každý člen po vstupu kódem, takže to neslučuje lidi za sdíleným NAT a zároveň
// to nejde zfalšovat volně voleným klientským cid. IP slouží jen na rate-limit.
function voterKey(nonce) {
  return 't:' + nonce;
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

  const nonce = await tokenNonce(request.headers.get('x-mtf-token'), env.GATE_CODE, env);
  if (!nonce) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
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
    const voter = await voterHash(voterKey(nonce));
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

  const nonce = await tokenNonce(request.headers.get('x-mtf-token'), env.GATE_CODE, env);
  if (!nonce) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
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
    // INSERT OR IGNORE: dedup je v PRIMARY KEY (card_id, voter) — opakovaný hlas
    // téhož voliče nic nepřidá. Žádný read-modify-write, počet je vždy přesný.
    const voter = await voterHash(voterKey(nonce));
    await env.VOTES_DB
      .prepare('INSERT OR IGNORE INTO votes (card_id, voter) VALUES (?, ?)')
      .bind(id, voter).run();
    const count = await countVotes(env, id);
    return Response.json({ id, count }, { headers });
  } catch {
    return Response.json({ error: 'Internal error' }, { status: 500, headers });
  }
}
