// Blokuje přístup k souborům, které leží v deploy rootu, ale nesmí být
// veřejné (config, secrets, interní dokumentace, git). Pages Functions
// middleware běží před servírováním statických assetů, takže 404 vrátíme dřív,
// než se soubor odešle.
//
// Bezpečnostně: nespoléháme na jediný přesný tvar cesty. Cestu nejdřív
// normalizujeme (dekódujeme %2E apod., zahodíme koncové lomítko/mezery,
// sloučíme lomítka) a pak blokujeme podle KAŽDÉHO segmentu — tím padnou i
// triky jako „/.dev.vars/", „//.dev.vars", „/%2Edev.vars" nebo „/foo/.git/config".

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

export async function onRequest(context) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(context.request.url).pathname);
  } catch {
    return new Response('Bad Request', { status: 400 });
  }
  const segments = pathname.split('/').filter(Boolean);
  if (segments.some(isBlockedSegment)) {
    return new Response('Not Found', { status: 404 });
  }
  return context.next();
}
