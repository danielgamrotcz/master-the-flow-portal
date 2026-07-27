// Čtení karet zevnitř Functions, mimo přihlašovací bránu.
//
// Datové soubory chrání middleware, protože obsahují přepisy diskuzí a plná
// těla karet. Server je ale potřebuje i pro nepřihlášené návštěvníky, a to ve
// dvou místech: náhled sdíleného odkazu (Open Graph) a upoutávka nad bránou.
// Obojí ukazuje jen titulek a úryvek, tedy to, co má lidi na portál přivést.
//
// env.ASSETS.fetch() sáhne na statický soubor přímo, bez průchodu middlewarem.
// Kdyby se místo toho volalo fetch(origin + cesta), request by šel znovu přes
// bránu a vrátil by 403.

/** Najde kartu podle id v archivu jejího dne. Vrací null, když neexistuje. */
export async function loadCard(env, request, id) {
  if (!env?.ASSETS) return null;
  const date = id.slice(0, 10);
  const url = new URL(request.url);
  url.pathname = `/data/archive/${date}.json`;
  url.search = '';
  try {
    const r = await env.ASSETS.fetch(new Request(url.toString()));
    if (!r.ok) return null;
    const d = await r.json();
    return (d.cards || []).find(c => c.id === id)
      || (d.resurfacing && d.resurfacing.id === id ? d.resurfacing : null)
      || null;
  } catch {
    return null;
  }
}
