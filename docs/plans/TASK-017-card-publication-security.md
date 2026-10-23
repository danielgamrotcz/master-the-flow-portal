# TASK-017 — Obnova publikace karet a zabezpečení portálu

Stav: Review
Tracker: ../../TASKS.md
Poslední checkpoint: 2026-10-23 Europe/Prague

## Výsledek a acceptance

Obnovená publikační cesta a kontrolované bezpečnostní kontrakty jsou VERIFIED. Původní launchd job je znovu registrovaný s původním rozvrhem. Skutečný běh přes run-portal.sh a podepsaný WASnapshot úspěšně dokončil push i produkční nasazení. Členská data zůstávají chráněná a push tajemství je rotované.

Rozsah živého průchodu byl retry již existujícího prázdného digestu. Další přirozený běh a nový neprázdný den zatím nejsou pozorované; netvrdit jejich samostatné živé ověření. Nejde o obecnou záruku bezpečnosti celého systému ani penetrační test.

## Scope a nepovolené kroky

Daniel schválil všechny potřebné opravy a bezpečnostní návrhy, cílené commity, push, deploy, rotaci i obnovu provozu. Výslovně přijal čtyři ověřené scanner false positive a obnovil bootstrap mimo sandbox. Bez force push, resetu, ručních změn generovaných komunitních dat a hromadných notifikací. Zachovat uživatelský slovníček a rozpracovanou OpenAI migraci. Citlivé hodnoty nikdy nevypisovat.

## Aktuální stav

- [x] Bezpečná publikace zastaví deploy po neúspěšném pushi a nasazuje čistý export přesného potvrzeného SHA.
- [x] Trvalý pending, ochrana aktivní Git operace a stabilní index bez časového churnu.
- [x] Obě Git historie zachované a opravy cíleně commitnuté/pushnuté.
- [x] Wrangler OAuth obnoven s minimálními potřebnými scopes.
- [x] Cloudflare production i preview fail_open=false, původní KV/D1 zachované.
- [x] Hlavičky dynamických náhledů a ticket privacy ověřené.
- [x] Push tajemství rotované; soukromý soubor 0600, rodič 0700, loader před stale env.
- [x] Původní launchd registrace a plán obnovené; skutečný run 1, exit 0.
- [x] Pending=false, failures={}, index beze změny a konzistentní s archivem.
- [x] Čerstvý snapshot zdrojových počtů i produkční přístup ověřené.
- [x] Nezávislý verifier dokončen a post-review snapshot shodný.

## Rozhodnutí a objevy

Telegram hlásil selhání publikace digestu. Git push byl od 19. 10. odmítaný kvůli rozdělené historii a Wrangler od 22. 10. vracel 400 při obnově tokenu. Náhledy sociálních sítí jsou jiná část stejného systému. Cloudflare e-mail o zvýšeném podílu botů sám nedokládal únik klíčů.

Původní publikace mohla nasazovat dirty checkout i po neúspěšném pushi. Opravy vážou deploy na konkrétní úspěšně pushnutý SHA, používají git archive a odmítají citlivé konfigurační cesty. Pending se smaže až po úspěchu. Aktivní Git operace zastaví generování. Dva AI nálezy byly samostatně reprodukovány a opraveny; oba povolené verifierem vyvolané opravné cykly jsou vyčerpané.

Čerstvý fetch potvrdil 14 lokálních a 7 remote commitů od b300de5. Lokální měnily pět datových cest, remote jiné soubory; merge 70730d6 zachoval obě historie. Jediný konflikt byl datum trackeru. Nepřepisovat upstream starým checkoutem.

Starší test formuláře závisel na skutečném datu a po publishUntil očekával již skryté profily. Chyba byla samostatně reprodukována. Opraven pouze test stabilními hodinami a kontrolou skrytí po cutoff; produkční datumová ochrana se nezměnila.

Při prvním auditu byla omylem zobrazena historická card-job hodnota tajemství z plistu. Lišila se od aktuálního push jobu; žádnou hodnotu neopakovat. Následná produkční rotace a odstranění plaintext proměnné z obou plistů jsou dokončené. Starý rollback soubor je chráněný mimo repozitář; nejde o aktivní produkční hodnotu.

## Checkpoint projektu

