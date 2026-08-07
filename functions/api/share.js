import { rateLimit, ipKey } from './_ratelimit.js';
import { createShareTicket, SHARE_TICKET_TTL_MS } from '../_share-ticket.js';
import { readRequestToken, verifyToken } from '../_token.js';

const SITE_ORIGIN = 'https://master-the-flow-portal.pages.dev';
const CARD_ID_RE = /^\d{4}-\d{2}-\d{2}-\d{2}$/;

function corsHeaders(origin) {
  const allowed = origin && (origin === SITE_ORIGIN || /^http:\/\/localhost(:\d+)?$/.test(origin));
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-mtf-token',
    'Vary': 'Origin',
  };
  if (allowed) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export async function onRequestOptions({ request }) {
  return new Response(null, { headers: corsHeaders(request.headers.get('Origin')) });
}

export async function onRequestPost({ request, env }) {
  const headers = corsHeaders(request.headers.get('Origin'));
  const nonce = await verifyToken(readRequestToken(request), env.GATE_CODE, env);
  if (!nonce) return new Response('Unauthorized', { status: 401, headers });

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (await rateLimit(env, 'share:' + ipKey(ip), 60, 3600)) {
    return new Response('Too Many Requests', { status: 429, headers });
  }
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return new Response('Bad Request', { status: 400, headers });
  }

  try {
    const { id } = await request.json();
    if (!CARD_ID_RE.test(id || '')) return new Response('Bad Request', { status: 400, headers });
    const ticket = await createShareTicket(id, env.GATE_CODE);
    if (!ticket) return new Response('Internal error', { status: 500, headers });
    return Response.json({ ticket, expires: Date.now() + SHARE_TICKET_TTL_MS }, {
      headers: { ...headers, 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    if (e instanceof SyntaxError) return new Response('Bad Request', { status: 400, headers });
    return new Response('Internal error', { status: 500, headers });
  }
}
