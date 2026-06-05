function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function onRequestOptions() {
  return new Response(null, { headers: cors() });
}

export async function onRequestGet({ env }) {
  try {
    const [opensRaw, readsRaw, searchRaw] = await Promise.all([
      env.MTF_DATA.get('analytics:opens'),
      env.MTF_DATA.get('analytics:reads'),
      env.MTF_DATA.get('analytics:searches'),
    ]);

    const opens = opensRaw ? JSON.parse(opensRaw) : {};
    const reads = readsRaw ? JSON.parse(readsRaw) : {};
    const searches = searchRaw ? JSON.parse(searchRaw) : {};

    const topOpened = Object.entries(opens)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([id, count]) => {
        const read = reads[id];
        const avg_seconds = read && read.opens > 0
          ? Math.round(read.total_ms / read.opens / 1000)
          : null;
        return { id, opens: count, avg_seconds };
      });

    const topSearches = Object.entries(searches)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([query, count]) => ({ query, count }));

    return Response.json({ top_opened: topOpened, top_searches: topSearches }, { headers: cors() });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500, headers: cors() });
  }
}
