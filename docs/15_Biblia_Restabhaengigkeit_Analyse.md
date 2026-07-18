# 15 — Analysebericht: Verbleibende Biblia-Abhängigkeit (Logos MCP 2.0, Phase 2)

**Status: Reiner Analysebericht. Keine Codeänderung, kein Refactoring, kein Commit, kein Tag, kein Push.**

Grundlage: Code-Lektüre der aktuellen Codebasis (`logos-mcp-server/src/`), Verifikation von Build (`npm run build`) und Tests (`npm test`, 116/116 grün) als reiner Lesevorgang ohne Änderung, sowie Fortschreibung von [[07_Bekannte_Probleme]], [[11_MCP2_Architektur_Vorschlag]], [[12_Lokale_Datenquellen_Analyse]], [[13_Implementierungsplan_Migration]] und [[14_Project_Completion_Report]].

## Ausgangslage

Laut [[14_Project_Completion_Report]] wurden bereits 3 von ursprünglich 7 Biblia-abhängigen Tools erfolgreich auf lokale Datenquellen migriert: `get_available_bibles` (→ `catalog.db`), `compare_passages` und `scan_references` (→ reine Referenzlogik). Verifiziert per `grep`: `index.ts` importiert aus `biblia-api.ts` nur noch zwei Funktionen (`getBibleText`, `searchBible`) — die drei migrierten Tools rufen `biblia-api.ts` nicht mehr auf.

**Verbleibend biblia-abhängig: 4 Tools** — `get_bible_text`, `get_passage_context`, `search_bible`, `get_cross_references`. Das ist der Gegenstand dieses Berichts.

**Randbefund (keine der 9 gestellten Fragen, aber direkt beim Beantworten von Frage 1 aufgefallen):** `biblia-api.ts` enthält weiterhin die Funktionen `parsePassage`, `scanReferences`, `comparePassages`, `getAvailableBibles` (Zeilen 80–133) — die Biblia-Implementierungen der drei bereits migrierten Tools. Sie werden von keiner Datei mehr importiert (`grep -rn` über `src/` und `tests/` liefert außer der Definition selbst keine Treffer) und sind damit **toter Code**, analog zu P6 in [[07_Bekannte_Probleme]]. Keine funktionale Auswirkung, aber bei einer künftigen Aufräum-Phase mit zu entfernen.

---

## 1. Welche Funktionen nutzen aktuell noch Biblia?

| Tool | Fundstelle (`index.ts`) | Ruft auf | Biblia-Endpunkt |
|---|---|---|---|
| `get_bible_text` | Zeilen 49–60 | `getBibleText()` | `GET /content/{bible}.txt` |
| `get_passage_context` | Zeilen 63–76 | `expandRange()` (**lokal**, `reference-parser.ts`) → `getBibleText()` | `GET /content/{bible}.txt` |
| `search_bible` | Zeilen 79–93 | `searchBible()` | `GET /search/{bible}` |
| `get_cross_references` | Zeilen 96–133 | `getBibleText()` (einmalig, zur Stichwortgewinnung) **und** `searchBible()` (limit 15) | beide obigen |

Kein einziges der vier Tools ruft einen eigenen, dedizierten Biblia-Endpunkt für „Cross References" auf — `/compare`, `/scan`, `/find`, `/parse` werden nirgends mehr aufgerufen (siehe Randbefund oben). Die gesamte verbleibende Abhängigkeit reduziert sich technisch auf **zwei** Biblia-Funktionen: `getBibleText()` und `searchBible()`, aus denen `get_passage_context` und `get_cross_references` bereits heute mit lokaler Zusatzlogik zusammengesetzt sind.

---

## 2. Welche Daten kommen von Biblia?

Zwei Datentypen, beide inhaltsbasiert (nicht Metadaten):

1. **Bibeltext-Inhalt** (`/content/{bible}.txt`): Klartext eines Referenzbereichs, für genau 6 Übersetzungscodes (`LEB` Default, `KJV`, `ASV`, `DARBY`, `YLT`, `WEB` — hartcodiert in Tool-Beschreibung, `index.ts:54`). Rückgabe: `{ passage, text, bible }`.
2. **Volltextsuche über Bibeltext** (`/search/{bible}`): `{ resultCount, results: [{ title, preview }] }`. Laut [[07_Bekannte_Probleme]] P3 ist unverifiziert, ob das Feld tatsächlich `title` heißt (öffentliche Doku nennt `passage`) — bislang nie mit echter Antwort getestet, da der Key als kompromittiert gilt (P1).

