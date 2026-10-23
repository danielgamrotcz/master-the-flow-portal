# TASK-015 — Registrace bez pevné kapacity

## Cíl

Odstranit pevný limit 98 ze všech vrstev registračního toku. Veřejná stránka má ukazovat pouze čerstvý počet registrovaných a registrace musí zůstat dostupná bez ohledu na jeho hodnotu.

## Mimo rozsah

- automatický replay dříve odmítnutých odpovědí,
- mazání historického ledgeru nebo markerů `VIBE_CODING_LIVE_FULL_*`,
- commit, push, deploy a živá změna Google Formu bez samostatného souhlasu.

## Implementace

1. Ve veřejném API odstranit `capacity` a `remaining`; zachovat ochrany zápisu, čerstvost, `no-store` a count-only payload.
2. Na landing page odstranit kapacitní texty. Klient má zobrazit jen `Přihlášeno: N` a nikdy nemá podle počtu deaktivovat registraci.
3. V count skriptu počítat aktuální unikátní platné e-maily přímo z odpovědí formuláře, bez změny stavu formuláře.
4. V pozvánkovém skriptu odstranit kapacitní větev a přidat idempotentní aktivaci, která pouze otevře formulář a aktualizuje potvrzovací text. Historický ledger ponechat inertní.
5. Přepsat kapacitní regresní testy na invariant registrace bez pevného limitu; zachovat testy deduplikace, retry, soukromí a cutoveru.

## Rizika a rollback

- Web a Google skripty musí být při živém cutoveru změněné koordinovaně; samostatný release by mohl slibovat registraci, kterou starý trigger zavře.
- Starý ledger a odmítací markery se nemažou. Rollback zdroje je možný, ale obnovení limitu vyžaduje vědomou živou aktivaci původní logiky.
- Calendar a MailApp mají provozní kvóty; „bez pevné kapacity“ není garance neomezené propustnosti externích služeb.

## Acceptance

- API nevrací kapacitu ani zbývající místa a nikdy nezveřejní e-mail.
- Web neobsahuje `98`, „kapacita“, „zbývá“, „obsazeno“ ani `z 98`; CTA funguje při 98, 101 i při výpadku API.
- Count klesne po odstranění odpovědi, deduplikuje e-maily a nikdy formulář nezavírá.
- Pozvánková logika přijme i více než 98 unikátních odpovědí při zachování deduplikace, retry a soukromí hostů.
- Aktivace neodesílá e-maily ani nereplayuje registrace; pouze otevře formulář a aktualizuje potvrzení.
- Cílené testy, lokální Wrangler E2E, vizuální kontrola, rapid security a nezávislý verifier mají čerstvý důkaz.
