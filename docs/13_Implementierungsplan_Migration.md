# 13 — Implementierungsplan: Migration auf lokale Datenquellen

**Status: Technischer Umsetzungsplan, keine Codeänderung.** Kein Commit, kein Tag. Grundlage: [[10_Tool_Kategorisierung]], [[12_Lokale_Datenquellen_Analyse]], [[11_MCP2_Architektur_Vorschlag]].

**Geklärter Scope (siehe Rückfrage im Chat):** Der Plan behandelt `scan_references`, `compare_passages`, `get_available_bibles` — die drei laut [[12_Lokale_Datenquellen_Analyse]] §5 als lokal migrierbar bestätigten Tools — sowie zusätzlich `search_bible`. `search_bible` ist laut derselben Analyse **nicht** aus Logos' eigenen lokalen Daten migrierbar (kein lokaler Volltextindex über Verstext, Verstext selbst DRM-geschützt). Der Abschnitt zu `search_bible` beschreibt daher ehrlich, was mit reinen Logos-Daten *nicht* geht, und skizziert zusätzlich, was eine echte lokale Umsetzung *voraussetzen würde* (externe Textquelle + Suchindex) — als separat zu entscheidende, größere Erweiterung, nicht als einfache „Migration" wie bei den anderen drei.

---

## Tool 1: `get_available_bibles`

### 1. Lokale Datenquelle
`Data/lpfinojk.yny/LibraryCatalog/catalog.db`, Tabelle `Records`, gefiltert auf `Type = 'text.monograph.bible'` (bestätigt 70 Treffer lokal, siehe [[12_Lokale_Datenquellen_Analyse]] §2). Bereits über `DB_PATHS.catalog` erschlossen — **keine neue DB-Anbindung nötig**.

### 2. Zu ändernde bestehende Dateien
- `logos-mcp-server/src/services/catalog-reader.ts` — neue Exportfunktion `getInstalledBibles(query?: string): CatalogResource[]` (oder passenderer Rückgabetyp, siehe unten), analog zu `searchCatalog()`, aber mit fest verdrahtetem `Type = 'text.monograph.bible'`-Filter statt eines generischen `type`-Parameters.
- `logos-mcp-server/src/index.ts` — Tool-Handler von `get_available_bibles` (Zeile ~378–394) von `getAvailableBibles()` (Biblia) auf `getInstalledBibles()` (Catalog) umstellen; Tool-Beschreibungstext anpassen (aktuell: „...via the Biblia API" → sollte „...installed in the local Logos library" o. Ä. werden, siehe Risiko unten).
- `logos-mcp-server/src/types.ts` — `BibleInfo` prüfen: aktuell `{bible, title, abbreviatedTitle, languages, publishers}`. Catalog liefert `ResourceId`/`Title`/`AbbreviatedTitle`/`Languages`, aber kein `publishers`-Äquivalent in der bisherigen `searchCatalog`-Selektion (müsste ergänzt werden, falls `Publisher`-Spalte existiert — nicht Teil der bisherigen Analyse, muss bei Umsetzung geprüft werden). Ggf. `BibleInfo` um `resourceId` erweitern (Catalog-ResourceId ≠ Biblia-Bible-Code, siehe Risiko).

### 3. Neue Dateien/Module
Keine. Reine Erweiterung von `catalog-reader.ts`.

### 4. Tests
- **Neu:** `logos-mcp-server/tests/catalog-reader.test.ts` — existiert aktuell **nicht** (bekannte Lücke, siehe [[07_Bekannte_Probleme]] P8). Da `catalog-reader.ts` `better-sqlite3` direkt gegen eine echte Datei öffnet, braucht ein automatisierter Test eine **Fixture-SQLite-Datei** mit minimalem `Records`-Schema (ein paar Zeilen `Type='text.monograph.bible'` + ein paar andere Typen), erzeugt z. B. in `tests/fixtures/` oder in-memory via `better-sqlite3(':memory:')` mit `DB_PATHS.catalog` gemockt/überschrieben. Testfälle: Filter liefert nur Bible-Typen, `query`-Filter funktioniert, leere Ergebnisliste bei keiner Übereinstimmung.
- Bestehende Tests (`reference-parser.test.ts`, `strip-markup.test.ts`) unverändert.

