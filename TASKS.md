# Projektové úkoly

Aktualizováno: 2026-10-18

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

### TASK-016 — Uzavření rozhovoru s Alexem

- Started: 2026-10-21
- Owner: Codex
- Výsledek: uzavřené registrace, proběhlý rozhovor a informace „Záznam připravujeme“ na landing page i v událostech portálu.
- Scope: landing, event data, odpovídající testy, uzavření Google Forms. Odkaz na záznam nesmí být zveřejněn. Merge obou historií, commit, push a produkční deploy výslovně schválené.
- ExecPlan: [docs/plans/TASK-016-close-alex-interview.md](docs/plans/TASK-016-close-alex-interview.md)

#### Verification

- [x] Landing ani portál nenabízejí registraci, stav je Proběhlo a záznam se připravuje.
- [x] Google formulář je skutečně uzavřený i přes původní veřejný odkaz.
- [x] Žádný odkaz na stream nebo záznam nebyl zveřejněn.
- [ ] Cílené E2E, responzivita, rapid security, secrets a nezávislá acceptance.
- [ ] Commit, push, deploy a produkční kontrola stejné verze.

#### Evidence

- Verifier: `/root/alex_archive_acceptance` — completed — PARTIALLY VERIFIED
- Post-review snapshot: nezměněn — event e6114f30, landing d6356075, testy 3ac1ec2e/f06989e3/db49a983; životní cyklus In Progress kvůli produkčnímu release.
- ExecPlan: docs/plans/TASK-016-close-alex-interview.md
- Připojený Chrome: landing 320/390/744/1024/1440/1920 bez overflow; mobilní ovládání tématu, hlavní banner, proběhlá karta a detail bez registrace i videa prošly.
- Syntax tří JS, diff-check a nezávislý Node kontrakt portálu prošly; ostatní eventy a medailonek zachované.
- Kanonická sada exit 1: Chromium nespustil sandbox; google-forms-attendees selhává stejně na baseline. API a Google registrační/count testy prošly; archived-groups prošel. Není vydáváno za úplný E2E success.
- Rapid security: pouze statický obsah a data; žádná změna auth, veřejného API, CSP, middleware, dependencies ani HTML sinků. Žádný potvrzený blocker v tomto diffu. Živý formulář uzavřen přes UI bez práce s odpověďmi.

## Blocked

### TASK-013 — Pevný limit 98 míst

- Started: 2026-10-12
- Owner: Codex
- Výsledek: při naplnění98 míst zavřít Google Forms a nepřidělit další pozvánku ani při souběhu.
- Scope: registrační a count skript, stav plno na LP a regresní testy. Žádné mazání registrací, odebírání pozvánek, změny Meet ani cizího slovníčku. Commit/push/deploy a živá aktivace nové změny vyžadují konkrétní potvrzení.
- ExecPlan: [docs/plans/TASK-013-registration-hard-limit.md](docs/plans/TASK-013-registration-hard-limit.md)
- Resumed: 2026-10-12 — uživatel schválil živou aktivaci, změnu potvrzení formuláře, odmítací e-mail bez Meet, commit, push a deploy. Fresh fetch 0/0, chráněné změny zachované. Nezávislý verifier zatím nedostupný kvůli limitu vláken.
- Resumed: uživatel po konkrétním popisu false positive výslovně požádal dokončit vše pro aktivaci. Nález tests/google-vibe-coding-count.js:22 přijatý; commit/push/deploy schválené. Nezávislý verifier stále nedostupný.
- Blocked: provozní výsledek dokončen; pouze nezávislá acceptance zůstává nedostupná kvůli limitu vláken. PARTIALLY VERIFIED.
- Last safe state: Google limit98 aktivní, čtyři triggery zachované. Commit bfcbcf4 pushnutý; produkce e1d81633-633e-4495-abe7-c88f5a110032 ze stejného commitu. Produkční E2E rozhovoru i kapacity exit0; snapshot23/75.
- Resume from: pouze nezávislá acceptance, až bude dostupná. Neopakovat aktivaci, instalátor ani deploy. Uživatelský slovníček zůstal mimo release.

