# TASK-008 — Světlé náhledové karty všech akcí

Stav: Blocked (pouze nezávislá acceptance; produkce nasazená)
Poslední checkpoint: 2026-10-12 Europe/Prague
Tracker: [TASKS.md](../../TASKS.md)

## Výsledek a acceptance

Všech devět akcí z events.json má vlastní světlý PNG náhled, serverově dostupná
OG/Twitter metadata a sdílecí adresu. Původní tři landing pages zůstávají;
šest zbývajících akcí dostane minimální sdílecí stránku s odkazem na detail
v portálu. Registrace, externí detailové odkazy a brána se nemění.

## Scope a nepovolené kroky

Schválené jsou generování karet, integrace, commit, push a produkční deploy.
Bez změn danielgamrot.cz, Google Forms, Calendar, databází a komunitních
karet z externí automatizace. Veřejná projekce používá pouze ID, název, typ,
datum a časy. Nepřenášet celé event objekty do teaserů ani logů.

## Aktuální stav

- [x] Inventura devíti akcí a dokončený impact mapper.
- [x] Opakovatelná HTML/CSS šablona, devět PNG a metadata.
- [x] Cílené testy, vizuální QA a security.
- [ ] Nezávislé ověření (agentní limit); self-review dokončen.
- [x] Cílený commit, push, deploy a produkční důkazy.

## Rozhodnutí a objevy

- Typografické karty vzniknou deterministickým renderem s existujícími fonty,
  bez nových závislostí, AI ilustrací nebo build systému.
- Hash event detailu nestačí pro serverová metadata. Sdílecí URL pro šest
  akcí bez místní landing page vede na jednoduchou veřejnou kartu; pokračování
  otevře původní hash v portálu a zachová bránu.
- Externí stránky tří webinářů nejsou v tomto releasu; jejich akce mají vlastní
  sdílecí kartu na mastertheflow.cz.
- Daily Brief lookup nepřinesl relevantní předchozí řešení.

## Checkpoint projektu

- Root: /Users/danielgamrot/Projects/master-the-flow-portal; main; baseline 6e1138a.
- Start: AGENTS.md obsahuje schválené nové pravidlo; tools/build_glossary.py
  je nesouvisející cizí změna, hash 166465a57fed8c01a232f1c0bc2a9b7f1351e90c5d4b5f5fa230f2826a5ec289.
- Data events baseline SHA-256 d22492f24daea9d767bf163e413bfb6497042b745a920af24222c35e6c727f6e.
- Release: `197e386f6906df58bdd678360db404ffc2a06fb3`, push origin/main dokončený.
- Cloudflare Production: `5d798075-dc7b-4ccf-997f-bde47d8d6e0c`, source `197e386`.
  Nasazen čistý Git export; nesouvisející slovníček zůstává pouze lokální.
- Tracker checkpoint SHA-256: fdb8c95f863652cf1698d680935b5907246d61cd1348f2748a2b0dee869b14fe.

## Ověření

- Cílené E2E 72/72; celá lokální sada 18 scénářů prošlo, 2 předchozí chyby.
- Syntaxe JS, bash -n a diff check prošly. Security regrese 14/14 prošly.
- Vizuálně prohlédnuto všech devět PNG a sdílecí stránka na desktopu i mobilu.
- Druhý render vytvořil identické hashe. Těla všech tří původních landing
  pages i celý events.json zůstaly byte-identické proti baseline.
- Rapid security: review veřejné projekce, HTML escapování, cesty, metadata
  a sdílení bez přístupových údajů. Žádný potvrzený nový bezpečnostní nález.
- Spawn fresh verifiera i follow-up existujícímu agentovi odmítl limit vláken.
  Oddělený self-review bez nálezu, ale celkový verdikt PARTIALLY VERIFIED.
  Samostatné nezávislé review zůstává neprovedené, nejde o jeho úspěch.
- Dvě chyby plné sady (slovníček, starší attendees fixture) jsou doložené
  před tímto taskem. Nerozšiřovat scope opravami těchto částí.
- Produkce mastertheflow.cz: e2e-event-cards.js 72/72 a
  e2e-vibe-coding-live.js 36/36 — prošlo po deployi. PNG všech devíti akcí
  jsou byte-identické s lokálním releasem a veřejně dostupné.
- GitHub CI Sraz E2E run 38252081793 pro commit 197e386 — success.
- Před release commitem checker vrátil 2 kvůli devíti nepodporovaným PNG.
  Dodatečný scan textových additions stejnými pravidly: 19 souborů, nula
  nálezů. PNG zvlášť ověřené: staged obsah shodný s vizuálně prohlédnutým,
  pouze obrazové chunky, bez EXIF/textových metadat a trailing payloadu.

## Blockery a recovery

Nezávislou acceptance blokuje limit agentních vláken. Funkční implementace
má lokální i produkční důkazy; výslovně schválený release byl dokončen.
Zbývá pouze fresh nezávislé review po uvolnění agentní kapacity.
Rollback je deploy exportu předchozího commitu 6e1138a;
nesouvisející pracovní soubory nestashovat, nemazat ani nenasazovat.

## Výsledek a retrospektiva

Všech devět karet, metadata a sdílení jsou v produkci. Celkový verdikt zůstává
PARTIALLY VERIFIED pouze kvůli chybějícímu nezávislému reviewerovi.
Dokumentační checkpoint po releasu nemění běžící implementaci a nevyžaduje
nový produkční deploy. Znovupoužitelný generátor chrání jednotný vizuál i
oddělení veřejných údajů od neveřejných eventových polí.
