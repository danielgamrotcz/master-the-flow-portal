const SITE_ORIGIN = 'https://master-the-flow-portal.pages.dev';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const enc = new TextEncoder();

function cors(origin) {
  const allowed = origin && (origin === SITE_ORIGIN || /^http:\/\/localhost(:\d+)?$/.test(origin));
  const headers = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-mtf-token',
    'Vary': 'Origin',
  };
  if (allowed) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

async function verifyToken(token, gateCode) {
  if (!token || typeof token !== 'string') return false;
  const lastColon = token.lastIndexOf(':');
  if (lastColon < 1) return false;
  const payload = token.slice(0, lastColon);
  const sigHex = token.slice(lastColon + 1);
  if (sigHex.length !== 64) return false;
  const ts = parseInt(payload.split(':')[0], 10);
  if (isNaN(ts) || Date.now() > ts + TOKEN_TTL_MS) return false;
  try {
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(gateCode),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sigBytes = new Uint8Array(sigHex.match(/.{2}/g).map(b => parseInt(b, 16)));
    return await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(payload));
  } catch { return false; }
}

export async function onRequestOptions({ request }) {
  const origin = request.headers.get('Origin');
  return new Response(null, { headers: cors(origin) });
}

export async function onRequestGet({ env, request }) {
  const origin = request.headers.get('Origin');
  const corsH = cors(origin);

  const token = request.headers.get('x-mtf-token');
  if (!env.GATE_CODE || !await verifyToken(token, env.GATE_CODE)) {
    return new Response('Unauthorized', { status: 401, headers: corsH });
  }

  try {
    const [opensRaw, readsRaw, sharesRaw, votesList] = await Promise.all([
      env.MTF_DATA.get('analytics:opens'),
      env.MTF_DATA.get('analytics:reads'),
      env.MTF_DATA.get('analytics:shares'),
      env.MTF_DATA.list({ prefix: 'vote_' }),
    ]);

    const opens = opensRaw ? JSON.parse(opensRaw) : {};
    const reads = readsRaw ? JSON.parse(readsRaw) : {};
    const shares = sharesRaw ? JSON.parse(sharesRaw) : {};

    const voteKeys = votesList.keys || [];
    const voteValues = await Promise.all(voteKeys.map(k => env.MTF_DATA.get(k.name)));
    const votes = {};
    voteKeys.forEach((k, i) => {
      if (voteValues[i]) votes[k.name.slice(5)] = parseInt(voteValues[i], 10) || 0;
    });

    const allIds = new Set([
      ...Object.keys(opens),
      ...Object.keys(reads),
      ...Object.keys(votes),
    ]);

    const cards = [...allIds].map(id => {
      const openCount = opens[id] || 0;
      const read = reads[id];
      const readCount = read ? read.opens : 0;
      const voteCount = votes[id] || 0;
      const shareCount = shares[id] || 0;
      const score = openCount + (readCount * 2) + (voteCount * 5) + (shareCount * 3);
      return { id, opens: openCount, reads: readCount, votes: voteCount, shares: shareCount, score };
    })
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);

    return Response.json({ cards }, {
      headers: {
        ...corsH,
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch {
    return Response.json({ cards: [] }, { headers: corsH });
  }
}
