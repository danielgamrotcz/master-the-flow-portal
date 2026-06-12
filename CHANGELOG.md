# Changelog

## [Unreleased]

### Added
- Nový typ karty **TIP** (tyrkysová) — sdílené externí zdroje (videa, kurzy, kanály, metodiky) s komentářem člena. Inspirace, kvůli které lidi do skupiny chodí.
- Zpětné doplnění odkazů na 80 historických karet — URL spárované přes zdrojové zprávy, u karet s víc kandidáty ověřeno Claudem (jen tematicky relevantní, bez falešných).

### Changed
- Sjednocení vizuálu — ikony (jednotná tloušťka tahu, zaoblené konce, ustálené velikosti) a tlačítka (společný základ `.icon-btn`, 2 velikosti + 1 zaoblení místo 4+4, odstraněno 8× zduplikovaného CSS, jednotky px místo rem).

### Fixed
- Počítadlo čtení sjednoceno na globální serverové číslo (`/api/reads`, veřejné) — bylo nekonzistentní mezi zařízeními (mobil vs desktop). Odeslání čtení přes `keepalive`, okamžité připočtení po přečtení nad spolehlivý serverový základ.
- CSP `style-src` doplněn o `'unsafe-inline'` — inline styly (barvy typů karet včetně TIP) byly blokované, házely 100+ chyb a barvy typů nefungovaly. `script-src` zůstává přísný.
- Spodní lišta v rozbalené kartě na mobilu: „Označit jako nepřečtené" → „Nepřečtené", tlačítka se nezalamují.
- Vyhledávací pole má plnou šířku hned od začátku (předtím se na desktopu rozšiřovalo až po zobrazení výsledků).
- Počet členů komunity aktualizován na 490.
- Klidný den bez karet: záložka Včera nově zobrazí hlášku „Za včerejšek nejsou žádné vygenerované poznatky" místo zavádějícího textu o filtru. Digest s 0 kartami je validní stav, portál nezamrzne na předchozím dni.

### Changed
- Typ karty „POSTAVIL JSEM" přejmenován na „UKÁZKA" — rodově neutrální, 57 existujících karet + generátor karet aktualizovány.
- Opravy obsahu archivu: odstraněna vymyšlená fakta (ceny produktů, encyklopedické detaily, nepotvrzené funkce), opraveny em-dashe a AI fráze v 40 dnech archivu.

### Fixed
- Chat: filtrovací tabky (témata) se zobrazovaly v chat view — nyní jsou skryté v chat, přepis a statistiky.
- Chat: při neplatném přihlašovacím tokenu se nyní automaticky odhlásí a zobrazí přihlašovací obrazovka místo chybové hlášky.
- Chat: nav tlačítko skryto — chatbot zůstává dostupný přes #chat ale není v menu.

### Added
- **Chatbot** — nová položka v menu „Chat"; Claude Sonnet odpovídá výhradně na základě obsahu komunity (karty + přepisy WhatsApp). Multi-turn konverzace, streaming po slovech, citace jako klikatelné chipy otevírající overlay karty.
- `/api/chat` endpoint se streamovanými odpověďmi přes SSE a tool-use smyčkou pro vyhledávání v přepisech.
- Předgenerované datové soubory `data/chat-corpus.json` (273 karet) a `data/chat-transcripts.json` (70 dní, 1439 zpráv) pro rychlé načítání v chatbotu.

### Security
- AUTH-001: nonce tracking — každý token ukládá nonce do KV (30 dní TTL); serverová verifikace odmítne token s neznámým nonce. Umožňuje budoucí revokaci tokenů. Stávající tokeny budou po deployi neplatné.
- Auth: CSPRNG nonce (`crypto.getRandomValues`) místo náhodného řetězce
- Auth: timing-safe porovnání gate kódu přes SHA-256 XOR
- Auth: rate limit přihlášení 10 pokusů / 15 min / IP
- Vote: autentizace tokenu na POST i DELETE (dříve byl volně dostupný)
- Vote: deduplikace hlasování — 1 hlas / IP / karta / 30 dní
- Chat: rate limit 30 požadavků / IP / 24 h
- Chat: limity zpráv — max 40 zpráv, max 4000 znaků / zpráva, max 4 iterace tool-use
- Chat: vynucené střídání rolí (user/assistant) — klient nemůže podvrhnout assistant zprávy
- Track: validace data — musí být reálné datum v rozsahu ±7 dní od dnes
- Subscribe: SSRF ochrana — allowlist platných push notifikace domén (`googleapis.com`, `mozilla.com`, …)
- Subscribe: vynucen `https:` protokol pro push endpoint
- Insights: timing-safe porovnání admin tokenu
- Insights: audit log přístupu (čas + IP)
- Security headers: `X-Frame-Options: DENY`, `HSTS`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `X-Robots-Tag: noindex`
- CSP: oprava SHA-256 hashe inline skriptu (tmavý režim se po reloadu resetoval kvůli blokovanému skriptu)
- Service worker: cache klíč využívá celý Request objekt místo pathname — opravena nesprávná shoda URL s query params
- CORS: localhost regex pevně zadaný (`/^http:\/\/localhost(:\d+)?$/`) ve všech API funkcích
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
