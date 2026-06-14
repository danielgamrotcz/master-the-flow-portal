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
  // Hlasy jsou klíče v:<karta>:<volič>. Počet karty = počet jejích klíčů.
  const counts = {};
  let cursor;
  do {
    const res = await env.MTF_DATA.list({ prefix: 'v:', cursor, limit: 1000 });
    for (const { name } of res.keys) {
      const rest = name.slice(2);
      const i = rest.lastIndexOf(':');
      if (i > 0) {
        const id = rest.slice(0, i);
        counts[id] = (counts[id] || 0) + 1;
      }
    }
    cursor = res.list_complete ? null : res.cursor;
  } while (cursor);
  const entries = Object.entries(counts).map(([id, count]) => ({ id, count }));
  entries.sort((a, b) => b.count - a.count);
  return Response.json(entries.slice(0, 20), {
    headers: corsHeaders(origin),
  });
}
