const SITE_ORIGIN = 'https://master-the-flow-portal.pages.dev';
const CARD_ID_RE = /^[a-zA-Z0-9_-]{1,80}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_EVENTS = new Set([
  'card_open', 'card_read', 'search',
  'share', 'transcript_view', 'random_card',
  'view_switch', 'overlay_nav', 'topic_filter', 'archive_date', 'session_visit',
]);

function corsHeaders(origin) {
  const allowed = !origin || origin === SITE_ORIGIN || origin.startsWith('http://localhost');
  return {
    'Access-Control-Allow-Origin': allowed ? (origin || '*') : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

async function kv_update(kv, key, fn) {
  const raw = await kv.get(key);
  const obj = raw ? JSON.parse(raw) : {};
  fn(obj);
  await kv.put(key, JSON.stringify(obj));
}

function incr(obj, key, max) {
  if (obj[key] !== undefined || Object.keys(obj).length < max) {
    obj[key] = (obj[key] || 0) + 1;
  }
}

export async function onRequestOptions({ request }) {
  const origin = request.headers.get('Origin');
  return new Response(null, { headers: corsHeaders(origin) });
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  const headers = corsHeaders(origin);

  try {
    const { event, data } = await request.json();
    if (!event || !ALLOWED_EVENTS.has(event) || !data) {
      return new Response('Bad Request', { status: 400, headers });
    }

    const hour = typeof data.hour_utc === 'number' && data.hour_utc >= 0 && data.hour_utc <= 23 ? data.hour_utc : null;
    const date = typeof data.date === 'string' && DATE_RE.test(data.date) ? data.date : null;
    const writes = [];

    // --- Card open ---
    if (event === 'card_open' && data.id && CARD_ID_RE.test(data.id)) {
      writes.push(kv_update(env.MTF_DATA, 'analytics:opens', obj => incr(obj, data.id, 2000)));
      if (data.topic) {
        writes.push(kv_update(env.MTF_DATA, 'analytics:topic_opens', obj => incr(obj, String(data.topic).slice(0, 60), 100)));
      }
    }

    // --- Card read ---
    if (event === 'card_read' && data.id && CARD_ID_RE.test(data.id) && data.duration_ms > 0) {
      writes.push(kv_update(env.MTF_DATA, 'analytics:reads', obj => {
        if (obj[data.id] !== undefined || Object.keys(obj).length < 2000) {
          const cur = obj[data.id] || { opens: 0, total_ms: 0 };
          cur.opens += 1;
          cur.total_ms += Math.min(data.duration_ms, 300000);
          obj[data.id] = cur;
        }
      }));
      if (data.topic) {
        writes.push(kv_update(env.MTF_DATA, 'analytics:topic_reads', obj => {
          const t = String(data.topic).slice(0, 60);
          if (obj[t] !== undefined || Object.keys(obj).length < 100) {
            const cur = obj[t] || { opens: 0, total_ms: 0 };
            cur.opens += 1;
            cur.total_ms += Math.min(data.duration_ms, 300000);
            obj[t] = cur;
          }
        }));
      }
    }

    // --- Search ---
    if (event === 'search' && data.query && data.query.length >= 2) {
      const q = data.query.toLowerCase().trim().slice(0, 60);
      writes.push(kv_update(env.MTF_DATA, 'analytics:searches', obj => incr(obj, q, 1000)));
      if (typeof data.result_count === 'number' && data.result_count === 0) {
        writes.push(kv_update(env.MTF_DATA, 'analytics:empty_searches', obj => incr(obj, q, 500)));
      }
    }

    // --- Share ---
    if (event === 'share' && data.id && CARD_ID_RE.test(data.id)) {
      writes.push(kv_update(env.MTF_DATA, 'analytics:shares', obj => incr(obj, data.id, 2000)));
    }

    // --- Transcript view ---
    if (event === 'transcript_view' && data.date && DATE_RE.test(data.date)) {
      writes.push(kv_update(env.MTF_DATA, 'analytics:transcripts', obj => incr(obj, data.date, 500)));
    }

    // --- Low-cardinality events (all in one key to save writes) ---
    if (['random_card', 'view_switch', 'overlay_nav', 'topic_filter', 'archive_date'].includes(event)) {
      writes.push(kv_update(env.MTF_DATA, 'analytics:events', obj => {
        if (event === 'view_switch' && data.view) {
          if (!obj.view_switch) obj.view_switch = {};
          const v = String(data.view).slice(0, 20);
          obj.view_switch[v] = (obj.view_switch[v] || 0) + 1;
        } else if (event === 'topic_filter' && data.topic) {
          if (!obj.topic_filter) obj.topic_filter = {};
          const t = String(data.topic).slice(0, 60);
          obj.topic_filter[t] = (obj.topic_filter[t] || 0) + 1;
        } else if (event === 'archive_date' && data.date && DATE_RE.test(data.date)) {
          if (!obj.archive_dates) obj.archive_dates = {};
          incr(obj.archive_dates, data.date, 200);
        } else {
          // random_card, overlay_nav
          obj[event] = (obj[event] || 0) + 1;
        }
      }));
    }

    // --- Daily aggregate (includes hour breakdown) ---
    if (date) {
      const dailyField = {
        card_open: 'opens', card_read: 'reads', search: 'searches',
        share: 'shares', session_visit: 'sessions',
      }[event];
      if (dailyField || hour !== null) {
        writes.push(kv_update(env.MTF_DATA, `analytics:daily:${date}`, obj => {
          if (dailyField) obj[dailyField] = (obj[dailyField] || 0) + 1;
          if (hour !== null) {
            if (!obj.hours) obj.hours = {};
            obj.hours[hour] = (obj.hours[hour] || 0) + 1;
          }
        }));
      }
    }

    await Promise.all(writes);
    return new Response('OK', { headers });
  } catch {
    return new Response('Error', { status: 500, headers });
  }
}