`get_cross_references` liefert **keine echten Cross-Reference-Daten von Biblia** — es gibt dafür keinen genutzten Endpunkt. Stattdessen: eigene Stopword-gefilterte Stichwortextraktion aus dem Passagentext (`getBibleText`) plus anschließende Volltextsuche (`searchBible`) mit den extrahierten Wörtern. Das ist bereits heute eine **lokale Heuristik**, die zufällig auf zwei Biblia-Datenpunkten aufbaut, keine Biblia-eigene Cross-Reference-Funktion.

---

## 3. Welche dieser Daten existieren bereits lokal in Logos?

**Keine, in nutzbarer Form.** Bestätigt in [[12_Lokale_Datenquellen_Analyse]] §3 durch tatsächliche Byte-Untersuchung (nicht nur Vermutung):

- Der reale Ressourceninhalt (inkl. Bibeltext) liegt unter `Data/<install-id>/ResourceManager/Resources/<ResourceId>.logos4` (z. B. `LEB.logos4`, 17,5 MB).
- Format-Header `"LRES01"` — proprietär, kein SQLite.
- `strings`-Suche nach bekanntem Klartext (Gen 1:1 „beginning") liefert **null Treffer**.
- `gzip`-Kompressionsrate = 1,000 — keine Größenreduktion, konsistent mit bereits verschlüsseltem/komprimiertem Inhalt.
- `catalog.db` (bereits für `get_available_bibles` genutzt) enthält nur bibliografische Metadaten (Titel, Sprache, ResourceId) zu 70 installierten Bibelübersetzungen — **keinen** Versinhalt.
- Kein lokaler Volltextindex über Verstext: `Concordance/*`-DBs indizieren installierte Ressourcen allgemein, nicht separat durchsuchbaren Bibeltext.

Ergebnis: Für die 4 verbleibenden Tools existiert **0 % der benötigten Rohdaten** in aus Logos' eigenen Dateien lesbarer Form. Das ist keine neue Erkenntnis dieser Phase, sondern die bereits in Phase 1 verifizierte technische Grenze — hier noch einmal explizit auf die 4 verbleibenden Tools bezogen bestätigt.

---

## 4. Welche Daten könnten vollständig lokal ersetzt werden?

Zu unterscheiden: „aus Logos' eigenen Daten" (= keine, siehe 3.) vs. „lokal mit einer separat gebündelten, nicht-Logos-Textquelle" (= grundsätzlich alle 4, mit einer Einschränkung bei der Default-Übersetzung, siehe 5.):

- **`get_bible_text`**: 1:1 ersetzbar durch Nachschlagen (Buch/Kapitel/Vers → Text) gegen einen gebündelten Public-Domain-Textkorpus — reine Lookup-Logik, kein Suchindex nötig.
- **`get_passage_context`**: folgt automatisch aus `get_bible_text` — ruft bereits heute lokal `expandRange()` auf und delegiert nur den eigentlichen Textabruf; keine separate Migrationsarbeit.
- **`get_cross_references`**: folgt ebenfalls automatisch, sobald `get_bible_text` und `search_bible` lokal sind — die Heuristik selbst (Stopword-Filter, Top-5-Wörter, Suche, Selbstreferenz-Ausschluss) ist bereits reiner Anwendungscode ohne Biblia-Spezifika und bleibt unverändert.
- **`search_bible`**: ersetzbar, aber mit echtem Zusatzaufwand — erfordert einen selbst aufgebauten Volltextindex (z. B. SQLite FTS5) über den gebündelten Korpus, nicht nur einen Lookup.

**Wichtige Einschränkung:** Von den 6 aktuell unterstützten Übersetzungscodes sind **5 gemeinfrei (public domain)**: `KJV`, `ASV`, `DARBY`, `YLT`, `WEB`. Die aktuelle Default-Übersetzung **`LEB` (Lexham English Bible) ist urheberrechtlich geschützt** (Faithlife/Logos) und *nicht* gemeinfrei — sie kann nicht einfach im Repo gebündelt werden. Das betrifft direkt `DEFAULT_BIBLE` in `config.ts:66`.

---

## 5. Welche Daten wären schwierig lokal nachzubilden?

- **`LEB` als Default-Übersetzung**: nicht gemeinfrei, siehe 4. — erfordert eine explizite Produktentscheidung (Default wechseln vs. LEB weiterhin exklusiv über Biblia beziehen), keine rein technische Frage.
- **Suchrelevanz/-qualität von `search_bible`**: Ein selbst gebauter FTS5-Index über eine einzelne gebündelte Übersetzung liefert strukturell einfacheres Ranking als Biblias produktiver Suchdienst (kein Stemming-/Relevanz-Tuning bekannt) — Erwartungshaltung an Suchqualität muss sinken, unabhängig vom Implementierungsaufwand.
- **Nicht-englische Übersetzungen**: Der Großteil der 70 in `catalog.db` gelisteten, tatsächlich installierten Übersetzungen ist deutschsprachig (siehe [[12_Lokale_Datenquellen_Analyse]] §2). Für keine davon liegt automatisch ein gemeinfreier Text vor, der mitgebündelt werden könnte (z. B. Luther 1912 oder Schlachter 1951 sind zwar PD, aber nicht Teil dieses Projekts und müssten separat beschafft/aufbereitet werden) — bleibt außerhalb des Rahmens dieser Migration.
- **Vollständigkeits-/Korrektheitsverifikation des Korpus**: Bereits bei der deutlich kleineren Versifikationstabelle (66 Bücher, 1.189 Kapitel) wurde laut [[14_Project_Completion_Report]] ein eigener Transkriptionsfehler gefunden. Ein kompletter Bibeltextkorpus (5 Übersetzungen × ~31.000 Verse) hat ein entsprechend höheres Fehlerrisiko bei der Aufbereitung, das durch Stichproben-/Checksummentests abgefangen werden müsste.
- **Verhaltensparität mit Biblia**: Wie schon in [[13_Implementierungsplan_Migration]] vermerkt, liefert die Biblia-API durchgehend HTTP 403 (P1) — es existiert kein verifizierter Ground-Truth, gegen den eine 1:1-Verhaltensgleichheit geprüft werden könnte. Das gilt für alle 4 Tools gleichermaßen weiter.

---

## 6. Architekturvorschlag für eine vollständig lokale Lösung

Aufbauend auf der bereits skizzierten, aber nie umgesetzten Provider-Abstraktion aus [[11_MCP2_Architektur_Vorschlag]], jetzt konkretisiert mit den unter 3.–5. verifizierten Fakten:

```
Tool-Aufruf ──► BibleTextProvider (neues Interface: resolveText, search)
                        │
        ┌───────────────┴───────────────┐
        ▼                                 ▼
LocalBibleProvider (neu, primär)   BibliaApiProvider (bestehend, optionaler Fallback)
- gebündelter PD-Korpus            - nur wenn BIBLIA_API_KEY gesetzt
  (KJV, ASV, DARBY, YLT, WEB)        UND lokal nicht abgedeckt
  als SQLite + FTS5-Volltextindex    (z. B. explizite LEB-Anfrage)
- Verse-Tabelle: book, chapter,
  verse, translation, text
- kein Netzwerk, kein Key nötig
```

Konkrete Bausteine:

1. **`BibleTextProvider`-Interface** (neue Datei, z. B. `services/bible-provider.ts`): `resolveText(passage, bible)`, `search(query, options)`. `index.ts` ruft nur noch dieses Interface auf, nie mehr `biblia-api.ts` oder eine lokale Implementierung direkt.
2. **`LocalBibleProvider`**: liest gegen eine gebündelte SQLite-Datei mit einer Verse-Tabelle je Übersetzung plus einer FTS5-Virtual-Table für `search()`. Lookup für `get_bible_text`/`get_passage_context` ist einfacher Bereichs-Select (Buch/Kapitel/Vers-Range, per bereits vorhandener `reference-parser.ts`/`versification.ts`-Logik in Zeilen-Range übersetzt).
3. **`get_cross_references`**: unverändert in seiner internen Logik, ruft nur noch `LocalBibleProvider.resolveText`/`.search` statt der Biblia-Version auf — kein separater Migrationsschritt nötig, „erbt" das Ergebnis der beiden anderen.
4. **`DEFAULT_BIBLE`-Entscheidung**: Default auf eine gemeinfreie Übersetzung (z. B. `WEB`, moderne Sprache, oder `KJV` als bekanntester Standard) umstellen; `LEB` bleibt als Option nur verfügbar, wenn `BIBLIA_API_KEY` gesetzt ist — mit klarer Fehlermeldung, falls nicht.
5. **Korpus-Erzeugung**: einmaliges Build-/Setup-Skript, das Rohtext (gemeinfreie Quelle, außerhalb des Laufzeitcodes zu beschaffen) in die SQLite+FTS5-Datei konvertiert — kein Teil des Server-Laufzeitpfads, analog zum bereits bestehenden Muster der gebündelten `versification.ts`-Daten.
6. **Fallback-Priorisierung**: `BibleTextProvider.resolve()` fragt immer zuerst `LocalBibleProvider`; nur bei nicht abgedeckter Übersetzung (`LEB`) oder falls Nutzer explizit Biblia-Suche über mehr Übersetzungen wünscht, wird `BibliaApiProvider` konsultiert — und nur, wenn ein Key gesetzt ist. Fehlender Key blockiert dann nur noch den optionalen Erweiterungsfall, nicht mehr den Kernbetrieb.

---

## 7. Aufwandsschätzung

| Baustein | Aufwand | Begründung |
|---|---|---|
| Provider-Abstraktion (`BibleTextProvider`-Interface, `biblia-api.ts` dahinter verdrahten) | **klein** | Reines Refactoring ohne Verhaltensänderung, wie bereits in [[11_MCP2_Architektur_Vorschlag]] Schritt 1 skizziert; Verhalten per Diff der Tool-Antworten verifizierbar. |
| Beschaffung/Aufbereitung des PD-Textkorpus (5 Übersetzungen) | **mittel** | Lizenzfrage entfällt (alle 5 gemeinfrei), aber Sammeln, Bereinigen, Formatieren, Stichprobenverifikation gegen bekannte Referenzverse — vergleichbarer Arbeitstyp wie die Versifikationstabelle, nur deutlich größerer Umfang (~31.000 Verse × 5). |
| `get_bible_text` / `get_passage_context` lokal (reiner Lookup) | **klein–mittel** | Sobald Korpus vorhanden: einfache Bereichsabfrage; Komplexität liegt im korrekten Mapping Referenz → Zeilenbereich (nutzt bereits vorhandene `reference-parser.ts`/`versification.ts`). |
| `search_bible` lokal (FTS5-Index + Ranking) | **mittel** | Erfordert Indexaufbau, Query-Escaping, Ranking-Strategie (z. B. `bm25()`); kein Reverse Engineering, aber neue Infrastruktur. |
| `get_cross_references` lokal | **klein** | Folgt automatisch aus den beiden vorherigen, keine eigenständige Implementierung nötig. |
| `LEB`/Default-Entscheidung + Doku/README-Anpassung | **klein** | Technisch trivial, aber Produkt-/Kommunikationsentscheidung, die vor Umsetzung getroffen werden muss. |
| **Gesamt (alle 4 Tools)** | **mittel** | Kein „groß" mehr, da die ursprünglich befürchtete Notwendigkeit einer DRM-Umgehung (siehe [[12_Lokale_Datenquellen_Analyse]] §3) nicht zutrifft — der Hauptaufwand liegt in Textbeschaffung/-verifikation, nicht in algorithmischer Komplexität. |

---

## 8. Risiken

1. **Lizenz der Default-Übersetzung (`LEB`)**: nicht gemeinfrei — muss vor jeder Umsetzung explizit entschieden werden (Default wechseln vs. LEB weiterhin Biblia-exklusiv). Ohne diese Entscheidung ist Baustein „Korpus" nicht startbereit.
2. **Datenqualität des gebündelten Korpus**: Fehlerrisiko bei ~155.000 Versen (5 × ~31.000) deutlich höher als bei der bereits einmal fehlerhaften Versifikationstabelle — erfordert systematische Stichprobenverifikation, nicht nur Vertrauen in die Quelle.
3. **Repo-Größe**: Fünf vollständige Bibelübersetzungen als Text summieren sich auf mehrere MB — Frage „im Repo bündeln vs. optionaler Download bei Erstinstallation" bleibt laut [[11_MCP2_Architektur_Vorschlag]] weiterhin offen und muss vor Baustein „Korpus" entschieden werden.
4. **Suchqualität**: Selbst gebauter FTS5-Index liefert wahrscheinlich schwächere Relevanzsortierung als Biblias Dienst — Nutzererwartung muss in der Tool-Beschreibung angepasst kommuniziert werden, sonst wirkt es wie eine Funktionsregression.
5. **`get_cross_references` bleibt strukturell eine Heuristik**: Weder die Biblia- noch eine lokale Variante liefert echte, kuratierte Cross-Reference-Daten — das ist unabhängig von der Datenquelle und wird durch die Migration nicht besser, nur die Quelle der zugrundeliegenden Suchtreffer ändert sich. Sollte in der Tool-Beschreibung nicht als „Cross-Reference-Datenbank" missverstanden werden.
6. **Sprachlücke bleibt bestehen**: Die überwiegend deutschsprachigen, lokal installierten Übersetzungen (`catalog.db`) bleiben weiterhin nicht durchsuchbar/abrufbar — verstärkt die bereits in [[13_Implementierungsplan_Migration]] (Tool 1, Risiko „Semantischer Bruch") notierte Erwartungslücke zwischen `get_available_bibles` (zeigt 70 installierte Übersetzungen) und dem, was `get_bible_text`/`search_bible` tatsächlich lokal bedienen können (nur 5 englische).
7. **Kein Ground-Truth-Vergleich möglich**: Solange P1 (kompromittierter Biblia-Key) nicht behoben ist, kann Verhaltensparität mit der bisherigen Biblia-Implementierung nicht empirisch verifiziert werden, nur gegen die dokumentierte/erwartete Semantik.
8. **Feldmapping-Altlast (P3)**: Das unverifizierte `title`-vs.-`passage`-Mapping in der bisherigen `searchBible()`-Implementierung sollte bei einer Neuimplementierung nicht unreflektiert übernommen werden — kein Grund, einen möglicherweise bereits fehlerhaften Vertrag fortzuschreiben.

---

## 9. Migrationsplan in Phasen

Jede Phase einzeln commit- und testbar (`npm run build && npm test` grün pro Schritt), konsistent mit dem bisherigen Vorgehen aus [[06_Roadmap]]. Kein Schritt wird in dieser Analysephase umgesetzt.

**Phase A — Provider-Abstraktion (klein, kein Verhaltenswechsel)**
`BibleTextProvider`-Interface einführen, `biblia-api.ts` unverändert als einzige Implementierung dahinter verdrahten. Im selben Zug: toten Code in `biblia-api.ts` entfernen (`parsePassage`, `scanReferences`, `comparePassages`, `getAvailableBibles` — siehe Randbefund oben), da diese Datei ohnehin angefasst wird. Test: Tool-Antworten unverändert (Snapshot/Diff).

**Phase B — Offene Produktentscheidungen klären (kein Code)**
- Default-Übersetzung: `LEB` beibehalten (nur via Biblia) oder auf gemeinfreie Übersetzung wechseln?
- Bündelungsform: Korpus im Repo oder optionaler Download bei Erstinstallation?
- Zielumfang: alle 5 gemeinfreien Übersetzungen (`KJV`, `ASV`, `DARBY`, `YLT`, `WEB`) oder eine kleinere Teilmenge zuerst?

**Phase C — Korpus beschaffen und aufbereiten (mittel)**
Gemeinfreien Rohtext sammeln, bereinigen, in SQLite-Verse-Tabelle + FTS5-Index überführen; Build-Skript; Stichprobenverifikation gegen bekannte Referenzverse (z. B. Joh 3,16, Röm 8,28).

**Phase D — `LocalBibleProvider` implementieren (klein–mittel)**
`resolveText()` und `search()` gegen den Korpus; `get_bible_text` und `get_passage_context` auf `LocalBibleProvider` umstellen. `get_cross_references` folgt automatisch, da es intern dieselben Provider-Methoden nutzt.

**Phase E — Fallback-Priorisierung (klein)**
`resolve()` fragt zuerst lokal; Biblia nur bei explizit angefragter, lokal nicht gebündelter Übersetzung (`LEB`) und gesetztem Key. Fehlender Key blockiert dann nur noch diesen Erweiterungsfall.

**Phase F — Dokumentation aktualisieren (klein)**
README/[[07_Bekannte_Probleme]] aktualisieren: 0 von 20 Tools mehr zwingend Biblia-abhängig, `LEB`-Sonderfall klar dokumentieren, P1 von „blockiert 4 Tools vollständig" auf „schränkt nur LEB-Zugriff ein" herabstufen.

Reihenfolge ist bindend bis Phase C (Datenentscheidung muss vor Korpusaufbau stehen); D–F sind streng sequenziell auf C aufbauend, aber technisch klein genug, um bei Bedarf in noch kleinere Einzelschritte zerlegt zu werden.
