// Blokuje přístup k souborům, které leží v deploy rootu, ale nesmí být
// veřejné (config, secrets, interní dokumentace). Pages Functions middleware
// běží před servírováním statických assetů, takže 404 je vrácen dřív, než
// se soubor odešle.
const BLOCKED = /^\/(\.dev\.vars|\.wrangler(\/|$)|wrangler\.toml|wrangler\.jsonc?|package(-lock)?\.json|[^/]+\.md)$/i;

export async function onRequest(context) {
  const { pathname } = new URL(context.request.url);
  if (BLOCKED.test(pathname)) {
    return new Response('Not Found', { status: 404 });
  }
  return context.next();
}
