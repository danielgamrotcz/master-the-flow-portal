# TASK-018 — Záznam rozhovoru s Alexem

Stav: Blocked
Poslední checkpoint: 2026-10-28
Tracker: ../../TASKS.md, TASK-018

## Výsledek a acceptance
Stránka i portál odkazují na dostupný původní záznam YouTube, Alexovy materiály a přesný automatický přepis s časovými odkazy. YouTube má aktuální popis, kapitoly, češtinu a kategorii Vzdělávání. Sdílení do skupiny obsahuje canonical stránky.

## Scope a nepovolené kroky
Daniel zadal přípravu a nasazení 28. října. Ponechat video neveřejné, registrace uzavřené, auth/CSP beze změny. Žádný commit/push, jiné akce, účastnická data ani změny slovníčku. Originál Alexova HTML publikovat beze změn; nevyvíjet jeho systém.

## Aktuální stav
- [x] Read-only mapper /root/alex_release_map dokončen.
- [x] Čerstvý ls-remote odpovídá lokálním HEAD; fetch blokuje FS.
- [x] YouTube Studio potvrdilo video SQ4VtvYf8E4, HD, 1:49:59, neveřejné, playlist a Vzdělávání.
- [x] Nejnovější HTML v Downloads MacBooku načteno read-only přes SSH; bez skriptů, formulářů, iframe a event handlerů.
- [x] Lokální implementace a zdrojově odvozené kapitoly připravené.
- [x] Nevizuální kontrakt, source fidelity, syntaxe a cílené bezpečnostní kontroly prošly.
- [x] Nezávislá lokální acceptance /root/alex_recording_final — completed — VERIFIED pro lokální kontrakt.
- [x] YouTube metadata uložená: shrnutí, 14 kapitol, 10 štítků, čeština, datum21.10.2026. Vzdělávání, playlist, miniatura, embedding a neveřejná viditelnost zachované. Veřejný yt-dlp readback potvrdil14 kapitol a language=cs. Automatické české titulky cs-orig a cs dostupné.
- [x] Cloudflare OAuth výslovně schváleno, přihlášení obnoveno a Production5ef70fe5-fa28-43bc-8eb5-80c417e97094 nasazená.
- [x] Web na custom doméně i Pages URL byte-shodný s manifestem; finální YouTube popis obsahuje živé materiály a přepis.
- [ ] Sdílení do skupiny; připravený text group-message.txt nebyl odeslaný.

## Rozhodnutí a objevy
Hlavní video je původní stream: bez druhého uploadu, Drive zůstává zdrojový originál. Přepis je automatický Soniox, bez úplné kontroly poslechem a bez ověřené identity replik. Znění všech replik musí být shodné se zdrojem. Materiál je autorský podklad Alexe pro komunitu, nikoli ověřená univerzální technická dokumentace.

## Checkpoint projektu
Autoritativní portál HEAD13fdf0ee6210e26e25b56bec347205c9fb71e1cb, main. Izolovaná pracovní kopie /private/tmp/mtf-alex-recording-onbvdv4h/portal; původní checkout read-only a dirty pouze tools/build_glossary.py, SHA256166465a57fed8c01a232f1c0bc2a9b7f1351e90c5d4b5f5fa230f2826a5ec289. Obsahový repo HEADf4d884cab79cb34eed55c2dfa3ce6d6851f2d20c. Nepřepisovat původní checkout ani Obsidian.

## Ověření
- interview-recording.js — prošlo, všech285 replik i bezpečné pojmenované odkazy.
- card-security-headers.js — prošlo; API vibe-coding registrations — prošlo.
- Syntaxe změněných JS, bash-n a diff-check — prošlo.
- Kontrola shody všech ostatních eventů — prošlo.
- Rapid source security: bez potvrzené nové regrese; auth/CSP/functions beze změny, veřejné materiály bez aktivního obsahu, přepis bez nalezených e-mailů a známých credential tvarů (nejde o důkaz absence všech citlivých dat).
- Post-review implementační snapshot shodný s review-final-snapshot.json; mění se pouze tento checkpoint a lifecycle trackeru.
- UI/vizuál a browser E2E — NOT TESTED, nebyly vyžádané. Úplný poslech přepisu/kapitol — NOT TESTED.
- Produkční baseline GET přes curl — prošlo, čtyři klíčové soubory souhlasí s HEAD. Python urllib dostal403, curl200.
- YouTube save UI potvrdilo „Všechny změny jsou uloženy“; anonymní yt-dlp ověřil14 kapitol, češtinu a unlisted. Česká automatická titulková stopa dostupná; ruční publikace titulků nebyla provedena.

## Blockery a recovery
Vyřešeno Danielovým výslovným potvrzením 28.10.2026: auto-review dříve odmítlo kliknutí Authorize na Cloudflare OAuth, protože uživatel autorizoval deploy, nikoli konkrétní persistentní OAuth rozsah. Bylo požádáno o potvrzení account:read, user:read, pages:write a offline_access; Daniel nyní konkrétní rozsah výslovně potvrdil. Neobcházet zamítnutí. Login server následně timeoutoval; po odpovědi bude třeba nový wrangler login --browser=false --scopes account:read user:read pages:write s XDG_CONFIG_HOME v soukromé dočasné složce. Neotevírat starý vypršelý OAuth link. Po autorizaci ověřit čerstvý upstream a produkční baseline před nasazením.

