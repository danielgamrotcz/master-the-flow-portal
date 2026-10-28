# TASK-019 — Rozcestník po rozhovoru s Alexem

Stav: Review
Tracker: ../../TASKS.md, TASK-019
Poslední checkpoint: 2026-10-28

## Výsledek a acceptance
Návštěvník má v úvodu tři přímé volby: celý YouTube záznam, Alexův přehled postupu a nástrojů, přepis. Šest konkrétních témat vede na doložená místa videa. Starý harmonogram a registrační informace odstraněné. Profil hosta následuje po zdrojích. Zachovaná značka, krátký formát a datum natočení s délkou videa.

## Scope a oprávnění
Landing, její CSS a dotčené testy; deployment pokračuje v Danielově výslovně schváleném publikačním úkolu. Bez commitu, pushnutí, dalších funkcí, změn jiných akcí, materiálů, přepisu, medailonku, auth/CSP a YouTube. TASK-018 zůstává Blocked pouze kvůli WhatsAppu.

## Dokončené kroky
- [x] Read-only mapper /root/alex_archive_revision_map dokončen.
- [x] GitHub main ověřen13fdf0ee, uživatelská práce chráněná. Fetch nemohl zapisovat do chráněného .git; stav ověřen přes ls-remote bez Git mutace.
- [x] Implementace a jazyková redakce; zdrojové časy porovnány s automatickým přepisem.
- [x] Nevizuální kontrakt, syntaxe obou změněných E2E a diff-check PASS na Mac-mini-Pro.local.
- [x] Nezávislá acceptance /root/alex_archive_revision_verify completed, VERIFIED; post-review snapshot shodný.
- [x] Bezpečný release export nasazen na Pages abed1953 a custom doménu. Zdrojové změny promítnuty do původního checkoutu.
- [x] Nezávislý produkční readback téhož verifiera completed, VERIFIED: všech14 odpovědí HTTP200 a SHA-256 shodné, oba anonymní gate403 s prázdným tělem.
- [x] Board audit PASS: jediná TASK-019 v Review, nulový WIP, žádné duplicitní sekce, všechny ostatní karty byte-exact před revizí.

## Rozhodnutí a omezení
Historický fragment #registrace zůstává cílem podkladů. Staré E2E assertions aktualizované podle archivní stránky; ostatní ochrany zachované. Všech285 replik a Alexův původní HTML materiál zachované. Přepis je automatický, úplný poslech nebyl proveden. UI/vizuál a browser E2E NOT TESTED, nebyly vyžádané.

## Finální checkpoint
Zdroj /Users/danielgamrot/Projects/master-the-flow-portal; pracovní kopie /private/tmp/mtf-alex-recording-onbvdv4h/portal. Baseline HEAD13fdf0ee6210e26e25b56bec347205c9fb71e1cb, bez nového commitu a pushnutí. Release je výslovně označený pracovní snapshot, ne tento čistý commit.

Produkce https://mastertheflow.cz/rozhovory/1-vibe-coding-s-alexem/; deploy https://abed1953.master-the-flow-portal.pages.dev. První kontrola těsně po nasazení jednou dostala CSS404; při následném úplném a nezávislém readbacku vše200/shoda. Ochranné hashe, review snapshot, scoped diff, release manifest a HTTP důkazy v /private/tmp/mtf-alex-recording-onbvdv4h/archive-revision/. Po review se změnily pouze TASKS a tento plán.

Rollback: předchozí produkce5ef70fe5-fa28-43bc-8eb5-80c417e97094 a export /private/tmp/mtf-alex-recording-onbvdv4h/release. Chráněný tools/build_glossary.py SHA256166465a57fed8c01a232f1c0bc2a9b7f1351e90c5d4b5f5fa230f2826a5ec289 zůstává mimo release.

Aktuální TASKS.md SHA256: 7f20685dbf76bc34a65e352eec4f7b555d1017f8344dcbb8797962c560641e3e

## Blockery a pokračování
Pro web žádný blocker. Čeká pouze přijetí výsledku Danielem, proto Review. Neopakovat deploy, OAuth nebo YouTube editaci. Samostatné sdílení do WhatsAppu patří TASK-018 a nebylo tímto úkolem provedeno.

## Schválené uzavření session — 2026-10-28

Daniel schválil cílený staging 18 souborů, commit „Publish Alex interview recording and resources“ a push main do origin. WhatsApp výslovně odložený; bez nového pokynu neobnovovat. Git metadata původního checkoutu jsou chráněná proti zápisu; Git operace probíhají ve shodné izolované kopii /private/tmp/mtf-alex-recording-onbvdv4h/portal se stejným GitHub origin. Původní pracovní soubory a cizí slovníček zůstávají zachované. Konkrétní commit a úspěch pushnutí ověřit v Git historii a závěrečném readbacku; předchozí zákazy commitu/pushnutí jsou historické checkpointy před tímto novým souhlasem.
