const SITE_ORIGIN = 'https://master-the-flow-portal.pages.dev';
const CARD_ID_RE = /^[a-zA-Z0-9_-]{1,80}$/;
const ALLOWED_EVENTS = new Set(['card_open', 'card_read', 'search']);

function corsHeaders(origin) {
  const allowed = !origin || origin === SITE_ORIGIN || origin.startsWith('http://localhost');
  return {
    'Access-Control-Allow-Origin': allowed ? (origin || '*') : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

export async function onRequestOptions({ request }) {
  const origin = request.headers.get('Origin');
  return new Response(null, { headers: corsHeaders(origin) });
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  const headers = corsHeaders(origin);

  try {
    const { event, data } = await request.json();

    // Strict event whitelist
    if (!event || !ALLOWED_EVENTS.has(event) || !data) {
      return new Response('Bad Request', { status: 400, headers });
    }

    if (event === 'card_open' && data.id && CARD_ID_RE.test(data.id)) {
      const raw = await env.MTF_DATA.get('analytics:opens');
      const map = raw ? JSON.parse(raw) : {};
      // Guard against unbounded map growth (max 2000 unique keys)
      if (map[data.id] !== undefined || Object.keys(map).length < 2000) {
        map[data.id] = (map[data.id] || 0) + 1;
        await env.MTF_DATA.put('analytics:opens', JSON.stringify(map));
      }
    }

    if (event === 'card_read' && data.id && CARD_ID_RE.test(data.id) && data.duration_ms > 0) {
      const raw = await env.MTF_DATA.get('analytics:reads');
      const map = raw ? JSON.parse(raw) : {};
      if (map[data.id] !== undefined || Object.keys(map).length < 2000) {
        const cur = map[data.id] || { opens: 0, total_ms: 0 };
        cur.opens += 1;
        cur.total_ms += Math.min(data.duration_ms, 300000);
        map[data.id] = cur;
        await env.MTF_DATA.put('analytics:reads', JSON.stringify(map));
      }
    }

    if (event === 'search' && data.query && data.query.length >= 2) {
      const raw = await env.MTF_DATA.get('analytics:searches');
      const map = raw ? JSON.parse(raw) : {};
      const q = data.query.toLowerCase().trim().slice(0, 60);
      if (map[q] !== undefined || Object.keys(map).length < 1000) {
        map[q] = (map[q] || 0) + 1;
        await env.MTF_DATA.put('analytics:searches', JSON.stringify(map));
      }
    }

    return new Response('OK', { headers });
  } catch {
    return new Response('Error', { status: 500, headers });
  }
}
