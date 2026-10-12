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
- Po změně `sraz/styles.css` nebo `sraz/app.js` aktualizuj sedmimístný SHA-256
  query parametr v `sraz/index.html`; shodu ověřuje
  `node tests/sraz-asset-versions.js`.
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
  `~/Projects/archive/voice-browser/node_modules`. Obsah `.dev.vars` nikdy
  nevypisuj, nekopíruj do konverzace ani necommituj. Pokud Wrangler potřebuje
  download nebo prostředí chybí, řekni to místo změny dependency modelu
  projektu.

## Data a bezpečnost

- Denní digesty, archiv, indexy, přepisy a média považuj za data vlastněná
  externí automatizací. Neupravuj je ručně, pokud zadání výslovně necílí na
  data. `data/events.json` je ruční výjimka.
- U každé akce v `data/events.json` nastav `is_paid` explicitně jako boolean;
  chybějící hodnota se v současném UI zobrazí jako „Zdarma“.
- Klikatelné URL akce ukládej do pole `links`, ne do `description`, které se
  při vykreslení escapuje.
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

## Náhledové karty při sdílení

- Každá veřejná stránka konkrétní akce (webinář, rozhovor, sraz i další
  formáty) musí mít vlastní vygenerovanou náhledovou kartu pro sdílení odkazu.
  Globální karta portálu ji nenahrazuje; ta patří hlavní stránce portálu.
- Výchozí vizuál karet je světlý, minimalistický a v designu Master the Flow:
  světlé pozadí, tmavý čitelný text a střídmý oranžový akcent. Tmavý vizuál
  použij jen na Danielův výslovný pokyn.
- Karta má rozpoznatelně pojmenovat konkrétní akci. Použij minimum textu;
  hosta, číslo dílu nebo termín přidej jen podle relevance a ověřených údajů.
- Stránka musí odkazovat na svou kartu v `og:image` a `twitter:image`, nikoli
  na `og-default.png`. Název a popis sdílení musí odpovídat dané akci.
- Před zveřejněním ověř shodu s obsahem stránky, čitelnost v malém náhledu,
  ořezy a veřejnou dostupnost obrázku bez přihlášení. Po změně názvu, hosta
  nebo termínu zkontroluj i kartu; nové pravidlo samo nepovoluje hromadné
  přegenerování starších karet ani publikaci.

## Obnova náhledů akcí

- Zdrojem termínů a názvů je `data/events.json`; stručnou podobu textu karty
  určuje `tools/event-card-model.js`. Novou akci přidej i do jeho katalogu.
- Karty a metadata obnoví `NODE_PATH=/Users/danielgamrot/Projects/archive/voice-browser/node_modules node tools/generate_event_cards.js`.
  Používá existující Playwright, lokální fonty a žádné externí služby.
- Výstupy jsou v `event-cards/`, sdílecí stránky akcí bez vlastní landing page
  v `akce/`. Generátor upravuje jen metadata existujících landing pages.
- Po obnově vizuálně ověř PNG a spusť `tests/e2e-event-cards.js` se stejným
  `NODE_PATH` proti lokálnímu Wrangleru. Generátor nikdy nespouští deploy.

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
