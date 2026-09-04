# Master the Flow portál

Projekt záměrně nemá `LICENSE`; zdroj ani obsah nejsou bez samostatného
rozhodnutí určeny k dalšímu šíření.

Statický komunitní portál na Cloudflare Pages s Pages Functions pro
autentizaci, komunitní data a interaktivní funkce.

## Mapa

- `index.html`, `styles.css`, `app.js`, `sw.js` — hlavní klient a offline
  vrstva; projekt záměrně nemá package manifest ani build.
- `functions/` — serverové routy, autentizace, session a zápisové endpointy.
- `data/` — kombinace ručních a externě generovaných dat; vlastnictví
  jednotlivých souborů určuje `AGENTS.md`.
- `tests/` — kanonické E2E a cílené contract kontroly.
- `sraz/`, `show-and-tell/`, `skupinky/` — samostatné produktové plochy.

## Bezpečná práce

Přesné příkazy, CSP, offline, datové a release invarianty jsou v
`AGENTS.md`. Lokální ověření používá Wrangler a projektovou E2E sadu, ale
produkční deploy, backfill, notifikace, commit a push vyžadují vlastní
schválení. `CHANGELOG.md` je historický archiv, ne operativní tracker.