WhatsApp: native app hlásí cgWindowNotFound; web není přihlášený (QR pairing). Žádné nové propojení účtu nebylo provedeno. group-message.txt je návrh pouze pro finální živý výsledek; do nasazení jej neodesílat.

YouTube do nasazení obsahuje jen canonical stránky, žádné dosud neexistující přímé odkazy na materiály/přepis. Finální popis youtube-description.txt je připravený k doplnění po nasazení.

Připravený release je /private/tmp/mtf-alex-recording-onbvdv4h/release, manifest release-manifest.json (6 změněných runtime souborů), bez secrets a bez cizího slovníčku. Bez commitu či pushnutí. Příkaz podle ověřeného wrangler4.91.0 help: wrangler pages deploy /private/tmp/mtf-alex-recording-onbvdv4h/release --project-name master-the-flow-portal --branch main --commit-dirty=true; autentizaci a logy vést přes stejné task-specific XDG_CONFIG_HOME a WRANGLER_LOG_PATH. Nepředstírat, že baseline commit obsahuje tuto necommitnutou změnu.

Rollback: znovu nasadit čistý baseline export13fdf0ee; metadata YouTube mají baseline popis ve zdrojích session. Nepřepínat viditelnost ani neaktivovat registrace. Pokud nová produkční verze mezitím změní data, před deployem znovu porovnat baseline.

## Výsledek a retrospektiva
Lokální výsledek připravený a nezávisle ověřený; YouTube metadata skutečně uložená. Celý úkol PARTIALLY VERIFIED, produkce ani sdílení zatím nedokončené.

Aktuální SHA-256 trackeru: b8bb318650f6bf257ea56025799776ec70df6c52d7fced47f70a0bd2a653b135

Resume checkpoint: uživatel výslovně souhlasí s konkrétním OAuth rozsahem, deployem a dokončením sdílení. Runtime snapshot i upstream beze změn.

## Produkční checkpoint po obnovení

- Deployment: https://5ef70fe5.master-the-flow-portal.pages.dev
- Produkce: https://mastertheflow.cz/rozhovory/1-vibe-coding-s-alexem/
- Deploy CLI úspěch: šest změněných souborů, 932 už existujících; Functions bundle zkompilovaný a nasazený. Source metadata uvádějí baseline13fdf0e + dirty working snapshot; žádný nový Git commit není tvrzený.
- Nezávislý verifier `/root/alex_production_acceptance` — completed — VERIFIED pro web a YouTube.
- Všech šest runtime souborů HTTP200 po standardních308 redirectech HTML; SHA256 odpovídá release-manifest.json. OG karta přesná původní verze. Ostatních osm akcí beze změny. Gate anonymně curl403 a prázdné tělo na obou doménách.
- YouTube veřejně potvrzený finální popis včetně obou živých odkazů,14 kapitol, cs a unlisted. Žádné druhé video ani nový upload.
- Přeneseny pouze scoped reviewed změny do původního checkoutu /Users/danielgamrot/Projects/master-the-flow-portal přes schválený filesystem write. Původní checkout tedy už obsahuje runtime i testy, tools/build_glossary.py zachován na166465a5. Git metadata zůstávají nedotčená. Žádný commit ani push.
- Post-review implementační snapshot stále shodný; měněny pouze lifecycle poznámky a jejich kopie.
- OAuth blocker vyřešen. Aktivní blocker je pouze WhatsApp: CUA po resetu stále cgWindowNotFound, web nepřihlášený, plugin/CLI cesta nebyla nalezená. Neopakovat stejné neúspěšné pokusy bez změny stavu. Odpověď na otázku otevření WhatsAppu na Mini zatím nepřišla. group-message.txt je připravený, ale NOT SENT.
- Nejužší pokračování: otevřené dostupné okno WhatsAppu, určit správnou skupinu Master the Flow, odeslat uživatelem autorizovaný text s canonical a ověřit odeslání. Nebo Daniel potvrdí, že si zprávu odešle sám. Web a YouTube znovu nenasazovat.
- Celý úkol PARTIALLY VERIFIED, publikovaná část VERIFIED. UI/vizuál NOT TESTED; úplný poslech přepisu není dokončený ani tvrzený.

Aktuální SHA-256 trackeru po produkčním checkpointu: fc8498d1c6e4ebfdcd112e980c43a3b79a21dd7cfe4491e5ef5fadbda6e8d608

Finální audit trackeru: všechny původní karty beze změny, právě jedna TASK-018 v Blocked a žádný In Progress. SHA-256 trackeru: b0c3ad374b85d32482f7c6ec9362900bfbe6777afb35f835b13582e89c17498c

## Schválené uzavření session — 2026-10-28

Daniel schválil cílený staging 18 souborů, commit „Publish Alex interview recording and resources“ a push main do origin. WhatsApp výslovně odložený; bez nového pokynu neobnovovat. Git metadata původního checkoutu jsou chráněná proti zápisu; Git operace probíhají ve shodné izolované kopii /private/tmp/mtf-alex-recording-onbvdv4h/portal se stejným GitHub origin. Původní pracovní soubory a cizí slovníček zůstávají zachované. Konkrétní commit a úspěch pushnutí ověřit v Git historii a závěrečném readbacku; předchozí zákazy commitu/pushnutí jsou historické checkpointy před tímto novým souhlasem.
