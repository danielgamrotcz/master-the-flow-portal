const ADMIN_SECRET_HEADER = 'x-admin-secret';
const SITE_ORIGIN = 'https://master-the-flow-portal.pages.dev';

function cors(origin) {
  const allowed = origin && (origin === SITE_ORIGIN || /^http:\/\/localhost(:\d+)?$/.test(origin));
  const headers = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': `Content-Type, ${ADMIN_SECRET_HEADER}`,
    'Vary': 'Origin',
  };
  if (allowed) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

async function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const ba = new Uint8Array(ha), bb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < 32; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
}

export async function onRequestOptions({ request }) {
  const origin = request.headers.get('Origin');
  return new Response(null, { headers: cors(origin) });
}

export async function onRequestGet({ request, env }) {
  const origin = request.headers.get('Origin');
  const secret = request.headers.get(ADMIN_SECRET_HEADER);
  if (!secret || !env.ADMIN_SECRET || !await timingSafeEqual(secret, env.ADMIN_SECRET)) {
    return new Response('Unauthorized', { status: 401, headers: cors(origin) });
  }

  console.log('insights access', new Date().toISOString(), request.headers.get('CF-Connecting-IP') || 'unknown');

  try {
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      return d.toISOString().slice(0, 10);
    });

    const [
      opensRaw, readsRaw, searchRaw, emptySearchRaw,
      topicOpensRaw, topicReadsRaw, sharesRaw, transcriptsRaw, eventsRaw,
      votesList,
      ...dailyRaws
    ] = await Promise.all([
      env.MTF_DATA.get('analytics:opens'),
      env.MTF_DATA.get('analytics:reads'),
      env.MTF_DATA.get('analytics:searches'),
      env.MTF_DATA.get('analytics:empty_searches'),
      env.MTF_DATA.get('analytics:topic_opens'),
      env.MTF_DATA.get('analytics:topic_reads'),
      env.MTF_DATA.get('analytics:shares'),
      env.MTF_DATA.get('analytics:transcripts'),
      env.MTF_DATA.get('analytics:events'),
      env.MTF_DATA.list({ prefix: 'vote_' }),
      ...last30Days.map(d => env.MTF_DATA.get(`analytics:daily:${d}`)),
    ]);

    // Počet aktivních push odběrů — jedno číslo, jestli návratový kanál žije.
    const subsList = await env.MTF_DATA.list({ prefix: 'sub_', limit: 1000 });
    const pushSubscriptions = (subsList.keys || []).length;

    const opens = opensRaw ? JSON.parse(opensRaw) : {};
    const reads = readsRaw ? JSON.parse(readsRaw) : {};
    const searches = searchRaw ? JSON.parse(searchRaw) : {};
    const emptySearches = emptySearchRaw ? JSON.parse(emptySearchRaw) : {};
    const topicOpens = topicOpensRaw ? JSON.parse(topicOpensRaw) : {};
    const topicReads = topicReadsRaw ? JSON.parse(topicReadsRaw) : {};
    const shares = sharesRaw ? JSON.parse(sharesRaw) : {};
    const transcripts = transcriptsRaw ? JSON.parse(transcriptsRaw) : {};
    const events = eventsRaw ? JSON.parse(eventsRaw) : {};

    // Vote counts — parallel reads
    const voteKeys = votesList.keys || [];
    const voteValues = await Promise.all(voteKeys.map(k => env.MTF_DATA.get(k.name)));
    const votesMap = {};
    voteKeys.forEach((k, i) => {
      if (voteValues[i]) votesMap[k.name.slice(5)] = parseInt(voteValues[i], 10) || 0;
    });

    // Top cards with composite score (opens + reads×2 + votes×5 + shares×3)
    const allIds = new Set([...Object.keys(opens), ...Object.keys(reads), ...Object.keys(votesMap)]);
    const topCards = [...allIds].map(id => {
      const openCount = opens[id] || 0;
      const read = reads[id];
      const readCount = read ? read.opens : 0;
      const readMs = read ? read.total_ms : 0;
      const avg_seconds = readCount > 0 ? Math.round(readMs / readCount / 1000) : null;
      const read_through_rate = openCount > 0 ? Math.round((readCount / openCount) * 100) : 0;
      const voteCount = votesMap[id] || 0;
      const shareCount = shares[id] || 0;
      const score = openCount + (readCount * 2) + (voteCount * 5) + (shareCount * 3);
      return { id, opens: openCount, reads: readCount, avg_seconds, read_through_rate, votes: voteCount, shares: shareCount, score };
    })
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);

    // Top searches
    const topSearches = Object.entries(searches)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([query, count]) => ({ query, count }));

    // Empty searches — content gaps
    const topEmptySearches = Object.entries(emptySearches)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([query, count]) => ({ query, count }));

    // Topics with read depth
    const topTopics = Object.entries(topicOpens)
      .sort((a, b) => b[1] - a[1])
      .map(([topic, openCount]) => {
        const tr = topicReads[topic];
        const avg_read_seconds = tr && tr.opens > 0 ? Math.round(tr.total_ms / tr.opens / 1000) : null;
        return { topic, opens: openCount, avg_read_seconds };
      });

    // Top shares
    const topShares = Object.entries(shares)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([id, count]) => ({ id, count }));

    // Top transcript views
    const topTranscripts = Object.entries(transcripts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([date, count]) => ({ date, count }));

    // Daily trend (last 30 days, oldest first) + aggregate hours + sources
    const hoursTotal = {};
    const sourcesTotal = {};
    let gateShown30d = 0, gatePassed30d = 0, newVisitors30d = 0;
    const dailyTrend = last30Days.map((date, i) => {
      const raw = dailyRaws[i];
      const d = raw ? JSON.parse(raw) : {};
      if (d.hours) {
        for (const [h, c] of Object.entries(d.hours)) {
          hoursTotal[h] = (hoursTotal[h] || 0) + c;
        }
      }
      if (d.sources) {
        for (const [s, c] of Object.entries(d.sources)) {
          sourcesTotal[s] = (sourcesTotal[s] || 0) + c;
        }
      }
      gateShown30d += d.gate_shown || 0;
      gatePassed30d += d.gate_passed || 0;
      newVisitors30d += d.new_visitors || 0;
      return {
        date,
        opens: d.opens || 0,
        reads: d.reads || 0,
        sessions: d.sessions || 0,
        searches: d.searches || 0,
        shares: d.shares || 0,
        new_visitors: d.new_visitors || 0,
        returning: d.returning || {},
        gate_shown: d.gate_shown || 0,
        gate_passed: d.gate_passed || 0,
        sources: d.sources || {},
      };
    }).reverse();

    const hoursArray = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: hoursTotal[i] || 0 }));

    // Summary totals
    const totalOpens = Object.values(opens).reduce((s, n) => s + n, 0);
    const totalReads = Object.values(reads).reduce((s, r) => s + r.opens, 0);
    const totalSearches = Object.values(searches).reduce((s, n) => s + n, 0);
    const totalShares = Object.values(shares).reduce((s, n) => s + n, 0);
    const totalSessions30d = dailyTrend.reduce((s, d) => s + d.sessions, 0);
    const overallReadThrough = totalOpens > 0 ? Math.round((totalReads / totalOpens) * 100) : 0;

    return Response.json({
      summary: {
        total_opens: totalOpens,
        total_reads: totalReads,
        total_searches: totalSearches,
        total_shares: totalShares,
        sessions_last_30d: totalSessions30d,
        overall_read_through_rate: overallReadThrough,
        push_subscriptions: pushSubscriptions,
        new_visitors_30d: newVisitors30d,
        gate_shown_30d: gateShown30d,
        gate_passed_30d: gatePassed30d,
        gate_conversion: gateShown30d > 0 ? Math.round((gatePassed30d / gateShown30d) * 100) : null,
        sources_30d: sourcesTotal,
      },
      top_cards: topCards,
      top_searches: topSearches,
      empty_searches: topEmptySearches,
      topics: topTopics,
      top_shares: topShares,
      top_transcripts: topTranscripts,
      events,
      hours: hoursArray,
      daily_trend: dailyTrend,
    }, { headers: cors(origin) });

  } catch (e) {
    console.error('insights error:', e);
    return Response.json({ error: 'Internal error' }, { status: 500, headers: cors(origin) });
  }
}
