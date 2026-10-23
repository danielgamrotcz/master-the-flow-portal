# TASK-017 — Obnova publikace karet a zabezpečení portálu

Stav: Blocked
Tracker: ../../TASKS.md
Poslední checkpoint: 2026-10-23 Europe/Prague

## Výsledek a acceptance
Automatika publikuje aktuální digest a náhledy bezpečnou cestou. Veřejné odpovědi nezpřístupní přepisy ani tajemství. Dokončení vyžaduje skutečný launchd průchod a produkční ověření data, počtů zpráv, karet, archivu a náhledů, včetně přihlášeného detailu a mobilního dotyku.

## Scope a nepovolené kroky
Daniel schválil potřebné opravy a navržené bezpečnostní úpravy včetně obnovy produkčního provozu; při pokračování 23. 10. dodal plná technická oprávnění. Bez force push, resetu, ručních změn generovaných komunitních textů a hromadných notifikací. Zachovat rozpracovaný slovníček a OpenAI migraci. Citlivé hodnoty nevypisovat.

## Aktuální stav
- [x] Read-only mapování `/root/impact_map` dokončeno a po obnovení aktualizováno.
- [x] Cloudflare production i preview fail_open=false ověřeno po změně a při obnovení.
- [x] Lokální bezpečnostní a publikační opravy, trvalý pending stav a cílené regrese dokončeny.
- [x] Git historie sjednocena se zachováním obou původních HEAD.
- [x] Wrangler OAuth obnoven; přihlášení funguje i v původním CLI 4.91.0.
- [x] Nezávislá acceptance zmrazeného snapshotu dokončena.
- [x] Daniel výslovně schválil všechny čtyři false positive a dokončení obnovy.
- [x] Cílený WhatsApp commit 9c422dc a portál 1aadc7c pushnuté; uživatelská migrace i slovníček zachované.
- [x] Produkční rotace push tajemství a kontrolovaný deploy c09e20e4 úspěšné.
- [x] 31/31 produkčních HTTP kontrol a skutečný členský detail v Chrome na desktopu i při šířce 390 px.
- [ ] Obnova registrace cards jobu, skutečný launchd průchod a úplnost vůči zdrojovým zprávám.

## Rozhodnutí a objevy
Telegram hlásil selhání publikace digestu: Git push byl od 19. 10. odmítaný a Wrangler od 22. 10. vracel 400 při obnově tokenu. Náhledy sociálních sítí jsou samostatná část pipeline. Cloudflare e-mail o podílu botů sám nedokládá únik klíčů.

Publikace nově zastaví deploy po neúspěšném pushi, přenáší konkrétní pushnutý SHA, nasazuje jeho čistý git archive, odmítne citlivé konfigurační cesty a zachová pending až do úspěšného deploye. Aktivní Git operace zastaví generování. Stabilní index nemění jen časový údaj. Dva předchozí AI nálezy byly samostatně reprodukovány a opraveny; oba povolené verifierem vyvolané opravné cykly jsou vyčerpané.

Po obnoveném fetch bylo potvrzeno 14 lokálních a 7 remote commitů od b300de5. Lokální měnily pět generovaných datových souborů, remote jiné soubory. Merge zachoval obě historie; jediný konflikt byl datum trackeru. TASK-014–017 zůstaly zachované.

Kanonická sada odhalila starší test závislý na skutečném datu: po publishUntil očekával veřejné profily. Samostatná dočasná reprodukce s hodinami uvnitř okna prošla. Opraven jen test, navíc chrání skrytí profilů i počtů po konci zveřejňování. Produkční datumová ochrana nezměněna.

## Checkpoint projektu
Aktuální release: produkční commit 1aadc7c9c3341a6806ac057dd96ad7f719b6b35b, deployment c09e20e4-94f4-4127-a712-871e98ed7ca4, status success. WhatsApp cílený opravný commit 9c422dca580aac455835618449a23eec8e294070. Oba push exit0; žádné force operace. Následující checkpoint mění pouze dokumentaci a sám nevyžaduje další deploy.

