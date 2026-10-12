# TASK-011 — Doručování registračních pozvánek

Stav: Blocked — aktivní, čeká na uživatelský retest a nezávislou acceptance
Tracker: ../../TASKS.md
Poslední checkpoint: 2026-10-12

## Výsledek a acceptance

Nová registrace doručí potvrzení s připojením i pořadateli. Kalendář má název
Vibecoding s Alexem a čas 21. 10. 2026 18:00–20:00 Europe/Prague. Forms má
navázanou soukromou tabulku. Danielův test z 12. 10. je odstraněný a novou
registraci provede sám. Skutečné doručení neprohlašovat před jeho retestem.

## Scope a nepovolené kroky

Uživatel schválil opravu živé automatizace a smazání své dnešní registrace.
Žádné testovací či hromadné rozesílání, změna jiných událostí nebo registrací,
commit, push či deploy portálu. UI potvrzení OAuth a smazání vyžádat v místě akce.

## Aktuální stav

Resume 2026-10-12: uživatel výslovně dodal požadované schválení oprávnění,
aktivace a cíleného odstranění testu. Kód i chráněná změna mají stejné hashe.

- [x] Diagnóza: jedna odpověď, submit 12. 10. 16:02 dokončený, registrant je
  pořadatel. getGuestList(true) způsobí přeskočení addGuest; samostatný e-mail chybí.
- [x] Kalendář pořád končí 19:30, obsahuje starý název; Forms nemá destination.
- [x] Lokální oprava a 25 testů; syntaxe GS i testovacího JS prošla.
- [x] Živá konfigurace a aktivace bez zpětného rozesílání, dokončeno 16:31:30.
- [x] Cílené smazání testu z 12. 10. 16:02; Forms ukazuje 0 odpovědí.
- [x] Připojena nativní soukromá response Sheet, šest sloupců, bez datových řádků.
- [ ] Uživatelský retest skutečného doručení a nezávislá acceptance.

## Rozhodnutí a objevy

Použít MailApp s úzkým oprávněním send_mail, nikoli přístup do Gmail schránky.
Confirmation je oddělené od členství v kalendáři. Deduplikace podle ID odpovědi,
sdílený ScriptLock, potvrzení označit až po úspěšném sendEmail. Při chybě
zachovat možnost retry. Mezi odesláním a zápisem potvrzení nelze v externí
službě garantovat atomické exactly-once; toto omezení nepřekrývat tvrzením.
Privátní Meet zůstává pouze v Script Properties, ne ve veřejném repozitáři.
Při přechodu zaznamenat cutover pro nové e-mailové potvrzení, nereplayovat staré
registrace. Existující šestihodinový trigger a ochrany hostů zachovat.
Čas, název a další obsah sladit; lookup přes uložené iCalUID přežije přejmenování.

## Checkpoint projektu

Root: /Users/danielgamrot/Projects/master-the-flow-portal, main, HEAD 5760713.
Fetch 0/0. Jediná cizí změna tools/build_glossary.py,
SHA-256 166465a57fed8c01a232f1c0bc2a9b7f1351e90c5d4b5f5fa230f2826a5ec289.
Živý projekt Apps Script je otevřený v Chrome; ID je ověřené v UI.

## Ověření

25/25 lokálních mock testů prošlo 2026-10-12. Syntaxe obou souborů prošla.
Opravený kód uložen v živém Kód.gs; výběr celého editoru a kopie potvrdily
shodu s připraveným zdrojem (11217 znaků). Meet uložen pouze ve vlastnosti
VIBE_CODING_LIVE_MEET_URL. Původní aktivační vlastnost zachovaná.
Finální lokální SHA-256 GS:
a5ec107f99d359d3a592f1fb3e4e8b07081cb2e72235a28ffaafea4273523519.
SHA-256 testů: 7fbbff3d300bdccfc211881062f9521727eca6d999cedff6fc62071406f5d6ed.
Cizí změna build_glossary.py má stále původní hash.
Mapper i nezávislý verifier (registration_final_acceptance) nedostupní kvůli
limitu vláken. Self-review neodhalila další potvrzenou chybu; není nezávislá
acceptance. Stav ověření: PARTIALLY VERIFIED. Doručení do schránky neověřeno.

## Blockery a recovery

Případné nové OAuth oprávnění a UI potvrzení vyžadují uživatele. Předchozí
verzovaný skript zachovaný v HEAD. Triggery nemazat a nereinstalovat.
Při rollbacku zohlednit nový název/čas a uložené event ID, nevracet slepě starý lookup.

Původní blocker byl vyřešen explicitním souhlasem uživatele. Google OAuth
žádal jen nové oprávnění odesílat e-mail; bylo potvrzeno, bez čtení Gmailu.
První verify skončil chybou chybějícího destination (před propojením Sheet).
Prepare dokončeno 16:31:30; žádné zprávy neodeslalo. Následné verify
16:33:12 dokončeno: eventIdConfigured, correctTitle, correctEnd,
meetConfigured, emailActivated, responseSheetLinked = true; kvóta 1500;
všechny čtyři guest privacy flags = false; managedTriggerCount = 2.
UI triggerů potvrzuje onVibeCodingLiveFormSubmit z Forms a časový reconcile,
oba na Head. Triggery nebyly reinstalovány. Reconcile nebyl ručně spuštěn.
Před migrací stále existoval právě jeden schválený test; žádná nová registrace
nebyla vynechána cutoverem. Individuální test byl nevratně odstraněn až po
schválení, UI následně ukázalo 0 odpovědí. Poté vznikla připojená tabulka:
https://docs.google.com/spreadsheets/d/18uNkLJyAVpfbjq2Jj4_trqstccYESW5HvzuZjneinKM/edit
List Odpovědi formuláře 1 (gid 1814267425), šest původních sloupců; screenshot
ověřil čitelná záhlaví a prázdné řádky. UI sdílení: Soukromé pouze pro mě.
Opakovaný lokální test: 25/25, exit 0. Rychlý security scope proti 5760713:
exit 0, bez sítě; source review a živé privacy flags bez potvrzeného blockeru.
Neověřeno: doručení do skutečné schránky, odolnost veřejného Forms vůči spamu,
atomické exactly-once mezi MailApp a Properties (není garantované).
Čerstvý verifier registration_activation_verifier opět nedostupný (limit
vláken). PARTIALLY VERIFIED, nikoli nezávisle přijaté. Další krok: uživatel
provede novou registraci, poté read-only ověřit submit execution a doručení.
Neopakovat migraci, mazání, vytváření Sheet, OAuth ani instalaci triggerů.

## Výsledek a retrospektiva

Aktivováno a připraveno k uživatelskému retestu. Skutečné doručení zůstává
neověřené; nový důkaz nesmí být nahrazen mock testy. Bez commitu/pushe/deploye.
