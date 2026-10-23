# TASK-017 — Obnova publikace karet a zabezpečení portálu

Stav: In Progress
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
- [ ] Cílený WhatsApp commit a zbývající push.
- [ ] Produkční rotace push tajemství a kontrolovaný deploy.
- [ ] Obnova cards jobu, skutečný launchd průchod a produkční acceptance.

## Rozhodnutí a objevy
Telegram hlásil selhání publikace digestu: Git push byl od 19. 10. odmítaný a Wrangler od 22. 10. vracel 400 při obnově tokenu. Náhledy sociálních sítí jsou samostatná část pipeline. Cloudflare e-mail o podílu botů sám nedokládá únik klíčů.

Publikace nově zastaví deploy po neúspěšném pushi, přenáší konkrétní pushnutý SHA, nasazuje jeho čistý git archive, odmítne citlivé konfigurační cesty a zachová pending až do úspěšného deploye. Aktivní Git operace zastaví generování. Stabilní index nemění jen časový údaj. Dva předchozí AI nálezy byly samostatně reprodukovány a opraveny; oba povolené verifierem vyvolané opravné cykly jsou vyčerpané.

Po obnoveném fetch bylo potvrzeno 14 lokálních a 7 remote commitů od b300de5. Lokální měnily pět generovaných datových souborů, remote jiné soubory. Merge zachoval obě historie; jediný konflikt byl datum trackeru. TASK-014–017 zůstaly zachované.

Kanonická sada odhalila starší test závislý na skutečném datu: po publishUntil očekával veřejné profily. Samostatná dočasná reprodukce s hodinami uvnitř okna prošla. Opraven jen test, navíc chrání skrytí profilů i počtů po konci zveřejňování. Produkční datumová ochrana nezměněna.

## Checkpoint projektu
- Portal main HEAD 0fcd7c546a892d7fe794666d5f2b36ab69986331; origin/main 70730d686bf3954e938444fe3591a35d52f1d93f. Lokální opravy 90f601c, merge 70730d6, privacy test 0fcd7c5.
- Původní HEAD 274eb1e34a65b99e9d9e335e3d3bc55553147d7b a remote e91d7bb500b4c8463eeb7c0851d089596c16f7c2 jsou předky aktuálního main.
- WhatsApp main HEAD fa2b3cb1844b24b9c8986a9dbf216a4df85b0cdf. Staged pouze .gitignore, publikační hunks portal_cards.py, push_notify.py a nový test. Existující OpenAI migrace zůstává unstaged; nic z ní nevráceno.
- Chráněný tools/build_glossary.py SHA-256 166465a57fed8c01a232f1c0bc2a9b7f1351e90c5d4b5f5fa230f2826a5ec289; CLAUDE.md 689569e0a655689afb0e7d0b0a393ed725084eb1f5769707410a9e72b1de9a21.
- Skutečný pre-repair dirty baseline portal_cards.py: /private/tmp/mtf-portal-cards-before-repair.py, SHA-256 a954b3c09a97cf56f108ddc8330de52a5186b93aa37f3f66b1edb146e99ece2b. Opravný diff /private/tmp/mtf-automation-repair.diff; cílený staged patch /private/tmp/mtf-automation-index-nodoc.patch a dokumentační hunk /private/tmp/mtf-pub-doc-index.patch.
- Naplánovaný cards retry v 06:15 UTC sám pushnul merge 70730d6. Deploy ještě selhal na starém OAuth. Po zjištění byl již neaktivní job cz.gamrot.portal-cards dočasně odregistrován; původní ~/Library/LaunchAgents/cz.gamrot.portal-cards.plist a StartCalendarInterval zachovány. RunAtLoad i KeepAlive false. PŘED DOKONČENÍM obnovit přes launchctl bootstrap gui/UID PLIST; před ručním kickstart ověřit neběžící stav.
- Produkce stále deployment fa2a7342-4be9-4001-b98e-6308446a705d z commitu 79057917de7ebb254e19da0f379915b4c8ab89f7. Agent žádný nový deploy ani push neprovedl.

