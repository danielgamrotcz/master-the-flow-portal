# Projektové úkoly

Aktualizováno: 2026-10-12

Backlog není souhlas začít; Ready vyžaduje schválení a WIP limit je jeden.
Review obsahuje čerstvé cílené E2E důkazy, Done přijetí. Task neautorizuje
produkci, backfill, notifikaci, změnu živých dat, commit ani push.

## Inbox

_Žádné položky._

## Backlog

_Žádné položky._

## Ready

_Žádné položky._

## In Progress

### TASK-008 — Světlé náhledové karty všech akcí

- Started: 2026-10-12
- Owner: Codex
- Výsledek: devět samostatných světlých karet, metadata a použitelné sdílecí adresy všech akcí v portálu.
- Scope: portál včetně historických akcí; bez úprav externích webů, formulářů, kalendáře a komunitní automatizace. Commit, push a produkční deploy výslovně schválené.
- ExecPlan: [docs/plans/TASK-008-event-cards.md](docs/plans/TASK-008-event-cards.md)

#### Verification

- [x] Všech devět akcí má vlastní světlou kartu a OG/Twitter metadata.
- [x] Sdílení z portálu používá HTTP adresu akce, nikoli samotný hash.
- [x] Nové veřejné podklady neobsahují přístupové údaje, záznamové ani soukromé odkazy.
- [ ] Vizuální, funkční, bezpečnostní a nezávislá kontrola dokončené.
- [ ] Commit, push a produkční ověření dokončené.

#### Evidence

- Baseline `6e1138a`; fetch potvrdil 0/0. Existující pravidlo v AGENTS.md patří do releasu, cizí tools/build_glossary.py zůstane mimo něj.
- Mapper: `/root/event_cards_impact` — completed; 3 landing pages, 3 externí detaily, 3 pouze hashové detaily.
- Cílené E2E: 72/72 prošlo. Celá sada: 18 scénářů prošlo, 2 předchozí selhání (slovníček a google-forms-attendees) se opakovala. Security regrese 14/14 prošly.
- Všech devět PNG vizuálně zkontrolováno, sdílecí stránka otevřená na desktopu a mobilu 390 px. Druhý render má identické hashe všech výstupů.
- Rapid security proti 6e1138a: žádná potvrzená nová regrese; escapované veřejné pole, allowlist cest, žádné share tickety/privátní údaje, brána zachovaná. Externí sociální sítě nebyly použity k odeslání.
- Nezávislý verifier: NOT TESTED — spawn i follow-up odmítl limit agentních vláken; proveden oddělený self-review. Celkový verdikt PARTIALLY VERIFIED, nikoli plná nezávislá acceptance.
- Post-review snapshot: nezměněn — app 3ebf7ef…, model 72ec3e8…, generátor f76fe5f…, E2E c8307c7…; events.json i cizí tools/build_glossary.py shodné s baseline. Těla tří landing pages byte-identická s 6e1138a.

## Blocked

### TASK-006 — Podpora živé účasti na rozhovoru

- Started: 2026-10-12
- Owner: Codex
- Výsledek: jasný důvod přijít živě, nenápadný záznam, účast bez přípravy, registrace pouze s povinným e-mailem a užitečné potvrzení.
- Scope: bez připomínek, propagace s Alexem a organizace vysílání. Zachovat otázky a odpovědi formuláře, adresu registračního e-mailového pole, pozvánkovou automatizaci, portrét a skrytí v portálu.
- Oprávnění: uživatel schválil úpravy webu a registrace, commit, push a produkční deploy.
- Blocked: 2026-10-12 — čeká potvrzení uložení změn živého Google Forms v browser workflow; webová část je dokončená.
- Last safe state: webový commit `63e76bd` pushnut a nasazen, produkční cílené E2E 31/31 prošlo; formulář nezměněný.
- Resume from: [ExecPlan](docs/plans/TASK-006-live-attendance.md), potvrdit uživatelovu odpověď a nastavení živého formuláře.

#### Verification

- [x] Web vysvětluje živé dotazy a účast bez instalace či připraveného projektu; záznam je pod CTA.
- [ ] Formulář vyžaduje jen e-mail; zkušenosti, vlastní otázky a jméno zůstávají nepovinné.
- [ ] Potvrzení vysvětluje doručení pozvánky a kontakt při nedoručení, bez spuštění automatizace.
- [x] Mobil, desktop, relevantní testy, bezpečnostní a nezávislá kontrola webové části dokončené.

#### Evidence

