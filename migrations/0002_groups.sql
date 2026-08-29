-- D1 schéma pro jednorázové rozdělení účastníků do týmů.
-- Produkční aplikace stejné CREATE IF NOT EXISTS provede i při prvním requestu;
-- tato migrace zůstává kanonickým, auditovatelným schématem.
--   wrangler d1 execute mtf-votes --remote --file=migrations/0002_groups.sql
CREATE TABLE IF NOT EXISTS group_events (
  event_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('open', 'locking', 'finalized', 'expired')),
  groups_json TEXT,
  created_at INTEGER NOT NULL,
  finalized_at INTEGER
);

CREATE TABLE IF NOT EXISTS group_participants (
  event_id TEXT NOT NULL,
  participant_hash TEXT NOT NULL,
  nickname TEXT NOT NULL,
  nickname_key TEXT NOT NULL,
  experience INTEGER NOT NULL CHECK (experience BETWEEN 1 AND 10),
  has_laptop INTEGER NOT NULL CHECK (has_laptop IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, participant_hash),
  FOREIGN KEY (event_id) REFERENCES group_events(event_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_group_participants_event_nickname
ON group_participants(event_id, nickname_key);
