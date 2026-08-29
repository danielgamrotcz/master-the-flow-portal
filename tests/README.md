## E2E testy portálu

Vznikly při přestavbě 17. 7. 2026 (audit → fáze 1+2 + brand vrstva). Hlídají:

- `e2e-portal.js` — jádro: gate, dnešek, resurfacing, karta + zpět, hledání s diakritikou, deep linky (21 kontrol)
- `e2e-mereni.js` — session_visit bez PII, ?src= atribuce, gate eventy
- `e2e-offline.js` — service worker cache, offline reload
- `e2e-magic.js` — krátkodobý podepsaný share ticket, gate teaser a 90denní session bez globálního kódu v URL
- `e2e-push.js` — push primer, iOS instruktáž
- `e2e-quiet.js` — klidný den (sám si mockuje 0-karet today.json a vrací zpět)
- `e2e-slovnicek.js` — slovníček: data, hledání, kategorie, detail výrazu, deep linky, propojení s hledáním a s detailem karty (26 kontrol)
- `e2e-sraz.js` — veřejný archiv pražského srazu: ukončený stav, odstraněná registrace, program, účastníci a responzivita
- `api-attendees.js` — veřejný seznam účastníků: allowlist polí, souhlas, CORS, cache a rate limit chráněného zápisu
- `google-forms-attendees.js` — synchronizace používá zadaný e-mail jen interně, respektuje odvolání souhlasu a e-mail neexportuje
- `privacy-public-data.js` — verzovaná veřejná JSON data neobsahují e-maily mimo výslovně povolený kontaktní údaj
- `security-regressions.js` — negativní a pozitivní auth scénáře pro chat corpus, tracking, push subscription a cache policy
- `sraz-asset-versions.js` — shoda sedmimístných cache hashů CSS a JavaScriptu
  stránky srazu s aktuálním obsahem souborů
- `archived-groups.js` — vyřazené stránky a API Skupinek vracejí 410 bez
  historického obsahu a bez cache

Spuštění:

```bash
npx wrangler pages dev . --port 8788
./tests/run-all.sh
```

Adresu serveru drží proměnná `MTF_BASE`, bez ní testy míří na
`http://localhost:8788`. Na jiném portu tedy stačí
`MTF_BASE=http://localhost:9000 ./tests/run-all.sh`.

Playwright se bere přes NODE_PATH z ~/Projects/voice-browser/node_modules
(portál záměrně nemá package.json — deployoval by se).

Složka tests/ je blokovaná v functions/_middleware.js, na produkci není dostupná.

### CI kontrola archivu srazu a vyřazených Skupinek

Workflow `.github/workflows/sraz-e2e.yml` spouští `tests/e2e-sraz.js` a
`tests/archived-groups.js` při pull requestu nebo pushi do `main`, pokud se
změnila stránka srazu, middleware, fonty, hlavičky, Wrangler konfigurace nebo
samotné testy. Před E2E kontroluje také shodu cache hashů stránky srazu.
Lze ho spustit také ručně přes `workflow_dispatch`.

Playwright a Wrangler se v CI instalují v připnutých verzích pouze do
`RUNNER_TEMP`; repozitář proto dál nemá `package.json` ani `node_modules`.
Workflow používá lokální Pages server, nemá produkční tajemství a neobsahuje
žádný push ani deploy krok. Produkční nasazení zůstává samostatnou ručně
schvalovanou akcí.
