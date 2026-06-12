const SITE_ORIGIN = 'https://master-the-flow-portal.pages.dev';
const READS_RATE_LIMIT = 30; // max 30 requests per minute per IP

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
  const key = 'ratelimit:reads:' + ip;
  const raw = await env.MTF_DATA.get(key);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= READS_RATE_LIMIT) return true;
  await env.MTF_DATA.put(key, String(count + 1), { expirationTtl: 60 });
  return false;
}

export async function onRequestOptions({ request }) {
  const origin = request.headers.get('Origin');
  return new Response(null, { headers: corsHeaders(origin) });
}

// Veřejný read-count pro VŠECHNY karty — globální agregát, stejný na všech
// zařízeních. Žádné přihlášení (vyhne se auth selhání), žádný top-N limit.
export async function onRequestGet({ env, request }) {
  const origin = request.headers.get('Origin');
  const corsH = corsHeaders(origin);

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (await checkRateLimit(env, ip)) {
    return new Response('Too Many Requests', { status: 429, headers: corsH });
  }

  try {
    const raw = await env.MTF_DATA.get('analytics:reads');
    const reads = raw ? JSON.parse(raw) : {};
    const out = {};
    for (const [id, r] of Object.entries(reads)) {
      const n = r && typeof r === 'object' ? (r.opens || 0) : 0;
      if (n > 0) out[id] = n;
    }
    return Response.json(out, {
      headers: { ...corsH, 'Cache-Control': 'public, max-age=60' },
    });
  } catch {
    return Response.json({}, { headers: corsH });
  }
}
