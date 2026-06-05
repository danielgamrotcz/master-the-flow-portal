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

export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'missing id' }, { status: 400 });
  const raw = await env.MTF_DATA.get('vote_' + id);
  const count = raw ? parseInt(raw, 10) : 0;
  return Response.json({ id, count }, { headers: cors() });
}

export async function onRequestPost({ request, env }) {
  try {
    const { id } = await request.json();
    if (!id) return Response.json({ error: 'missing id' }, { status: 400 });
    const key = 'vote_' + id;
    const raw = await env.MTF_DATA.get(key);
    const count = (raw ? parseInt(raw, 10) : 0) + 1;
    await env.MTF_DATA.put(key, String(count));
    return Response.json({ id, count }, { headers: cors() });
  } catch (e) {
    return Response.json({ error: 'error' }, { status: 500, headers: cors() });
  }
}

// Top N most voted cards
export async function onRequestGet_top({ request, env }) {
  const list = await env.MTF_DATA.list({ prefix: 'vote_' });
  const entries = await Promise.all(
    list.keys.map(async ({ name }) => {
      const count = parseInt(await env.MTF_DATA.get(name) || '0', 10);
      return { id: name.replace('vote_', ''), count };
    })
  );
  entries.sort((a, b) => b.count - a.count);
  return Response.json(entries.slice(0, 20), { headers: cors() });
}
