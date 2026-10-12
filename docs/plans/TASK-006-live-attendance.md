# TASK-006 — Podpora živé účasti

Stav: Blocked
Poslední checkpoint: 2026-10-12 Europe/Prague
Tracker: [TASKS.md](../../TASKS.md)

## Výsledek a acceptance

Web vysvětluje živé otázky a účast bez přípravy; záznam je vedlejší informace.
Formulář má vyžadovat pouze e-mail a po registraci vysvětlit doručení pozvánky
i postup při nedoručení. Podrobné checklisty jsou v TASKS.md.

## Scope a nepovolené kroky

Schválené jsou úpravy stránky a registrace, commit, push a deploy. Bez připomínek,
propagace s Alexem, organizace vysílání, mazání otázek či odpovědí. Nespouštět
instalátor Apps Scriptu, reconciliation ani odesílání testovacích pozvánek.

## Aktuální stav

- [x] Webový commit `63e76bd` pushnut; deployment `6b77342e` ověřen na vlastní doméně.
- [x] Lokální/produkční E2E 31/31; automatizace 11/11; nezávislá kontrola webu VERIFIED.
- [ ] Změnit jméno v Google Form na nepovinné; ostatní pole mimo e-mail již nepovinná jsou.
- [ ] Doplnit úvod o „K registraci stačí e-mail. Ostatní otázky jsou nepovinné.“
- [ ] Uložit potvrzení podle `VIBE_CODING_LIVE.confirmationMessage` ve verzovaném skriptu.
- [ ] Veřejně ověřit formulář, znovu načíst uložené potvrzení a uzavřít nezávislou kontrolu externí části.

## Rozhodnutí a objevy

Automatizace používá jen otázku s titulkem `E-mail`/`E‑mail`; titulky neměnit.
Calendar lookup je svázaný s historickým názvem události, který musí zůstat.
Změna lokálního `.gs` ani deploy webu neaktualizují živý Apps Script či formulář.
Potvrzení lze změnit přímo v editoru Google Forms v Nastavení → Prezentace.
Nepouštět instalátor: mění triggery a může odeslat pozvánky.
Podpůrný kontakt `daniel@gamrot.cz` doložen na vlastní stránce webinar/vibe-coding/dekuji.

## Checkpoint projektu

Root: `/Users/danielgamrot/Projects/master-the-flow-portal`, branch `main`.
Tracker SHA-256: `29b26845653d408b878269ec4c8e1dcf4446b56f8cfcb5f29e0b3f5a7307dd53`.
Implementační snapshot: HTML `85122fa…`, CSS `8763095…`, E2E `ad1f09e…`,
automatizační test `9c8f049…`, skript `c6a72d2…`. Eventy, fotografie, middleware
a hlavičky zůstaly shodné s baseline `6e2b591`.

## Ověření

Verifier `/root/live_attendance_acceptance` — completed — VERIFIED pro lokální
web a zdroj potvrzení. Živý formulář nebyl změněn. Celá lokální sada má stejné
dvě nezávisle reprodukované chyby v nedotčeném slovníčku a registracích srazu.
Rapid security check změny bez nové potvrzené regrese; nejde o audit celého systému.

## Blockery a recovery

Browser workflow vyžádal potvrzení zápisu do živého formuláře přes asynchronní
otázku; do checkpointu odpověď nepřišla. Editor formuláře:
`https://docs.google.com/forms/d/1NE0ISDvtJ51sGkHSJPlodY3pOwyK8hrfhMFz-79ce60/edit`.
Veřejnou URL převzít z registračního tlačítka webu. Editor má otevřenou původní
potvrzovací zprávu, žádné nové hodnoty nebyly vyplněny ani uloženy.
Při pokračování znovu ověřit WIP, Git stav a živé required stavy. Návrat webu
je možný deployem `6e2b591`; původní potvrzení je v tomtéž Git commitu.

## Výsledek a retrospektiva

Webová část je dokončená a publikovaná. Celkový výsledek PARTIALLY VERIFIED,
dokud není dokončen a ověřen živý formulář. Commit dokumentace nevyžaduje nové
nasazení, protože nemění veřejné soubory.