#### Verification

- [x] Lokální testy: nejvýše 98 unikátních míst, pořadí triggerů, sdílený zámek, duplicity, retry a smazání odpovědi.
- [x] Mock formuláře se zavře a nepřijatý člověk nedostane Meet; 100 odpovědí znamená 98 pozvánek a dvě odmítnutí.
- [x] Web při plné kapacitě nenabízí registraci, ověřeno E2E i vizuálně na mobilu a desktopu.
- [x] Google aktivace, shoda živých skriptů s lokálními soubory a skutečný časový běh.
- [x] Webový release a produkční ověření frontendové změny.

#### Evidence

- Relevantní syntaxe, diff-check, tři Google mock testy a API test prošly. Lokální E2E rozhovoru 37/37, capacity E2E včetně výpadku, obnovy a čtyř viewportů prošly.
- Celá sada exit 1: pouze dvě již evidovaná nesouvisející selhání (slovníček bez doloženého výskytu, google-forms-attendees fixture). Neopravováno mimo scope.
- Verifier: NOT TESTED — capacity_hard_limit_acceptance spawn odmítnut limitem vláken. Oddělený self-review nenahrazuje nezávislé ověření; PARTIALLY VERIFIED.
- Post-review snapshot: invitation GS4b267b44, count GS4c298abb, klient13609ecd, HTMLa99fee6f, capacity test14becf48. Chráněný slovníček166465a5 zachovaný.

- Release: bfcbcf4 → origin/main → Production e1d81633. Vlastní doména vrací klient13609ecd; produkční rozhovor37/37 a capacity E2E exit0. API23/75, updatedAt2026-10-12T16:02:14.064Z. CI se pro tyto cesty podle existujícího workflow nespouští.

### TASK-012 — Živé počty registrací a kapacita rozhovoru

- Started: 2026-10-12
- Owner: Codex
- Výsledek: anonymní počet unikátních registrací a zbývající místa z kapacity 98, automatické obnovování bez falešných údajů při výpadku.
- Scope: landing page, chráněné API a synchronizace Google Forms. Commit, push a produkční deploy včetně předchozí opravy pozvánek výslovně schválené. Cizí tools/build_glossary.py mimo scope.
- ExecPlan: [docs/plans/TASK-012-registration-capacity.md](docs/plans/TASK-012-registration-capacity.md)
- Resumed: 2026-10-12 — uživatel konkrétně schválil uložení klíče do Cloudflare a Google skriptu, anonymní synchronizaci a přijetí tří false positives scanneru. Čerstvý fetch main 0/0, cizí slovníček zachovaný.
- Resumed: konkrétní kombinace Google oprávnění uživatelem schválena a OAuth potvrzen. Probíhá aktivace a produkční kontrola, nový deploy není potřeba.
- Blocked: provozní výsledek kompletní; zbývá jen nezávislá acceptance, jejíž spawn blokuje limit vláken. Celkový formální verdikt PARTIALLY VERIFIED.
- Last safe state: commit 3dcef63 / Production48f88d95, oba produkční E2E prošly. Živý počet16 / zbývá82 ověřený 17:29; automatický časový běh 17:27:45 dokončen. Čtyři správné triggery, bez syntetických registrací a zpráv.
- Resume: pouze nezávislá acceptance finálního snapshotu, až bude dostupná. Neopakovat OAuth, instalátor, nasazení ani registrace.

#### Verification

- [x] Počet z reálných registrací, deduplikace a soukromí ověřené.
- [x] Obnovování, nula, plno a výpadek pokryté testy.
- [x] Mobil a desktop vizuálně ověřené.
- [x] Commit, push a produkční kontrola dokončené.

#### Evidence

