# 24 — Phase 3 Abschlussbericht: Lokaler Bibeltext-Korpus & Provider-Architektur

**Status: Abschlussbericht für die gesamte Phase 3 (3A–3D-6 plus finaler Konsolidierung). Kein Commit, kein Tag, kein Push — Vorschlag zur Aufteilung in Abschnitt 9, Ausführung erst nach Freigabe.**

Phase 3 setzte die in [[16_MCP2_Zielarchitektur]] skizzierte Provider-Architektur vollständig um: von der reinen Abstraktionsschicht (Phase A) über die Produktentscheidungen (Phase B), den verifizierten und produktiv gebauten lokalen Korpus (Phase C), die produktionsreifen lokalen Provider (Phase D) bis zur lokal-first/Biblia-Fallback-Verdrahtung (Phase E) und einer abschließenden Konsolidierung, die eine während der Umsetzung entdeckte Lücke schloss und die Projektdokumentation auf den aktuellen Stand brachte (Phase F).

---

## 1. Übersicht aller erledigten Teilphasen

| Teilphase | Tag | Kerninhalt |
|---|---|---|
| **3A** — Provider-Abstraktion | `logos-mcp-v1.8-phase3a` | 4 Interfaces (`BibleTextProvider`, `SearchProvider`, `CrossReferenceProvider`, `TranslationProvider`), Biblia-Wrapper, `HeuristicCrossReferenceProvider` aus `index.ts` extrahiert, toter Code in `biblia-api.ts` entfernt — reines Refactoring, kein Verhaltenswechsel |
| **3B** — Korpus-Produktentscheidungen | `logos-mcp-v1.9-phase3b` | Default-Übersetzung zweistufig entschieden (öffentliche API bleibt `LEB`, `LocalBibleProvider` intern `WEB`), Übersetzungsumfang V1 = WEB+KJV+ASV, Format SQLite+FTS5, Auslieferung als GitHub Release Asset (nicht im Repo) |
| **3C** — Verifikations-Spike | `logos-mcp-v2.0-phase3c` | 9 Referenzstellen (WEB) real von eBible.org bezogen, Format/Lizenz/Versifikation/Psalmenüberschriften verifiziert, isolierter SQLite+FTS5-Prototyp, 23 Spike-Tests |
| **3D-1** — WEB-Rohdaten-Analyse | *(kein Tag, Chat-Bericht)* | Bulk-Download-Machbarkeit bestätigt (direkter `curl`-Zugriff, PGP/SHA-256-verifiziert), VPL-Format vollständig analysiert, Römer-14/16-Doxologie-Abweichung gefunden und erklärt |
| **3D-2** — WEB-Korpus-Build | `logos-mcp-v2.1-phase3d2` | Produktions-Build-Pipeline (`scripts/build-bible-corpus.ts`), 31.103 WEB-Verse gebaut und verifiziert |
| **3D-3** — KJV+ASV-Erweiterung | `logos-mcp-v2.2-phase3d3` | Pipeline um Mehrsprachigkeit erweitert, kombinierter Korpus (93.307 Verse, 3 Übersetzungen) |
| **3D-4** — LocalBibleTextProvider | `logos-mcp-v2.3-phase3d4` | Erster produktionsreifer lokaler `BibleTextProvider`, echter SQL-Bug durch eigene Tests gefunden und behoben |
| **3D-5** — BibleTextResolver | `logos-mcp-v2.4-phase3d5` | Lokal-first/Biblia-Fallback für `get_bible_text`/`get_passage_context`; sichere Null-Degradierung bei fehlendem Korpus |
| **3D-6** — LocalSearchProvider + SearchResolver | *(freigegeben, noch nicht committet — siehe Abschnitt 9)* | Lokal-first/Biblia-Fallback für `search_bible`; strikte FTS5-Phrasensuche als Injection-Schutz |
| **Phase-3-Abschluss** (dieser Bericht) | *(freigegeben, noch nicht committet — siehe Abschnitt 9)* | Lücke geschlossen: `get_cross_references` reicht jetzt `bible` durch (profitiert erstmals tatsächlich vom lokalen Korpus, wie in [[16_MCP2_Zielarchitektur]] §18 Phase D ursprünglich erwartet); README/[[07_Bekannte_Probleme]] aktualisiert; 2 verwaiste Biblia-Ära-Typen entfernt |

---

## 2. Sämtliche geänderten und neu erstellten Dateien

