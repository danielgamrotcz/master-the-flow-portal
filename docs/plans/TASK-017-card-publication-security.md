# TASK-017 — Obnova publikace karet a zabezpečení portálu

Stav: In Progress
Tracker: ../../TASKS.md
Poslední checkpoint: 2026-10-23 Europe/Prague

## Výsledek a acceptance
Aktuální karty i náhledy se bezpečně publikují automatickou cestou. Veřejné odpovědi neodhalují přepisy ani tajemství. Čerstvé testy, reálný launchd běh a produkční scénář doloží výsledek.

## Scope a nepovolené kroky
Schváleny potřebné opravy, commity, push a nasazení. Neprovádět force push, reset, ruční změny generovaných komunitních textů ani hromadné notifikace. Zachovat cizí práci a oba rodiče rozdílné Git historie. Citlivé hodnoty nezapisovat do dokumentace ani logů.

## Aktuální stav
- [x] Read-only mapovač /root/impact_map dokončen.
- [x] Cloudflare production i preview fail_open=false ověřeno přes GET po PATCH.
- [x] Lokální opravy a syntetické regrese: 74 testů automatizace, karta/hlavičky i lokální HTTP prošly.
- [x] Nezávislá kontrola zmrazeného lokálního snapshotu dokončena.
- [ ] Obnova Git historie a přihlášení Wrangleru.
- [ ] Browserové a produkční testy, celková acceptance, release a ověření automatického provozu.

## Rozhodnutí a objevy
Hlášky jsou o publikaci digestu. Git push je od 19. 10. odmítaný; Wrangler vrací 400 při obnově tokenu. Publikace dosud nasazovala dirty checkout i po neúspěšném pushi. Potřebuje čistý ověřený export a samostatný deployment checkpoint. Push tajemství bylo nalezeno přímo v launchd konfiguraci a bude rotováno bez výpisu hodnoty.

## Checkpoint projektu
Portal main HEAD 274eb1e34a65b99e9d9e335e3d3bc55553147d7b. Čerstvý ls-remote ukázal e91d7bb500b4c8463eeb7c0851d089596c16f7c2; fetch selhal na sandbox zákazu zápisu .git. GitHub API ověřilo 37 upstream commitů od společného základu dd2b033; produkční stav proto nelze přepsat starým checkoutem.
Chráněný tools/build_glossary.py SHA-256 166465a57fed8c01a232f1c0bc2a9b7f1351e90c5d4b5f5fa230f2826a5ec289; CLAUDE.md 689569e0a655689afb0e7d0b0a393ed725084eb1f5769707410a9e72b1de9a21. WhatsApp portal_cards.py baseline a954b3c09a97cf56f108ddc8330de52a5186b93aa37f3f66b1edb146e99ece2b. Rozpracované migrační hunks jsou mimo publikační helpery.

## Ověření
- Celá syntetická sada automatizace po poslední změně: 74 testů, OK. Log /private/tmp/mtf-automation-tests-final.log.
- Kanonická mockovaná kontrola slovníčku: prošla; Python syntax všech scripts/*.py a tests/*.py prošla.
- Node card-security-headers, ESM syntax a shell syntax: prošly. Lokální HTTP ověřilo interní 404, pět anonymních 403, členský přístup, private cache a oba typy náhledů.
- Plná E2E sada: SELHALO na prostředí Chromium (MachPortRendezvous Permission denied), nikoli úspěšný funkční důkaz. Eskalovaný cílený pokus stejný výsledek. Vizuální a offline scénář nejsou ověřeny.
- Produkce: /.dev.vars, /.env.production.local a /wrangler.toml vrací 404; /data/today.json a /data/chat-transcripts.json vrací 403 bez přihlášení. První požadavek today měl síťovou chybu, úzké opakování prošlo.
- Cloudflare GET: production i preview fail_open=false, KV i D1 binding zachovány. Produkční deployment stále fa2a7342; nový deploy neproběhl.
- Push tajemství přesunuto do ~/Library/Application Support/mtf-portal/notify-secret (0600, rodič 0700); loader ho načte, obě plist konfigurace už nemají plaintext proměnnou. Hodnoty se nevypisují. Staré tajemství karet se lišilo od push jobu; rotace produkčního tajemství čeká na ověřený release.
- Dva nezávislé nálezy byly potvrzeny oddělenou syntetickou reprodukcí a opraveny: aktivní cherry-pick musí zastavit generování/publikaci; deploy musí použít přesný SHA potvrzený pushem. Druhý povolený opravný cyklus dokončen.
- Finální verifier `/root/publication_security_frozen_review`: PARTIALLY VERIFIED pro celkovou obnovu, bez nového potvrzeného blokujícího nálezu v lokálním snapshotu. Samostatně ověřil všech 13 hashů, 19 publikačních testů, Node test karty, ESM a shell syntax. Plný log 74 testů přečetl, celou sadu znovu nespouštěl. Dokončení agenta ověřeno přes list_agents.
- Před tímto dokumentačním checkpointem všech 13 souborů stále odpovídalo `/private/tmp/mtf-review-snapshot-final.json`. Následně se mění jen tento plán a TASKS.md kvůli zápisu verdiktu. Implementace zůstává zmrazená. Guardy nejsou společným zámkem proti lidské Git operaci zahájené během generování; tento souběh nebyl ověřen.

Předchozí audit: 30 syntetických kontrol a čtyři API/privacy testy prošly. Nejde o důkaz po nynějších změnách; nutno zopakovat.

## Blockery a recovery
Obnoveno 2026-10-23 po rozšíření oprávnění: fetch obou repozitářů prošel. Portál 14 ahead / 7 behind, merge-base b300de5. Commitnuté větve jsou souborově nezávislé. Překryv trackeru bude spojen se zachováním TASK-014–017. Původní blocker .git je vyřešen; OAuth stále vrací 400 a Chromium stále selhává na MachPortRendezvous.

Historický checkpoint před rozšířením oprávnění:
Zápis .git blokován i při require_escalated; požádáno o technické rozšíření session oprávnění. Do jeho získání žádné obcházení sandboxu. Přihlášení Wrangleru vyžaduje obnovení OAuth. Cloudflare rollback fail_open by obnovil předchozí riziko a není výchozí recovery.

## Výsledek a retrospektiva
PARTIALLY VERIFIED. Bezpečnostní nastavení cloudu a lokální opravy jsou hotové v uvedeném rozsahu. Celkový provozní výsledek není dokončen kvůli technickým oprávněním a nedokončené autentizaci. Necommitováno, nepushnuto, nenasazeno a nic nerozesláno. Uživatelské změny zachované.


Tracker SHA-256 po checkpointu: 6ae3070b62e2dd67790645c627e0a8435470a6d5c6587179f5bd4648f4d0d103
