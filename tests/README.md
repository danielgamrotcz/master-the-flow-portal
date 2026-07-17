## E2E testy portálu

Vznikly při přestavbě 17. 7. 2026 (audit → fáze 1+2 + brand vrstva). Hlídají:

- `e2e-portal.js` — jádro: gate, dnešek, resurfacing, karta + zpět, hledání s diakritikou, deep linky (21 kontrol)
- `e2e-mereni.js` — session_visit bez PII, ?src= atribuce, gate eventy
- `e2e-offline.js` — service worker cache, offline reload
- `e2e-magic.js` — magic link ?k=, gate teaser, 90denní token (kód čte z .dev.vars)
- `e2e-push.js` — push primer, iOS instruktáž
- `e2e-quiet.js` — klidný den (sám si mockuje 0-karet today.json a vrací zpět)

Spuštění:

```bash
npx wrangler pages dev . --port 8788   # v jednom terminálu
./tests/run-all.sh                      # v druhém
```

Playwright se bere přes NODE_PATH z ~/Projects/voice-browser/node_modules
(portál záměrně nemá package.json — deployoval by se).

Složka tests/ je blokovaná v functions/_middleware.js, na produkci není dostupná.