### Neue Provider-Schicht (`src/services/providers/`)
| Datei | Phase |
|---|---|
| `bible-text-provider.ts`, `search-provider.ts`, `cross-reference-provider.ts`, `translation-provider.ts` (Interfaces) | 3A (Interfaces), `cross-reference-provider.ts` in Phase-3-Abschluss um `bible`-Parameter erweitert |
| `biblia-bible-text-provider.ts`, `biblia-search-provider.ts` (Biblia-Wrapper) | 3A |
| `local-translation-provider.ts` | 3A |
| `heuristic-cross-reference-provider.ts` | 3A, in Phase-3-Abschluss um `bible`-Durchreichung erweitert |
| `local-bible-text-provider.ts` | 3D-4 |
| `bible-text-resolver.ts` | 3D-5 |
| `local-search-provider.ts` | 3D-6 |
| `search-resolver.ts` | 3D-6 |

### Neue Build-/Spike-Infrastruktur
| Datei | Phase |
|---|---|
| `spike/corpus-prototype.ts`, `spike/fixtures/web-sample-verses.ts` | 3C |
| `scripts/build-bible-corpus.ts` | 3D-2, in 3D-3 um Mehrübersetzungsfähigkeit erweitert |
| `data/bible-corpus/bible-corpus.db` | 3D-2/3D-3 gebaut — **nicht versioniert** (per `.gitignore`s `*.db`-Regel, entspricht der Phase-3B-Auslieferungsentscheidung) |

### Geänderte Kern-Dateien
| Datei | Änderung |
|---|---|
| `src/index.ts` | 3A: Provider statt Biblia direkt; 3D-5: `bibleTextProvider` → `BibleTextResolver`; 3D-6: `searchProvider` → `SearchResolver`; Phase-3-Abschluss: `get_cross_references` erhält optionalen `bible`-Parameter |
| `src/config.ts` | 3D-4: `LOCAL_BIBLE_CORPUS_PATH` ergänzt |
| `src/services/biblia-api.ts` | 3A: 4 tote Funktionen entfernt (`parsePassage`, `scanReferences`, `comparePassages`, `getAvailableBibles`) |
| `src/types.ts` | Phase-3-Abschluss: 2 verwaiste Typen entfernt (`BibliaParseResult`, `BibleInfo`) |

### Neue Tests (19 Testdateien insgesamt, 246 Tests)
`tests/providers/{biblia-bible-text-provider,biblia-search-provider,local-bible-text-provider,local-search-provider,bible-text-resolver,search-resolver,local-translation-provider,heuristic-cross-reference-provider}.test.ts`, `tests/scripts/build-bible-corpus.test.ts`, `tests/spike/corpus-prototype.spike.test.ts`, `tests/index.integration.test.ts` (3A, in 3D-5 korrigiert), `tests/index.local-bible-resolver.integration.test.ts` (3D-5), `tests/index.local-search-resolver.integration.test.ts` (3D-6, in Phase-3-Abschluss um 2 Tests erweitert).

### Dokumentation
`docs/16` (Zielarchitektur, Grundlage von Phase 3) sowie neu in Phase 3: `docs/17`–`docs/24` (8 Dokumente), `README.md` (Phase-3-Abschluss), `docs/07_Bekannte_Probleme.md` (P1-Update, Phase-3-Abschluss).

---

## 3. Architekturänderungen

### Zielbild (erreicht)
```
Tool-Aufruf (get_bible_text / get_passage_context / search_bible / get_cross_references)
        │
        ▼
BibleTextResolver / SearchResolver   ← lokal zuerst, Biblia nur Fallback
        │                    │
        ▼                    ▼
LocalBibleTextProvider   BibliaBibleTextProvider
LocalSearchProvider       BibliaSearchProvider
        │                    │
        ▼                    ▼
SQLite+FTS5-Korpus       Biblia REST API
(WEB, KJV, ASV;          (LEB + alle anderen
 93.307 Verse)            Übersetzungen)
```

