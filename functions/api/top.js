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
  const list = await env.MTF_DATA.list({ prefix: 'vote_' });
  const entries = await Promise.all(
    list.keys.map(async ({ name }) => {
      const count = parseInt(await env.MTF_DATA.get(name) || '0', 10);
      return { id: name.replace('vote_', ''), count };
    })
  );
  entries.sort((a, b) => b.count - a.count);
  return Response.json(entries.slice(0, 20), {
    headers: corsHeaders(origin),
  });
}
