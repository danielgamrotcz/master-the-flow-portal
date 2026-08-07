## E2E testy portálu

Vznikly při přestavbě 17. 7. 2026 (audit → fáze 1+2 + brand vrstva). Hlídají:

- `e2e-portal.js` — jádro: gate, dnešek, resurfacing, karta + zpět, hledání s diakritikou, deep linky (21 kontrol)
- `e2e-mereni.js` — session_visit bez PII, ?src= atribuce, gate eventy
- `e2e-offline.js` — service worker cache, offline reload
- `e2e-magic.js` — krátkodobý podepsaný share ticket, gate teaser a 90denní session bez globálního kódu v URL
- `e2e-push.js` — push primer, iOS instruktáž
- `e2e-quiet.js` — klidný den (sám si mockuje 0-karet today.json a vrací zpět)
- `e2e-slovnicek.js` — slovníček: data, hledání, kategorie, detail výrazu, deep linky, propojení s hledáním a s detailem karty (26 kontrol)
- `e2e-sraz.js` — veřejná podstránka pražského srazu: obsah, harmonogram, kalendář, registrace a mobilní CTA
- `api-attendees.js` — veřejný seznam účastníků: allowlist polí, souhlas, CORS, cache a rate limit chráněného zápisu
- `google-forms-attendees.js` — synchronizace používá zadaný e-mail jen interně, respektuje odvolání souhlasu a e-mail neexportuje
- `privacy-public-data.js` — verzovaná veřejná JSON data neobsahují e-maily mimo výslovně povolený kontaktní údaj
- `security-regressions.js` — negativní a pozitivní auth scénáře pro chat corpus, tracking, push subscription a cache policy

Spuštění:

```bash
npx wrangler pages dev . --port 8788   # v jednom terminálu
./tests/run-all.sh                      # v druhém
```

Adresu serveru drží proměnná `MTF_BASE`, bez ní testy míří na
`http://localhost:8788`. Na jiném portu tedy stačí
`MTF_BASE=http://localhost:9000 ./tests/run-all.sh`.

Playwright se bere přes NODE_PATH z ~/Projects/voice-browser/node_modules
(portál záměrně nemá package.json — deployoval by se).

Složka tests/ je blokovaná v functions/_middleware.js, na produkci není dostupná.
