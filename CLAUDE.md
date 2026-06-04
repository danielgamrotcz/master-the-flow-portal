# Master the Flow — Portál

Statický web portál pro komunitu Master the Flow. Denní digest WhatsApp diskuzí, anonymizovaný, prohledávatelný.

- **URL (prod):** https://master-the-flow-portal.pages.dev (+ vlastní doména podle nastavení)
- **Repozitář:** https://github.com/danielgamrotcz/master-the-flow-portal
- **Hosting:** Cloudflare Pages (auto-deploy při push na main)
- **Data:** JSON soubory v `/data/` — commitovány automaticky skriptem

## Architektura

```
master-the-flow-portal/
├── index.html        SPA portál
├── styles.css        Design system (dark, #000, #F06A15)
├── app.js            Logika: filtrování, vyhledávání, overlay, přepisy
├── data/
│   ├── today.json    Dnešní digest (přepisuje se každý den)
│   ├── archive.json  Index všech dostupných dat
│   └── archive/      Archiv: YYYY-MM-DD.json pro každý den
└── CLAUDE.md
```

## Automation pipeline

```
04:00  launchd → daily_export.py     WhatsApp SQLite → Obsidian MD
05:00  launchd → weekly_summary.py   Týdenní souhrn (jen pondělí)
05:15  launchd → portal_cards.py     MD → JSON karty → git push
  ↓
Cloudflare Pages auto-deploy (<60s)
```

Generátor karet: `/Users/danielgamrot/Projects/whatsapp-export/scripts/portal_cards.py`

## JSON schema — denní digest

```json
{
  "date": "2026-06-04",
  "generated_at": "2026-06-04T05:15:00Z",
  "stats": { "messages": 42, "groups": 3, "members": 7 },
  "cards": [
    {
      "id": "2026-06-04-01",
      "type": "INSIGHT",
      "level": "Builder",
      "topic": "Claude Code",
      "title": "Krátký název max 8 slov",
      "excerpt": "2–3 věty shrnutí.",
      "body": "Plný text 100–250 slov.",
      "read_minutes": 2,
      "source_date": "2026-06-04"
    }
  ],
  "resurfacing": { ...stejný formát jako karta, "resurfaced_from": "2026-05-18" },
  "transcript": {
    "groups": [
      {
        "slug": "inspirace-diskuze",
        "name": "Inspirace & Diskuze",
        "messages": [
          { "time": "10:53", "author": "člen komunity", "text": "..." }
        ]
      }
    ]
  }
}
```

## Typy karet

| Typ | Barva | Kdy použít |
|-----|-------|------------|
| INSIGHT | oranžová | tip, postup, poznatek |
| NÁSTROJE | modrá | srovnání nástrojů, zkušenost |
| POSTAVIL JSEM | zelená | sdílený projekt nebo výsledek |
| OTEVŘENÁ OTÁZKA | fialová | zajímavá otázka z komunity |
| TÉMA TÝDNE | žlutá | dominující téma dne/týdne |

## Manuální backfill

```bash
cd /Users/danielgamrot/Projects/whatsapp-export
python3 scripts/portal_cards.py --backfill=2026-05-28
```

Skript přeskočí dny, kde archiv už existuje, jen pokud to implementuješ tak v backfill scriptu.

## Cloudflare Pages nastavení

1. Dashboard → Pages → Create → Connect to Git
2. Repozitář: `danielgamrotcz/master-the-flow-portal`
3. Build command: *(prázdné)*
4. Output directory: `/` nebo `.`
5. Branch: `main`

Custom doména: Pages → Custom domains → přidat subdoménu z Cloudflare DNS.

## Logy

```bash
tail -f /tmp/portal_cards.log      # dnešní generování
tail -f /tmp/daily_export.log      # ranní export z WhatsApp
```

## Roadmap

### Fáze 1 (hotovo)
- Statický portál: level filtr, typy karet, resurfacing, vyhledávání (Fuse.js)
- Denní automation: daily_export → portal_cards → git push → CF deploy
- Anonymizovaný přepis dne

### Fáze 2
- PWA (offline, Add to Home Screen)
- Push notifikace při novém digestu (Web Push API)
- „Záložky" v localStorage — ukládání karet pro pozdější čtení

### Fáze 3
- Týdenní digest karta (nejlepší z týdne)
- Integrovaný odkaz na živé akce / webináře