- Baseline: `6e2b591`; čistý `main`, čerstvý fetch potvrdil synchronizaci.
- Mapper: `/root/live_attendance_impact` — completed. E-mailový titulek a Calendar lookup jsou chráněné kontrakty; instalátor automatizace se nesmí spouštět kvůli textu.
- Cílené E2E 31/31 a lokální test automatizace 11/11 — prošlo. Celá sada 17 scénářů prošlo, 2 selhaly na reprodukovaných chybách nedotčeného slovníčku a registrací srazu. Syntaxe a diff — prošlo.
- Rapid security check proti `6e2b591`: bez nové potvrzené regrese. Odkazy, e-mailový titulek, Calendar lookup, ochrana hostů, deduplikace a hlavičky beze změny. Změna skriptu je omezena na potvrzovací text; živý skript nebyl spuštěn ani upraven.
- Verifier: `/root/live_attendance_acceptance` — completed — VERIFIED pro lokální web a zdroj potvrzení; živý formulář NOT TESTED.
- Post-review snapshot: nezměněn — HTML `85122fa…`, CSS `8763095…`, E2E `ad1f09e…`, test automatizace `9c8f049…`, skript `c6a72d2…`.
- Vizuální kontrola: 390 a 1440 px, světlý a tmavý režim — prošlo; E2E pokrývá 320–1920 px.
- Živý Google Form: dosud beze změny; čeká potvrzení uživatele pro uložení nepovinného jména, informační věty a nového potvrzení. Před změnou vyžaduje e-mail i jméno; ostatní otázky jsou nepovinné.
- Recovery: web obnovit deployem předchozího commitu; formulář vrátit z nepovinného jména na povinné a obnovit původní potvrzení uložené v Git baseline. Odpovědi ani otázky se nemažou.
- ExecPlan: [docs/plans/TASK-006-live-attendance.md](docs/plans/TASK-006-live-attendance.md)
- Produkce: deployment `6b77342e`, source `63e76bd`. HTML/CSS/JS na `https://mastertheflow.cz/live/vibe-coding/` mají HTTP 200 a přesně odpovídají releasu; E2E 31/31 prošlo.

## Review

### TASK-007 — První díl v části Rozhovory

- Started: 2026-10-12
- Owner: Codex
- Výsledek: `/rozhovory/1-vibe-coding-s-alexem/`, název „Vibe coding s Alexem“, číslování první epizody a trvalé přesměrování původní URL.
- Scope: změna webu a jeho eventových odkazů; registrace, kalendář a skrytí v portálu zachované. Následný pokyn prodloužil webový čas do 20:00: rozhovor 18:00–19:30, otázky a odpovědi diváků 19:30–20:00. Živý formulář z TASK-006 zůstává oddělený a nedokončený.

#### Verification

- [x] Nová veřejná cesta, číslo dílu, titulek a metadata jsou konzistentní.
- [x] Stará cesta s lomítkem, bez něj a s index.html přesměruje bez ztráty query a fragmentu.
- [x] Registrační odkazy, assety, skrytí v portálu a bezpečnostní ochrany zachované.
- [x] Vizuální, funkční, bezpečnostní a nezávislá kontrola dokončené.

#### Evidence

- Baseline `a0fe75a`; čistý `main`, čerstvý fetch, bez rozdílu proti upstreamu.
- Mapper: `/root/interview_route_impact` — completed; veřejný název není Calendar lookup.
- Cílené E2E 36/36, bezpečnostní regrese 14/14, syntaxe a diff — prošlo. Celá sada selhala na dvou již doložených problémech slovníčku a registrací srazu; ostatních 17 scénářů prošlo.
- Rapid security: přesný same-origin redirect, stávající ochrany beze změny; nezávislé HTTP potvrdilo CSP, chráněná data 403/no-store, interní testy 404 a archivované Skupinky 410/no-store.
- Vizuální kontrola mobilu i desktopu, světlého i tmavého režimu — prošlo. Cílené E2E pokrývá 320–1920 px.
- Verifier: `/root/interview_route_acceptance` — completed — VERIFIED
- Post-review snapshot: nezměněn — HTML `38978d9…`, middleware `ed49ea6…`, E2E `cb2a3de…`, eventy `824a70c…`; CSS, JS, portrét a registrační skript shodné s baseline.
- ExecPlan: nepoužit; krátká změna v jedné session.
- Doplnění času: cílené E2E 36/36, syntaxe testu a vizuální kontrola desktopu a mobilu 390 px prošly po poslední úpravě. Aktuální HTML `e4bbd81…`, eventy `d22492f…`, E2E `c890945…`. Předchozí nezávislá kontrola se týká přesunu a názvu, nikoli následné časové úpravy.
- Release: uživatel 2026-10-12 výslovně schválil commit, push a produkční deploy. Živý formulář, Calendar ani odeslání registrace nejsou součástí releasu; pozvánková automatizace dosud používá konec 19:30 a vyžaduje samostatné sladění.

### TASK-005 — Minimalistická revize stránky rozhovoru

