export async function onRequestGet({ env }) {
  const list = await env.MTF_DATA.list({ prefix: 'vote_' });
  const entries = await Promise.all(
    list.keys.map(async ({ name }) => {
      const count = parseInt(await env.MTF_DATA.get(name) || '0', 10);
      return { id: name.replace('vote_', ''), count };
    })
  );
  entries.sort((a, b) => b.count - a.count);
  return Response.json(entries.slice(0, 20), {
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}
