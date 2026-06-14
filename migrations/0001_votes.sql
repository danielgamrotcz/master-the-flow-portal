-- D1 schéma pro hlasy (srdíčka). Aplikováno na databázi mtf-votes.
-- KV se na počítadla nehodí (eventually consistent → ztráta souběžných hlasů
-- i zpožděné čtení). D1 je silně konzistentní.
--   wrangler d1 execute mtf-votes --remote --file=migrations/0001_votes.sql
CREATE TABLE IF NOT EXISTS votes (
  card_id TEXT NOT NULL,
  voter   TEXT NOT NULL,           -- SHA-256 otisk (c:<clientId> nebo i:<ip>)
  PRIMARY KEY (card_id, voter)     -- dedup: jeden hlas na voliče a kartu
);
