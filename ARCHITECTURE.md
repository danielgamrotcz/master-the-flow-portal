# Architektura portálu

## Komponenty

- Kořenové HTML/CSS/JS — statický klient, navigace a prezentace komunitních dat.
- `sw.js` — offline cache a aktualizační hranice.
- `functions/_middleware.js` a auth/session utility — vstupní bezpečnostní
  hranice.
- `functions/api/` — konkrétní čtecí a zápisové endpointy.
- `data/` — statická, ručně vlastněná i automaticky generovaná data.
- `tests/` — lokální end-to-end a kontraktní kontroly.

## Tok a invarianty

Prohlížeč načte statické soubory, autentizované operace vedou přes Pages
Functions a data se čtou nebo zapisují pouze přes vlastní route. CSP hash,
service-worker cache, asset verze a auth/session pravidla jsou samostatné
kontrakty; úspěch jedné vrstvy nedokazuje ostatní.

## Provoz a obnova

Lokální prostředí poskytuje Wrangler. Produkční Cloudflare stav, KV/D1 či jiné
provider zdroje se nemění bez approval. Každá změna musí mít cílený E2E a
rollback pro přesný soubor, route nebo datový artefakt; sdílené zdroje se
nepřepisují plošně.
