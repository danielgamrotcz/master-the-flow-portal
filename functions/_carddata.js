// Čtení karet zevnitř Functions, mimo přihlašovací bránu.
//
// Datové soubory chrání middleware, protože obsahují přepisy diskuzí a plná
// těla karet. Server je ale potřebuje pro bezpečné Open Graph teasery a pro
// přihlášený chat. Interní čtení proto používá ASSETS binding a nikdy
// neotevírá statický soubor veřejnosti.
//
// env.ASSETS.fetch() sáhne na statický soubor přímo, bez průchodu middlewarem.
// Kdyby se místo toho volalo fetch(origin + cesta), request by šel znovu přes
// bránu a vrátil by 403.

export async function loadJsonAsset(env, request, pathname) {
  if (!env?.ASSETS) return null;
  if (typeof pathname !== 'string' || !pathname.startsWith('/data/') || pathname.includes('..')) return null;
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = '';
  try {
    const r = await env.ASSETS.fetch(new Request(url.toString()));
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/** Najde kartu podle id v archivu jejího dne. Vrací null, když neexistuje. */
export async function loadCard(env, request, id) {
  const date = id.slice(0, 10);
  const d = await loadJsonAsset(env, request, `/data/archive/${date}.json`);
  if (!d) return null;
  return (d.cards || []).find(c => c.id === id)
    || (d.resurfacing && d.resurfacing.id === id ? d.resurfacing : null)
    || null;
}
