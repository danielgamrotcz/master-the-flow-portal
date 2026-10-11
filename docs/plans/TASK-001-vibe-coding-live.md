# TASK-001 — Landing page „Vibe coding nezačíná promptem“

Stav: Done
Poslední checkpoint: 2026-10-11 19:10 CEST
Tracker: [TASKS.md](../../TASKS.md)

## Výsledek a acceptance

- Veřejná landing page v existujícím vizuálu Master the Flow představí live stream s Alexem Trejtnarem ve středu 21. 10. 2026 od 18:00 do 19:30.
- Akce bude zdarma po registraci a záznam dostanou všichni registrovaní.
- Text osloví lidi, kteří už zkusili Lovable, ChatGPT, Codex, Claude Code nebo podobný nástroj, ale stále postupují hlavně přes další a další prompty.
- Stránka nebude slibovat konkrétní aplikaci ani projekt praktické ukázky.
- Stránka uvede pouze tematické okruhy, ne minutový harmonogram jednotlivých částí.
- Nový Google Form bude sbírat jen údaje potřebné pro registraci a přípravu vysílání.
- Po registraci dostane účastník soukromou Calendar pozvánku s Google Meet; hosté neuvidí adresy ostatních.
- Veřejné HTML ani `data/events.json` neodhalí Meet odkaz nebo odkaz na budoucí záznam.

## Scope a nepovolené kroky

- V rozsahu: nový statický eventový povrch, eventová data, cílené testy, registrační formulář, Calendar událost, Apps Script automatizace a lokální vizuální kontrola.
- Mimo rozsah: konkrétní obsah dema, platební tok, automatické rozeslání záznamu po akci a veřejná propagace. Commit, push a produkční deploy byly později samostatně schváleny Danielem.
- Zachovat statickou architekturu bez `package.json`, buildu nebo nové závislosti.

## Aktuální stav

- [x] Čerstvost repozitáře ověřena fetch kontrolou; `main` je čistý a v synchronizaci s `origin/main`.
- [x] Zmapován existující Show & Tell precedens, eventový kontrakt, testy a registrační automatizace.
- [x] Alexova identita a relevantní praxe ověřeny z LinkedInu, GitHubu, App Store a dodaných podkladů.
- [x] Vytvořit a lokálně napojit nový landing, eventová data a testy.
- [x] Vytvořit a publikovat registrační formulář pro každého s odkazem.
- [x] Uložit ověřenou registrační automatizaci do Apps Script projektu.
- [x] Vytvořit Calendar událost s Google Meet a aktivovat automatizaci.
- [x] Spustit syntaktické, behaviorální, vizuální, bezpečnostní a nezávislé acceptance kontroly.

## Rozhodnutí a objevy

- Použít vizuální a technický precedens `/show-and-tell/`, ale veřejný text nebude omezený na členy komunity.
- URL povrchu: `/live/vibe-coding/`.
- Program komunikovat jako okruhy bez časových slotů; závazný je jen celkový čas 18:00–19:30.
- Událost bude mít známý typ `SHOW-AND-TELL`, aby portál zachoval barevnou konvenci.
- Registrační počet se na stránce zobrazovat nebude; nový tok proto nepotřebuje veřejný webhook ani KV klíč.
- Globální `noindex, nofollow` zůstane beze změny; stránka bude veřejně dostupná přes přímý odkaz.
- Použít pouze veřejně ověřená fakta: Alex Trejtnar má přes 20 let praxe v digitálním prostředí, postavil s AI aplikaci ARIBENA a publikuje malé CLI nástroje pro coding agenty.

## Checkpoint projektu

- Root: `/Users/danielgamrot/Projects/master-the-flow-portal`
- Branch: `main`
- Výchozí HEAD: `bfd7d3d5d514fb631a4be9394033d296d5f4d1fd`
- Výchozí worktree: čistý, `main...origin/main`, ahead 0, behind 0.
- Chráněné precedenční soubory před změnou: `show-and-tell/index.html`, `show-and-tell/styles.css`, `show-and-tell/app.js`.

## Ověření