- Started: 2026-10-12
- Owner: Codex
- Výsledek: kratší text bez opakování, klidnější rozvržení a čitelné mobilní i desktopové zobrazení. Fotografie zůstává čtvercová v oranžové sekci, akce skrytá v portálu.

#### Verification

- [x] Registrace, termín, dostupnost záznamu, název série a Alexův profil zachované.
- [x] Text a délka stránky zkrácené; odstraněné opakování, číslované panely a dekorativní registrační karta.
- [x] Světlý i tmavý režim, mobil, desktop, klávesnice a registrační tlačítka vizuálně i funkčně ověřené.
- [x] Čerstvé cílené E2E a nezávislá acceptance kontrola dokončené.
- [x] Název a úvod veřejného Google Forms sladěné s webem; otázky i automatizace zachované.

#### Evidence

- Cílené E2E: `tests/e2e-vibe-coding-live.js` — 29/29 — prošlo lokálně.
- Celá lokální sada `tests/run-all.sh`: 17 scénářů prošlo, 2 selhaly mimo rozsah změny. `e2e-slovnicek` hlásí termíny s `mentions: 0` (ověřeno i v datech HEAD). `google-forms-attendees` selže na zařazení testovacího profilu a následně na `Object.keys(undefined)`; test i jeho jediný načítaný skript `tools/google_forms_attendees.gs` jsou beze změny oproti HEAD. Tyto části nebyly opravovány.
- Syntaxe změněných JS a `git diff --check` — prošlo.
- Vizuální kontrola: 390 × 844 a 1440 × 900, světlý i tmavý režim; E2E šířky 320 až 1920 px — prošlo.
- Hlavní text: 281 → 157 slov. Čtvercový portrét pouze v oranžové sekci, registrace zachovaná, žádné nové sliby ukázek.
- Verifier: `/root/minimal_landing_acceptance` — completed — VERIFIED.
- Post-review snapshot: nezměněn — HTML `51f960f…`, CSS `9faabe4…`, JS `c4f7c9f…`, E2E `f1d8ea4…`.
- Formulář: veřejně ověřen název „Vibe coding nezačíná promptem | Alex Trejtnar“ a série „Rozhovory Master the Flow“. Bez testovací registrace či rozesílání pozvánek.
- ExecPlan: nepoužit; krátká změna v jedné session.
- Release této revize: neproveden; webové úpravy jsou zatím lokální.

## Done

### TASK-004 — Vyvážení rolí Daniela a Alexe v textu landing page

- Started: 2026-10-11
- Accepted: 2026-10-11 — Daniel schválil commit, push a produkční nasazení.
- Owner: Codex
- Výsledek: hero ani další text nesrovnávají Danielovu pokročilost s Alexem. Alexova odbornost je pojmenovaná přímo, bez shazování moderátora.
- Release: commit `84d50db`, push na `origin/main` a Cloudflare Pages deployment `b11218e0.master-the-flow-portal.pages.dev` dokončeny.

#### Verification

- [x] Landing page ani eventová data neobsahují sebeumenšující srovnání Daniela s Alexem.
- [x] Text konkrétně uznává Alexovu zkušenost a propracovaný systém.
- [x] Cílené E2E a vizuální kontrola prošly.
- [x] Nezávislý verifier potvrdil acceptance criteria.
- [x] Produkční landing page a nový deployment vracejí HTTP 200.
- [x] Produkční cílené E2E prošlo 27/27 a hlavní portálový E2E prošel.

#### Evidence

- Cílené E2E: `tests/e2e-vibe-coding-live.js` — 27/27 — prošlo lokálně, na deployment URL i na kanonické produkci.
- Portálový E2E: `tests/e2e-portal.js` — prošlo lokálně i na kanonické produkci.
- Vizuální kontrola: desktop 1440 × 900 a mobil 390 × 844 — prošlo bez overflow.
- Verifier: `/root/vibe_role_balance_verifier_final` — completed — VERIFIED
- Post-review snapshot: nezměněn — HTML `aab256b…`, CSS `77fe5c6…`, eventy `4351944…`, E2E `8c9c0a5…`.
- ExecPlan: nepoužit; šlo o krátkou změnu v jedné session.
- Produkce: `https://mastertheflow.cz/live/vibe-coding/` — HTTP 200.

### TASK-003 — Přesun Alexovy fotografie a civilnější text landing page

- Started: 2026-10-11
- Accepted: 2026-10-11 — Daniel schválil commit, push a produkční nasazení.
- Owner: Codex
- Výsledek: hero zůstává bez portrétu; Alexova fotografie je jako čtverec pouze v oranžové profilové sekci. Text stránky neobsahuje dlouhé pomlčky a je kratší, konkrétnější a civilnější.
- Release: commit `7cc97d6`, push na `origin/main` a Cloudflare Pages deployment `672b7fe7.master-the-flow-portal.pages.dev` dokončeny.

