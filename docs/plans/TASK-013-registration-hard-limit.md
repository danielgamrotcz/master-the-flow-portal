# TASK-013 — Pevný limit registrací

Stav: In Progress
Tracker: ../../TASKS.md
Poslední checkpoint: 2026-10-12

## Výsledek a acceptance

Nejvýše98 unikátních e-mailů dostane přidělené místo a pozvánku z automatu.
Formulář se při naplnění zavře; souběžně došlé odpovědi nad limit nedostanou
Meet ani Calendar pozvánku. Duplicitní e-mail nezabere další místo. Veřejný
count ukazuje přidělená místa a při plnu LP nenabízí funkční registraci.
Nejde o kontrolu fyzického počtu připojených zařízení či přeposílání Meet odkazu.

## Scope a hranice

Uživatel žádá uzavření a nepřekročení kapacity. Implementace lokálně povolena.
Uživatel nyní konkrétně schválil aktivaci Google skriptů a formuláře včetně
zpráv, commit, push a produkční deploy. Resume 2026-10-12, fresh fetch0/0.
Neodebírat staré pozvánky, nemazat odpovědi, neotevírat formulář automaticky,
neprovádět syntetickou registraci ani hromadné rozesílání.

## Plán

- [x] Read-only mapa, fresh fetch0/0, prior-art lookup bez nálezu.
- [x] Implementace uzamčeného přidělení míst, uzavření, lokální testy.
- [x] Read-only security self-review a UI plného stavu.
- [ ] Nezávislá acceptance (spawn odmítnut limitem vláken).
- [ ] Schválená aktivace a release.

Aktivace Google dokončena. Uživatel po konkrétním popisu false positive
tests/google-vibe-coding-count.js:22 výslovně požádal dokončit vše pro aktivaci.
Tento nález přijatý; pokračovat schváleným commitem, pushem a deployem.

## Rozhodnutí

Trvalý ledger hashů normalizovaných e-mailů v soukromých Script Properties.
Nejvýše98 SHA256 hashů, celý ledger v jediné hodnotě (<9KB). Sdílený ScriptLock
chrání kontrolu, přidělení i pozvánku. Zápis místa před odesláním, chyba mailu
místo neuvolní. Ruční smazání odpovědi neruší již přidělenou pozvánku, takže
ani neuvolňuje místo. Inicializace započítá stávající odpovědi bez zpráv,
při více než98 skončí bez migrace. Odpovědi řadit dle timestampu/ID.
Při přeplnění odejde pouze stručné odmítnutí bez připojovacího odkazu.
Count sync zavírá formulář před externím HTTP, takže výpadek webu neblokuje limit.
Google Forms nelze považovat za atomickou frontu; rozhodující je ledger před
pozvánkou, nikoli počet současně uložených odpovědí. Meet admission mimo scope.

## Checkpoint

Root master-the-flow-portal, main HEAD d67a68c. Chráněný tools/build_glossary.py
SHA256166465a57fed8c01a232f1c0bc2a9b7f1351e90c5d4b5f5fa230f2826a5ec289.
Původní invitation GS a5ec107f, count GS658d0781. Mapper spawn
capacity_hard_limit_impact odmítnut limitem vláken; self-map dokončen,
celkový verdikt nejvýše PARTIALLY VERIFIED bez nezávislé acceptance.
Google dokumentace ověřuje setAcceptingResponses(false), closed message,
sdílený ScriptLock. Apps Script managed V8 nemá pinovanou SDK verzi.

## Recovery

Před aktivací ověřit aktuální počet a zachování původních triggerů. Nasazovat
helper a pozvánkový guard spolu; nikdy nepouštět původní instalátor pozvánek.
Při chybě zůstat fail-closed, neobcházet ledger ani neposílat ručně pozvánky.
Rollback legacy skriptu by odstranil hard limit, proto není bezpečný bez rozhodnutí.

Před inicializací porovnat současné odpovědi s již vydanými pozvánkami v kalendáři
(bez zveřejnění kontaktů). Pokud existují pozvaní diváci bez odpovědi, migraci
zastavit: samotné odpovědi by jejich místa nezapočítaly. Pořadatelé nejsou
divácká místa. Oprávnění k aktivaci, zprávám i commit/push/deploy nyní uděleno.

## Ověření 2026-10-12 17:48 Europe/Prague