- `node --check` nad změněnými JS — prošlo 2026-10-11 po poslední změně relevantních souborů.
- JSON parse `data/events.json` — prošlo 2026-10-11.
- `bash -n tests/run-all.sh` — prošlo 2026-10-11.
- Cílené E2E nové landing page — prošlo 20/20 kontrol 2026-10-11 se skutečnou publikovanou URL formuláře.
- Test registrační Apps Script logiky — prošlo 10/10 kontrol 2026-10-11. Submit i reconciliation používají stejný `ScriptLock` přes celou sekvenci kontrola–přidání hosta.
- Celá lokální sada — spuštěna 2026-10-11; nové `google-vibe-coding-live-registration` a `e2e-vibe-coding-live` prošly. Sada jako celek selhala na dvou nedotčených existujících oblastech (`e2e-slovnicek`, `google-forms-attendees`), jejichž soubory nejsou součástí změny.
- Vizuální kontrola hero a obsahových sekcí v reálném Chrome — prošla; E2E zároveň nepotvrdilo horizontální overflow na 320–1920 px.
- Read-only security audit — rychlý check prošel bez potvrzeného blockeru pro lokální handoff. Ověřeny veřejné odkazy, browser policy, PII hranice, deduplikace a soukromí hostů; Apps Script má uživatelem výslovně schválený široký OAuth rozsah pro Calendar a Forms.
- Google runtime — instalace dokončena bez chyby; Apps Script UI potvrzuje přesně dva triggery (`onVibeCodingLiveFormSubmit`, `reconcileVibeCodingLiveRegistrations`). Calendar UI potvrzuje správný termín, Google Meet a vypnuté možnosti hostů upravovat událost, zvát další i zobrazit seznam hostů.
- Cloudová read-only kontrola po poslední změně — Apps Script spuštění `verifyVibeCodingLiveRegistrationAutomation` dokončeno bez chyby; existující dva triggery zůstaly aktivní a nebylo nutné je mazat ani znovu vytvářet.
- Živá testovací registrace — záměrně nebyla odeslána, aby nevznikla falešná registrace ani testovací Calendar pozvánka. End-to-end tok je proto doložen strukturou triggeru, runtime instalací a lokálním behaviorálním testem, ne syntetickou produkční odpovědí.
- Nezávislý verifier — PASS 2026-10-11 po opravě souběhu; bez lokálního blockeru. Skutečný souběh triggerů v Google runtime nebyl synteticky vyvolán, což je limit důkazu, ne potvrzená chyba.
- Nezávislý pre-release verifier `/root/vibe_release_verifier` — completed — VERIFIED. Cílené E2E 20/20, Apps Script test 10/10, syntaxe, JSON, diff, veřejný formulář a lokální blokace interních cest prošly.
- Stabilní post-review snapshot: `events 4fa82c14`, `HTML 62e8a663`, `CSS bc57594a`, `app a14add94`, `landing test d0673ed7`, `Apps test 69395a58`, `Apps Script d48ba0f4`, `run-all a756d14d`.
- Review tracker snapshot: `TASKS.md` SHA-256 `9808901ad41e1c398cabd20d5d8582c69301c9893d34060b80268358b523dbbe`.
- Git release — commit `9894067318f55e0e74f7b25ea2ebde323fbf8fb6` byl pushnut na `origin/main`.
- Cloudflare Pages — production deployment `4e3b7cdb-1a38-4c8a-a4dc-c80a8301abac` na větvi `main` používá source `9894067`.
- Produkční landing — `https://mastertheflow.cz/live/vibe-coding/` vrací HTTP 200 a cílené E2E prošlo 20/20.
- Produkční eventová data obsahují správné ID, termín, čas, `is_paid: false` a `recording_url: null`.
- Produkční `/.dev.vars`, `/tools/`, `/tests/` a `/docs/` vracejí HTTP 404. Deploy byl vytvořen z čistého `git archive`, ne z pracovního adresáře.
- Done tracker snapshot: `TASKS.md` SHA-256 `2d58310b7e2d4955e92814fb7b9f044e0d1f46198dac9347a43d181b19b348b1`.

## Blockery a recovery

- Žádný aktivní implementační blocker. Daniel potvrdil, že souběžná událost „Základní střih 2h“ je rezervace studia pro stream.
- Rollback webu: v Cloudflare Pages vrátit předchozí production deployment `4b51a4f1-23fb-482e-8166-5e3a2b96dc90` nebo nasadit čistý archiv předchozího SHA `bfd7d3d`; Google Form, Calendar a Apps Script jsou samostatná rollback plocha.

Obnovení: 2026-10-11 — Daniel dokončil přihlášení a potvrdil vytvoření formuláře, Calendar události a automatických soukromých pozvánek. Čerstvý fetch potvrdil `main` v synchronizaci s `origin/main`; dirty stav přesně odpovídá checkpointu TASK-001. Formulář je publikovaný pro lidi s odkazem, stránka používá skutečnou respondent URL, Calendar událost obsahuje Google Meet a oba automatizační triggery jsou aktivní.

## Výsledek a retrospektiva

- Daniel výsledek přijal; implementace je commitnutá, pushnutá a ověřená v produkci.
- Pokročilý Alexův systém je na stránce záměrně vysvětlen jako postupně vznikající vrstvy, ne jako povinný startovní setup.
- Registrační tok používá jednoduchý Google Form, soukromou Calendar pozvánku a dvě cesty doručení: okamžitý submit trigger a šestihodinovou reconciliation pojistku.
