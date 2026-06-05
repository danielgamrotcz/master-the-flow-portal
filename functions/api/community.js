function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function onRequestOptions() {
  return new Response(null, { headers: cors() });
}

export async function onRequestGet({ env }) {
  try {
    const raw = await env.MTF_DATA.get('community_member_count');
    const count = raw ? parseInt(raw, 10) : null;
    return Response.json({ count }, { headers: cors() });
  } catch {
    return Response.json({ count: null }, { headers: cors() });
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const { count } = await request.json();
    if (!count || typeof count !== 'number' || count < 0) {
      return Response.json({ error: 'invalid count' }, { status: 400, headers: cors() });
    }
    await env.MTF_DATA.put('community_member_count', String(Math.round(count)));
    return Response.json({ count: Math.round(count) }, { headers: cors() });
  } catch {
    return Response.json({ error: 'error' }, { status: 500, headers: cors() });
  }
}