- Produkce: https://mastertheflow.cz/rozhovory/1-vibe-coding-s-alexem/, deploy48f88d95 / source3dcef63. Web neměněn po úspěšných produkčních E2E.
- Google instalátor dokončen 17:24:14, skutečný anonymní snapshot16/82. Časový trigger 17:27:45 dokončen13.94s, veřejné API updatedAt15:27:59.174Z. Žádný kontakt neopouští Google.
- Mobil390px i desktop vizuálně ověřené se skutečnými počty. Jednotkové API a count testy znovu exit0, pozvánky25/25. Plná sada má dvě popsaná dřívější nesouvisející selhání.
- Verifier: NOT TESTED — registration_capacity_acceptance spawn odmítnut limitem vláken; self-review není nezávislý.
- Post-review snapshot: API bb535e82, count GS658d0781, klient47fe0dfe, CSS c0f14268, HTML733cb4ce; chráněný slovníček166465a5 beze změny.
- ExecPlan: [docs/plans/TASK-012-registration-capacity.md](docs/plans/TASK-012-registration-capacity.md)

### TASK-011 — Oprava doručování registračních pozvánek

- Started: 2026-10-12
- Owner: Codex
- Výsledek: potvrzení nové registrace e-mailem i pořadateli; stabilní vazba na událost, správný název a čas, připojená tabulka a odstraněná pouze Danielova dnešní testovací odpověď.
- Scope: explicitně schválená oprava živého registračního toku a cílené smazání testu. Bez commitu, pushnutí, deploye portálu a syntetických registrací nebo hromadného rozesílání.
- ExecPlan: [docs/plans/TASK-011-registration-delivery.md](docs/plans/TASK-011-registration-delivery.md)
- Resumed: 2026-10-12 — uživatel schválil oprávnění, aktivaci a cílené odstranění své testovací odpovědi.
- Release scope: 2026-10-12 — uživatel povolil zahrnout tuto opravu do společného commitu, pushnutí a release TASK-012.
- Blocked: aktivace dokončena, čeká pouze uživatelský retest doručení a nezávislá acceptance (limit vláken); PARTIALLY VERIFIED.
- Last safe state: live verify 16:33:12 prošel, dva triggery, soukromá tabulka připojená, schválený test odstraněný, Forms 0 odpovědí. Žádný e-mail ručně odeslán.
- Resume: uživatel provede novou registraci, pak ověřit execution a doručení; neopakovat migraci ani mazání.

#### Verification

- [x] Doručování, retry, deduplikace a soukromí pokryté 25 procházejícími mock testy; syntaxe ověřena.
- [x] Živý skript, triggery, tabulka a kalendář ověřené po opravě.
- [x] Pouze schválený test odstraněný, připraveno pro Danielův retest.
- [ ] Skutečné doručení potvrzené uživatelem.

### TASK-010 — Zobrazení rozhovoru na hlavním portálu

- Started: 2026-10-12
- Owner: Codex
- Výsledek: rozhovor s Alexem v obvyklém banneru hlavní stránky i mezi nadcházejícími akcemi.
- Scope: odkrytí existující akce a odpovídající testy; beze změn designu, landing page, registrace a ostatních akcí. Bez commitu, pushnutí a deploye.
- Režim: contained; nový pokyn nahrazuje dřívější požadavek skrytí.
- Release oprávnění: 2026-10-12 — Daniel výslovně schválil commit, push a produkční nasazení banneru a odkrytí akce. Původní omezení scope na lokální změny je tím pro release nahrazené.
- Blocked: 2026-10-12 — implementace a lokální kontroly dokončené; nezávislý verifier nedostupný kvůli limitu vláken.
- Last safe state: commit 5874eab pushnutý a nasazený; produkční portál 32/32 a LP 37/37 prošly. Zbývá pouze nezávislá acceptance.
- Resume from: nezávislá acceptance finálního diffu po uvolnění vláken; nový deploy automaticky neopakovat.

#### Verification

- [x] Banner a přehled zobrazují rozhovor se správným termínem a odkazem.
- [x] Mobilní a desktopový náhled a relevantní E2E ověřené.
- [ ] Nezávislá acceptance dokončená, chráněné změny zachované.

#### Evidence

