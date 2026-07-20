# 21 — Phase 3D-4: Erster produktionsreifer LocalBibleTextProvider

**Status: Kleine, klar abgegrenzte Änderung. Nur der `LocalBibleTextProvider` — kein Resolver, keine Änderung an `index.ts`, an anderen Providern oder am `BibliaBibleTextProvider`, keine Umschaltung von `get_bible_text()`, keine Änderung an öffentlicher API oder Tool-Namen. Kein Commit, kein Tag, kein Push.**

Grundlage: [[16_MCP2_Zielarchitektur]] §5/§15 (`BibleTextProvider`-Interface, Resolver-Vertrag), Phase 3A (`bible-text-provider.ts`, `biblia-bible-text-provider.ts` als Referenzimplementierung), [[19_Phase3D2_WEB_Korpus_Build]]/[[20_Phase3D3_KJV_ASV_Korpus]] (Korpusschema und -inhalt).

---

## 1. Geänderte Dateien

**Neu:**

| Datei | Zweck |
|---|---|
| `logos-mcp-server/src/services/providers/local-bible-text-provider.ts` | Der `LocalBibleTextProvider` selbst |
| `logos-mcp-server/tests/providers/local-bible-text-provider.test.ts` | 14 Unit-Tests |

**Geändert:**

| Datei | Änderung |
|---|---|
| `logos-mcp-server/src/config.ts` | +`LOCAL_BIBLE_CORPUS_PATH`-Konstante (11 Zeilen) — notwendige Grundlage, damit der Provider weiß, wo die Korpusdatei liegt; Wert per `LOCAL_BIBLE_CORPUS_PATH`-Umgebungsvariable überschreibbar, sonst Default relativ zum eigenen Dateipfad berechnet (identisches Muster wie in `scripts/build-bible-corpus.ts`) |

**Bestätigt unverändert** (per `git diff --stat`, leere Ausgabe): `src/index.ts`, `src/services/providers/biblia-bible-text-provider.ts`, `biblia-search-provider.ts`, `heuristic-cross-reference-provider.ts`, `local-translation-provider.ts`. Kein `BibleTextResolver` erstellt.

---

## 2. Implementierungsbeschreibung

### Interface-Konformität
`LocalBibleTextProvider implements BibleTextProvider` (aus Phase 3A, `bible-text-provider.ts`) — beide Methoden vollständig implementiert:
- `supports(translation: string): boolean` — prüft (case-insensitiv) gegen die beim Öffnen einmalig ermittelte Menge tatsächlich im Korpus vorhandener Übersetzungen (`SELECT DISTINCT translation FROM verses`), nicht gegen eine hartkodierte Liste.
- `resolveText(passage: string, translation: string): Promise<BibleTextResult>` — liefert exakt dieselbe Objektform wie `BibliaBibleTextProvider`: `{ passage, text, bible }`, wobei `passage`/`bible` unverändert die übergebenen Argumente widerspiegeln (kein Reformatieren) — identisches Verhalten zu `biblia-api.ts`s `getBibleText()`.

