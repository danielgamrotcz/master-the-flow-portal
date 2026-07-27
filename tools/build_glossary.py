#!/usr/bin/env python3
"""Sestaví data/glossary.json pro slovníček na portálu.

Obsah hesel je v tools/glossary_terms.json (data, ne kód, aby do něj mohla
přisypávat i pipeline). Tady se k němu jen dopočítají čísla, doplní se česká
typografie a výsledek se zapíše do data/glossary.json.

Co se dopočítává:
 - mentions   kolikrát výraz padl v denních přepisech (doložitelné číslo)
 - card_hits  kolik karet na portálu ho zmiňuje (aby se nenabízelo prázdné hledání)

Spuštění:
    python3 tools/build_glossary.py
"""
from __future__ import annotations
import json
import re
import unicodedata
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VAULT = Path.home() / "Documents" / "Second Brain" / "2 Oblasti" / "🤖 Master the Flow" / "WhatsApp skupina" / "Daily reports"
TERMS_FILE = ROOT / "tools" / "glossary_terms.json"
OUT = ROOT / "data" / "glossary.json"
CARDS_INDEX = ROOT / "data" / "cards-index.json"

NB = " "  # nezlomitelná mezera

# Předložky a spojky, za kterými nesmí zůstat obyčejná mezera (česká typografie).
_NB_WORDS = ["v", "s", "k", "z", "o", "u", "i", "a", "na", "do", "po", "ve", "ze",
             "od", "za", "se", "si", "že", "bez", "pro", "při", "před", "mezi"]
_NB_RE = re.compile(r"(?<![\w“„])\b(" + "|".join(_NB_WORDS) + r")\s+(?=[\w„])",
                    re.IGNORECASE | re.UNICODE)
_NB_NUM_RE = re.compile(r"(\d)\s+(?=[×%]|Kč|GB|MB|tokenů|hodin|minut|krát)")


def nb(text):
    """Doplní nezlomitelné mezery. Ruční psaní by se dřív nebo později rozpadlo."""
    if not text:
        return text
    text = _NB_RE.sub(lambda m: m.group(1) + NB, text)
    text = _NB_NUM_RE.sub(lambda m: m.group(1) + NB, text)
    return text


def _fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in s if not unicodedata.combining(c)).lower()


def load_terms():
    data = json.loads(TERMS_FILE.read_text(encoding="utf-8"))
    return data["terms"], data["categories"]


def _pattern(pats):
    """Regex s hranicemi slov. Bez nich by se RAG našlo uvnitř Storage."""
    parts = []
    for p in pats:
        body = re.escape(p).replace(r"\ ", r"\s+")
        parts.append(r"(?<!\w)" + body + r"(?!\w)")
    return re.compile("|".join(parts), re.IGNORECASE | re.UNICODE)


def _daily_corpus():
    """Denní přepisy. Týdenní souhrny schválně vynecháváme, obsah opakují
    a čísla by nafoukly, takže by tvrzení „padlo Xkrát" neobstálo."""
    if not VAULT.exists():
        raise SystemExit(f"Nenalezen vault s přepisy: {VAULT}")
    corpus = []
    for p in sorted(VAULT.glob("WA 2*.md")):
        if "Týden" in p.name:
            continue
        m = re.search(r"(\d{4}-\d{2}-\d{2})", p.name)
        corpus.append((m.group(1) if m else "", p.read_text(encoding="utf-8")))
    if not corpus:
        raise SystemExit("Nenalezeny žádné denní přepisy")
    return corpus


def _card_haystacks():
    try:
        raw = json.loads(CARDS_INDEX.read_text(encoding="utf-8"))
        cards = raw if isinstance(raw, list) else raw.get("cards", [])
    except Exception as e:
        print(f"POZOR, cards-index.json nenačten ({e}), card_hits budou 0")
        cards = []
    return [_fold(" ".join(str(c.get(k) or "") for k in ("title", "excerpt", "body")))
            for c in cards]


def build(quiet: bool = False) -> dict:
    terms_in, categories = load_terms()
    corpus = _daily_corpus()
    haystacks = _card_haystacks()
    if not quiet:
        print(f"denních přepisů: {len(corpus)}")

    slugs = {t["slug"] for t in terms_in}
    if len(slugs) != len(terms_in):
        raise SystemExit("V glossary_terms.json jsou duplicitní slugy")
    cat_ids = {c["id"] for c in categories}

    out_terms = []
    for t in terms_in:
        if t["cat"] not in cat_ids:
            raise SystemExit(f"{t['slug']}: neznámá kategorie {t['cat']}")

        rx = _pattern(t.get("match") or [t["term"]])
        total, days, first, last = 0, 0, None, None
        for d, text in corpus:
            n = len(rx.findall(text))
            if n:
                total += n
                days += 1
                first = first or d
                last = d

        forms = [f for f in [t["term"]] + (t.get("match") or []) if len(_fold(f)) >= 3]
        card_res = [re.compile(r"(?<![a-z0-9])" + re.escape(_fold(f)) + r"(?![a-z0-9])")
                    for f in forms]
        card_hits = sum(1 for h in haystacks if any(r.search(h) for r in card_res))

        for r in t.get("related", []):
            if r not in slugs:
                raise SystemExit(f"{t['slug']}: odkaz na neexistující termín {r}")

        out_terms.append({
            "slug": t["slug"],
            "term": t["term"],
            "category": t["cat"],
            "short": nb(t["short"]),
            "plain": nb(t["plain"]),
            "why": nb(t.get("why")) if t.get("why") else None,
            "related": t.get("related", []),
            "aliases": t.get("match", []),
            "source": t.get("source", "hand"),
            "search": _fold(" ".join([t["term"], t["short"], t["plain"],
                                      t.get("why") or "",
                                      " ".join(t.get("match") or [])])),
            "mentions": total,
            "days": days,
            "first_seen": first,
            "last_seen": last,
            "card_hits": card_hits,
        })

    out_terms.sort(key=lambda x: _fold(x["term"]))
    unused = [t["slug"] for t in out_terms if t["mentions"] == 0]
    if unused and not quiet:
        print(f"POZOR, termíny bez jediného výskytu v přepisech: {unused}")

    data = {
        "generated_at": date.today().isoformat(),
        "source": {"daily_notes": len(corpus), "range": [corpus[0][0], corpus[-1][0]]},
        "categories": [{**c, "hint": nb(c.get("hint"))} for c in categories],
        "terms": out_terms,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if not quiet:
        print(f"termínů: {len(out_terms)}")
        print(f"zapsáno: {OUT}")
        top = sorted(out_terms, key=lambda x: -x["mentions"])[:8]
        print("\nnejčastější v přepisech:")
        for t in top:
            print(f"  {t['term']:28} {t['mentions']:5}×  ve {t['days']} dnech")
    return data


if __name__ == "__main__":
    build()
