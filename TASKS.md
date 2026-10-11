# Projektové úkoly

Aktualizováno: 2026-10-11

Backlog není souhlas začít; Ready vyžaduje schválení a WIP limit je jeden.
Review obsahuje čerstvé cílené E2E důkazy, Done přijetí. Task neautorizuje
produkci, backfill, notifikaci, změnu živých dat, commit ani push.

## Inbox

_Žádné položky._

## Backlog

_Žádné položky._

## Ready

_Žádné položky._

## In Progress

_Žádné položky._

## Review

_Žádné položky._

## Done

### TASK-001 — Landing page „Vibe coding nezačíná promptem“

- Started: 2026-10-11
- Resumed: 2026-10-11 — Daniel dokončil interaktivní přihlášení a potvrdil vytvoření formuláře, Calendar události a automatických soukromých pozvánek.
- Accepted: 2026-10-11 — Daniel schválil commit, push a produkční nasazení.
- Owner: Codex
- ExecPlan: [docs/plans/TASK-001-vibe-coding-live.md](docs/plans/TASK-001-vibe-coding-live.md)
- Výsledek: veřejná landing page pro bezplatný live stream 21. 10. 2026 od 18:00, registrační Google Form a soukromé Calendar pozvánky s Google Meet.
- Release: commit `9894067`, push na `origin/main` a Cloudflare Pages production deployment `4e3b7cdb-1a38-4c8a-a4dc-c80a8301abac` dokončeny.

#### Verification

- [x] Veřejná stránka a eventová data jsou konzistentní se skutečným formulářem.
- [x] Registrační CTA vedou na nový formulář a veřejně neodhalují Meet ani záznam.
- [x] Lokální test registrační logiky chrání adresy hostů a neposílá duplicitní pozvánky.
- [x] Responzivní cílené E2E nové stránky prošlo 20/20.
- [x] Calendar událost, aktivace Apps Scriptu, bezpečnostní kontrola a nezávislý verifier jsou dokončené.

#### Evidence

- Cílené E2E: `tests/e2e-vibe-coding-live.js` — 20/20 — prošlo.
- Registrační automatizace: `tests/google-vibe-coding-live-registration.js` — 10/10 — prošlo.
- Verifier: `/root/vibe_release_verifier` — completed — VERIFIED
- Post-review snapshot: nezměněn — stabilní implementační hashe jsou uložené v ExecPlanu.
- ExecPlan: [docs/plans/TASK-001-vibe-coding-live.md](docs/plans/TASK-001-vibe-coding-live.md)
- Produkce: `https://mastertheflow.cz/live/vibe-coding/` — HTTP 200 a cílené E2E 20/20 — prošlo.

## Blocked

_Žádné položky._
