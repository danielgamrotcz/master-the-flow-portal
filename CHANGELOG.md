# Changelog

## [Unreleased]

### Fixed
- Chat: filtrovací tabky (témata) se zobrazovaly v chat view — nyní jsou skryté v chat, přepis a statistiky.
- Chat: při neplatném přihlašovacím tokenu se nyní automaticky odhlásí a zobrazí přihlašovací obrazovka místo chybové hlášky.

### Added
- **Chatbot** — nová položka v menu „Chat"; Claude Sonnet odpovídá výhradně na základě obsahu komunity (karty + přepisy WhatsApp). Multi-turn konverzace, streaming po slovech, citace jako klikatelné chipy otevírající overlay karty.
- `/api/chat` endpoint se streamovanými odpověďmi přes SSE a tool-use smyčkou pro vyhledávání v přepisech.
- Předgenerované datové soubory `data/chat-corpus.json` (273 karet) a `data/chat-transcripts.json` (70 dní, 1439 zpráv) pro rychlé načítání v chatbotu.

### Security
- CORS: požadavky bez hlavičky Origin vrací `null` místo `*` — brání přístupu z curl/server-side skriptů
- Auth: odstraněn FALLBACK_HASH ze source kódu; bez `GATE_CODE` env var server vrátí 500
- Auth: response při přihlášení má `Cache-Control: no-store`
- Subscribe: klíč subscripce využívá SHA-256 hash endpointu — odstraněna možnost kolize klíčů
- Subscribe: globální limit 500 subscripcí — ochrana před flood útokem
- Track: oprava rate limit TTL (5 s → 60 s; KV minimum); chyba rate limitu nyní vrací CORS hlavičky

### Changed
- Swipe přepínání panelů (Dnes/Týden/Archiv…) odstraněno — zůstává swipe na kartách (srdíčko / přečteno)
- Top view: řazení podle váženého skóre (čtení + srdíčka × 5) místo pouhého počtu čtení
- Push notifikace zobrazují title + excerpt nejlépe hodnocené karty dne místo generického textu
- Statistiky: 2-sloupcový layout na desktopu (čísla + kalendář vlevo, témata + oblíbené karty vpravo)
- Přepis u karty filtrovaný na relevantní zprávy — tlačítko „Zobrazit celý přepis" pro kompletní konverzaci

### Added
- `source_group` + `source_msg_times` na kartách — dohledání zdrojových zpráv v přepisu
- Generátor karet nyní předává Claudovi konverzaci s časovými razítky [HH:MM] a slug skupiny
- Backfill 304 existujících karet (keyword matching karta ↔ zprávy přepisu)

### Fixed
- Resurfacing karta se nezobrazovala v tab Včera (null místo data.resurfacing)
- Service worker cachoval archivní soubory cache-first — stará data po aktualizaci; přepnuto na network-first + cache `mtf-v3`
- Hash v URL se neaktualizoval při přechodu na archiv z datumu v overlay nebo ze statistik
- Přepis → Zpět obnovoval špatný view a neopravoval hash
- Přímá URL `#card/ID` neotvírala overlay pokud den nebyl v cache; nyní se datum donačte z archivu
- Počet členů komunity v Statistikách zobrazoval „—"; hodnota nastavena v KV store (400)

### Added
- Portál se statickým SPA: level filtr, typy karet, téma, vyhledávání (Fuse.js)
- Resurfacing mechanic — karta „Z archivu" v každém digestu
- Přepis dne — anonymizovaná konverzace z WhatsApp skupin
- Sdílitelné permalink na každou kartu (#card/ID)
- Automation pipeline: portal_cards.py → git push → Cloudflare Pages
- LaunchD plist: cz.gamrot.portal-cards (spouštění v 05:15)