- **Provider-Interfaces** entkoppeln den Tool-Layer (`index.ts`) vollständig von der konkreten Datenquelle — Handler kennen nur noch `BibleTextProvider`/`SearchProvider`/`CrossReferenceProvider`/`TranslationProvider`, nie mehr `biblia-api.ts` oder SQLite direkt.
- **Resolver-Muster** (`BibleTextResolver`, `SearchResolver`): identischer Aufbau für beide, lokal zuerst, Biblia nur bei fehlender lokaler Abdeckung. Beide Konstruktorparameter bewusst nullable (Abweichung von der literalen Signatur in [[16_MCP2_Zielarchitektur]] §15) — verhindert, dass ein fehlender Korpus beim Serverstart den **gesamten Server** zum Absturz bringt; degradiert stattdessen sauber auf „nur Biblia".
- **`HeuristicCrossReferenceProvider`** komponiert `BibleTextProvider` + `SearchProvider` und reicht seit dem Phase-3-Abschluss eine vom Aufrufer übergebene Übersetzung an **beide** internen Aufrufe durch — schließt die Lücke, in der `get_cross_references` trotz lokalem Korpus nie davon profitieren konnte.
- **Öffentliche API vollständig kompatibel:** Alle bestehenden Tool-Namen, Parameter und Rückgabeformate unverändert. Die einzige additive Änderung ist ein neuer, optionaler `bible`-Parameter bei `get_cross_references` (Phase-3-Abschluss) — Weglassen erzeugt exakt das vorherige Verhalten.
- **`DEFAULT_BIBLE` bleibt `"LEB"`** — bewusst nicht geändert (Phase-3B-Entscheidung), siehe Abschnitt 4/8.

---

## 4. Noch bestehende Biblia-Abhängigkeiten

| Fall | Abhängig von Biblia? |
|---|---|
| `get_bible_text`/`get_passage_context`/`search_bible`/`get_cross_references` mit `bible: WEB\|KJV\|ASV` | **Nein** — vollständig lokal |
| Dieselben Tools **ohne** `bible`-Parameter (Default `LEB`) | **Ja** — `LEB` ist urheberrechtlich geschützt (siehe [[15_Biblia_Restabhaengigkeit_Analyse]] Abschnitt 4) und wird nie lokal gebündelt |
| Dieselben Tools mit `bible: LEB` oder einer anderen, nicht lokal gebündelten Übersetzung (z. B. `DARBY`, `YLT`) | **Ja** |
| `scan_references`, `compare_passages`, `get_available_bibles` | **Nein** — bereits seit Phase 2 vollständig lokal, unverändert durch Phase 3 |
| Alle 13 übrigen Tools (SQLite/UI-basiert) | **Nein** — nie Biblia-abhängig gewesen |

**Zusammenfassend:** Kein Tool ist mehr *zwingend* auf Biblia angewiesen — aber jedes der vier ursprünglich betroffenen Tools bleibt beim reinen Standardaufruf (kein `bible`-Parameter) weiterhin auf Biblia angewiesen, da `DEFAULT_BIBLE` bewusst `LEB` geblieben ist (siehe Abschnitt 8, offene Entscheidung).

---

## 5. Test- und Build-Ergebnisse

```
npm run build   → keine Fehler
npm test        → 19 Testdateien, 246/246 Tests grün
```

Testzuwachs über ganz Phase 3: von 116 Tests (Stand Phase 2) auf 246 Tests (+130, davon 23 Spike-Tests, 23 Build-Pipeline-Tests, 14+15 Provider-Tests für Bibeltext/Suche, 11+10 Resolver-Tests, 14 Integrationstests über das echte MCP-Protokoll, 10 Cross-Reference-Tests inkl. der 4 neuen Bible-Pass-Through-Tests, plus Wrapper-/Fixture-Tests für Biblia-Provider). Jede Teilphase wurde einzeln mit grünem Build+Testlauf abgeschlossen (siehe jeweilige Einzelberichte docs/18–23); dieser Abschlussdurchgang bestätigt den Endzustand erneut vollständig grün.

Zusätzlich in mehreren Teilphasen **manuell gegen den echten Produktionskorpus** verifiziert (nicht nur Fixtures) — u. a. Einzelvers-/Bereichs-/Kapitel-Lookups, Wort- und Phrasensuche über alle drei Übersetzungen, und (in diesem Abschlussdurchgang) `get_cross_references` mit explizitem `bible: WEB`, das nachweislich ohne jeden Biblia-Aufruf durchläuft.

---

## 6. Bekannte Einschränkungen

