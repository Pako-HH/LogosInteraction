# 19 — Phase 3D-2: Aufbau des vollständigen lokalen WEB-Korpus

**Status: Build-Pipeline für den lokalen Bibeltext-Korpus. Ausschließlich Korpusaufbau — kein `LocalBibleTextProvider`, kein `BibleTextResolver`, keine Änderung an `src/index.ts` oder der öffentlichen API. Kein Commit, kein Tag, kein Push.**

Grundlage: [[16_MCP2_Zielarchitektur]] §14/§18 (Phase C), [[17_Phase3B_Korpus_Produktentscheidungen]] (Format-/Auslieferungsentscheidung), [[18_Phase3C_Verifikations_Spike]] (Schema-Validierung im Kleinen), Phase-3D-1-Analyse (verifizierte WEB-VPL-Rohdaten, siehe Chat-Bericht der Vorphase).

---

## 1. Geänderte Dateien

**Neu:**

| Datei | Zweck |
|---|---|
| `logos-mcp-server/scripts/build-bible-corpus.ts` | Produktions-Build-Pipeline: VPL-Parser, SIL→kanonischer-Name-Mapping, Vollständigkeitsprüfung gegen `versification.ts`, SQLite+FTS5-Schema, CLI-Runner |
| `logos-mcp-server/tests/scripts/build-bible-corpus.test.ts` | 19 Unit-Tests für die Build-Pipeline (fixture-basiert, kein Zugriff auf echte Rohdaten nötig) |
| `logos-mcp-server/data/bible-corpus/web.db` | **Erzeugter Korpus** (8,2 MB, 31.103 Verse, Übersetzung `WEB`) — durch `.gitignore`s bestehende `*.db`-Regel automatisch ausgeschlossen, nicht committet (konsistent mit der Auslieferungsentscheidung „GitHub Release Asset, nicht im Repo" aus [[17_Phase3B_Korpus_Produktentscheidungen]]) |

**Geändert:**

| Datei | Änderung |
|---|---|
| `logos-mcp-server/package.json` | +1 Zeile: `"build:corpus": "tsx scripts/build-bible-corpus.ts"` |

**Unverändert (verifiziert per `git status`/`git diff`):** `src/index.ts`, `src/services/providers/*` (alle 8 Dateien aus Phase 3A), `src/services/reference-parser.ts`, `src/data/versification.ts`, alle bestehenden Tests.

---

## 2. Implementierungsbeschreibung

### Datenquelle
Ausschließlich die in Phase 3D-1 heruntergeladene und per SHA-256 gegen die signierte eBible.org-Prüfsumme verifizierte Datei `eng-web_vpl.txt` — **kein erneuter Download**. Die Datei liegt im Scratchpad, nicht im Repository; das Build-Skript nimmt den Pfad als Parameter (`WEB_VPL_SOURCE_PATH`-Umgebungsvariable oder CLI-Argument) entgegen, statt einen festen Pfad anzunehmen — es lädt selbst nichts herunter.

### Pipeline-Schritte (`scripts/build-bible-corpus.ts`)
1. **`validateSilMapping()`** — prüft vor jedem Lauf, dass die lokale SIL/UBS-Buchcode-Tabelle (`SIL_TO_CANONICAL_BOOK`, 66 Einträge) exakt mit `reference-parser.ts`s `BOOK_ORDER` übereinstimmt (keine fehlenden/überzähligen Bücher) — wirft sonst einen Fehler, statt einen stillschweigend unvollständigen Korpus zu bauen.
2. **`parseVplText()`** — parst das Format `SILCODE KAPITEL:VERS TEXT` zeilenweise (per `parseVplLine()`), filtert die 15 Apokryphen-/Deuterokanon-Buchcodes heraus (die „eng-web"-Ausgabe enthält sie, `versification.ts` und `BOOK_ORDER` decken nur die 66 protestantischen Kanon-Bücher ab) und mappt auf die kanonischen Buchnamen aus `reference-parser.ts` — **einzige Quelle der Wahrheit für Buchnamen**, keine Zweitliste.
3. **`checkCompleteness()`** — vergleicht die geparsten Verse pro Kapitel gegen `versesInChapter()` aus `versification.ts` und meldet Abweichungen, ohne den Build abzubrechen (eine übersetzungsspezifische Versifikationsabweichung ist ein erwartetes, dokumentiertes Phänomen, kein Baufehler).
4. **`createCorpusDb()`** — legt Schema an: `verses`-Tabelle (`translation, book, chapter, verse, text`, `UNIQUE(translation, book, chapter, verse)`) + `verses_fts`-FTS5-Virtual-Table (`tokenize='unicode61'`, contentlink per Trigger) — identisches Schema zum in Phase 3C validierten Spike-Prototyp, jetzt produktionsreif mit Fehlerbehandlung, Exporten und CLI.
5. **`insertCorpusVerses()`** — Bulk-Insert in einer Transaktion.
6. CLI-Runner schreibt standardmäßig nach `logos-mcp-server/data/bible-corpus/web.db` (per `.gitignore`s `*.db`-Regel nicht versioniert) und gibt eine Build-Zusammenfassung aus.

### Tatsächlicher Build-Lauf (durchgeführt, Ergebnis siehe Abschnitt 3)
```
npx tsx scripts/build-bible-corpus.ts <verifizierte eng-web_vpl.txt aus Phase 3D-1>
```
Ergebnis: 31.103 Verse geparst, 2 erwartete Abweichungen gemeldet (Römer 14/16 — siehe Phase 3D-1), 31.103 Verse in `data/bible-corpus/web.db` geschrieben.

---

## 3. Testergebnisse

### Automatisierte Tests (fixture-basiert, Teil von `npm test`)
```
npm run build   → keine Fehler
npm test        → 13 Testdateien, 177/177 Tests grün (158 bestehend + 19 neu)
```
Die 19 neuen Tests (`tests/scripts/build-bible-corpus.test.ts`) decken ab: VPL-Zeilen-Parsing (Normalfall, mehrstellige Kapitel/Verse, leerer Verstext, Fehlerfälle), Apokryphen-Filterung, SIL→Buchname-Mapping-Vollständigkeit (bijektiv zu `BOOK_ORDER`), Vollständigkeitsprüfung (Treffer, Abweichung, komplett fehlendes Buch), Schema-Erstellung, UNIQUE-Constraint, Mehrsprachigkeit (zwei Übersetzungen koexistieren), FTS5-Suche.

### Manuelle Verifikation des echten Korpus (nicht Teil von `npm test`, siehe Risiken)
Der reale Build wurde gegen die vollständige, verifizierte WEB-Quelle ausgeführt und stichprobenartig geprüft:

| Prüfung | Ergebnis |
|---|---|
| Gesamtzahl Verse | 31.103 (66 Bücher) |
| Dateigröße | 8,2 MB |
| Einzelvers-Lookup (Johannes 3:16) | Korrekter Text |
| FTS5-Wortsuche (`love`) | Funktioniert über den **gesamten** Korpus, sinnvoll gerankt (bm25) |
| FTS5-Phrasensuche (`"in the beginning"`) | 15 echte Treffer im gesamten Bibeltext (u. a. Genesis 1:1, Johannes 1:1-2, Sprüche 8:22) — deutlich aussagekräftiger als die 3-Treffer-Stichprobe aus Phase 3C |
| Leere Verstexte | Exakt die 5 aus Phase 3D-1 bekannten (Lukas 17,36 · Apg 8,37 · Apg 15,34 · Apg 24,7 · Römer 16,25) — korrekt übernommen, nicht verloren, nicht dupliziert |
| Vollständigkeitsabgleich | Exakt 2 abweichende Kapitel (Römer 14, Römer 16), identisch zum in Phase 3D-1 identifizierten Doxologie-Fall — keine neuen/unerwarteten Abweichungen |

---

## 4. Bekannte Risiken

1. **Der echte End-to-End-Build ist nicht Teil der automatisierten Testsuite.** `npm test` prüft die Pipeline-Logik ausschließlich gegen kleine, eingebettete Fixtures — die 5,3-MB-Rohquelldatei liegt bewusst nicht im Repository (siehe Auslieferungsentscheidung) und ist daher für andere Entwickler/CI nicht automatisch verfügbar. Der reale 31.103-Vers-Build wurde für diesen Bericht manuell ausgeführt und dokumentiert, ist aber nicht reproduzierbar ohne die Datei aus Phase 3D-1 erneut lokal bereitzustellen.
2. **Nur WEB vorhanden.** KJV und ASV (laut [[17_Phase3B_Korpus_Produktentscheidungen]] Teil von Version 1) fehlen noch — vorgesehen für Phase 3D-3. Die Pipeline (`parseVplText`, Schema) ist bereits übersetzungsagnostisch gebaut (Tests bestätigen Mehrsprachigkeit funktioniert), aber nicht real gegen KJV/ASV-Rohdaten erprobt.
3. **Korpusdatei liegt nur lokal, nicht reproduzierbar aus dem Repo allein.** Wer das Projekt frisch klont, kann `data/bible-corpus/web.db` nicht ohne die (noch nicht offiziell bezogene) Rohquelle nachbauen — konsistent mit der bewussten Phase-B-Entscheidung, aber ein offener Punkt für den tatsächlichen Auslieferungsmechanismus (Release Asset), der noch nicht existiert.
4. **Römer 14/16-Sonderfall wirkt sich auf künftige Bereichsoperationen aus.** Sobald `LocalBibleTextProvider`/`get_passage_context` real auf diesen Korpus zugreifen (spätere Phase), muss ein Bereich, der die Kapitelgrenze 14/16 in Römer überschreitet, gesondert betrachtet werden — hier nur dokumentiert, nicht gelöst (außerhalb des Scopes von 3D-2).
5. **Kein Zweitquellen-Abgleich.** Wie bereits in Phase 3C und 3D-1 vermerkt, wurde ausschließlich eBible.org als Quelle verwendet — der in [[17_Phase3B_Korpus_Produktentscheidungen]] geforderte Abgleich gegen eine zweite unabhängige Quelle steht weiterhin aus.
6. **`build:corpus`-npm-Skript ungetestet im „echten" CI-Sinn.** Es wurde manuell per `tsx` mit explizitem Pfad ausgeführt; der npm-Skript-Alias selbst (`npm run build:corpus`) wurde nicht separat verifiziert — funktional identisch, aber nicht eigens getestet.

---

## 5. Vorgeschlagene Commit-Nachricht

```
feat: add production build pipeline for local WEB Bible corpus (Phase 3D-2)
```

---

**Kein Commit, kein Tag, kein Push.** Warte auf Freigabe für 3D-3.