- Čerstvý fetch: main 0/0. Cizí tools/build_glossary.py beze změny, SHA-256 166465a57fed8c01a232f1c0bc2a9b7f1351e90c5d4b5f5fa230f2826a5ec289.
- Změna: pouze portal_hidden=false a stručný název ve stávajícím banneru. Ostatní eventová pole a akce byte-významově shodné s HEAD; layout ani registrace nezměněné.
- Cílený e2e-portal po poslední změně: 32 kontrol prošlo; syntaxe všech tří JS a git diff --check prošly. Landing page 37/37, eventové karty 73/73 prošly.
- Kompletní sada: 18 scénářů prošlo, dvě známá selhání ve slovníčku a google-forms-attendees se opakovala. Dotčené testy a jejich zdrojová data/skript jsou shodné s HEAD. Celý běh začal před finálním zkrácením banneru; hlavní portálový E2E a vizuální kontrola pak zopakované.
- Prohlížeč 390 a 1440 px: banner, detail a nadcházející karta prohlédnuté, bez horizontálního přesahu. Mobilní tap i desktopový klik otevřely LP; zavření banneru přežilo reload a neodstranilo kartu akcí.
- Verifier: NOT TESTED — spawn homepage_alex_final_acceptance odmítnut kvůli limitu vláken; druhý read-only self-review provedený, není nezávislý. Verdikt PARTIALLY VERIFIED.
- Post-review snapshot: implementace nezměněná — app 1c2392b…, events 9e67ba4…, portal E2E 25a0ccf…, LP E2E a2be8f5….
- ExecPlan: nepoužit, krátká lokální změna. Commit, push a produkční nasazení nebyly spuštěné.
- Strukturální audit boardu: selhal na 43 chybějících polích dřívějších TASK-001 až TASK-007, žádný nález u nové TASK-010. Historické karty nebyly hromadně přeformátované.
- Predeploy rapid security proti 36bfaeb: žádná potvrzená nová bezpečnostní regrese; pevný escapovaný titulek, pouze veřejná akce, odkazy a všechny serverové ochrany beze změn. Lokální security-regressions 14/14 prošly. Cizí slovníček se do commitu ani exportu nezahrnuje; úplný audit aplikace mimo scope.
- Release: 5874eabb7f3bede0a8fc6b4c86bbbd38cd89fb3f pushnutý do origin/main. Cloudflare Production 356c4b1e-0a13-46dd-9c4d-75dba1303e94, branch main, source 5874eab. Nasazený čistý Git export bez cizí změny slovníčku.
- Produkce https://mastertheflow.cz: e2e-portal 32/32 a e2e-vibe-coding-live 37/37 prošly. app.js a data/events.json jsou byte-identické s releasem. Banner i nadcházející karta ověřené v prohlížeči na 390 a 1440 px, registrační cesta správná. Staged secret scan bez nálezu. CI v tomto kroku nebylo ověřováno; dříve uvedená omezení nezávislé acceptance a plné sady trvají.

### TASK-009 — Text rozhovoru podle Alexových podkladů

- Started: 2026-10-12
- Owner: Codex
- Výsledek: minimalistická stránka s Alexovým medailonkem, jeho tématem přemýšlení o AI a názvem „Vibecoding s Alexem“.
- Scope: texty, metadata a karta tohoto rozhovoru; neměnit layout, registraci, termín, skrytí v portálu ani jiné akce. Forms a Calendar mimo scope.
- Release oprávnění: 2026-10-12 — Daniel výslovně schválil commit, push a produkční nasazení této revize.
- Zdroj: Alexovy dvě screenshotové přílohy a teaser/index.html z ZIPu, dodané ve WhatsAppu 2026-10-12. Importován pouze požadovaný veřejný text, nikoli kód teaseru, formulář nebo propagace kurzu.
- Režim: coordinated; mapper nedostupný (limit vláken), read-only self-map dokončený. ExecPlan nepoužit, krátká textová úprava.
- Blocked: 2026-10-12 — implementace dokončená; nezávislou acceptance blokuje limit agentních vláken.
- Last safe state: commit `6906b5d` pushnutý a nasazený; produkční cílené E2E 37/37 a karty 72/72 prošly. Nezávislá acceptance zůstává neprovedená.
- Resume from: čerstvý nezávislý read-only review tohoto diffu po uvolnění kapacity. Autorizovaný release je samostatný krok a chybějící review nenahrazuje.

