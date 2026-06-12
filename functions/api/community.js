const SITE_ORIGIN = 'https://master-the-flow-portal.pages.dev';

function corsHeaders(origin, methods = 'GET, OPTIONS') {
  const allowed = origin && (origin === SITE_ORIGIN || /^http:\/\/localhost(:\d+)?$/.test(origin));
  const headers = {
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
  if (allowed) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export async function onRequestOptions({ request }) {
  const origin = request.headers.get('Origin');
  return new Response(null, { headers: corsHeaders(origin, 'GET, POST, OPTIONS') });
}

export async function onRequestGet({ env, request }) {
  const origin = request.headers.get('Origin');
  try {
    const raw = await env.MTF_DATA.get('community_member_count');
    const count = raw ? parseInt(raw, 10) : null;
    return Response.json({ count }, { headers: corsHeaders(origin) });
  } catch {
    return Response.json({ count: null }, { headers: corsHeaders(origin) });
  }
}

export async function onRequestPost({ request, env }) {
  // Admin-only write — requires secret header
  const secret = request.headers.get('x-admin-secret');
  if (!env.ADMIN_SECRET || secret !== env.ADMIN_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const { count } = await request.json();
    if (!count || typeof count !== 'number' || count < 0 || count > 1000000) {
      return Response.json({ error: 'invalid count' }, { status: 400 });
    }
    await env.MTF_DATA.put('community_member_count', String(Math.round(count)));
    return Response.json({ count: Math.round(count) });
  } catch {
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}
