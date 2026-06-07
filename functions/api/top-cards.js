function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };
}

export async function onRequestOptions() {
  return new Response(null, { headers: cors() });
}

export async function onRequestGet({ env }) {
  try {
    const [opensRaw, readsRaw, sharesRaw, votesList] = await Promise.all([
      env.MTF_DATA.get('analytics:opens'),
      env.MTF_DATA.get('analytics:reads'),
      env.MTF_DATA.get('analytics:shares'),
      env.MTF_DATA.list({ prefix: 'vote_' }),
    ]);

    const opens = opensRaw ? JSON.parse(opensRaw) : {};
    const reads = readsRaw ? JSON.parse(readsRaw) : {};
    const shares = sharesRaw ? JSON.parse(sharesRaw) : {};

    const voteKeys = votesList.keys || [];
    const voteValues = await Promise.all(voteKeys.map(k => env.MTF_DATA.get(k.name)));
    const votes = {};
    voteKeys.forEach((k, i) => {
      if (voteValues[i]) votes[k.name.slice(5)] = parseInt(voteValues[i], 10) || 0;
    });

    const allIds = new Set([
      ...Object.keys(opens),
      ...Object.keys(reads),
      ...Object.keys(votes),
    ]);

    const cards = [...allIds].map(id => {
      const openCount = opens[id] || 0;
      const read = reads[id];
      const readCount = read ? read.opens : 0;
      const voteCount = votes[id] || 0;
      const shareCount = shares[id] || 0;
      const score = openCount + (readCount * 2) + (voteCount * 5) + (shareCount * 3);
      return { id, opens: openCount, reads: readCount, votes: voteCount, shares: shareCount, score };
    })
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);

    return Response.json({ cards }, {
      headers: {
        ...cors(),
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch {
    return Response.json({ cards: [] }, { headers: cors() });
  }
}