## Ověření
- 74 syntetických testů automatizace: prošlo po finální source změně; /private/tmp/mtf-resume-unit.log.
- 19 publikačních testů také nad čistým exportem staged indexu: prošlo; /private/tmp/mtf-staged-publication-tests.log. Verifier nezávisle zopakoval nad working tree i indexem.
- 30 negativních auth/privacy kontrol: prošlo bez sítě a živých dat; /private/tmp/mtf-resume-security.log. Rapid security scope /private/tmp/mtf-resume-security-scope.json, baseline skutečný produkční commit 7905791; v cílených opravách žádný nový potvrzený source blocker.
- Card-security-headers a 42 formulářových kontrol včetně privacy cutoff: prošlo. JS/ESM/Python AST/shell syntax a diff-check: prošlo.
- Plná E2E sada: SELHALO na Chromium MachPortRendezvous Permission denied i po rozšíření oprávnění. /private/tmp/mtf-resume-e2e.log obsahuje i následně opravený starší date-test failure. Plnou sadu nevydávat za pass. Přihlášený browser, mobilní dotyk a offline nejsou ověřeny.
- CUA Chrome nad lokálním http://127.0.0.1:8788/card/2026-03-14-01 ověřil skutečný meta-refresh do aplikace a přístupovou bránu s veřejným teaserem. Nejde o přihlášený produkční scénář.
- Předchozí lokální HTTP: interní 404, pět anonymních 403, platný člen, private cache i oba typy náhledů prošly. Předchozí produkční malé GET kontroly: .dev.vars, .env.production.local a wrangler.toml 404; today a chat-transcripts 403 bez přihlášení. Po budoucím deployi zopakovat.
- Wrangler OAuth obnoven dočasným oficiálním CLI4.119.0 device flow, globální verze nezměněna. Původní4.91.0 whoami potvrdilo stejný účet, account/user read, Pages write a offline_access. Další široké scopes nepřidány, konfigurační soubor má0600.
- Push tajemství je v ~/Library/Application Support/mtf-portal/notify-secret (0600, rodič0700); loader načítá soubor před stale env. Obě plist konfigurace nemají plaintext proměnnou. Historická card-job hodnota omylem zobrazená v prvním auditu se lišila od současného push jobu; hodnoty neopakovat. Produkční rotace ještě neproběhla, žádný testovací push členům neodeslán.

## Nezávislá acceptance
Verifier `/root/recovery_acceptance` — completed — PARTIALLY VERIFIED pro lokální release i celkovou obnovu. Kontrolované lokální publikační kontrakty a zachování migrace VERIFIED, žádný nový potvrzený source blocker. Dokončení ověřeno list_agents.
Post-review snapshot: 12 stabilních souborů, oba HEAD a indexy shodné s /private/tmp/mtf-resume-review-snapshot.json; SHA-256 5040ed49ac5c8bd39e8bf6b322caffc7838e3a5ab01220dfa4ba0192bc6c9602. Po tomto důkazu se mění pouze TASKS a tento plán. Git guard není společný zámek proti lidské Git operaci zahájené uprostřed generování; tento souběh neověřen.

## Blockery a recovery
Obnoveno po explicitním potvrzení „Ano, všechno ti potvrzuju a schvaluju to.“: všech12 stabilních hashů, oba HEAD a indexy souhlasí s nezávisle prověřeným snapshotem. Fetch aktuální, žádný nový upstream ani Git operace. Čtyři false positive jsou přijaté; historický zápis níže zůstává auditní stopou. Opravena vlastní duplicitní stavová hlavička trackeru bez změny cizích karet.

Historický blocker před potvrzením:
Čeká výslovné rozhodnutí o čtyřech ověřených false positive dle check-staged-secrets: upstream tools/vibe_coding_registration_count.gs:18 načítá Script Property; scripts/push_notify.py:101,109,126 volají loader/čtení souboru. Žádný z řádků neobsahuje credential literal. Checker byl u prvního portal opravného commitu a date-test commitu PASS. Merge byl omylem commitnut po hlášce checkeru; omyl přiznán, následný samovolný scheduled push zaznamenán. Checker pass pro merge ani WhatsApp staged změny netvrdit.

Po rozhodnutí znovu ověřit snapshot a current remote, commitnout pouze připravené opravné hunks, připravit atomickou rotaci a čistý deploy přes potvrzený SHA. Při rotaci zachovat konzistentní private-file credential a runtime binding, žádné hodnoty v argv či výstupu. Obnovit cards launchd registraci a provést skutečný běh až po potvrzené publikační připravenosti; neposílat notifikaci členům jen kvůli ověření. Na závěr ověřit produkci, skutečný job exit, pending a stabilitu indexu. Cloudflare fail_open=false nerušit.

## Výsledek a retrospektiva
PARTIALLY VERIFIED. Git a OAuth blockery odstraněny; lokální opravy prověřené. Celková obnova dosud nedokončena. Cards retry dočasně pozastavený a musí být obnoven. Původní user práce i migrační změny zachované.

Tracker SHA-256 po checkpointu: c0d70385fe3c6ddafe201d9136eeda8636e4259aa4f7c1d358d9b27e42c3fd1f
