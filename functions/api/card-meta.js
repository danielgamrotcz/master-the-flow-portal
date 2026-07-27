// Veřejná metadata karty: titulek a úryvek, nic víc.
//
// Slouží upoutávce nad bránou („Za bránou na vás čeká…“). Dřív si ji appka
// brala tak, že stáhla celý archivní soubor daného dne — tedy včetně těl karet
// a přepisů diskuzí — jen aby z něj přečetla jeden titulek. Tenhle endpoint
// vrací výhradně to, co má nepřihlášený návštěvník vidět.

import { rateLimit, ipKey } from './_ratelimit.js';
import { loadCard } from '../_carddata.js';

const ID_RE = /^\d{4}-\d{2}-\d{2}-\d{2}$/;
const SITE_ORIGIN = 'https://master-the-flow-portal.pages.dev';

function corsHeaders(origin) {
  const allowed = origin && (origin === SITE_ORIGIN || /^http:\/\/localhost(:\d+)?$/.test(origin));
  const headers = { 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Vary': 'Origin' };
  if (allowed) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export async function onRequestOptions({ request }) {
  return new Response(null, { headers: corsHeaders(request.headers.get('Origin')) });
}

export async function onRequestGet({ request, env }) {
  const headers = corsHeaders(request.headers.get('Origin'));

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (await rateLimit(env, 'cardmeta:' + ipKey(ip), 60, 60)) {
    return new Response(null, { status: 429, headers });
  }

  const id = new URL(request.url).searchParams.get('id') || '';
  if (!ID_RE.test(id)) {
    return new Response(null, { status: 400, headers });
  }

  const card = await loadCard(env, request, id);
  if (!card) return new Response(null, { status: 404, headers });

  return Response.json(
    { id, title: card.title || '', excerpt: card.excerpt || '' },
    { headers: { ...headers, 'Cache-Control': 'public, max-age=300' } }
  );
}