### 5. Risiken
- **Semantischer Bruch:** Die lokale Liste (70 Übersetzungen, inkl. viele deutschsprachige) überschneidet sich nur teilweise mit dem, was ein weiterhin Biblia-basiertes `get_bible_text` tatsächlich abrufen kann (Biblia bedient nur 6 Codes: LEB, KJV, ASV, DARBY, YLT, WEB). Ein Nutzer könnte über `get_available_bibles` eine lokal installierte Übersetzung sehen, die `get_bible_text` danach mit einem Fehler ablehnt. **Muss in der Tool-Beschreibung klar kommuniziert werden** (z. B. „installed in your Logos library — not all are retrievable via get_bible_text").
- **Code-Mapping:** `AlternateResourceIds` deckt laut Analyse nur `LEB` zuverlässig 1:1 ab; für die übrigen Biblia-Codes gibt es keine automatische Zuordnung. Für `get_available_bibles` selbst unkritisch (liefert nur lokale Metadaten), aber relevant für spätere Tools, die beide Quellen kombinieren wollen.
- **`Type`-Filter-Vollständigkeit:** `catalog-reader.ts`s `TYPE_LABELS` kennt zusätzlich den Typ-String `text.bible` (separat von `text.monograph.bible`) — ob darunter weitere, in der 70er-Zählung nicht erfasste Bibelressourcen liegen, wurde nicht verifiziert und muss bei Umsetzung per Stichprobe geprüft werden.
- **Gering, aber vorhanden:** `Availability`/`IsDataset`-Filter (wie in `searchCatalog` verwendet) müssen konsistent übernommen werden, sonst tauchen ggf. nicht nutzbare/Datensatz-Einträge in der Liste auf.

---

## Tool 2: `compare_passages`

### 1. Lokale Datenquelle
Keine Datenbank — reine Referenz-*Logik* auf Basis der bereits vorhandenen Buch-Zuordnungstabellen in `reference-parser.ts` (`BOOK_TO_LOGOS`, `NAME_LOOKUP`). Erfordert zusätzlich eine **kanonische Buchreihenfolge** (66 Bücher, Genesis…Offenbarung), die aktuell **nicht** existiert, sowie optional eine Versifikationstabelle (siehe Risiko).

### 2. Zu ändernde bestehende Dateien
- `logos-mcp-server/src/services/reference-parser.ts` — neue Exportfunktion `compareReferences(first: string, second: string): CompareResult`; neue interne Konstante `BOOK_ORDER: string[]` (Reihenfolge der 66 Buchnamen, ableitbar aus der bestehenden `BOOK_TO_LOGOS`-Objektreihenfolge, aber explizit als Array zu machen, da JS-Objektschlüsselreihenfolge nicht als stabiler Vertrag gelten sollte).
- `logos-mcp-server/src/index.ts` — Handler von `compare_passages` (Zeile ~357–376) von `comparePassages()` (Biblia) auf `compareReferences()` umstellen. Rückgabeformat (`CompareResult`) bleibt unverändert, Handler-Logik darunter unverändert.

### 3. Neue Dateien/Module
Keine zwingend neue Datei — Erweiterung von `reference-parser.ts`. Falls die Vergleichslogik umfangreich wird (Range-Arithmetik, Versifikation), alternativ ein neues Modul `services/reference-compare.ts`, das `reference-parser.ts` importiert — empfohlen, sobald Versifikationsdaten (Risiko unten) hinzukommen, um `reference-parser.ts` nicht zu überladen.

### 4. Tests
- Erweiterung von `tests/reference-parser.test.ts` (oder neue Datei `tests/reference-compare.test.ts`): Testfälle für alle 6 Ergebnisfelder (`equal`, `intersects`, `subset`, `superset`, `before`, `after`), inkl. der bereits im Testprotokoll dokumentierten Beispielkombination `Romans 8:28-30` vs. `Romans 8:29` (erwartungsgemäß `subset`, siehe [[08_Testprotokoll]]) als Regressions-Fixpunkt.
- Zusätzlich: Cross-Book-Vergleiche (z. B. `Genesis 50` vs. `Exodus 1` → `before`), Cross-Testament-Vergleiche, Kapitel-ohne-Vers-Vergleiche.

### 5. Risiken
- **Versifikation (größtes Risiko):** Ohne eine Tabelle mit Verszahlen pro Kapitel kann „Genesis 1" (ganzes Kapitel) nicht exakt mit „Genesis 1:1-31" verglichen werden — es ist unbekannt, ob Kapitel 1 mit Vers 31 endet, ohne diese Daten zu bündeln. Zwei Optionen, beide mit Konsequenzen:
  a) **Reduzierte Genauigkeit ohne Versifikationstabelle:** Kapitel-Referenzen werden nur auf Kapitelebene verglichen (kein exakter Versbereich) — einfach, aber nicht Biblia-äquivalent bei „ganzes Kapitel"-Vergleichen.
  b) **Versifikationstabelle bündeln:** Faktische, lizenzfreie Daten (Standard-KJV-Versifikation, 66 Bücher × Kapitel → max. Verszahl), aber zusätzlicher Datenumfang und Pflegeaufwand; unterschiedliche Übersetzungen haben teils leicht abweichende Versifikation (z. B. Psalmen-Überschriften) — Wahl der „Referenz-Versifikation" ist eine bewusste Entscheidung.
