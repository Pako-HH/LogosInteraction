# 18 — Phase 3C: Verifikations-Spike für den lokalen WEB-Testkorpus

**Status: Kleiner, isolierter Verifikations-Spike. Kein vollständiger Korpus, kein `LocalBibleProvider`, keine Umstellung bestehender Tool-Logik, keine Änderung an der öffentlichen API. Keine Codeänderung an `src/` oder `index.ts`. Kein Commit, kein Tag, kein Push.**

Grundlage: [[15_Biblia_Restabhaengigkeit_Analyse]], [[16_MCP2_Zielarchitektur]], [[17_Phase3B_Korpus_Produktentscheidungen]], `logos-mcp-server/src/data/versification.ts`, `logos-mcp-server/src/services/reference-parser.ts`, `logos-mcp-server/src/services/reference-compare.ts`, `logos-mcp-server/src/services/providers/` (Stand nach Phase 3A), `logos-mcp-server/tests/`.

## Ausgangslage

[[17_Phase3B_Korpus_Produktentscheidungen]] Abschnitt 8 empfiehlt als ersten Teilschritt von Phase C einen „reinen Verifikations-Spike (Stichprobenverse + Psalmenüberschriften-Check am tatsächlichen Rohtext ... vor dem eigentlichen Build-Skript)". Dieser Bericht ist genau dieser Spike — begrenzt auf `WEB`, 9 vorgegebene Referenzstellen, ein isoliertes SQLite+FTS5-Prototyp-Schema außerhalb von `src/`, keine Produktionscodeänderung.

---

## 1. Quelle, Lizenzstatus und Textformat des WEB-Testtextes

| Punkt | Befund |
|---|---|
| **Quelle** | `https://ebible.org/eng-web/<BOOKCODE><KAPITEL>.htm` (z. B. `GEN01.htm`, `PSA023.htm`, `JHN03.htm`) — dieselbe Primärquelle, die bereits in [[17_Phase3B_Korpus_Produktentscheidungen]] Abschnitt 5 empfohlen und deren Lizenzseite dort verifiziert wurde. |
| **Lizenzstatus** | Auf **jeder** abgerufenen Seite wörtlich bestätigt: „The World English Bible is in the Public Domain. You may copy and share it freely." Deckt sich mit der in [[17_Phase3B_Korpus_Produktentscheidungen]] zitierten Copyright-Seite — keine neue Erkenntnis, aber jetzt zusätzlich auf Kapitel-Ebene (nicht nur der zentralen Copyright-Seite) bestätigt. |
| **Verwendetes Textformat** | HTML-Leseseiten (`.htm`), **nicht** das für die Produktionspipeline in [[17_Phase3B_Korpus_Produktentscheidungen]] Abschnitt 6 vorgesehene maschinenlesbare Rohformat (USFM/Bulk-Text-Download). Für diesen kleinen Spike ausreichend, für Phase C jedoch **nicht** die empfohlene Bezugsmethode — siehe Risiko 1 unten. |
| **Abrufdatum** | 2026-07-19 |
| **Extraktionsmethode** | Über ein KI-vermitteltes Web-Fetch-Werkzeug (mit der expliziten Anweisung, wörtlichen Text ohne Zusammenfassung zu liefern), **nicht** über einen deterministischen HTML-/USFM-Parser. Anführungszeichen wurden beim Ablegen in der Fixture-Datei auf ASCII `'`/`"` normalisiert. Diese Methode ist für einen 9-Stellen-Spike vertretbar, aber **explizit nicht** als Bezugsmethode für den Produktionskorpus geeignet — siehe Risiko 1. |

---

## 2. Testdatensatz

Alle 9 vorgegebenen Stellen wurden abgerufen und in `logos-mcp-server/spike/fixtures/web-sample-verses.ts` abgelegt (44 Verse gesamt):

