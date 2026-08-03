# Master the Flow portál

## Účel a orientace

- Statický komunitní portál nasazený na Cloudflare Pages s Pages Functions.
  Nemá build krok, `package.json` ani lokální `node_modules` a je to záměr.
- Klient je v `index.html`, `styles.css`, `app.js` a `sw.js`. API,
  autentizace a middleware jsou ve `functions/`; E2E scénáře v `tests/`.
- `CLAUDE.md` zachovává podrobný produktový a automatizační kontext;
  `tests/README.md` je zdroj pravdy pro plnou E2E sadu. Pro aktuální topologii
  rozhodují skutečné soubory v repozitáři. Tyto dokumenty nemaž ani hromadně
  nepřepisuj.

## Práce v repozitáři

- Nepřidávej `package.json`, dependency, bundler ani build systém bez
  předchozího schválení. Portál se servíruje přímo z kořene repozitáře.
- Pro lehkou kontrolu spusť `node --check` nad změněnými klientskými nebo
  testovacími JS soubory. Pages Functions kontroluj jako ESM pomocí
  `node --input-type=module --check < cesta/k/souboru.js`.
- Po změně `tests/run-all.sh` spusť `bash -n tests/run-all.sh`. Po změně
  `tools/build_glossary.py` ověř Python syntaxi bez vytvoření `__pycache__`:
  `python3 -c 'import ast, pathlib; ast.parse(pathlib.Path("tools/build_glossary.py").read_text())'`.
- Pro změnu uživatelského chování spusť lokálně Wrangler a potom kanonickou
  E2E sadu ve dvou terminálech:

  ```bash
  npx wrangler pages dev . --port 8788
  ./tests/run-all.sh
  ```

  Testy čtou lokální `GATE_CODE` přes existující helper a Playwright berou z
  `~/Projects/voice-browser/node_modules`. Obsah `.dev.vars` nikdy nevypisuj,
  nekopíruj do konverzace ani necommituj. Pokud Wrangler potřebuje download nebo
  prostředí chybí, řekni to místo změny dependency modelu projektu.

## Data a bezpečnost

- Denní digesty, archiv, indexy, přepisy a média považuj za data vlastněná
  externí automatizací. Neupravuj je ručně, pokud zadání výslovně necílí na
  data. `data/events.json` je ruční výjimka.
- Zdroj slovníčku je `tools/glossary_terms.json`. Po jeho změně spusť
  `python3 tools/build_glossary.py`, zkontroluj vygenerovaný
  `data/glossary.json` a nevydávej nedoložený termín bez výskytu.
- Zachovej anonymizaci komunitních dat. Do JSONů, logů, testů ani výstupu
  nepřidávej jména, kontakty, přístupové kódy nebo jiné PII.
- Změny v `functions/`, `_headers`, autentizaci, tokenu, chatu, trackingu,
  push, KV nebo D1 považuj za bezpečnostně citlivé a ověř příslušný gate,
  autorizaci, CORS, cache a rate limit.
- Inline bootstrap v `index.html` je svázaný s CSP SHA-256 v `_headers`.
  Změníš-li jej, aktualizuj hash a ověř, že CSP skript neblokuje.
- Po změně `sw.js`, cache strategie nebo offline dat spusť offline E2E scénář;
  úspěšné načtení online není důkazem offline funkčnosti.

## Projektové konvence

- `CHANGELOG.md` je historický archiv; pro běžné změny jej neaktualizuj.
- Každý CSS `:hover` patří do `@media (hover: hover)`. Vybraný stav od hoveru
  odděl a dotykovou odezvu řeš přes `:active`.
- Nový sraz pojmenuj „Sraz Master the Flow v <městě>“ se značkou „Master the
  Flow“ a nezlomitelnou mezerou po předložce.
- Neměň fungující generovaná data, závislosti ani strukturu repozitáře jako
  vedlejší úklid.

## Produkční akce

- `git push` sám portál nenasazuje.
- Bez samostatného explicitního pokynu nespouštěj Wrangler production deploy,
  externí `portal_cards.py`, backfill, launchd pipeline ani jinou operaci,
  která commituje, pushuje, zapisuje Cloudflare nebo rozesílá notifikace.

## Hotovo znamená

- Relevantní lehké kontroly a E2E scénáře prošly po poslední změně, nebo je
  přesně uvedeno, co nebylo možné spustit a proč.
- Celý diff byl zkontrolován a každý změněný generovaný soubor má vysvětlený
  zdroj.
- U změn UI byly ověřeny dotykové stavy; u service workeru offline chování a u
  bezpečnostních změn nepřihlášený i přihlášený scénář.
- `CLAUDE.md` zůstal zachovaný a sdílená projektová fakta si neodporují.
  Tajemství, externí pipeline a produkční prostředí zůstaly beze změny, pokud
  nebyly výslovnou součástí zadání.
