const SITE_ORIGIN = 'https://master-the-flow-portal.pages.dev';

function corsHeaders(origin) {
  const allowed = !origin || origin === SITE_ORIGIN || origin.startsWith('http://localhost');
  return {
    'Access-Control-Allow-Origin': allowed ? (origin || '*') : 'null',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

export async function onRequestOptions({ request }) {
  const origin = request.headers.get('Origin');
  return new Response(null, { headers: corsHeaders(origin) });
}

export async function onRequestGet({ env, request }) {
  const origin = request.headers.get('Origin');
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