#### Verification

- [x] Medailonek a slogan odpovídají dodaným podkladům; název je konzistentní s kartou.
- [x] Počet sekcí, registrace, termín, portrét, skrytí a ostatní akce zachované.
- [x] Cílené testy, mobil a desktop ověřené po změně.
- [ ] Čerstvá nezávislá acceptance dokončená.

#### Evidence

- Baseline `ffc46ce`; čerstvý fetch 0/0. Jediná cizí změna tools/build_glossary.py (166465a57fed8c01a232f1c0bc2a9b7f1351e90c5d4b5f5fa230f2826a5ec289) je mimo scope.
- Cílené E2E: e2e-vibe-coding-live.js 37/37; e2e-event-cards.js 72/72 — prošlo lokálně. Syntaxe obou změněných JS a diff check — prošlo. Plná sada nebyla v této textové revizi spuštěna.
- Vizuální kontrola: desktop a 390px mobil v reálném prohlížeči, nová PNG karta — prošlo. Čtyři stejné sekce, hlavní text 183 → 189 slov.
- Všechny body HTML tagy a atributy jsou identické s baseline. CSS, JS, portrét a cizí změna mají původní hashe. U akce změněn pouze title/description; všechny ostatní akce a jejich karty beze změny.
- Verifier: NOT TESTED — spawn `/root/alex_copy_acceptance` odmítl limit vláken. Oddělený druhý průchod textu, zdrojů a diffu proveden; celkový verdikt PARTIALLY VERIFIED, nikoli nezávislá acceptance.
- Post-review snapshot: HTML f56aa96…, data e350f86…, model 872b760…, test 4ead669…, PNG 4ec5b4e…; implementační snapshot nezměněn.
- Surové přílohy zůstaly jen v dočasné složce /private/tmp/alex-landing-sources-HKUqj9. WhatsApp pouze čtený; žádná zpráva odeslána, žádný kód ze ZIPu spuštěný nebo importovaný.
- Predeploy rapid security proti ffc46ce: pouze veřejný text a PNG, HTML tagy/atributy v body, odkazy, registrační formulář, ochrany a runtime kód beze změny; žádná potvrzená nová bezpečnostní regrese. Chráněný cizí slovníček se nenasazuje. Celkový limit nezávislé acceptance trvá.
- Release: commit `6906b5da533352daff48814bb1ec73155b7bfb14`, push origin/main a Cloudflare Production `49fb0ed8-c5df-4236-ad9a-a2b5c75d7a5f` dokončené. Nasazen čistý Git export bez lokálního slovníčku.
- Produkce: e2e-vibe-coding-live.js 37/37, e2e-event-cards.js 72/72 — prošlo. Veřejné HTML HTTP 200 a byte-identické s releasem (f56aa96…). První deploy selhal interní chybou Cloudflare, druhý stejný commit úspěšný. První browser test ještě načetl starý text; opakování po nasazení prošlo beze změny kódu.
- Release gate: bezpečnostní regrese 14/14 prošly; staged text secret scan bez nálezu, PNG zvlášť shodný s prohlédnutým hashem bez textových metadat či připojeného obsahu. CI se pro tyto cesty nespustilo; nejde o úspěšný CI běh. Dokumentační doplnění po releasu nemění runtime a nenasazuje se znovu.

### TASK-008 — Světlé náhledové karty všech akcí

- Started: 2026-10-12
- Owner: Codex
- Výsledek: devět samostatných světlých karet, metadata a použitelné sdílecí adresy všech akcí v portálu.
- Scope: portál včetně historických akcí; bez úprav externích webů, formulářů, kalendáře a komunitní automatizace. Commit, push a produkční deploy výslovně schválené.
- ExecPlan: [docs/plans/TASK-008-event-cards.md](docs/plans/TASK-008-event-cards.md)
- Blocked: 2026-10-12 — zbývá nezávislá acceptance; spawn i follow-up blokuje limit agentních vláken. Implementace i autorizovaný release dokončené.
- Last safe state: commit `197e386` pushnut a nasazen; produkční karty 72/72 a stránka rozhovoru 36/36 prošly.
- Resume from: ExecPlan, pouze nezávislé review aktuální implementace po uvolnění agentní kapacity; bez automatického nového deploye.