Historický výchozí checkpoint před dokončením:
- Portal main HEAD 0fcd7c546a892d7fe794666d5f2b36ab69986331; origin/main 70730d686bf3954e938444fe3591a35d52f1d93f. Lokální opravy 90f601c, merge 70730d6, privacy test 0fcd7c5.
- Původní HEAD 274eb1e34a65b99e9d9e335e3d3bc55553147d7b a remote e91d7bb500b4c8463eeb7c0851d089596c16f7c2 jsou předky aktuálního main.
- WhatsApp main HEAD fa2b3cb1844b24b9c8986a9dbf216a4df85b0cdf. Staged pouze .gitignore, publikační hunks portal_cards.py, push_notify.py a nový test. Existující OpenAI migrace zůstává unstaged; nic z ní nevráceno.
- Chráněný tools/build_glossary.py SHA-256 166465a57fed8c01a232f1c0bc2a9b7f1351e90c5d4b5f5fa230f2826a5ec289; CLAUDE.md 689569e0a655689afb0e7d0b0a393ed725084eb1f5769707410a9e72b1de9a21.
- Skutečný pre-repair dirty baseline portal_cards.py: /private/tmp/mtf-portal-cards-before-repair.py, SHA-256 a954b3c09a97cf56f108ddc8330de52a5186b93aa37f3f66b1edb146e99ece2b. Opravný diff /private/tmp/mtf-automation-repair.diff; cílený staged patch /private/tmp/mtf-automation-index-nodoc.patch a dokumentační hunk /private/tmp/mtf-pub-doc-index.patch.
- Naplánovaný cards retry v 06:15 UTC sám pushnul merge 70730d6. Deploy ještě selhal na starém OAuth. Po zjištění byl již neaktivní job cz.gamrot.portal-cards dočasně odregistrován; původní ~/Library/LaunchAgents/cz.gamrot.portal-cards.plist a StartCalendarInterval zachovány. RunAtLoad i KeepAlive false. PŘED DOKONČENÍM obnovit přes launchctl bootstrap gui/UID PLIST; před ručním kickstart ověřit neběžící stav.
- Produkce stále deployment fa2a7342-4be9-4001-b98e-6308446a705d z commitu 79057917de7ebb254e19da0f379915b4c8ab89f7. Toto byl stav před dokončením; následný kontrolovaný push a deploy jsou zaznamenané výše.

## Ověření
- Produkce po deployi: 31/31 HTTP kontrol, 0 selhání; /private/tmp/mtf-production-http-evidence.json. Anonymní chráněná data403 bez těla, interní cesty404, platná členská autentizace i čtení, private/no-store, shoda today/index/archivu s commitnutým zdrojem, dynamická CSP/nosniff, veřejný PNG, podepsaný ticket a no-referrer.
- Produkční desktopový detail karty a jeho otevření/zavření při šířce 390 px ověřeny přes skutečný Chrome včetně screenshotů; viewport vrácen. Nejde o fyzický dotyk ani plnou automatickou E2E sadu.
- Read-only konzistence všech 207 archivů a 521 indexovaných karet: prošlo; today se přesně shoduje s archivem 2026-10-22, stats 0 zpráv / 0 nových karet. Neprokazuje aktuální úplnost zdrojové WhatsApp DB. Hash stabilního indexu 7b82ccd5daae54d2d0da2772f7d485ea5015f8c08e61860ea3553e65b11e0f60.
- Nové NOTIFY_SECRET vytvořeno kryptograficky náhodně a předáno CLI přes stdin bez hodnot v argv/výstupu. Cloudflare potvrdil upload, následný úspěšný deploy obsahuje secret_text binding. Privátní soubor atomicky přepnut po deployi; loader odpovídá novému obsahu, 0600/0700 ověřeno. Starý rollback soubor zůstává chráněný mimo repozitář. Žádná testovací notifikace členům nebyla odeslána; pozitivní volání notify endpointu nebylo záměrně provedeno, protože by rozesílalo zprávy.
- Cloudflare GET po rotaci a deployi: production/preview fail_open=false, původní KV a D1 zachované, stejná sada názvů serverových tajemství. Preview NOTIFY_SECRET není nakonfigurované. /private/tmp/mtf-release-evidence.json obsahuje pouze sanitizovaná metadata.

Dříve získané důkazy pro nezměněnou implementaci:
- 74 syntetických testů automatizace: prošlo po finální source změně; /private/tmp/mtf-resume-unit.log.
- 19 publikačních testů také nad čistým exportem staged indexu: prošlo; /private/tmp/mtf-staged-publication-tests.log. Verifier nezávisle zopakoval nad working tree i indexem.
- 30 negativních auth/privacy kontrol: prošlo bez sítě a živých dat; /private/tmp/mtf-resume-security.log. Rapid security scope /private/tmp/mtf-resume-security-scope.json, baseline skutečný produkční commit 7905791; v cílených opravách žádný nový potvrzený source blocker.
- Card-security-headers a 42 formulářových kontrol včetně privacy cutoff: prošlo. JS/ESM/Python AST/shell syntax a diff-check: prošlo.
- Plná E2E sada: SELHALO na Chromium MachPortRendezvous Permission denied i po rozšíření oprávnění. /private/tmp/mtf-resume-e2e.log obsahuje i následně opravený starší date-test failure. Plnou sadu nevydávat za pass. Přihlášený produkční Chrome a rozvržení při šířce 390 px následně ověřeny ručně; plná sada, fyzický dotyk a offline stále neověřeny.
- CUA Chrome nad lokálním http://127.0.0.1:8788/card/2026-03-14-01 ověřil skutečný meta-refresh do aplikace a přístupovou bránu s veřejným teaserem. Nejde o přihlášený produkční scénář.
- Předchozí lokální HTTP: interní 404, pět anonymních 403, platný člen, private cache i oba typy náhledů prošly. Předchozí produkční malé GET kontroly: .dev.vars, .env.production.local a wrangler.toml 404; today a chat-transcripts 403 bez přihlášení. Po novém deployi zopakováno výše.
- Wrangler OAuth obnoven dočasným oficiálním CLI 4.119.0 device flow, globální verze nezměněna. Původní 4.91.0 whoami potvrdilo stejný účet, account/user read, Pages write a offline_access. Další široké scopes nepřidány, konfigurační soubor má 0600.
- Push tajemství je v ~/Library/Application Support/mtf-portal/notify-secret (0600, rodič 0700); loader načítá soubor před stale env. Obě plist konfigurace nemají plaintext proměnnou. Historická card-job hodnota omylem zobrazená v prvním auditu se lišila od současného push jobu; hodnoty neopakovat. Při tomto historickém checkpointu rotace ještě neproběhla; následná rotace je doložena výše. Žádný testovací push členům neodeslán.