### SQLite-Zugriff
Eine einzige, langlebige Read-Only-Verbindung pro Provider-Instanz (konstruktoreröffnet), passend zu [[16_MCP2_Zielarchitektur]] §10 („der Korpus ist statisch, eine dauerhafte Verbindung ist unkritisch"). Pfad per Konstruktorparameter überschreibbar (Default: `LOCAL_BIBLE_CORPUS_PATH`) — macht die Klasse ohne Umgebungsvariablen-Hacks testbar.

### Referenzauflösung — vier Fälle, eine Abfrage
Nutzt `parseReference()` aus `reference-parser.ts` unverändert (keine eigene Parser-Logik). Eine private Hilfsfunktion `resolveVerseRange()` bildet jede von `parseReference()` erzeugte Form auf einen inklusiven `(startChapter, startVerse) … (endChapter, endVerse)`-Bereich ab:
- Einzelvers (`"John 3:16"`)
- Versbereich innerhalb eines Kapitels (`"Romans 8:28-30"`)
- Ganzes Kapitel (`"Psalms 117"`, kein Vers angegeben → `versesInChapter()` aus `versification.ts` liefert die Kapitelendgrenze, gleiches Prinzip wie in `reference-compare.ts`s privater `lastVerseOf()`-Hilfsfunktion, hier bewusst lokal dupliziert statt dort exportiert, um den Änderungsumfang dieser Phase auf eine neue Datei plus eine Konfigurationskonstante zu begrenzen)
- Kapitelübergreifender Bereich (`"Genesis 1:2-2:1"`)

Eine einzige SQL-Abfrage liest den passenden Versebereich:
```sql
SELECT book, chapter, verse, text FROM verses
WHERE translation = ? AND book = ?
  AND (chapter > ? OR (chapter = ? AND verse >= ?))
  AND (chapter < ? OR (chapter = ? AND verse <= ?))
ORDER BY chapter ASC, verse ASC
```
**Gefundener und behobener Bug während der Testerstellung:** Eine erste, naivere Formulierung als Drei-Wege-`OR` (Startkapitel / mittlere Kapitel / Endkapitel) sah plausibel aus, war aber bei einem Bereich *innerhalb desselben Kapitels* mit `startVerse > 1` (z. B. „Genesis 1:99") **zu locker** — die „Endkapitel"-Klausel allein hätte auch Verse *vor* `startVerse` im selben Kapitel mit ausgewählt. Der eigene Test (`"rejects a well-formed reference for which no rows exist at all"`) deckte das auf, bevor der Code committet wurde. Die jetzige Zwei-Gruppen-`AND`-Form (siehe Kommentar im Code) ist für alle vier Fallformen korrekt.

### Mehrere Verse zusammensetzen
`rows.map(r => r.text).join(" ")` — Verse werden durch ein einzelnes Leerzeichen getrennt zu fortlaufendem Text zusammengefügt, passend zum bereits im Korpus angewandten `trimEnd()`-Muster aus dem Build-Skript.

### Fehlerbehandlung
| Fall | Verhalten |
|---|---|
| Korpusdatei fehlt | Klarer Fehler, verweist auf `npm run build:corpus` (kein Pfad-Leak, analog `catalog-reader.ts`) |
| Datei ist keine gültige SQLite-Datenbank | Eigener Fehlerpfad, unterschieden per `better-sqlite3`-Fehlercode (`SQLITE_NOTADB`/`SQLITE_CORRUPT`) — **identisches Muster wie `catalog-reader.ts`**, inklusive des dort dokumentierten Verhaltens, dass `better-sqlite3` das Dateiformat erst bei der ersten Abfrage validiert, nicht beim Öffnen |
| Datei ist gültiges SQLite, aber falsches Schema | Eigener, unterscheidbarer Fehlertext („unexpected structure") |
| Referenz syntaktisch ungültig | `parseReference()`s eigener Fehler propagiert unverändert („Cannot parse reference") |
| Unbekanntes Buch | `parseReference()`s eigener Fehler propagiert unverändert („Unknown book") |
| Übersetzung nicht im Korpus | Eigener, klarer Fehler mit Liste der tatsächlich verfügbaren Übersetzungen |
| Wohlgeformte Referenz, aber keine Zeile gefunden | Eigener Fehler („No verses found …") — **bewusst unterschieden** von einem Vers, der real existiert, aber leeren Text hat (siehe nächster Punkt) |
| Wohlgeformte Referenz zu einem real leeren Vers (z. B. Römer 16,25 in WEB, siehe [[19_Phase3D2_WEB_Korpus_Build]]) | **Kein Fehler** — liefert `{ passage, text: "", bible }`, da genau eine Zeile mit leerem Text existiert |

---

## 3. Testergebnis

```
npm run build   → keine Fehler
npm test        → 14 Testdateien, 195/195 Tests grün (181 bestehend + 14 neu)
```

Die 14 neuen Tests (`tests/providers/local-bible-text-provider.test.ts`) decken exakt die sechs geforderten Kategorien ab, jeweils gegen eine per Fixture (mit den echten `createCorpusDb`/`insertCorpusVerses`-Funktionen aus `scripts/build-bible-corpus.ts` gebaute, schema-identische) Test-Datenbank:

| Kategorie | Test |
|---|---|
| Einzelvers | Johannes 3:16 (WEB), zusätzlich Übersetzungsvergleich WEB vs. KJV |
| Versbereich | Römer 8:28-30 (Zusammensetzung dreier Verse), zusätzlich kapitelübergreifend Genesis 1:2-2:1 |
| Ganzes Kapitel | Psalm 117 (kürzestes Kapitel der Bibel, 2 Verse, vollständig) |
| Ungültige Referenz | `"this is not a reference"` |
| Unbekanntes Buch | `"Foobar 1:1"` |
| Leeres Ergebnis | Römer 16,25 (WEB) — real leerer, aber existierender Vers |

Zusätzlich 3 Tests zur Dateifehlerbehandlung (fehlend / korrupt / falsches Schema) und 2 weitere Robustheitstests (nicht unterstützte Übersetzung; wohlgeformte Referenz ohne jede Zeile).

### Manuelle Verifikation gegen den echten Produktionskorpus
Zusätzlich gegen den realen, in Phase 3D-2/3D-3 gebauten Korpus (93.307 Verse, WEB+KJV+ASV) verifiziert — alle sechs Kategorien liefern korrekte, plausible Ergebnisse (u. a. Römer 8:28-30 in KJV korrekt mit Kommentarzeichen „¶"-freiem, aber eckigen-Klammern-erhaltendem Text, Psalm 117 in ASV korrekt beide Verse).

---

## 4. Bekannte Einschränkungen

1. **Kein Resolver, kein Fallback — wie gefordert.** `LocalBibleTextProvider` weiß nichts von `BibliaBibleTextProvider` und umgekehrt; eine Anfrage nach einer lokal nicht vorhandenen Übersetzung (z. B. „LEB") schlägt hart fehl, statt an Biblia weiterzureichen. Das ist in dieser Phase explizit gewollt (Phase 3D-5 ist für die Resolver-Logik vorgesehen).
2. **`translation`-Groß-/Kleinschreibung wird beim Vergleich normalisiert (`toUpperCase()`), aber beim Speichern nicht erzwungen.** Der Provider funktioniert korrekt, *weil* der Build-Prozess bislang konsequent Großschreibung verwendet hat (`WEB`, `KJV`, `ASV`). Ein künftiger Build-Lauf mit kleingeschriebenem Code würde vom Provider trotzdem korrekt gefunden (Normalisierung greift bei der Abfrage), aber uneinheitlich in der DB abgelegt — keine Änderung in dieser Phase, nur dokumentiert.
3. **`resolveVerseRange()` dupliziert eine kleine Menge Logik**, die strukturell `reference-compare.ts`s privater `lastVerseOf()`-Funktion ähnelt. Bewusste Entscheidung, um `reference-compare.ts` in dieser Phase nicht anzufassen (Änderungsumfang minimal halten) — bei einer künftigen Resolver-Einführung wäre eine gemeinsame, exportierte Hilfsfunktion eine sinnvolle Aufräumarbeit.
4. **Keine Kapazitäts-/Performance-Messung durchgeführt.** Einzelne Testabfragen liefern subjektiv sofort Ergebnisse gegen den 93.307-Vers-Korpus, aber keine systematische Latenzmessung — konsistent mit der in [[16_MCP2_Zielarchitektur]] §12 geäußerten Erwartung (Sub-Millisekunden-Bereich), aber nicht dieser Phase empirisch nachgewiesen.
5. **Noch keine Integration.** Der Provider ist vollständig funktionsfähig, aber von keinem Tool erreichbar — `get_bible_text()` ruft weiterhin ausschließlich `BibliaBibleTextProvider` auf. Erst Phase 3D-5 (Resolver) bzw. eine spätere Phase verbindet beide.

---

## 5. Vorgeschlagene Commit-Nachricht

```
feat: implement production LocalBibleTextProvider reading the local corpus (Phase 3D-4)
```

---

**Kein Commit, kein Tag, kein Push.** Warte auf Freigabe.