- **Kein verifizierter Ground-Truth:** Da die Biblia-API durchgehend 403 liefert (siehe [[07_Bekannte_Probleme]] P1/P3), konnte das exakte Vergleichsverhalten von Biblia nie live beobachtet werden — eine 1:1-Verhaltensparität lässt sich nicht garantiert nachbilden, nur die dokumentierte/erwartete Semantik.
- **Edge Case Single-Chapter-Bücher:** `reference-parser.ts` hat bereits Sonderlogik für einkapitlige Bücher (Jud, Phlm, etc.) — muss in der Vergleichslogik korrekt mitgeführt werden.

---

## Tool 3: `scan_references`

### 1. Lokale Datenquelle
Keine Datenbank — reine Text-Scanning-Logik auf Basis der Buch-Namenstabellen aus `reference-parser.ts`.

### 2. Zu ändernde bestehende Dateien
- `logos-mcp-server/src/index.ts` — Handler von `scan_references` (Zeile ~341–355) von `scanReferences()` (Biblia) auf eine neue lokale Funktion umstellen.

### 3. Neue Dateien/Module
- **Neu:** `logos-mcp-server/src/services/reference-scanner.ts` — enthält `scanReferencesLocal(text: string, tagChapters: boolean): ScanResult[]`. Bewusst als **eigenes Modul**, nicht in `reference-parser.ts` integriert: `reference-parser.ts` parst eine *einzelne, vollständige* Referenzangabe (`^...$`-verankerte Regex); Scannen erfordert eine *nicht verankerte, global über Freitext iterierende* Variante mit anderer Fehlerbehandlung (kein Werfen bei Nicht-Treffer, sondern Überspringen). Reuse der bestehenden `NAME_LOOKUP`/`BOOK_TO_LOGOS`-Tabellen aus `reference-parser.ts` per Import.

