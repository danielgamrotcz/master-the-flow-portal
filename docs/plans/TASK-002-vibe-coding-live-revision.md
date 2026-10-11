# TASK-002 — Zjednodušení landing page „Vibe coding nezačíná promptem“

Stav: Done
Poslední checkpoint: 2026-10-11 20:02 CEST
Tracker: [TASKS.md](../../TASKS.md)

## Výsledek a acceptance

- Landing page vychází z Danielovy situace: už zkusil Lovable nebo coding agenta, něco vytvoří, ale výsledek není ten, který zamýšlel, a další prompty problém spíše lepí.
- Text láká na živý rozhovor a Alexovo rozhodování, ale neslibuje pevnou metodiku, konkrétní demo, přesný obsah ukázek ani polovinu vysílání na sdílené obrazovce.
- Struktura je kratší, vizuálně zarovnaná na společný grid a má jednu dominantní registrační akci.
- Stránka obsahuje ověřenou Alexovu profilovou fotografii z veřejného LinkedIn profilu jako lokální asset; přímý hotlink se nepoužije.
- Datum, čas, bezplatnost, Google Meet, soukromá pozvánka, záznam a registrační URL zůstávají beze změny.
- Eventová data, HTML a cílený E2E test si neodporují.

## Scope a nepovolené kroky

- V rozsahu: `live/vibe-coding/`, odpovídající položka v `data/events.json`, cílený E2E test a task dokumentace.
- Mimo rozsah implementace: Google Form, Calendar událost, Apps Script automatizace a jiné části portálu.
- Historický TASK-001 a jeho release důkazy zůstávají beze změny.

## Routing packet

- Režim: coordinated; jeden writer.
- Důvod: veřejná obsahová a vizuální změna má vazby do eventových dat a E2E kontraktu.
- Rizikové plochy: přehnané sliby, rozpor mezi landingem a portálem, mobilní layout, expirující LinkedIn CDN URL, oprávnění k použití portrétu.
- Gates: syntaxe JS, parse JSON, cílené E2E, kontrola overflow 320–1920 px, vizuální QA desktop/mobile a nezávislý verifier.
- Známá nejistota: skutečný obsah živých ukázek se rozhodne až podle rozhovoru; stránka jej proto záměrně nekonkretizuje.

## Checkpoint projektu

- Root: `/Users/danielgamrot/Projects/master-the-flow-portal`
- Branch: `main`
- Výchozí HEAD: `226eba60466b164c763c344ea45b282ecc36e860`
- Výchozí stav: čistý, `main...origin/main`, ahead 0, behind 0, čerstvý fetch.
- Impact mapper: `/root/vibe_revision_impact` — completed; potvrdil obsahové vazby, CSP omezení pro hotlink a testovací kontrakty.

## Průběh

- [x] Ověřit čerstvost repozitáře a projektové instrukce.
- [x] Zmapovat dopady a konkrétní příliš silné sliby.
- [x] Ověřit Alexovu identitu a profilovou fotografii na veřejném LinkedIn profilu.
- [x] Upravit obsah, strukturu, vizuál, eventová data a cílený test.
- [x] Spustit technické, responzivní a vizuální ověření.
- [x] Získat nezávislou acceptance kontrolu a přesunout task do Review.
- [x] Po Danielově schválení commitnout, pushnout, nasadit a ověřit produkci.

## Ověření

- `node --check` nad změněným cíleným E2E a existujícím landing JavaScriptem — prošlo.
- `jq empty data/events.json` a `git diff --check` — prošlo.
- Cílené E2E `tests/e2e-vibe-coding-live.js` — 23/23 — prošlo po poslední funkční změně.
- Hlavní portálový E2E — prošlo; navíc byl v reálném runtime otevřen detail nové akce a potvrzena absence nadpisu i sekce „Program“.
- Registrační automatizace — 10/10 — prošlo v plné sadě; její kód zůstal beze změny.
- Responzivní kontrola — prošla na 320, 390, 744, 1024, 1440 a 1920 px.
- Vizuální QA — desktop 1440 × 900 a mobil 390 × 844 po poslední CSS změně; společný grid, portrét, CTA a skládání sekcí bez viditelného overflow.
- Plná sada `./tests/run-all.sh` — spuštěna. Nový scénář i dotčené portálové a automatizační scénáře prošly; sada jako celek selhala na dvou známých nedotčených oblastech `e2e-slovnicek` a `google-forms-attendees`, stejně jako před TASK-002.
- První nezávislá kontrola našla rozpor mezi `program` a portálovým nadpisem „Program“; oprava změnila hodnotu na `null` a skutečný runtime rozpor odstranila.
- Fresh verifier `/root/vibe_revision_verifier_final` — VERIFIED; finální funkční snapshot zůstal stabilní.
- Funkční snapshot: HTML `a7c977d…`, CSS `e81dc55…`, app `a14add9…`, foto `ac67504…`, eventy `4d4be43…`, cílený E2E `da90431…`.
- Implementační commit `626ea8a50b9d3a21b2905ea57477ad96cb12b611` byl pushnut na `origin/main`.
- Cloudflare Pages deployment: `https://4adbdf37.master-the-flow-portal.pages.dev`.
- Produkce `https://mastertheflow.cz/live/vibe-coding/` — stránka i fotografie HTTP 200; cílené E2E 23/23 prošlo.
- Produkční ochrana: `.dev.vars`, `tools/` a `tests/` vracejí 404; `/docs/` vrací pouze kořenovou přístupovou bránu portálu, ne interní dokumentaci.

## Neověřeno po publikaci

- Google Form a Calendar zůstaly beze změny; nebyla odeslána testovací registrace.
- Fotografie je ověřená jako Alexova veřejná profilová fotografie a je uložena lokálně. Daniel použití připravených podkladů schválil; samostatné potvrzení držitele práv nebylo nezávisle doloženo.

## Recovery

- Nasazený funkční stav odpovídá commitu `626ea8a`. Návrat lze provést novým reverzním commitem a následným Cloudflare Pages deploymentem; předchozí vydaná verze byla na commitu `226eba6`.