#### Verification

- [x] Cílené E2E potvrzuje jediné umístění fotografie mimo hero a čtvercový formát.
- [x] Veřejná stránka ani eventová data této akce neobsahují dlouhou pomlčku.
- [x] Desktop 1440 × 900 a mobil 390 × 844 jsou vizuálně zkontrolované bez overflow.
- [x] Produkční landing page vrací HTTP 200 a cílené E2E 26/26 prošlo.
- [x] Produkční hlavní portálový E2E po změně eventových dat prošel.
- [x] Nezávislý verifier potvrdil acceptance criteria.

#### Evidence

- Cílené E2E: `tests/e2e-vibe-coding-live.js` — 26/26 — prošlo lokálně i v produkci.
- Portálový E2E: `tests/e2e-portal.js` — prošlo lokálně i v produkci.
- Verifier: `/root/vibe_photo_copy_verifier` — completed — VERIFIED
- Post-review snapshot: nezměněn — HTML `9fecdb4…`, CSS `bbf0c53…`, eventy `82a84ab…`, E2E `11d75fa…`.
- ExecPlan: nepoužit; šlo o krátkou změnu v jedné session.
- Produkce: `https://mastertheflow.cz/live/vibe-coding/` — HTTP 200.

### TASK-002 — Zjednodušení landing page „Vibe coding nezačíná promptem“

- Started: 2026-10-11
- Accepted: 2026-10-11 — Daniel schválil použití připraveného obsahu, commit, push a produkční nasazení.
- Owner: Codex
- ExecPlan: [docs/plans/TASK-002-vibe-coding-live-revision.md](docs/plans/TASK-002-vibe-coding-live-revision.md)
- Výsledek: stručnější a vizuálně sjednocená landing page postavená na Danielových otázkách člověka, který používá Lovable či coding agenty, ale stále nedostává zamýšlené výstupy.
- Release: commit `626ea8a`, push na `origin/main` a Cloudflare Pages deployment `4adbdf37.master-the-flow-portal.pages.dev` dokončeny.

#### Verification

- [x] Produkční landing page a Alexova fotografie vracejí HTTP 200.
- [x] Produkční cílené E2E landing page — 23/23 — prošlo.
- [x] Eventová data mají `program: null`; portál nevydává otevřené otázky za pevný program.
- [x] Interní `.dev.vars`, `tools/` a `tests/` nejsou veřejně dostupné; `/docs/` je pouze fallback na přístupovou bránu portálu.
- [x] Nezávislý verifier `/root/vibe_revision_verifier_final` — VERIFIED; funkční snapshot zůstal stabilní.

### TASK-001 — Landing page „Vibe coding nezačíná promptem“

- Started: 2026-10-11
- Resumed: 2026-10-11 — Daniel dokončil interaktivní přihlášení a potvrdil vytvoření formuláře, Calendar události a automatických soukromých pozvánek.
- Accepted: 2026-10-11 — Daniel schválil commit, push a produkční nasazení.
- Owner: Codex
- ExecPlan: [docs/plans/TASK-001-vibe-coding-live.md](docs/plans/TASK-001-vibe-coding-live.md)
- Výsledek: veřejná landing page pro bezplatný live stream 21. 10. 2026 od 18:00, registrační Google Form a soukromé Calendar pozvánky s Google Meet.
- Release: commit `9894067`, push na `origin/main` a Cloudflare Pages production deployment `4e3b7cdb-1a38-4c8a-a4dc-c80a8301abac` dokončeny.

#### Verification

- [x] Veřejná stránka a eventová data jsou konzistentní se skutečným formulářem.
- [x] Registrační CTA vedou na nový formulář a veřejně neodhalují Meet ani záznam.
- [x] Lokální test registrační logiky chrání adresy hostů a neposílá duplicitní pozvánky.
- [x] Responzivní cílené E2E nové stránky prošlo 20/20.
- [x] Calendar událost, aktivace Apps Scriptu, bezpečnostní kontrola a nezávislý verifier jsou dokončené.

#### Evidence

- Cílené E2E: `tests/e2e-vibe-coding-live.js` — 20/20 — prošlo.
- Registrační automatizace: `tests/google-vibe-coding-live-registration.js` — 10/10 — prošlo.
- Verifier: `/root/vibe_release_verifier` — completed — VERIFIED
- Post-review snapshot: nezměněn — stabilní implementační hashe jsou uložené v ExecPlanu.
- ExecPlan: [docs/plans/TASK-001-vibe-coding-live.md](docs/plans/TASK-001-vibe-coding-live.md)
- Produkce: `https://mastertheflow.cz/live/vibe-coding/` — HTTP 200 a cílené E2E 20/20 — prošlo.
