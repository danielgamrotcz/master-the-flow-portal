import { rateLimit, ipKey } from './_ratelimit.js';
import { verifyShareTicket } from '../_share-ticket.js';
import { generateToken, gateCookie, TOKEN_TTL_MS } from '../_token.js';

const SITE_ORIGIN = 'https://master-the-flow-portal.pages.dev';

function corsHeaders(origin) {
  const allowed = origin && (origin === SITE_ORIGIN || /^http:\/\/localhost(:\d+)?$/.test(origin));
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return new Response('Bad Request', { status: 400, headers });
  }
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (await rateLimit(env, 'share-auth:' + ipKey(ip), 30, 3600)) {
    return new Response('Too Many Requests', { status: 429, headers });
  }

  try {
    const { ticket } = await request.json();
    const verified = await verifyShareTicket(ticket, env.GATE_CODE);
    if (!verified) return new Response('Unauthorized', { status: 401, headers });

    const token = await generateToken(env.GATE_CODE, env);
    const expires = Date.now() + TOKEN_TTL_MS;
    return Response.json({ ok: true, token, expires, card_id: verified.cardId }, {
      headers: {
        ...headers,
        'Cache-Control': 'no-store',
        'Set-Cookie': gateCookie(request, token),
      },
    });
  } catch (e) {
    if (e instanceof SyntaxError) return new Response('Bad Request', { status: 400, headers });
    return new Response('Internal error', { status: 500, headers });
  }
}