| Referenz | Verse im Datensatz | Kapitellänge lt. `versification.ts` | Vollständiges Kapitel? | Superscription vorhanden? |
|---|---|---|---|---|
| Genesis 1,1–5 | 5 | 31 | Nein (Ausschnitt) | — |
| Psalm 1 (vollständig) | 6 | 6 | **Ja** | Nein |
| Psalm 23 (vollständig) | 6 | 6 | **Ja** | Ja („A Psalm by David") |
| Psalm 51,1–5 | 5 | 19 | Nein (Ausschnitt) | Ja (lange Überschrift, Nathan/Bathseba) |
| Johannes 1,1–5 | 5 | 51 | Nein (Ausschnitt) | — |
| Johannes 3,16–18 | 3 | 36 | Nein (Ausschnitt) | — |
| Römer 8,28–30 | 3 | 39 | Nein (Ausschnitt) | — |
| 1. Korinther 13,1–7 | 7 | 13 | Nein (Ausschnitt — **nicht** das vollständige Kapitel, siehe Korrektur unten) | — |
| Offenbarung 22,18–21 | 4 | 21 | Nein (Ausschnitt, letzte 4 von 21 Versen) | — |

*Korrektur während der Umsetzung:* Der Datensatz und ein erster Testentwurf hatten 1. Korinther 13,1–7 fälschlich als „vollständiges Kapitel" behandelt. `versification.ts` weist für 1. Korinther 13 jedoch 13 Verse aus — der reale Bereich 1–7 ist nur ein Ausschnitt. Der Fehler wurde durch den zugehörigen Spike-Test selbst aufgedeckt (`expected false to be true`) und vor Abschluss korrigiert — siehe Abschnitt 6, Randbefund.

---

## 3. Ergebnis des Vergleichs mit der bestehenden Versification-Tabelle

**Ergebnis: Keine Abweichung gefunden — vollständige Übereinstimmung bei allen 9 Stellen.**

- **Vollständige Kapitel** (Psalm 1, Psalm 23): Anzahl der abgelegten Verse stimmt exakt mit `versesInChapter("Psalms", 1)` = 6 und `versesInChapter("Psalms", 23)` = 6 überein. Keine Lücken, keine Duplikate, aufsteigende Reihenfolge — automatisiert per `checkVersification()` geprüft.
- **Ausschnitte** (die übrigen 7 Stellen): Für einen Ausschnitt ist ein exakter Vollständigkeitsabgleich nicht möglich (per Definition), aber geprüft wurde: (a) keine Lücke *innerhalb* des abgerufenen Bereichs, (b) keine Duplikate, (c) aufsteigende Reihenfolge, (d) jede abgelegte Versnummer liegt innerhalb der von `versification.ts` erwarteten Kapitellänge (z. B. Offenbarung 22 Vers 18–21 ≤ 21 erwartete Verse). Alle 7 bestanden.
- **Gesamtzahl:** 44 abgelegte Verse, 44 eindeutige `(translation, book, chapter, verse)`-Schlüssel — keine Duplikate über den gesamten Datensatz hinweg.

Damit ist die in [[17_Phase3B_Korpus_Produktentscheidungen]] Abschnitt 6 als „begründete Erwartung, aber noch nicht am realen Text verifiziert" eingestufte Annahme (WEB folgt derselben Standard-Englisch-Versifikation wie `versification.ts`) für diese 9 Stichproben **empirisch bestätigt** — nicht mehr nur erwartet.

---

## 4. Verhalten bei Psalmenüberschriften

| Psalm | Superscription im Quelltext | Als eigener Vers gezählt? |
|---|---|---|
| Psalm 1 | Keine | — |
| Psalm 23 | „A Psalm by David" | **Nein** — separat, unnummeriert, vor Vers 1 dargestellt |
| Psalm 51 | „For the Chief Musician. A Psalm by David, when Nathan the prophet came to him, after he had gone in to Bathsheba" | **Nein** — separat, unnummeriert, vor Vers 1 dargestellt |

Beide Fälle mit Überschrift folgen der englischen Tradition (Überschrift nicht mitgezählt), **nicht** der masoretischen Zählung (Überschrift = Vers 1) — exakt die Annahme, die `versification.ts` bereits in seinem Kommentar voraussetzt. Verifiziert per Spike-Test: `Psalms 23:1` und `Psalms 51:1` liefern den inhaltlichen Vers, nicht die Überschrift (geprüft durch Ausschluss der bekannten Überschriftswörter „David", „Nathan", „Bathsheba" aus dem gespeicherten Vers-1-Text).

---

## 5. Buchnamen-Normalisierung, Bereichsauflösung, deutsche/englische Referenzen

- **Englische Referenzen** (z. B. `Romans 8:28`, `John 3:16`): lösen korrekt über die bestehende `parseReference()`-Pipeline auf — keine Auffälligkeit.
- **Bereichsauflösung** (z. B. `Romans 8:28-30`): liefert die richtigen 3 Verse in aufsteigender Reihenfolge — keine Auffälligkeit.
- **Deutsche Referenz, ASCII-Buchname + Doppelpunkt** (`Johannes 3:16`): löst korrekt auf `John` 3:16 auf, über die bereits vorhandene `GERMAN_ALIAS_TO_BOOK`-Tabelle in `reference-parser.ts`.
- **Zwei neue, echte Befunde (vorbestehende Einschränkungen, nicht durch diesen Spike verursacht):**
  1. **Deutsche Buchnamen mit Umlaut werden nicht erkannt.** `parseReference("Römer 8:28")` wirft einen Fehler. Ursache: Der Buchname-Regex in `reference-parser.ts:289` verwendet die Zeichenklasse `[A-Za-z\s]`, die keine Nicht-ASCII-Buchstaben (`ö`, `ä`, `ü`) enthält — obwohl `"Römer": "Romans"` bereits in `GERMAN_ALIAS_TO_BOOK` vorhanden ist, kann der Name wegen des `ö` nie bis zu diesem Nachschlagewerk vordringen. Betrifft mindestens `Römer`, `1/2 Könige`, `Sprüche`, `Sprichwörter`, `Matthäus`, `Hebräer` aus derselben Tabelle.
  2. **Deutsches Komma als Kapitel/Vers-Trenner wird nicht unterstützt.** `parseReference("Romans 8,28")` (selbst mit ASCII-Buchname) schlägt fehl, da der Regex nur `:` als Trenner akzeptiert (`reference-parser.ts:289`, Gruppe `(?::(\d+))?`). Die im Auftrag dieser Phase selbst verwendete deutsche Schreibweise („Römer 8,28–30") würde also **beide** Probleme gleichzeitig auslösen.
- Beide Befunde sind **nicht behoben** — bewusst, da Codeänderungen in dieser Phase ausgeschlossen sind. Sie sind für Phase D/E dokumentiert, da ein künftiger `LocalBibleTextProvider` laut [[17_Phase3B_Korpus_Produktentscheidungen]] Mindestanforderung „Referenznormalisierung" dieselbe `parseReference()`-Pipeline wiederverwenden soll — er würde also identisch an denselben zwei Fällen scheitern wie heute bereits jedes andere referenzbasierte Tool.

---

## 6. SQLite + FTS5 Prototyp

Isoliertes Schema (`logos-mcp-server/spike/corpus-prototype.ts`, ausschließlich `:memory:`-Datenbanken, nie auf Disk persistiert):

```sql
CREATE TABLE verses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  translation TEXT NOT NULL,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  text TEXT NOT NULL,
  UNIQUE (translation, book, chapter, verse)
);

CREATE VIRTUAL TABLE verses_fts USING fts5(
  text, content='verses', content_rowid='id', tokenize='unicode61'
);
```

**Ergebnis der FTS5-Suche:**

| Test | Ergebnis |
|---|---|
| `better-sqlite3` unterstützt FTS5 ohne Zusatzkonfiguration | **Bestätigt** — löst eine bislang unverifizierte technische Annahme aus [[17_Phase3B_Korpus_Produktentscheidungen]] Abschnitt 4 auf |
| Wortsuche (`love`) | Findet u. a. 1. Korinther 13,1 korrekt |
| Wortgruppensuche (`"in the beginning"`) | Findet **genau** die 3 Verse, die die Phrase tatsächlich enthalten (Genesis 1:1, Johannes 1:1, Johannes 1:2 — Letzteres ein Korrekturfund während der Testerstellung, siehe unten), keine Falschtreffer über Wortgrenzen hinweg |
| Keine Treffer (`xenophobia`) | Leeres Array, kein Fehler |
| Einzelvers-Lookup (`John 3:16`) | Korrekter Text |
| Bereichs-Lookup (`Romans 8:28-30`) | 3 Verse, aufsteigend, vollständig |
| Ungültige Referenz (`Foobar 1:1`) | Wirft sauber über die bestehende `parseReference()`-Fehlermeldung („Unknown book") |
| Gültige Referenz außerhalb der Stichprobe (`John 1:10`) | Liefert `undefined`, **keinen** Fehler — bestätigt die in [[16_MCP2_Zielarchitektur]] §11 vorgesehene Unterscheidung „lokal nicht abgedeckt" (kein Fehler) vs. „ungültige Referenz" (Fehler) |

**Randbefund während der Testerstellung (methodisch bemerkenswert):** Ein erster Testentwurf ging fälschlich davon aus, dass die Wortgruppensuche „in the beginning" **nur** Genesis 1:1 und Johannes 1:1 treffen dürfe, nicht Johannes 1:2. Der Testlauf zeigte, dass Johannes 1:2 („The same was in the beginning with God.") die Phrase tatsächlich ebenfalls enthält — der Test hatte eine falsche Erwartung, nicht die FTS5-Suche einen Fehler. Korrigiert; zusammen mit dem 1.-Korinther-13-Korrekturfund (Abschnitt 2) ein konkretes Beispiel dafür, dass der Spike wie beabsichtigt Annahmen widerlegt hat, statt sie nur zu bestätigen.

---

## 7. Testergebnis

```
npm run build   → keine Fehler
npm test        → 12 Testdateien, 158/158 Tests grün (135 bestehend + 23 neue Spike-Tests)
```

Neue Testdatei: `tests/spike/corpus-prototype.spike.test.ts` (23 Tests, deckt exakt die 9 in Auftrag Punkt 6 geforderten Fälle ab: Einzelvers-Lookup, Bereichs-Lookup, Wortsuche, Wortgruppensuche, keine Treffer, ungültige Referenz, Psalmenüberschrift (2 Fälle), deutsche Referenz (gültig + 2 dokumentierte Fehlfälle), englische Referenz — plus 8 zusätzliche Versifikationsvergleichstests).

---

## 8. Offene Risiken

1. **KI-vermittelte Textextraktion statt deterministischem Parser.** Der Testtext wurde über ein Web-Fetch-Werkzeug mit einem zwischengeschalteten Sprachmodell bezogen, nicht über einen rohen HTML-/USFM-Parser. Für einen 44-Vers-Spike vertretbar, aber **nicht** die für Phase C vorgesehene Bezugsmethode — dort muss eine deterministische, nicht-KI-vermittelte Beschaffung (z. B. direkter USFM-/Text-Bulk-Download) verwendet werden, um jedes Transkriptionsrisiko durch das Zwischenmodell auszuschließen.
2. **Sehr kleine Stichprobe.** 44 von ca. 31.100 Versen (~0,14 %) — dieser Spike ist ein Plausibilitätsnachweis für Schema, Referenzlogik und FTS5-Technologie, **keine** statistische Aussage über die Textqualität des vollständigen WEB-Korpus.
3. **Zwei echte, vorbestehende `parseReference()`-Einschränkungen entdeckt** (Umlaute in deutschen Buchnamen, deutsche Komma-Notation) — siehe Abschnitt 5. Nicht behoben (außerhalb des Scopes), aber jetzt für Phase D/E dokumentiert, da sie den künftigen `LocalBibleTextProvider` identisch beträfen.
4. **Nur WEB getestet**, nicht KJV/ASV (die beiden anderen für Version 1 vorgesehenen Übersetzungen laut [[17_Phase3B_Korpus_Produktentscheidungen]] Abschnitt 2) — ein analoger Mini-Spike für KJV/ASV steht noch aus, bevor Phase C in vollem Umfang beginnt.
5. **Kein Cross-Check gegen eine zweite unabhängige Quelle.** [[17_Phase3B_Korpus_Produktentscheidungen]] Abschnitt 5/6 fordert für die Produktionsbeschaffung einen Abgleich gegen mindestens 2 unabhängige Quellen — dieser Spike nutzte ausschließlich ebible.org.
6. **FTS5-Tokenizer nur mit Standardeinstellungen (`unicode61`) getestet** — keine Bewertung von Stemming/Porter-Erweiterungen oder Rankingqualität bei größerer Wortmenge; bei 44 Versen nicht aussagekräftig zu beurteilen.

---

## Nicht Teil dieser Phase

- Kein vollständiger Korpus, kein Build-Skript für die Produktionsbeschaffung.
- Kein `LocalBibleProvider`, keine Provider-Interface-Implementierung, keine Änderung an `src/services/providers/`.
- Keine Umstellung von `index.ts` oder eines bestehenden Tools — `git status` bestätigt: ausschließlich neue, ungetrackte Dateien unter `spike/` und `tests/spike/`, keine einzige bestehende Datei verändert.
- Keine Behebung der in Abschnitt 5 gefundenen `parseReference()`-Einschränkungen.
- Keine Entscheidung über KJV/ASV-Verifikation — als offener Punkt vermerkt (Risiko 4).