1. **`get_cross_references`-Heuristik passt schlecht zur strikten lokalen Phrasensuche.** Die Auto-Extraktion liefert bis zu 5 nicht zwangsläufig benachbarte Schlüsselwörter; `LocalSearchProvider` behandelt die gesamte Anfrage als eine exakte Phrase (Designentscheidung aus 3D-6, siehe [[23_Phase3D6_LocalSearchProvider]] Abschnitt 3) — dadurch liefert die automatische Stichwortsuche oft 0 Treffer, obwohl der Mechanismus korrekt lokal routet (manuell verifiziert: mit `key_terms` als echte Phrase werden reale Treffer gefunden). Kein Bug, aber eine Qualitätslücke.
2. **Deutsche Referenzen mit Umlauten oder Komma-Notation werden von `parseReference()` nicht erkannt** (`Römer 8,28` scheitert doppelt — Umlaut *und* Komma, siehe [[18_Phase3C_Verifikations_Spike]] Abschnitt 5). Vorbestehende Einschränkung, durch Phase 3 nicht verursacht und nicht behoben.
3. **`LEB`-UK-Sonderfall** (Crown-„Letters Patent"-Beschränkung innerhalb des UK, siehe [[17_Phase3B_Korpus_Produktentscheidungen]] Abschnitt 5) betrifft nur den Biblia-Fallback-Pfad, unverändert durch Phase 3.
4. **Suchqualität strukturell einfacher als Biblia** (kein Stemming/Synonymerweiterung) — bereits in Phase 3B als akzeptiertes Risiko dokumentiert.
5. **Kein Zweitquellen-Abgleich** des gebündelten Korpustexts — nur eBible.org als Quelle verwendet, durchgängig in 3C/3D-1/3D-2/3D-3 als offener Punkt vermerkt.
6. **Übersetzungscode-Groß-/Kleinschreibung** funktioniert nur zuverlässig, weil der Korpus bislang konsequent großgeschrieben gebaut wurde (siehe [[21_Phase3D4_LocalBibleTextProvider]] Abschnitt 4).

---

## 7. Technische Schulden

1. **Korpus noch nicht als GitHub Release Asset veröffentlicht.** Die in [[17_Phase3B_Korpus_Produktentscheidungen]] getroffene Auslieferungsentscheidung ist noch nicht umgesetzt — der Korpus muss aktuell manuell nach der in README beschriebenen Anleitung gebaut werden.
2. **DARBY und YLT (Version 2) fehlen weiterhin** — bewusst zurückgestellt seit [[17_Phase3B_Korpus_Produktentscheidungen]] Abschnitt 2.
3. **Zwei unabhängige SQLite-Verbindungen** (`LocalBibleTextProvider`, `LocalSearchProvider`) auf dieselbe Korpusdatei, nicht geteilt — unkritisch, aber eine mögliche spätere Optimierung.
4. **`resolveVerseRange()`-Logik** in `local-bible-text-provider.ts` dupliziert eine kleine Menge Logik, die strukturell `reference-compare.ts`s privater `lastVerseOf()`-Funktion ähnelt (bewusste Entscheidung, um bestehende Dateien nicht anzufassen, siehe [[21_Phase3D4_LocalBibleTextProvider]] Abschnitt 4).
5. **`openCorpusDbSafely()`-Fehlerbehandlung** ist zwischen `local-bible-text-provider.ts` und `local-search-provider.ts` dupliziert statt in ein gemeinsames Modul extrahiert (gleiche bewusste Begründung).
6. **`DEFAULT_BIBLE` bleibt eine offene Entscheidung** (siehe Abschnitt 8) — [[17_Phase3B_Korpus_Produktentscheidungen]] hat sie explizit auf „später" vertagt, Phase 3 hat sie bewusst nicht getroffen.
7. **`docs/07_Bekannte_Probleme.md`s übrige Einträge (P2, P6, P7, P8, P9) sind älter als Phase 2/3** und wurden in diesem Durchgang **nicht** verifiziert/aktualisiert (nur P1, da direkt Phase-3-relevant) — mehrere davon (P2 Autodetection, P6 toter `src/tools/*`-Code) scheinen bereits durch spätere Commits behoben, ohne dass doc07 das nachträgt.
8. **Zwei weitere verwaiste Typen (`ToolDefinition`, `ToolResult` in `types.ts`)** wurden bei der Suche nach toten Biblia-Ära-Typen gefunden, aber **bewusst nicht entfernt** — sie stammen aus dem in Phase 2 bereits entfernten `src/tools/*.ts`-Muster, sind also kein Biblia-/Phase-3-Thema, sondern ein separates, unabhängiges Aufräumthema.

---

## 8. Empfehlungen für Phase 4

1. **Offene Entscheidung explizit treffen: `DEFAULT_BIBLE` bei `LEB` belassen oder auf `WEB` umstellen?** Diese Entscheidung wurde in [[17_Phase3B_Korpus_Produktentscheidungen]] bewusst vertagt und in Phase 3 absichtlich nicht getroffen (Instruktion: „keine Änderungen an der öffentlichen API, sofern nicht zwingend erforderlich"). Sie ist die letzte große offene Weiche, um alle vier Tools tatsächlich standardmäßig lokal laufen zu lassen.
2. **Korpus als GitHub Release Asset veröffentlichen**, gemäß der bereits getroffenen Entscheidung — macht den in README beschriebenen manuellen Bau-Workflow überflüssig.
3. **DARBY und YLT ergänzen** (Version 2 des Korpus), mit demselben, bereits bewährten Muster (`scripts/build-bible-corpus.ts` ist bereits mehrsprachig).
4. **`get_cross_references`-Suchqualität verbessern:** Entweder die Stichwort-Extraktion durch eine adjazenzfreundlichere Anfrage ersetzen (z. B. FTS5 `NEAR`-Operator statt strikter Phrase) oder `LocalSearchProvider` um einen zweiten, toleranteren Suchmodus erweitern.
5. **Diagnose-Tool-Integration** (bereits in [[16_MCP2_Zielarchitektur]] §13 Punkt 3 vorgesehen): das optionale `source: "local"|"biblia"`-Feld aus der Architektur-Skizze einführen, damit Nutzer sehen, welche Quelle tatsächlich geantwortet hat.
6. **Zweitquellen-Abgleich des Korpustexts** nachholen (z. B. Stichproben gegen eine zweite unabhängige WEB/KJV/ASV-Quelle).
7. **`docs/07_Bekannte_Probleme.md` vollständig neu verifizieren** (P2, P6, P7, P8, P9) — mehrere Einträge sind wahrscheinlich veraltet.
8. **Kleinere Code-Hygiene:** `ToolDefinition`/`ToolResult` in `types.ts` entfernen (unabhängig von Phase 3, siehe Abschnitt 7 Punkt 8); optional gemeinsame SQLite-Verbindung für die beiden lokalen Provider.

---

## 9. Vorschlag zur Aufteilung in Commits und Tags

Alle Teilphasen **3A bis 3D-5 sind bereits committet, getaggt und gepusht** (Tags `logos-mcp-v1.8-phase3a` bis `logos-mcp-v2.4-phase3d5`). Offen sind ausschließlich die Arbeiten aus **3D-6** (bereits freigegeben) und dem **Phase-3-Abschluss** (dieser Bericht) — beide noch uncommittet.

**Praktischer Hinweis zur Sauberkeit der Trennung:** `src/index.ts` und `tests/index.local-search-resolver.integration.test.ts` wurden in **beiden** Teilarbeiten angefasst (3D-6-Verdrahtung bzw. -Tests, dann in diesem Abschlussdurchgang um die `get_cross_references`-Erweiterung ergänzt) — eine Trennung auf Zeilenebene (`git add -p`) wäre möglich, aber unnötig fein für den Nutzen. Empfehlung: beide Dateien vollständig dem **zweiten** Commit zuordnen, da ihr finaler Stand ohnehin nur im Kontext des Abschlusses vollständig Sinn ergibt.

### Commit 1 — Phase 3D-6 (bereits freigegeben)
```
feat: add LocalSearchProvider with local-first routing and Biblia fallback for search_bible (Phase 3D-6)
```
Dateien: `src/services/providers/local-search-provider.ts`, `src/services/providers/search-resolver.ts`, `tests/providers/local-search-provider.test.ts`, `tests/providers/search-resolver.test.ts`, `docs/23_Phase3D6_LocalSearchProvider.md`

Tag: `logos-mcp-v2.5-phase3d6`

### Commit 2 — Phase-3-Abschluss
```
docs: close Phase 3 (cross-reference translation pass-through, README/known-issues update, dead-type cleanup)
```
Dateien: `src/index.ts`, `src/services/providers/cross-reference-provider.ts`, `src/services/providers/heuristic-cross-reference-provider.ts`, `src/types.ts`, `tests/providers/heuristic-cross-reference-provider.test.ts`, `tests/index.local-search-resolver.integration.test.ts`, `README.md`, `docs/07_Bekannte_Probleme.md`, `docs/24_Phase3_Abschlussbericht.md`

Tag-Vorschlag: `logos-mcp-v2.6-phase3-complete`

**Beide Commits bleiben unabhängig überprüfbar** (`npm run build && npm test` grün nach jedem einzelnen Commit, verifiziert). Kein Push, kein Commit, kein Tag wurde in dieser Phase ausgeführt — alles wartet auf Freigabe.
