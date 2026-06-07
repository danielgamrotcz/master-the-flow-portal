# Overnight session — přehled změn (v111–v170)

Záloha je dostupná na branchi `overnight-backup-2026-06-07`.
Portál byl revertován na `ba8504f` (stav 5. 6. 2026) a změny se přidávají selektivně.

Jak použít: vyber, co chceš vrátit zpět, a řekni mi číslo nebo název.

---

## Mobilní UX (základy)

- [ ] **1. Touch targets, iOS zoom, safe areas, archive layout** — úpravy pro správné dotykové plochy, oprava zoomu na iOS, safe area pro notch
- [ ] **2. Tap feedback + calendar trim** — vizuální odezva na klepnutí, kompaktnější kalendář
- [ ] **3. Overlay handle, read opacity** — úchop na spodním sheetu, průhlednost přečtených karet
- [ ] **4. Chips scroll-reset, banner konflikty** — topic chips se scrollují na začátek při změně
- [ ] **5. Keyboard-safe nav + iOS keyboard fix** — navigace se neschová za klávesnici na iOS
- [ ] **6. Topic chips pouze horizontální scroll na mobilu** — chips nejdou přes řádek na mobilu

---

## Overlay a karta

- [ ] **7. Prev/next navigace v overlay + J/K klávesy** — šipky pro listování kartami bez zavírání
- [ ] **8. Overlay title expand** (v136) — delší nadpis se rozbalí po klepnutí
- [ ] **9. Overlay read badge** (v149) — badge „přečteno" přímo v overlay
- [ ] **10. Copy akce v card sheet** (v158) — tlačítko Kopírovat v overlay sheetu
- [ ] **11. Copy btn v overlay** (v163) — zkopírovat text karty
- [ ] **12. Date link v overlay** (v165) — datum v overlay je klikatelný odkaz do archivu
- [ ] **13. Topic chips v overlay** (v114) — topicy karty klikatelné rovnou v overlay
- [ ] **14. Pinch-to-zoom overlay text** (v169) — rozbalení textu gesty

---

## Čtení a stav přečtení

- [ ] **15. Unread count v titulku stránky** (v112) — `(3) Master the Flow` v záložce prohlížeče
- [ ] **16. Next-unread navigace** (v111) — tlačítko „→ další nepřečtená"
- [ ] **17. Jump-to-first-unread tlačítko + G shortcut** (v124) — přejdi na první nepřečtenou
- [ ] **18. Week unread count v podtitulku** (v122) — v týdenním přehledu vidíš X/Y nepřečteno
- [ ] **19. Week day mark-as-read tlačítko** (v128) — označit celý den jako přečtený
- [ ] **20. All-caught-up banner** (v142) — banner „Vše přečteno" po dočtení všeho
- [ ] **21. All-read tab checkmark** (v150) — fajfka na záložce, když je vše přečteno
- [ ] **22. Today read progress badge** (v153) — dnešní progress „3/5" v záložce
- [ ] **23. Archive date chip read progress dots** (v152) — tečky u dat v archivu ukazují stav čtení
- [ ] **24. DOW today highlight** (v170) — zvýraznění dnešního dne v týdenním přehledu
- [ ] **25. Archive jump-to-unread** (v168) — tlačítko pro skok na první nepřečtenou v archivu
- [ ] **26. Numbered unread badge on nav** (v129) — čísla nepřečtených na navigačních ikonách
- [ ] **27. Unread counts na topic chips** (v167) — počty nepřečtených přímo na filtrech
- [ ] **28. Space=read+next shortcut** (v164) — mezerník označí přečteno a přejde na další
- [ ] **29. M shortcut — mark as unread** (v162) — M klávesa pro odznačení přečtené karty

---

## Vyhledávání

- [ ] **30. Search highlight v overlay** (v150) ✅ *přidáno zpět* — zvýraznění hledaných slov v textu karty
- [ ] **31. Search clear tlačítko** (v149) — X pro vymazání vyhledávání
- [ ] **32. Search clear animace** (v151) — plynulá animace při mazání
- [ ] **33. Search section labels** (v123) — sekce „Aktuální", „Archiv" ve výsledcích
- [ ] **34. Recently viewed v search** (v123) — naposledy zobrazené karty ve vyhledávání
- [ ] **35. Search empty state s topic suggestions** (v131) — při nulových výsledcích navrhni témata
- [ ] **36. Search type filter chips** (v146) — filtruj výsledky podle typu karty (INSIGHT, PŘÍBĚH…)
- [ ] **37. Search topic chips** (v166) — filtruj výsledky podle tématu

---

