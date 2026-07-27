// Náhled sdílené karty. Crawlerům (WhatsApp, LinkedIn, Facebook, Twitter)
// vrátí HTML s Open Graph meta tagy konkrétní karty (titulek + úryvek + obrázek).
// Člověka přesměruje meta-refreshem do SPA (#card/ID) — CSP-safe, bez inline JS.
import { loadCard } from '../_carddata.js';

const ID_RE = /^\d{4}-\d{2}-\d{2}-\d{2}$/;

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export async function onRequestGet({ params, request, env }) {
  const id = params.id;
  const origin = new URL(request.url).origin;

  if (!ID_RE.test(id)) {
    return Response.redirect(origin + '/', 302);
  }

  // Archiv je za bránou, proto přes ASSETS a ne přes fetch na vlastní origin.
  const card = await loadCard(env, request, id);

  const title = card ? card.title : 'Master the Flow';
  const desc = card ? card.excerpt : 'Poznatky komunity Master the Flow — AI, nástroje a produktivita.';
  const pageTitle = card ? `${title} — Master the Flow` : 'Master the Flow';

  // Per-card banner, pokud existuje; jinak obecný brandový banner.
  let image = origin + '/og-default.png';
  if (card) {
    try {
      const h = await fetch(`${origin}/data/og/${id}.png`, { method: 'HEAD' });
      if (h.ok) image = `${origin}/data/og/${id}.png`;
    } catch { /* fallback zůstává */ }
  }
  const canonical = `${origin}/card/${id}`;
  // Magic link a atribuce: whitelistované parametry (k, src) projdou redirectem
  // do SPA, aby auto-unlock a měření zdroje fungovaly i přes /card/ náhled.
  const inParams = new URL(request.url).searchParams;
  const passthrough = new URLSearchParams();
  for (const p of ['k', 'src']) {
    const v = inParams.get(p);
    if (v && /^[\w-]{1,40}$/.test(v)) passthrough.set(p, v);
  }
  const qs = passthrough.toString();
  const spa = `${origin}/${qs ? '?' + qs : ''}#card/${id}`;

  const html = `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Master the Flow">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${esc(canonical)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0; url=${esc(spa)}">
</head>
<body><p>Otevírám poznatek… <a href="${esc(spa)}">Master the Flow</a></p></body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
}