- Produkční deployment 5e37161c-f412-4b6c-82f9-1e38d58bf31d, status success, commit 3f6c1ae447f1f7583164b77e642deb0683cd1b35. Skutečný launchd log 09:19:55–09:20:26 UTC dne 23. 10. 2026.
- WhatsApp opravy 9c422dca580aac455835618449a23eec8e294070 obsahují pouze 4 očekávané soubory; OpenAI migrace zůstává mimo tento commit a nebyla vrácena.
- Původní portal HEAD 274eb1e34a65b99e9d9e335e3d3bc55553147d7b a remote e91d7bb500b4c8463eeb7c0851d089596c16f7c2 jsou zachované v historii.
- Uživatelský tools/build_glossary.py SHA-256 166465a57fed8c01a232f1c0bc2a9b7f1351e90c5d4b5f5fa230f2826a5ec289 a historický CLAUDE.md 689569e0a655689afb0e7d0b0a393ed725084eb1f5769707410a9e72b1de9a21 zůstaly beze změny.
- Pre-repair dirty baseline portal_cards.py: /private/tmp/mtf-portal-cards-before-repair.py, SHA-256 a954b3c09a97cf56f108ddc8330de52a5186b93aa37f3f66b1edb146e99ece2b. Opravný diff /private/tmp/mtf-automation-repair.diff. Kompozice cíleného indexu byla ověřena zvlášť proti této baseline i čistému exportu.
- Registrovaný původní cz.gamrot.portal-cards používá /bin/bash a původní scripts/run-portal.sh. Plist a StartCalendarInterval zachované; RunAtLoad/KeepAlive false. Nyní neběží, další běh řídí původní kalendář.
- Finální checkpoint mění pouze TASKS a tento plán a sám nevyžaduje další deploy. Produkční runtime soubory odpovídají prověřenému snapshotu.

## Ověření

| Tvrzení | Typ | Zdroj a rozsah | Čerstvý důkaz | Provedení | Výsledek | Jistota | Omezení |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Publikační cesta opět funguje | chování | původní launchd wrapper | run 1, exit 0, push/deploy success, pending=false, failures={} | provedeno | SUPPORTED | high | retry existujícího prázdného dne |
| Digest je úplný vůči snapshotu | chování | bezpečná kopie WhatsApp DB | 0 zdrojových/uložených zpráv, snapshot po konci dne, shoda dat | provedeno | SUPPORTED | high | samostatná diagnostika neprokazuje launchd kontext |
| Členská data zůstávají chráněná | chování | skutečná produkce | 31 HTTP kontrol a následných 14 po launchd deployi, člen i anonymní přístup | provedeno | SUPPORTED | high | cílené cesty, nikoli penetrační test |
| Dynamické náhledy fungují bezpečně | chování | produkce a syntetické testy | CSP/nosniff, PNG 200, ticket private/no-store a no-referrer | provedeno | SUPPORTED | high | celá browserová sada blokována prostředím |
| Tajemství je vyměněné a neveřejné | konfigurace | Cloudflare a soukromý loader | CLI stdin upload, úspěšný nový deploy, atomická aktivace, 0600/0700 | provedeno | SUPPORTED | high | doručení push nebylo testováno rozesláním |
| Fail closed a bindingy zachované | konfigurace | Cloudflare | nezávislý GET aktuálního deploymentu | provedeno | SUPPORTED | high | neověřuje všechny historické deploymenty |
| Cizí práce zachovaná | artefakt | oba checkouty | 12 zdrojových hashů, cílený commit, oba rodiče historie | provedeno | SUPPORTED | high | existující migration WIP zůstává lokální |

