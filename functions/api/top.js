const SITE_ORIGIN = 'https://master-the-flow-portal.pages.dev';
const TOP_RATE_LIMIT = 30; // max 30 requests per minute per IP

function corsHeaders(origin) {
  const allowed = origin && (origin === SITE_ORIGIN || /^http:\/\/localhost(:\d+)?$/.test(origin));
  const headers = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
  if (allowed) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

async function checkRateLimit(env, ip) {
  if (!env.MTF_DATA) return false;
  const key = 'ratelimit:top:' + ip;
  const raw = await env.MTF_DATA.get(key);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= TOP_RATE_LIMIT) return true;
  await env.MTF_DATA.put(key, String(count + 1), { expirationTtl: 60 });
  return false;
}

export async function onRequestOptions({ request }) {
  const origin = request.headers.get('Origin');
  return new Response(null, { headers: corsHeaders(origin) });
}

export async function onRequestGet({ env, request }) {
  const origin = request.headers.get('Origin');
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (await checkRateLimit(env, ip)) {
    return new Response('Too Many Requests', { status: 429, headers: corsHeaders(origin) });
  }
  // Počty hlasů z D1 (přesné, silně konzistentní).
  const rows = await env.VOTES_DB
    .prepare('SELECT card_id, COUNT(*) AS count FROM votes GROUP BY card_id ORDER BY count DESC LIMIT 20')
    .all();
  const entries = (rows.results || []).map(r => ({ id: r.card_id, count: r.count }));
  return Response.json(entries, {
    headers: corsHeaders(origin),
  });
}