### 4. Tests
- **Neu:** `tests/reference-scanner.test.ts` — Testfälle: mehrere Referenzen in einem Absatz (inkl. des dokumentierten Testfalls „Siehe Johannes 3,16 und Römer 8,28" aus [[08_Testprotokoll]] — **auf Englisch**, siehe Risiko unten zu deutschen Buchnamen), `tag_chapters: true/false`-Verhalten, keine Treffer in referenzfreiem Text, Nichterkennung von Zahlen, die wie Referenzen aussehen aber keine sind (z. B. „im Jahr 1994" sollte nicht als „Referenz" erkannt werden).

### 5. Risiken
- **Präzision (False Positives/Negatives):** Ein regelbasierter Freitext-Scanner ist grundsätzlich unschärfer als eine dedizierte API. Risiko von Fehltreffern bei Zahlen im Fließtext, die zufällig wie `Buch Zahl:Zahl` aussehen. Muss mit einer Testsuite mit realistischen Negativbeispielen abgesichert werden, nicht nur Positivbeispielen.
- **Sprachabdeckung — konkreter Regressionsrisiko-Fund:** Der bisherige Live-Test von `scan_references` gegen Biblia lief mit **deutschem** Text („Siehe Johannes 3,16 und Römer 8,28", siehe [[08_Testprotokoll]]). `reference-parser.ts`s `BOOK_TO_LOGOS`/`ALIAS_TO_BOOK`-Tabellen enthalten **ausschließlich englische** Buchnamen/Abkürzungen. Eine lokale Migration ohne Ergänzung deutscher (und ggf. weiterer) Buchnamens-Aliase wäre eine **funktionale Regression** gegenüber dem bisherigen (getesteten) Verhalten. Muss vor Umsetzung entschieden werden: deutsche Aliase ergänzen (Aufwand, aber machbar) oder Sprachumfang bewusst auf Englisch einschränken (Verhaltensänderung, dokumentationspflichtig).
- **Komma vs. Doppelpunkt:** Deutsche Schreibweise nutzt „3,16" statt „3:16" — zusätzlicher Parsing-Fall, unabhängig von der Sprachfrage.

---

## Tool 4: `search_bible` (eingeschränkter Migrationsumfang — siehe Vorbemerkung)

### 1. Lokale Datenquelle
**Keine geeignete existiert.** Laut [[12_Lokale_Datenquellen_Analyse]] §3/§5 liegt Bibeltext ausschließlich in proprietären, DRM-geschützten `.logos4`-Dateien (`Data/.../ResourceManager/Resources/*.logos4`) — nicht lesbar, nicht durchsuchbar. Die Concordance-Datenbanken (`Data/.../Concordance/*`) indizieren installierte Ressourcen allgemein, nicht Verstext-Inhalt separat durchsuchbar. **Eine echte lokale Volltextsuche über Bibeltext ist aus Logos' eigenen Daten technisch nicht umsetzbar.**

Eine lokale Umsetzung wäre nur möglich mit einer **externen, nicht aus Logos stammenden** Textquelle (gebündelte public-domain-Übersetzung, siehe [[11_MCP2_Architektur_Vorschlag]] Schritt 3) plus einem selbst aufgebauten Suchindex. Das ist keine „Migration bestehender lokaler Daten" mehr, sondern eine **neue Funktionalität mit neuer externer Abhängigkeit** — architektonisch näher an [[11_MCP2_Architektur_Vorschlag]] als an den anderen drei Tools dieses Plans.

### 2. Zu ändernde bestehende Dateien (nur falls die externe-Corpus-Variante verfolgt wird)
- `logos-mcp-server/src/config.ts` — neue Konfigurationswerte, z. B. `LOCAL_BIBLE_CORPUS_DIR`, Pfad zu einer gebündelten SQLite-FTS5-Indexdatei.
- `logos-mcp-server/src/index.ts` — Handler von `search_bible` (Zeile ~76–91) müsste eine Fallback-Kette implementieren: lokal (falls Corpus vorhanden) → Biblia (falls Key gesetzt) → Fehler. Das ist eine Verhaltensänderung, kein reiner Austausch wie bei den anderen drei Tools.
- `logos-mcp-server/src/services/biblia-api.ts` — `searchBible()` bliebe als Fallback-Implementierung bestehen (nicht entfernbar wie bei den anderen drei).

### 3. Neue Dateien/Module (nur falls externe-Corpus-Variante verfolgt wird)
- Ein Datenverzeichnis/-Artefakt für die gebündelte Übersetzung (Format, Übersetzung, Lizenz — **noch offen**, siehe [[11_MCP2_Architektur_Vorschlag]] „Offene Fragen zur Freigabe" Punkt 1 und 3).
- `logos-mcp-server/src/services/local-bible-search.ts` — Aufbau/Abfrage eines SQLite-FTS5-Index über den gebündelten Text.
- Build-/Setup-Schritt zum Erzeugen des FTS5-Index aus dem Rohtext (einmalig oder bei Installation).

### 4. Tests (nur falls externe-Corpus-Variante verfolgt wird)
- Neue Tests gegen eine kleine Fixture-Teilmenge des Corpus (nicht den vollen Datensatz), um Determinismus zu sichern.
- Fallback-Matrix-Tests (siehe [[11_MCP2_Architektur_Vorschlag]] Schritt 4): lokaler Corpus vorhanden/nicht vorhanden × Biblia-Key gesetzt/nicht gesetzt → 4 Kombinationen.
- Dies wäre zugleich der erste automatisierte Test für `biblia-api.ts` überhaupt (bisher ungetestet, siehe [[07_Bekannte_Probleme]] P8) — `fetch` müsste gemockt werden.

### 5. Risiken
- **Lizenz-/Umfangsentscheidung ausstehend:** Ohne Klärung, welche Übersetzung gebündelt wird (siehe offene Frage in [[11_MCP2_Architektur_Vorschlag]]), ist dieser Tool-Punkt **nicht startbereit** — er hängt von einer Produktentscheidung außerhalb dieses technischen Plans ab.
- **DRM-/Lizenzgrenze:** Es darf unter keinen Umständen versucht werden, Logos' eigenes `.logos4`-Format zu entschlüsseln oder dessen Inhalt zu extrahieren — das wäre ein Lizenzverstoß, unabhängig von technischer Machbarkeit. Dieser Plan schließt das explizit aus.
- **Qualitäts-/Relevanzunterschied:** Ein selbst aufgebauter FTS5-Index über eine einzelne gebündelte Übersetzung liefert andere (wahrscheinlich schlechtere) Suchrelevanz als Biblias mehrsprachiger, mehrübersetzungsfähiger Suchdienst — funktionale Erwartungshaltung muss angepasst werden.
- **Aufwand/Umfang:** Deutlich größer als die anderen drei Tools — eher ein eigenes Teilprojekt als ein einzelner Migrationsschritt.
- **Empfehlung:** `search_bible` **nicht** im selben Umsetzungsschritt wie die anderen drei behandeln, siehe Sequenzierung (§7).

---

## 6. Abhängigkeiten zwischen den vier Migrationen

| Beziehung | Art | Detail |
|---|---|---|
| `scan_references` ↔ `compare_passages` | **Gemeinsame Infrastruktur** | Beide bauen auf einer gehärteten `reference-parser.ts` auf (Buch-Erkennung bzw. Buch-Reihenfolge). Sinnvoll, die Erweiterung von `reference-parser.ts` (Buchreihenfolge, ggf. Versifikation, ggf. deutsche Aliase) **einmal gemeinsam** zu planen statt zweimal parallel. |
| `compare_passages` → `scan_references` | **Schwache Reihenfolge-Empfehlung** | `compare_passages` deckt bereits Referenz-Range-Arithmetik ab; `scan_references` kann davon profitieren (z. B. erkannte Referenzen direkt validieren/normalisieren). Kein hartes Blocking, aber effizienter in dieser Reihenfolge. |
| `get_available_bibles` | **Unabhängig** | Nutzt `catalog-reader.ts`, keine Berührung mit `reference-parser.ts`. Kann parallel zu den anderen beiden begonnen werden. |
| `get_available_bibles` ↔ `search_bible` | **Semantische Kopplung, falls beide umgesetzt** | Falls `search_bible` später lokal wird (externer Corpus), sollte `get_available_bibles` idealerweise kennzeichnen, welche Übersetzungen *lokal durchsuchbar* sind vs. nur *installiert* — sonst entsteht dieselbe Erwartungslücke wie bereits in Risiko-Abschnitt 1 beschrieben. Kein technisches Blocking, aber ein Konsistenzpunkt, der bei Umsetzung von `search_bible` eine Nacharbeit an `get_available_bibles` auslösen könnte. |
| `search_bible` → alle anderen drei | **Keine Abhängigkeit in diese Richtung** | Die drei anderen Migrationen sind von der `search_bible`-Entscheidung komplett unabhängig und können unabhängig davon abgeschlossen werden. |

---

## 7. Empfohlene Umsetzungsreihenfolge

1. **`get_available_bibles`** — geringstes Risiko, keine neue Infrastruktur, nutzt bereits angebundene DB, kein Eingriff in `reference-parser.ts`. Guter erster Schritt, um das Migrationsmuster (Biblia-Aufruf → lokale Funktion, Tool-Antwortformat unverändert) einmal end-to-end zu validieren, inkl. des ersten Tests für `catalog-reader.ts`.
2. **`compare_passages`** — baut die gemeinsame `reference-parser.ts`-Erweiterung (Buchreihenfolge) auf; Versifikationsfrage (Risiko §Tool 2) muss hier **vor** Beginn entschieden werden (reduzierte Genauigkeit vs. Versifikationstabelle).
3. **`scan_references`** — nutzt dieselbe gehärtete `reference-parser.ts`-Basis aus Schritt 2; Sprachumfang-Entscheidung (Englisch-only vs. + Deutsch, Risiko §Tool 3) muss hier **vor** Beginn entschieden werden, da sie eine Verhaltensänderung gegenüber dem zuletzt getesteten Zustand darstellt.
4. **`search_bible`** — **zurückgestellt**, bis die in [[11_MCP2_Architektur_Vorschlag]] offenen Fragen (Übersetzungswahl, Lizenz, Bündelungsform) separat entschieden sind. Kein technisches Blocking gegenüber 1–3, aber deutlich größerer, eigenständiger Aufwand mit externer Abhängigkeit — sollte nicht denselben Umsetzungsschritt wie 1–3 teilen.

Jeder der vier Punkte bleibt einzeln commit- und testbar (`npm run build && npm test` grün pro Schritt), passend zum bestehenden Vorgehen aus [[06_Roadmap]].

---

## Offene Entscheidungen vor Umsetzungsbeginn

1. `compare_passages`: Versifikationstabelle bündeln oder reduzierte Kapitel-Genauigkeit akzeptieren?
2. `scan_references`: Sprachumfang auf Englisch beschränken oder deutsche (und ggf. weitere) Buchnamens-Aliase ergänzen?
3. `get_available_bibles`: Tool-Beschreibungstext-Anpassung zur Vermeidung der Erwartungslücke gegenüber `get_bible_text` — genauer Wortlaut?
4. `search_bible`: Wird die externe-Corpus-Variante überhaupt verfolgt, oder bleibt dieses Tool bewusst Biblia-abhängig? Falls ja: Übersetzungswahl/Lizenz (offene Frage aus [[11_MCP2_Architektur_Vorschlag]]).
