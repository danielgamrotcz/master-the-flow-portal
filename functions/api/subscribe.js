export async function onRequestPost({ request, env }) {
  try {
    const sub = await request.json();
    if (!sub?.endpoint) return new Response('Bad request', { status: 400 });
    const key = 'sub_' + btoa(sub.endpoint).replace(/[^a-zA-Z0-9]/g, '').slice(0, 48);
    await env.MTF_DATA.put(key, JSON.stringify(sub), { expirationTtl: 60 * 86400 });
    return new Response('OK', { headers: corsHeaders() });
  } catch (e) {
    return new Response('Error', { status: 500 });
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const sub = await request.json();
    if (!sub?.endpoint) return new Response('Bad request', { status: 400 });
    const key = 'sub_' + btoa(sub.endpoint).replace(/[^a-zA-Z0-9]/g, '').slice(0, 48);
    await env.MTF_DATA.delete(key);
    return new Response('OK', { headers: corsHeaders() });
  } catch (e) {
    return new Response('Error', { status: 500 });
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
