# TASK-012 — Živé počty a kapacita

Stav: In Progress
Tracker: ../../TASKS.md
Poslední checkpoint: 2026-10-12

## Výsledek a acceptance

Minimalistická landing page ukazuje skutečný počet unikátních přihlášených
a max(0, 98 − počet) volných míst. Nezveřejňuje žádné kontakty. Duplicitní
registrace se nezapočítá dvakrát. Aktualizace na stránce po 30 sekundách,
zdroj se synchronizuje po registraci a každých 5 minut včetně ručních změn.
Starý nebo neznámý údaj není prezentován jako nula ani plná kapacita.
Kapacita je informační, tento task nezavírá formulář ani nemění rozesílání.

## Scope a oprávnění

User schválil implementaci, potřebné návaznosti, commit, push a produkci,
včetně předchozí opravy TASK-011. Bez změn ostatních akcí a slovníčku.
Google UI granty mají vlastní action-time confirmation, pokud je vyžádá UI.
Nespouštět žádné syntetické registrace či rozesílání pozvánek.

## Aktuální stav

- [x] Read-only mapa existujícího Show & Tell API a Apps Script precedensu.
- [x] Čerstvý fetch main 0/0; předchozí oprava explicitně přijata do scope.
- [x] Implementace a relevantní testy.
- [ ] Živá synchronizace a prvotní anonymní snapshot.
- [ ] Release a produkční ověření.

## Rozhodnutí

Samostatný event key i secret. Jen počet a serverový čas v KV, nikdy e-maily.
Přenos celého snapshotu namísto inkrementu (ruční smazání i duplicity).
Stará data po 15 minutách skrýt; krátký výpadek není důvod ukazovat 98 míst.
Počet je informativní, ne atomická rezervace kapacity. Žádná falešná urgence.
Předchozí cutover a e-mailové dedup klíče zachovat. Count sync nevolá MailApp.

## Checkpoint a ochrany

Repo main HEAD5760713; chráněná cizí úprava tools/build_glossary.py:
166465a57fed8c01a232f1c0bc2a9b7f1351e90c5d4b5f5fa230f2826a5ec289.
Výchozí opravený GS a5ec107f99d359d3a592f1fb3e4e8b07081cb2e72235a28ffaafea4273523519.
Mapper spawn registration_capacity_impact odmítnut limitem vláken. Self-map
proveden, celkový verdikt nejvýše PARTIALLY VERIFIED bez nezávislé acceptance.
Daily Brief lookup neměl související výsledek. Show & Tell lokální kód je precedent.

## Ověření a recovery

Přidat stabilní regresní testy počtu, ochrany zápisu, stáří a UI fallbacku.
Release z čistého Git exportu, aby cizí slovníček nešel na produkci.
Rollback: předchozí webový commit; count-only trigger lze ponechat, nezasahuje
do pozvánek. Nikdy znovu nespouštět původní instalátor registrací kvůli počítadlu.

## Výsledek

Lokální implementace hotová. API, Apps Script count-only test a UI E2E prošly
(exit 0). UI pokrývá nulu, plno, přesah, nedostupnost, stáří, obnovu po 30 s,
šířky 320/390/768/1440 a oba motivy. Pozvánkový test 25/25 prošel.
Kanonická plná sada doběhla exit 1: opakují se známé baseline chyby
e2e-slovnicek a google-forms-attendees; ostatní relevantní scénáře prošly.
Desktopový screenshot fallbacku prohlédnutý, minimální řádek u CTA.

Rapid security proti 5760713: bez potvrzené nové regrese v auth zápisu,
allowlistu payloadu, privacy, DOM výstupu a cache. Produkční konfigurace
a skutečný přenos zatím NOT TESTED. Žádné secret hodnoty v repozitáři.
Verifier registration_capacity_acceptance nebyl spuštěn: spawn odmítnut
limitem vláken. Druhý read-only self-review proveden; není nezávislý.
Celkově PARTIALLY VERIFIED, nikoli dokončené end-to-end.

Implementační snapshot: API bb535e82, count GS 658d0781, klient 47fe0dfe,
CSS c0f14268, HTML 733cb4ce; chráněný slovníček stále 166465a5.
Čeká konkrétní action-time potvrzení uložení nového neveřejného klíče do
Cloudflare a Google Script Properties a povolení anonymního outbound syncu.
Commit/push/deploy byly schváleny uživatelem nezávisle na tomto UI potvrzení.

Staged scanner exit 1: tests/api-vibe-coding-registrations.js:17,
tests/google-vibe-coding-count.js:8, tools/vibe_coding_registration_count.gs:12,
kategorie generic-credential-assignment. Přímé čtení potvrzuje dva testovací
literály a načítání z PropertiesService, nikoli reálné tajemství. Skill vyžaduje
uživatelské přijetí false positives; odeslaná samostatná otázka. Žádná výjimka
scanneru nezapsaná. Soubory jsou cíleně staged, checkpoint úpravy zatím unstaged.
Commit/push/deploy se neuskutečnily. Cloudflare otevřený dialog nového secretu
zůstává prázdný; žádná produkční konfigurace změněná. Google skript beze změny.
Tracker checkpoint SHA-256: bffd8e7c85bd67ad3d5e5a70c63fd9986623f0d4383d6c9e2901acde54f7035e.

Resume 2026-10-12: uživatel výslovně přijal oba požadované kroky, včetně
konkrétních tří false positives scanneru. Žádná globální výjimka se nepřidává.
Čerstvý fetch 0 ahead / 0 behind. Pokračuje schválený release a živé propojení.
