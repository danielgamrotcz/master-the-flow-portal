// Blokuje přístup k souborům, které leží v deploy rootu, ale nesmí být
// veřejné (config, secrets, interní dokumentace, git). Pages Functions
// middleware běží před servírováním statických assetů, takže 404 vrátíme dřív,
// než se soubor odešle.
//
// Bezpečnostně: nespoléháme na jediný přesný tvar cesty. Cestu nejdřív
// normalizujeme (dekódujeme %2E apod., zahodíme koncové lomítko/mezery,
// sloučíme lomítka) a pak blokujeme podle KAŽDÉHO segmentu — tím padnou i
// triky jako „/.dev.vars/", „//.dev.vars", „/%2Edev.vars" nebo „/foo/.git/config".

import { verifyToken, readCookie, COOKIE_NAME } from './_token.js';

// Citlivý je celý segment, který se přesně rovná jednomu z těchto názvů…
const BLOCKED_EXACT = new Set([
  '.dev.vars', '.env', '.gitignore', '.git', '.wrangler',
  'wrangler.toml', 'wrangler.json', 'wrangler.jsonc',
  'package.json', 'package-lock.json',
  'tests', 'tools', '__pycache__',
]);
// …nebo odpovídá jednomu z těchto vzorů (přípony / prefixy).
const BLOCKED_PATTERN = /^(\.env(\..+)?|\.dev\.vars|.+\.(md|sql))$/i;

function isBlockedSegment(seg) {
  const s = seg.trim().toLowerCase();
  if (!s) return false;
  return BLOCKED_EXACT.has(s) || BLOCKED_PATTERN.test(s);
}

// Data, která obsahují přepisy diskuzí nebo plné texty karet. Ta smí dostat
// jen přihlášený člen. Zbytek (slovníček, seznam dnů, akce, upozornění)
// zůstává veřejný — slovníček má lidi na portál lákat, ne je odrazovat.
function needsGate(pathname) {
  const p = pathname.toLowerCase();
  if (p === '/data/today.json') return true;
  if (p === '/data/cards-index.json') return true;
  if (p === '/data/chat-corpus.json') return true;
  if (p === '/data/chat-transcripts.json') return true;
  if (p.startsWith('/data/archive/') && p.endsWith('.json')) return true;
  return false;
}

export async function onRequest(context) {
  const { request, env } = context;
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url).pathname);
  } catch {
    return new Response('Bad Request', { status: 400 });
  }
  const segments = pathname.split('/').filter(Boolean);
  if (segments.some(isBlockedSegment)) {
    return new Response('Not Found', { status: 404 });
  }

  if (needsGate(pathname)) {
    const token = readCookie(request, COOKIE_NAME);
    if (!await verifyToken(token, env.GATE_CODE, env)) {
      // Bez těla. Tělo, které volající nepřečte, drží spojení otevřené —
      // stránka pak nikdy nedosáhne stavu „síť je v klidu“.
      return new Response(null, {
        status: 403,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    // Odpověď se dál nepřebaluje. new Response(res.body, res) by zkopírovalo
    // i Content-Encoding a Content-Length ke znovu zabalenému streamu, což
    // u komprimovaných statických souborů rozbije rámcování a spojení zůstane
    // viset. Cache-Control pro /data/ řeší soubor _headers.
    return context.next();
  }

  return context.next();
}