## Archiv

- [ ] **38. Archive prev/next day navigace** (v118) — šipky doleva/doprava pro listování dny
- [ ] **39. Archive date quick-pick** (v147) — rychlý výběr data
- [ ] **40. Archive date dividers** (v148) — oddělovače dnů v archivním výpisu
- [ ] **41. Archive weekend dividers** (v149) — vizuální oddělení víkendů
- [ ] **42. Archive link v empty state** (v157) — prázdný stav odkazuje rovnou do archivu
- [ ] **43. Archive btn v all-read banneru** (v164) — po přečtení vše tlačítko „Jít do archivu"

---

## Statistiky a streaky

- [ ] **44. Reading heatmap** (v134) — vizuální mapa aktivity čtení po dnech
- [ ] **45. Clickable heatmap cells** (v155) — kliknutím na den se otevře archiv pro daný den
- [ ] **46. Best-streak stat** (v147) — nejdelší série čtení v řadě
- [ ] **47. Personal most-read topics** (v132) — tvoje nejčtenější témata
- [ ] **48. Personalized reading insights** (v129) — tipy na základě čtenářských vzorců
- [ ] **49. Weekly read chart v stats** (v127) — graf aktivita po týdnech
- [ ] **50. Reading time stat** (v160) — celkový čas strávený čtením
- [ ] **51. Header streak badge** (v133) — série dnů přímo v hlavičce
- [ ] **52. Personalized recommendation card** (v144) — karta „Doporučeno pro tebe" na základě zájmů
- [ ] **53. Bookmark export v stats** (v142) — export záložek ze statistik

---

## Swipe gesta

- [ ] **54. Swipe-to-bookmark + swipe-to-read v card list** (v120) — gestem doleva/doprava na kartě
- [ ] **55. Horizontal swipe pro přepínání views** (v139) — přejetí prstem přepne Dnes/7dní/Archiv
- [ ] **56. Swipe visual feedback** (v145) — ikony se zobrazí při přejíždění
- [ ] **57. Swipe ikony** (v162) — lepší vizuál pro swipe akce
- [ ] **58. Swipe haptic threshold** (v163) — haptická odezva při překročení prahu

---

## Týdenní přehled

- [ ] **59. Week view grouped by date se sticky headers** — karty seskupeny po dnech, hlavičky ulpí
- [ ] **60. Week progress bar** (v136) — progress bar přečtených v týdenním přehledu
- [ ] **61. Week jump-to-today tlačítko** (v145) — přeskoč na dnešní den
- [ ] **62. Week mark-all btn** (v162) — označit vše v týdnu jako přečtené
- [ ] **63. Collapsible week day groups** (v161) — sbalitelné skupiny dnů v týdenním přehledu

---

## Klávesové zkratky

- [ ] **64. Shortcuts panel** (v74 + v154) ✅ *přidáno zpět* — `?` zobrazí panel s nápovědou
- [ ] **65. T shortcut — scroll to top** (v148) — T scrolluje na vrchol stránky
- [ ] **66. C shortcut — kopírovat kartu** (v153) — C kopíruje text vybrané karty
- [ ] **67. Q shortcut — action sheet** (v141) — Q otevírá kontextové menu

---

## Různé UX detaily

- [ ] **68. Relative dates v card list** (v119) — „Včera", „Před 3 dny" místo data
- [ ] **69. Is-new card indicator** (v151) — nové karty mají pulzující indikátor
- [ ] **70. Long-press context action sheet** (v140) — podržení prstu otevírá menu s akcemi
- [ ] **71. Header compact on scroll** (v166) — hlavička se zkompaktní při scrollování
- [ ] **72. Card press scale** (v168) — karta se mírně zmenší při stisku
- [ ] **73. Pull-to-refresh text hints** (v146) — text „Táhni pro obnovení" při PTR
- [ ] **74. Toast dedup + ikony** (v148) — jedna toast zpráva najednou, ikonky
- [ ] **75. Gesture tutorial overlay** (v133) — první spuštění ukáže jak používat gesta

---

## Záložky

- [ ] **76. Long-press to bookmark** — podržení prstu přidá záložku
- [ ] **77. Bookmarked corner badge** (v130) — záložkovaná karta má značku v rohu
- [ ] **78. Bookmark export (E key)** (v117) — E klávesa exportuje záložky

---

> **Záloha:** `overnight-backup-2026-06-07`  
> **Stabilní stav po revertu:** `ba8504f`  
> **Aktuálně přidáno zpět:** Search highlight (#30), Shortcuts panel (#64), Desktop sidebar, Unread bar, Mark as unread
