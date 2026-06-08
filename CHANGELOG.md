# Changelog

## [Unreleased]

### Changed
- Swipe přepínání panelů (Dnes/Týden/Archiv…) odstraněno — zůstává swipe na kartách (srdíčko / přečteno)
- Top view: řazení podle váženého skóre (čtení + srdíčka × 5) místo pouhého počtu čtení

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