- Skutečný launchd běh: /private/tmp/mtf-final-launchd-evidence.json. Z původního logu jsou uloženy pouze sanitizované provozní řádky. Pending a failures byly ověřeny i samostatně verifierem.
- Samostatná read-only diagnostika: /private/tmp/mtf-final-source-counts.json. Použila existující shellový bootstrap a podepsaný WASnapshot; Python četl jen dodaný snapshot. Pro 22. 10. je zdrojový počet 0, uložený počet 0 a karet 0. Poznámka neexistuje, což odpovídá legitimní quiet-day větvi. Nejnovější zpráva i mtime DB jsou po konci dne; čerstvost potvrzena. Snapshot uklizen původním trapem.
- Následný produkční smoke: 14/14, 0 selhání; /private/tmp/mtf-final-production-smoke.json. Anonymní odmítnutí bez těla, autentizace člena, today/index/archiv shodné se zdrojem, private/no-store, bezpečnostní hlavičky a veřejný PNG.
- Předchozích 31/31 HTTP kontrol /private/tmp/mtf-production-http-evidence.json a skutečný Chrome desktop / 390 px detail platí pro nezměněné runtime soubory. Viewport vrácen. Rozdíl posledního deploye byl pouze tracker/plán.
- Konzistence 207 archivů a 521 indexovaných karet prošla; index hash 7b82ccd5daae54d2d0da2772f7d485ea5015f8c08e61860ea3553e65b11e0f60 se během skutečného běhu nezměnil a nevznikl prázdný časový commit.
- Lokálně 74 syntetických unit, 19 publikačních testů i nad čistým exportem indexu, 30 negativních auth/privacy kontrol a 42 formulářových kontrol prošly. Python AST, JS/ESM, shell syntax i diff-check prošly. Logy /private/tmp/mtf-resume-unit.log, /private/tmp/mtf-staged-publication-tests.log, /private/tmp/mtf-resume-security.log.
- Wrangler OAuth obnoven dočasným oficiálním 4.119.0 device flow; původní 4.91.0 i skutečný launchd deploy fungují. Scopes pouze account/user read, pages write, offline_access; soubor 0600.
- NOTIFY_SECRET je secret_text v úspěšně nasazeném runtime; soukromý soubor mimo web má 0600/rodič 0700. Loader načítá soubor před starým prostředím. Ostatní názvy serverových tajemství, KV i D1 zachované, production/preview fail_open=false. Hodnoty nikdy v reportu, argv ani testovém výstupu.

## Nezávislá acceptance

Verifier: /root/recovery_acceptance — completed — VERIFIED

Verdikt platí pro obnovenou publikační cestu a kontrolované bezpečnostní kontrakty TASK-017. Verifier sám ověřil launchd registraci/exit/rozvrh, pending/failures a Cloudflare deployment/commit/fail closed/bindingy. Potvrdil 12/12 zdrojových hashů a 3/3 provozních artefaktů. Žádný nový potvrzený blocker. Dokončení ověřeno list_agents.

Post-review snapshot: /private/tmp/mtf-operational-final-snapshot.json, SHA-256 2ed6e5bd2be7b519ffdbc29e2c516218d576a9ce37a658406602fa6d27720317. Parent zopakoval shodu po dokončení verifiera. Následně se mění jen tracker a tento plán.

## Blockery a recovery

Žádný zbývající blocker pro ověřený rozsah obnovy. Historicky sandbox nepovolil bootstrap; Daniel zaregistroval původní plist v běžném Terminálu a následný kickstart i celý skutečný průchod prošly. Registraci zbytečně neopakovat ani job znovu neodhlašovat. Rotaci neopakovat.

Pokud budoucí běh selže, číst sanitizovanou příčinu a pending; neopakovat neomezeně generování ani nepřepisovat upstream. Nedokončená Git operace či nový remote vyžadují vědomé sjednocení. Pending po neúspěšném deployi zůstává true a retry pokračuje původním plánem. Fail closed nerušit.

Zbývající omezení důkazů: další přirozeně naplánovaný běh a generování nového neprázdného dne nepozorovány. Plná automatická E2E skončila na Chromium MachPortRendezvous Permission denied; není to pass. Fyzický dotyk, offline chování a skutečné doručení push nebyly ověřeny. Git guard není společným zámkem proti lidské operaci zahájené během generování. Tyto limity nepřevádět na neprokázaný problém, ale ani nezamlčet.

Historie scanneru: první portal opravný commit a časově stabilní test prošly. Merge byl omylem dokončen po nálezu getteru a následně samovolně pushnut původním retry; omyl byl přiznán. Tři další nálezy označovaly volání loaderu. Daniel přijal všechny 4 ověřené false positive; scanner pass pro tyto případy netvrdit.

## Výsledek a retrospektiva

VERIFIED pro obnovenou publikační cestu a kontrolované bezpečnostní kontrakty. Publikace, přístupová ochrana, rotace a skutečný launchd průchod jsou doložené. Testovací notifikace členům se neposílaly. Uživatelský slovníček a rozpracovaná OpenAI migrace zůstaly zachované. Task je v Review; Done ponecháno na přijetí výsledku, žádné další technické schválení není potřeba.

Tracker SHA-256 po checkpointu: 69ccb6c3d5b047687a0d906ff9613415dd4bee523252bd016cadce0e761e92ca
