function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function onRequestOptions() {
  return new Response(null, { headers: cors() });
}

export async function onRequestPost({ request, env }) {
  try {
    const { event, data } = await request.json();
    if (!event || !data) return new Response('Bad Request', { status: 400, headers: cors() });

    if (event === 'card_open' && data.id) {
      const raw = await env.MTF_DATA.get('analytics:opens');
      const map = raw ? JSON.parse(raw) : {};
      map[data.id] = (map[data.id] || 0) + 1;
      await env.MTF_DATA.put('analytics:opens', JSON.stringify(map));
    }

    if (event === 'card_read' && data.id && data.duration_ms > 0) {
      const raw = await env.MTF_DATA.get('analytics:reads');
      const map = raw ? JSON.parse(raw) : {};
      const cur = map[data.id] || { opens: 0, total_ms: 0 };
      cur.opens += 1;
      cur.total_ms += Math.min(data.duration_ms, 300000); // cap at 5 min
      map[data.id] = cur;
      await env.MTF_DATA.put('analytics:reads', JSON.stringify(map));
    }

    if (event === 'search' && data.query && data.query.length >= 2) {
      const raw = await env.MTF_DATA.get('analytics:searches');
      const map = raw ? JSON.parse(raw) : {};
      const q = data.query.toLowerCase().trim().slice(0, 60);
      map[q] = (map[q] || 0) + 1;
      await env.MTF_DATA.put('analytics:searches', JSON.stringify(map));
    }

    return new Response('OK', { headers: cors() });
  } catch {
    return new Response('Error', { status: 500, headers: cors() });
  }
}
