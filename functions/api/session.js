// Vymění platný token z localStorage za HttpOnly cookie.
//
// Členové přihlášení před zavedením cookie mají token jen v localStorage.
// Bez tohoto endpointu by jim datové soubory přestaly chodit a museli by
// znovu opisovat kód z WhatsAppu. Appka sem proto po startu jednou zajde.

import { rateLimit, ipKey } from './_ratelimit.js';
import { verifyToken, gateCookie } from '../_token.js';

const SITE_ORIGIN = 'https://master-the-flow-portal.pages.dev';

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

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (await rateLimit(env, 'session:' + ipKey(ip), 60, 3600)) {
    return new Response('Too Many Requests', { status: 429, headers });
  }

  const token = request.headers.get('x-mtf-token');
  if (!await verifyToken(token, env.GATE_CODE, env)) {
    return new Response('Unauthorized', { status: 401, headers });
  }

  // 204, tedy bez těla. S tělem by ho volající musel přečíst, jinak prohlížeč
  // drží spojení otevřené a request nikdy nedoběhne (rozbíjí to i čekání na
  // „networkidle“ v testech). Cookie se posílá hlavičkou, tělo netřeba.
  return new Response(null, {
    status: 204,
    headers: {
      ...headers,
      'Cache-Control': 'no-store',
      'Set-Cookie': gateCookie(request, token),
    },
  });
}
