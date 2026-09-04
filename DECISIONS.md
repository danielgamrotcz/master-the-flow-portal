# Záznam rozhodnutí

## 2026-09-04 — Zachovat portál bez build systému

Stav: přijaté

Klient se servíruje přímo z kořene a Pages Functions běží odděleně. Projekt
proto nedostane package manifest, bundler ani framework jen kvůli standardizaci.
Lehké syntax kontroly a reálné Wrangler E2E jsou zdrojem důkazu. Produkční
změna vyžaduje approval a konkrétní rollback podle dotčené route nebo dat.