#### Verification

- [x] Všech devět akcí má vlastní světlou kartu a OG/Twitter metadata.
- [x] Sdílení z portálu používá HTTP adresu akce, nikoli samotný hash.
- [x] Nové veřejné podklady neobsahují přístupové údaje, záznamové ani soukromé odkazy.
- [x] Vizuální, funkční a bezpečnostní kontrola dokončené.
- [ ] Nezávislá kontrola dokončená.
- [x] Commit, push a produkční ověření dokončené.

#### Evidence

- Baseline `6e1138a`; fetch potvrdil 0/0. Existující pravidlo v AGENTS.md patří do releasu, cizí tools/build_glossary.py zůstane mimo něj.
- Mapper: `/root/event_cards_impact` — completed; 3 landing pages, 3 externí detaily, 3 pouze hashové detaily.
- Cílené E2E: 72/72 prošlo. Celá sada: 18 scénářů prošlo, 2 předchozí selhání (slovníček a google-forms-attendees) se opakovala. Security regrese 14/14 prošly.
- Všech devět PNG vizuálně zkontrolováno, sdílecí stránka otevřená na desktopu a mobilu 390 px. Druhý render má identické hashe všech výstupů.
- Rapid security proti 6e1138a: žádná potvrzená nová regrese; escapované veřejné pole, allowlist cest, žádné share tickety/privátní údaje, brána zachovaná. Externí sociální sítě nebyly použity k odeslání.
- Nezávislý verifier: NOT TESTED — spawn i follow-up odmítl limit agentních vláken; proveden oddělený self-review. Celkový verdikt PARTIALLY VERIFIED, nikoli plná nezávislá acceptance.
- Post-review snapshot: nezměněn — app 3ebf7ef…, model 72ec3e8…, generátor f76fe5f…, E2E c8307c7…; events.json i cizí tools/build_glossary.py shodné s baseline. Těla tří landing pages byte-identická s 6e1138a.
- Release: `197e386f6906df58bdd678360db404ffc2a06fb3`, origin/main; Cloudflare Production `5d798075-dc7b-4ccf-997f-bde47d8d6e0c`. Deploy z čistého Git exportu bez cizí změny slovníčku.
- Produkce `https://mastertheflow.cz`: `e2e-event-cards.js` 72/72 a `e2e-vibe-coding-live.js` 36/36 — prošlo; všech devět PNG byte-identických s releasem. CI Sraz E2E run `38252081793` — success pro `197e386`.
- Staged secret scan: textové additions bez nálezu; devět nepodporovaných PNG ověřeno zvlášť proti prohlédnutým souborům, bez textových/EXIF metadat a připojeného obsahu.

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

### TASK-015 — Registrace bez pevné kapacity

- Started: 2026-10-18
- Owner: Codex
- Výsledek: registrace se nezavře po 98 lidech a veřejná stránka ukazuje pouze čerstvý počet registrovaných bez kapacity či zbývajících míst.
- Scope: landing page, anonymní count API, registrační a count Apps Script, potvrzení formuláře, YouTube odkaz v pozvánce a regresní testy. Bez replaye dříve odmítnutých registrací, mazání historického ledgeru nebo živého zásahu bez samostatného potvrzení.
- Režim: critical/coordinated; TASK-015 vědomě nahrazuje kapacitní chování TASK-012 a TASK-013, jejich historii nemaže.
- Release scope: 2026-10-18 — Daniel výslovně schválil commit, push a produkční deploy; živou změnu Apps Scriptu provede ručně podle přesného verzovaného zdroje.
- ExecPlan: [docs/plans/TASK-015-unlimited-registration.md](docs/plans/TASK-015-unlimited-registration.md)
- Review: lokální implementace a nezávislá acceptance dokončené. Živá produkce a Google Form stále používají původní zdroj; commit, push, deploy a živá Google aktivace nejsou autorizované.
- Last safe state: změna je pouze v čistém dočasném worktree proti baseline `5cbe29d`; historický ledger a odmítací markery zůstávají beze změny.
- Resume from: koordinovaný živý cutover Apps Script/Form + web release až po samostatném potvrzení; bez replaye historických odmítnutí a bez syntetické registrace.

