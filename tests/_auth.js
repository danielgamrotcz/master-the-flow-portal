// Přihlášení pro e2e testy.
//
// Dřív si testy vkládaly do localStorage vymyšlený token ('test') a to stačilo,
// protože brána byla jen klientská a datové JSONy visely veřejně. Od chvíle,
// kdy je chrání serverová cookie, vymyšlený token neprojde a portál se načte
// prázdný. Testy se proto musí přihlásit doopravdy.
//
// Kód se bere z .dev.vars, tedy z lokální vývojové proměnné. Nikde se nevypisuje.

const fs = require('fs');
const path = require('path');

// Adresa běžícího serveru. Testy jedou proti lokálnímu wrangler dev, ale přes
// MTF_BASE se dají pustit i proti jinému portu nebo náhledové adrese.
// Koncové lomítko se ustřihne hned tady, protože cesty se dál skládají
// řetězením (base + '/api/auth') a jinak by vznikly adresy s dvojím lomítkem.
const BASE = (process.env.MTF_BASE || 'http://localhost:8788').replace(/\/+$/, '');

function gateCode() {
  const p = path.join(__dirname, '..', '.dev.vars');
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch {
    throw new Error('.dev.vars nenalezen — e2e testy potřebují lokální GATE_CODE');
  }
  const m = raw.match(/^GATE_CODE=(.*)$/m);
  if (!m) throw new Error('.dev.vars neobsahuje GATE_CODE');
  return m[1].trim().replace(/^["']|["']$/g, '');
}

// Deep-link scénáře nesmí záviset na obsahu proměnlivého today.json. Den bez
// zpráv může legitimně nemít ani novou, ani resurfacing kartu. Agregovaný index
// je stabilní testovací zdroj a vybíráme jen kartu, jejíž archivní soubor
// skutečně existuje.
function fixtureCardId() {
  const dataDir = path.join(__dirname, '..', 'data');
  const raw = JSON.parse(fs.readFileSync(path.join(dataDir, 'cards-index.json'), 'utf8'));
  const cards = Array.isArray(raw) ? raw : (raw.cards || []);
  const card = cards.find(item => {
    const date = typeof item?.id === 'string' && item.id.match(/^(\d{4}-\d{2}-\d{2})-/)?.[1];
    return date && fs.existsSync(path.join(dataDir, 'archive', `${date}.json`));
  });
  if (!card) throw new Error('cards-index.json neobsahuje použitelnou archivní kartu');
  return card.id;
}

/**
 * Přihlásí browser context: získá platný token, uloží ho do localStorage
 * (odtud ho appka bere pro API volání) a nechá cookie přistát v context jaru
 * (odtud ji prohlížeč posílá k datovým souborům, včetně fetchů ze SW).
 *
 * ctx.request sdílí úložiště cookies s kontextem, proto stačí jedno volání.
 */
async function authenticate(ctx, base = BASE) {
  const res = await ctx.request.post(base + '/api/auth', {
    headers: { 'Content-Type': 'application/json', Origin: base },
    data: { code: gateCode() },
  });
  if (!res.ok()) {
    throw new Error(`přihlášení v testu selhalo: HTTP ${res.status()}`);
  }
  const { token, expires } = await res.json();
  await ctx.addInitScript(
    ([t, e]) => {
      localStorage.setItem('mtf_auth', JSON.stringify({ token: t, expires: e }));
    },
    [token, expires]
  );
  return { token, expires };
}

module.exports = { authenticate, gateCode, fixtureCardId, BASE };
