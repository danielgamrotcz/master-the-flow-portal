# TASK-016 — Uzavření rozhovoru s Alexem

Stav: Blocked
Poslední checkpoint: 2026-10-21
Tracker: ../../TASKS.md, TASK-016

## Výsledek a acceptance

Rozhovor proběhl. Registrace jsou uzavřené na webu, v portálu i Google Forms.
Landing a událost uvádějí „Záznam připravujeme“. Žádný veřejný odkaz na záznam.
Commit, push, merge a produkční deploy uživatel výslovně schválil.

## Scope a nepovolené kroky

Pouze rozhovor s Alexem a jeho testy. Bez odesílání zpráv, testovacích registrací,
změn ostatních akcí či ručních zásahů do automaticky generovaných dat.

## Aktuální stav

- [x] Mapa /root/alex_close_impact dokončena.
- [x] Izolovaný clone sloučil b300de5 a origin/main 12274b5 bez konfliktu.
- [x] Google Forms uzavřený a veřejný closedform stav ověřený přes UI.
- [x] Web, cílené manuální scénáře a nezávislé ověření; automatické browser E2E omezené sandboxem.
- [ ] Git release, Cloudflare Pages a produkční ověření.

## Rozhodnutí a objevy

Původní checkout je pro toto prostředí read-only. Pracovní clone:
/private/tmp/mtf-alex-close-qca_vj32/portal. Není Git worktree.
Cizí tools/build_glossary.py v původním checkoutu má SHA-256
166465a57fed8c01a232f1c0bc2a9b7f1351e90c5d4b5f5fa230f2826a5ec289;
není součástí clone ani releasu. Origin main před merge 12274b5.
Zachovat streaming a registraci bez kapacitního limitu z upstreamu.

## Checkpoint projektu

Větev main, merge bd40192. Původní checkout zůstává na b300de5,
bez změny statusu a uživatelského slovníčku.

## Ověření

Google veřejný formulář přesměruje na closedform a zobrazuje správnou zprávu.
Žádná odpověď ani pozvánka nebyla odeslána.

## Blockery a recovery

Rollback webu: nasadit čistý export původního upstream commitu 12274b5.
Formulář ponechat uzavřený; neaktivovat instalační helpery, které ho otevírají.

## Výsledek a retrospektiva

Implementace a samostatné acceptance /root/alex_archive_acceptance dokončené:
PARTIALLY VERIFIED, bez lokálního funkčního blockeru. Post-review obsahové hashe
sedí na /private/tmp/mtf-alex-pre-review.json. Cílené manuální scénáře Chrome,
API testy, JS syntaxe, diff-check a kontrakt portálových funkcí prošly.
Plná sada exit 1: browser launch blokovaný sandboxem a stejné baseline selhání
google-forms-attendees. Rapid security diff nemá potvrzený blocker.
Cloudflare CLI dosud nepřihlášené; připraven OAuth jen account:read,
user:read a pages:write v odděleném dočasném configu. Žádný deploy zatím.

Implementační commit 79057917de7ebb254e19da0f379915b4c8ab89f7 pushnutý;
ls-remote shodný. Čistý deploy export /private/tmp/mtf-alex-release-usnlo433.
Cloudflare přihlášení vyžaduje potvrzení tlačítka s uvedeným souhlasem
s podmínkami. Asynchronní otázka čeká na Daniela; OAuth timeout není login.
Po potvrzení restartovat autorizaci a nasadit zkontrolovaný čistý export.
Původní checkout b300de5 je stále beze změny a není synchronizovaný s releasem.



Aktuální SHA-256 trackeru: d19a1d602555bc75b55235b34f2c4b876f187c7d5c4f741d17d7d814003ccef4