| Tvrzení | Důkaz | Stav a omezení |
| --- | --- | --- |
| Nejvýše 98 pozvánek | google-vibe-coding-capacity.js, 100 odpovědí v opačném pořadí triggerů | Prošlo v mock runtime; skutečný souběh Google nebyl vyvolán |
| Zavření při plnu, žádný Meet pro přesah | Stejný test, včetně HTTP výpadku a opakování | Prošlo v mock runtime |
| Deduplikace a trvalost míst | Google capacity/count testy, smazání odpovědi, chyba mailu | Prošlo, chyba ani smazání místo neuvolní |
| Veřejné UI plno | e2e-vibe-capacity, screenshoty 390 a 1440 px | Prošlo; všechna CTA bez href, obnova a oba motivy |
| Bez regrese rozhovoru | e2e-vibe-coding-live | Prošlo 37/37 |
| Syntaxe a diff | node --check JS/GS, bash -n tests/run-all.sh, git diff --check | Prošlo |
| Celá sada | ./tests/run-all.sh, lokální Wrangler8788 | Selhalo exit1 na dvou dříve evidovaných nesouvisejících testech |
| Produkce | Žádná aktivace ani deploy | Nebylo spuštěno, čeká souhlas |
| Nezávislá acceptance | spawn capacity_hard_limit_acceptance | Nebylo spuštěno, limit vláken; PARTIALLY VERIFIED |

Celý test log: /private/tmp/mtf-task013-tests.log. Vizuálně zkontrolované artefakty:
/private/tmp/mtf-task013-full-mobile.png a /private/tmp/mtf-task013-full-desktop.png.
Plná sada: e2e-slovnicek (chybějící doložený výskyt), google-forms-attendees
(neexistující attendee fixture). Ostatní testovací skupiny prošly.

## Rychlá bezpečnostní kontrola

Baseline d67a68c, read-only source/diff a lokální mock/E2E testy; žádný cloudový
audit ani dynamické testy produkce. Scope: přidělení míst, výstupní e-maily,
veřejný anonymní count a CTA. Skript collect_scope.py exit0.

| Plocha | Stav | Důkaz / omezení |
| --- | --- | --- |
| Atomické přidělení | Reviewed | Sdílený ScriptLock, ledger před Calendar/Mail, nikdy neuvolňovaný automaticky |
| Soukromí | Reviewed | Hashy pouze v soukromých Properties; ven jen počet; overflow bez Meet |
| Validace adresáta | Reviewed | Odmítnutí whitespace, čárky, středníku, úhlových závorek |
| API auth/cache | Reviewed, beze změny | api-vibe-coding-registrations a security-regressions prošly |
| Živé triggery a migrace | Not tested | Před aktivací zkontrolovat staré pozvánky a zachovat čtyři triggery |

Potvrzené nové nálezy: CRITICAL0 / HIGH0 / MEDIUM0 / LOW0. Controls observed
nejsou důkaz bezpečnosti celého projektu. Zbývá migrace, živé ověření a nezávislá
acceptance. Celkový verdikt PARTIALLY VERIFIED. Přeposlaný Meet odkaz či více
zařízení jednoho člověka zůstává mimo registrační hard limit.

## Finální lokální snapshot

HEAD d67a68c, necommitnuto. Invitation GS4b267b44, count GS4c298abb,
klient13609ecd, HTMLa99fee6f, capacity test14becf48, původní uživatelský
slovníček166465a5. Po odděleném self-review stejné hashe; žádný externí zápis.

## Živá aktivace 2026-10-12 17:55–17:58 Europe/Prague

- Uživatel schválil přesný aktivační a release balíček. Fresh fetch 0/0,
  implementační hashe stejné jako testované, slovníček zachovaný.
- Před změnou porovnáno 21 aktuálních registračních adres s 21 Calendar hosty
  v paměti (bez ukládání kontaktů); žádný host chybějící ve formuláři.
- Původní živý invitation skript ověřen hashem a5ec107f, pak nahrazen přesným
  lokálním obsahem. Zpětné přečtení z editoru byte-identické s4b267b44.
- Aktivace dokončena17:55:26: capacity98, reserved21, acceptingResponses=true.
  Bez odesílání historických pozvánek či zkušebních registrací. Potvrzení
  formuláře ověřeno v Google Forms nastavení.
- Count skript byte-identický s4c298abb. Ruční count synchronizace dokončena
  17:56:45, veřejné API21/77, updatedAt15:56:45.039Z. Následný skutečný
  časový běh17:57:45 dokončen5.106s. Zachované všechny čtyři triggery.
- Jedno neúspěšné spuštění editoru17:54:44: nabídka nepřepnula funkci a
  submit handler bezpečně odmítl chybějící event před jakýmkoli side effectem.
  Poté správně vybrána a ověřena aktivační funkce. Nešlo o registraci návštěvníka.
- Screenshot důkazu: /private/tmp/mtf-capacity-activation.png.
- Mock capacity a API testy znovu exit0. Fresh verifier
  capacity_release_acceptance spawn opět odmítnut limitem vláken.
- Staged přesně11 taskových souborů, slovníček mimo index. Secret scanner
  exit1: tests/google-vibe-coding-count.js:22 [generic-credential-assignment].
  Ruční kontrola: testovací dispatcher konfigurační položky, nikoli credential;
  čeká explicitní přijetí uživatelem dle check-staged-secrets. Scanner neměněn.
- Commit, push a webový deploy zatím neprovedeny. Google hard limit už aktivní
  nezávisle na releasu frontendového CTA. Nepřepisovat ani znovu neinstalovat
  triggery při pokračování, jen dokončit Git/release po potvrzení nálezu.