## Nezávislá acceptance
Verifier `/root/recovery_acceptance` — completed — PARTIALLY VERIFIED pro celkovou obnovu; kontrolovaný produkční release VERIFIED. Samostatný Cloudflare GET potvrdil úspěšný deployment c09e20e4 ze správného commitu, fail closed v obou prostředích a bindingy. Cílený WhatsApp commit obsahuje pouze očekávané 4 soubory a zachovává migraci. 31 HTTP kontrol a rotaci přebírá ze sanitizovaných provozních důkazů; tajemství nečetl. Dokončení ověřeno list_agents.
Post-review snapshot: všech 12 stabilních hashů zůstává shodných s původním nezávisle kontrolovaným snapshotem. Stabilní finální artefakt /private/tmp/mtf-release-implementation-snapshot.json, SHA-256 c9ebc39386213ee42def9c1445389eeeb1f3363e3f584bb658cee761f693d620. Následně se mění pouze TASKS a tento plán. Git guard není společným zámkem proti lidské operaci zahájené během generování; tento souběh neověřen.

## Blockery a recovery
Všechna schválení jsou získaná včetně čtyř ověřených scanner false positive. Nejde o čekání na další souhlas.

Původní cards job zůstává odregistrovaný. Dva bootstrap pokusy skončily exit 5 Input/output error; plist je validní, 644, vlastníkem je aktuální UID, program i skript existují a služba není disabled. Systémový log navíc výslovně odmítl běh v sandboxu. Omezení neobcházet přes jiný interpreter, GUI Terminál či SSH.

Uživatel byl asynchronně požádán spustit v běžném Terminálu na Mac mini:

```bash
launchctl bootstrap gui/501 /Users/danielgamrot/Library/LaunchAgents/cz.gamrot.portal-cards.plist
```

Po jeho provedení ověřit `launchctl print gui/501/cz.gamrot.portal-cards`, nepřítomnost běžícího PID a původní ProgramArguments/schedule. Poté použít `launchctl kickstart gui/501/cz.gamrot.portal-cards`, ověřit skutečný exit/log, aktuální snapshot a zdrojové počty, produkční data, pending=false a stabilitu indexu. Přípravný záznam /private/tmp/mtf-controlled-job.json nese offset před dosud nespouštěným pokusem. /private/tmp/mtf-rotation-state.json je pouze provozní recovery metadata s cestami k privátním souborům, není určen k běžnému review; hodnoty tajemství nečíst ani nevypisovat.

Pending zůstává true, aby skutečný launchd průchod ověřil i publikaci. Nejde o neúspěch hotového kontrolovaného deploye. Rotaci neopakovat. Pokud vznikne mezitím nový HEAD, pořídit čerstvý scoped snapshot a zachovat uživatelské změny. Po provozním ověření zopakovat malou produkční kontrolu a uzavřít task; plný browserový E2E stále nepovažovat za prošlý. Fail closed nerušit. Neposílat testovací push členům.

Historie scanneru: první portal opravný commit a date-test commit prošly. Merge byl omylem dokončen po varování nad getterem, později jej samovolně pushnul scheduled retry; omyl byl přiznán. Tři další nálezy se týkaly volání funkcí loaderu. Daniel výslovně přijal všechny 4; scanner pass pro tyto případy netvrdit.

## Výsledek a retrospektiva
PARTIALLY VERIFIED celkově. Opravy jsou commitnuté, pushnuté a bezpečně nasazené; produkční přístup i soukromí ověřené a push tajemství rotované. Automatický provoz není dokončen, dokud nebude obnovená registrace cards jobu a ověřen skutečný launchd průchod. Žádné další schválení oprav není potřeba. Původní uživatelská práce zachovaná.

Tracker SHA-256 po checkpointu: 472eaecaf654c08a8423d12eaf63d4341f67618a1301a43d945a3a82ae589d90
