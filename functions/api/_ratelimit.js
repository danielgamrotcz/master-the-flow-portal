// Atomický rate limiting nad D1.
//
// Proč ne KV: KV je eventually consistent. Vzorec read-modify-write nad ním
// znamená, že souběžné requesty přečtou stejnou zastaralou hodnotu a všechny
// projdou. Změřeno v auditu 27. 7. 2026 — 25 souběžných pokusů proti limitu
// 10 za 15 minut skončilo 24× 401 a ani jednou 429, limit se vůbec nezapojil.
//
// D1 umí inkrement a vyhodnocení okna v jediném SQL příkazu, takže souběh
// vyřeší databáze. Stejné rozhodnutí už je ve wrangler.toml u počtů hlasů,
// tohle ho jen dotahuje na čítače, kde chybělo.

const SCHEMA_READY = new WeakSet();

const CREATE_SQL = `CREATE TABLE IF NOT EXISTS rate_limits (
  k TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires INTEGER NOT NULL
)`;

// Reset okna i inkrement v jednom příkazu. Kdyby to byly dva, vrátil by se
// přesně ten souběh, kvůli kterému se od KV odchází.
const BUMP_SQL = `INSERT INTO rate_limits (k, count, expires)
VALUES (?1, 1, ?2)
ON CONFLICT(k) DO UPDATE SET
  count   = CASE WHEN rate_limits.expires <= ?3 THEN 1  ELSE rate_limits.count + 1 END,
  expires = CASE WHEN rate_limits.expires <= ?3 THEN ?2 ELSE rate_limits.expires     END
RETURNING count`;

async function ensureSchema(db) {
  if (SCHEMA_READY.has(db)) return;
  await db.prepare(CREATE_SQL).run();
  SCHEMA_READY.add(db);
}

/**
 * Zvýší čítač a řekne, jestli je limit překročen.
 * Vrací true = blokovat (stejná sémantika jako původní KV varianty).
 *
 * Fail-closed: když D1 chybí nebo selže, request se zamítne. Fail-open by
 * z výpadku databáze udělal cestu, jak limity obejít.
 */
export async function rateLimit(env, key, limit, windowSec) {
  const db = env.VOTES_DB;
  if (!db) return true;
  const now = Math.floor(Date.now() / 1000);
  try {
    await ensureSchema(db);
    const row = await db.prepare(BUMP_SQL)
      .bind(key, now + windowSec, now)
      .first();
    if (!row) return true;
    if (Math.random() < 0.01) {
      // Občasný úklid prošlých řádků, ať tabulka neroste donekonečna.
      env.__gc = db.prepare('DELETE FROM rate_limits WHERE expires <= ?1').bind(now).run();
    }
    return row.count > limit;
  } catch {
    return true;
  }
}

/**
 * Klíč z IP adresy. IPv6 se ořezává na /64, protože jednomu klientovi běžně
 * patří celý prefix — bez ořezu má útočník prakticky nekonečnou zásobu
 * čerstvých čítačů. Komprimovaný zápis se musí nejdřív rozvinout, jinak
 * dvě adresy ze stejné /64 skončí pod různými klíči.
 */
export function ipKey(ip) {
  if (!ip || typeof ip !== 'string') return 'unknown';
  const addr = ip.trim().toLowerCase();
  if (!addr.includes(':')) return addr;

  // IPv4-mapped (::ffff:1.2.3.4) — rozhoduje vložená IPv4.
  const v4 = addr.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) return v4[1];

  const [head, tail] = addr.split('::');
  const h = head ? head.split(':').filter(Boolean) : [];
  let hextets;
  if (tail === undefined) {
    hextets = h;
  } else {
    const t = tail ? tail.split(':').filter(Boolean) : [];
    const missing = 8 - h.length - t.length;
    hextets = [...h, ...Array(Math.max(0, missing)).fill('0'), ...t];
  }
  const prefix = hextets.slice(0, 4).map(x => {
    const n = parseInt(x, 16);
    return (Number.isNaN(n) ? 0 : n).toString(16).padStart(4, '0');
  });
  while (prefix.length < 4) prefix.push('0000');
  return prefix.join(':') + '::/64';
}