#### Verification

- [x] API zveřejňuje pouze čerstvý anonymní počet a timestamp.
- [x] Web nikde neuvádí kapacitu ani zbývající místa a CTA zůstává aktivní.
- [x] Google skripty formulář nezavírají a count odpovídá aktuálním unikátním registracím bez historicky odmítnutých odpovědí.
- [x] Cílené testy, lokální E2E, rapid security a nezávislá acceptance prošly.
- [ ] Živá Google aktivace, produkční release a produkční kontrola dokončené.

#### Evidence

- Impact mapa: `/root/unlimited_registration_impact` dokončena; web, API, Apps Script a testy musí být změněné koordinovaně.
- Baseline: `5cbe29d`, shodný s čerstvým `origin/main`. Produkční API 2026-10-18 vracelo 69 registrací a kapacitu 98; Google Form byl otevřený, ale stále obsahoval kapacitní texty.
- Cílené jednotkové a mock testy: API, invitation, count a unlimited invariant — exit 0. Mock ověřil 101 čerstvých registrací, deduplikaci, retry, pokles countu po smazání a žádný replay historického `FULL_*` markeru.
- Lokální Wrangler + Playwright: rozhovorový E2E a registrační E2E — exit 0; CTA zůstává aktivní při 98, 101, stale datech i výpadku, 30s obnova, čtyři viewporty a oba motivy.
- Rapid security proti `5cbe29d`: žádný potvrzený nový nález. Secret, konstantní porovnání, allowlist, 128B limit, rate limit, `no-store` a count-only hranice zachované; žádné PII neopouští Google.
- Plná sada proti správnému lokálnímu serveru — exit 1 kvůli chybějícímu `.dev.vars` pro privátní E2E a dříve evidovanému selhání `google-forms-attendees`; všechny testy dotčeného toku v témže běhu prošly.
- Nezávislá acceptance: první průchod našel replay historicky odmítnutých odpovědí; po opravě druhý průchod `VERIFIED` bez blockeru. Asset hash `e30a38b`, `git diff --check` a syntaxe prošly.
- Manuální pixelová kontrola: NOT TESTED — spravovaná browser policy zablokovala otevření localhostu; behaviorální Playwright layout kontrola prošla.

### TASK-014 — Formát vysílání na landing page

- Started: 2026-10-18
- Owner: Codex
- Výsledek: veřejná landing page už neslibuje Google Meet; uvádí živé online
  vysílání a zachovává odkaz až po registraci.
- Scope: landing page a cílený regresní test. Bez změny formuláře, potvrzovacích
  e-mailů, kalendáře, registrační automatizace a streamového odkazu.
- Release scope: 2026-10-18 — Daniel výslovně schválil commit, push na `main`
  a produkční deploy na Cloudflare Pages.
- Režim: contained; implementace v dočasném čistém worktree kvůli nesouvisející
  rozpracované změně `tools/build_glossary.py` v hlavním checkoutu.

#### Verification

- [x] Veřejný fakt „Kde“ uvádí živé online vysílání a odkaz po registraci.
- [x] Landing page neobsahuje YouTube ani jiný streamový odkaz.
- [x] Cílené automatické a browserové kontroly prošly.

#### Evidence

- `node --check tests/e2e-vibe-coding-live.js` — prošlo.
- `e2e-vibe-coding-live.js` proti lokálnímu Wrangleru — 37/37 prošlo; kontroluje
  také registrační CTA, absenci Meetu a streamových odkazů a layout od telefonu
  po desktop.
- `git diff --check` — prošlo.
- Verifier: `/root/landing_format_recheck` — completed — VERIFIED WITH WARNINGS
- Post-review snapshot před releasem: landing page `29818d7f…`, E2E
  `70e5f311…`; TASK-014 je v Review.
- ExecPlan: nepoužit; krátká změna v jedné session.

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
