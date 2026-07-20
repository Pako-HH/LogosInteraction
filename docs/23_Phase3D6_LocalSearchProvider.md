# 23 — Phase 3D-6: LocalSearchProvider — lokale Volltextsuche für `search_bible`

**Status: `LocalSearchProvider` + `SearchResolver` implementiert und in `index.ts` verdrahtet. Öffentliche API und Rückgabeformat unverändert. Kein Commit, kein Tag, kein Push.**

Grundlage: [[16_MCP2_Zielarchitektur]] §7/§15 (`SearchProvider`, Resolver-Vertrag), [[22_Phase3D5_BibleTextResolver]] (identisches Kompositionsmuster für Bibeltext, jetzt auf Suche übertragen), [[19_Phase3D2_WEB_Korpus_Build]]/[[20_Phase3D3_KJV_ASV_Korpus]] (FTS5-Index im Korpus).

---

## 1. Geänderte und neu erstellte Dateien

**Neu:**

| Datei | Zweck |
|---|---|
| `logos-mcp-server/src/services/providers/local-search-provider.ts` | Der `LocalSearchProvider` |
| `logos-mcp-server/src/services/providers/search-resolver.ts` | Der `SearchResolver` (lokal-first, Biblia-Fallback) |
| `logos-mcp-server/tests/providers/local-search-provider.test.ts` | 15 Unit-Tests |
| `logos-mcp-server/tests/providers/search-resolver.test.ts` | 10 Unit-Tests |
| `logos-mcp-server/tests/index.local-search-resolver.integration.test.ts` | 5 echte End-to-End-Tests über das MCP-Protokoll |

**Geändert:**

| Datei | Änderung |
|---|---|
| `logos-mcp-server/src/index.ts` | `searchProvider` ist jetzt ein `SearchResolver` aus `LocalSearchProvider` (mit sicherem Null-Fallback, identisches Muster wie `bibleTextProvider` aus Phase 3D-5) + `BibliaSearchProvider`, statt direkt `BibliaSearchProvider`. Kein Tool, keine Tool-Beschreibung, kein Parameter geändert. (+27/−10 Zeilen, ausschließlich Imports und Instanziierung) |

**Bestätigt unverändert** (per `git diff --stat`, leere Ausgabe): `bible-text-resolver.ts`, `local-bible-text-provider.ts`, `biblia-bible-text-provider.ts`, `biblia-search-provider.ts`, `local-translation-provider.ts`, `heuristic-cross-reference-provider.ts`. **Keine bestehende Testdatei musste korrigiert werden** (anders als in Phase 3D-5) — kein bestehender Test rief `search_bible` über den echten Server auf.

---

## 2. Architektur und Routing-Verhalten

### `LocalSearchProvider`
Implementiert `SearchProvider` vollständig, liest denselben Korpus (`verses`-Tabelle + `verses_fts`-FTS5-Index) wie `LocalBibleTextProvider`, öffnet aber eine **eigene** Verbindung (bewusste Entscheidung für Entkopplung, siehe [[16_MCP2_Zielarchitektur]] §5/§7 — beide Provider sind eigenständige Klassen). Öffnungs-/Fehlerbehandlung dupliziert exakt das in `local-bible-text-provider.ts` etablierte Muster (fehlende/korrupte/falsch strukturierte Datei), bewusst **nicht** in ein gemeinsames Modul extrahiert, um bestehende Provider-Dateien in dieser Phase nicht anfassen zu müssen.

### `SearchResolver`
Identisches Kompositionsmuster wie `BibleTextResolver` (Phase 3D-5): lokal zuerst, Biblia nur als Fallback für eine lokal nicht abgedeckte Übersetzung. Beide Konstruktorparameter nullable, aus demselben Grund wie beim Bibeltext-Resolver — `LocalSearchProvider`s Konstruktor wirft bei fehlendem Korpus, `index.ts` fängt das ab und degradiert sauber auf „nur Biblia".

**Ein Unterschied zum Bibeltext-Pfad:** `SearchOptions.bible` ist optional (`search-provider.ts`, Phase 3A), anders als `BibleTextProvider.resolveText`s *erforderlicher* `translation`-Parameter. `index.ts`s `search_bible`-Handler reicht `bible` unverändert (ggf. `undefined`) durch, ohne selbst auf `DEFAULT_BIBLE` aufzulösen — das entspricht dem bereits bestehenden Verhalten (`biblia-api.ts`s `searchBible()` löst den Default intern auf). Der `SearchResolver` übernimmt diese Auflösung jetzt zentral (`options?.bible ?? DEFAULT_BIBLE`), **bevor** er lokal-vs-Biblia entscheidet — sowohl `LocalSearchProvider` als auch `BibliaSearchProvider` bleiben dadurch unverändert und weiterhin eigenständig aufrufbar.

### Routing in der Praxis
| Anfrage | Weg |
|---|---|
| `search_bible(query, bible: "WEB")` | `SearchResolver` → `LocalSearchProvider` (lokal, kein Netzwerk) |
| `search_bible(query, bible: "KJV")` | `SearchResolver` → `LocalSearchProvider` |
| `search_bible(query, bible: "ASV")` | `SearchResolver` → `LocalSearchProvider` |
| `search_bible(query)` (kein `bible` → `DEFAULT_BIBLE` = `LEB`) | `SearchResolver` → `BibliaSearchProvider` (unverändert wie vor dieser Phase) |
| `search_bible(query, bible: "LEB")` | `SearchResolver` → `BibliaSearchProvider` |

`get_bible_text`/`get_passage_context` (Phase 3D-5) und `search_bible` (diese Phase) teilen sich denselben Entscheidungsmechanismus, aber **getrennte** Resolver-Instanzen — keine Kopplung zwischen Bibeltext- und Suchpfad nötig oder vorhanden.

---

## 3. Suchverhalten und Rückgabeformat

### Rückgabeform unverändert
`{ query, resultCount, results: [{ title, preview }] }` — exakt wie `BibliaSearchProvider`/`biblia-api.ts`. `title` wird lokal als `"${book} ${chapter}:${verse}"` gebildet (z. B. `"John 3:16"`), `preview` ist der volle Verstext (kein gekürzter Ausschnitt — Biblias tatsächliches Kürzungsverhalten war wegen P1 nie verifizierbar, siehe [[15_Biblia_Restabhaengigkeit_Analyse]]).

### `resultCount` vs. `limit`
`resultCount` spiegelt die **Gesamtzahl** der Treffer wider (eigene `COUNT(*)`-Abfrage ohne `LIMIT`), `results` ist auf `limit` (Default 20) begrenzt — genauso, wie es der bestehende `index.ts`-Formatierungscode bereits für Biblia-Antworten voraussetzt (`Found ${result.resultCount} results...`). Per Test verifiziert: 3 tatsächliche Treffer, `limit: 2` → `resultCount: 3`, `results.length: 2`.

### Wortgruppensuche — bewusste Designentscheidung
Die **gesamte** (getrimmte) Nutzeranfrage wird als **eine** FTS5-Phrase behandelt (`"${query}"`, interne Anführungszeichen verdoppelt), nicht in Einzelwörter zerlegt und mit UND verknüpft. Ein einzelnes Wort verhält sich dabei identisch zu einer normalen Wortsuche (eine „Phrase" aus einem Token hat keine Adjazenzbedingung), eine Mehrwort-Anfrage verlangt aber exakte, benachbarte Übereinstimmung — **dieselbe Genauigkeit, die bereits im Phase-3C-Spike für „in the beginning" nachgewiesen wurde**, jetzt produktiv. Zusätzlicher Vorteil: FTS5-Sonderzeichen/Operatoren (`AND`, `OR`, `NOT`, `*`, `-`, Spaltenfilter) in der Nutzereingabe werden dadurch als reiner Text behandelt, nicht als Abfragesyntax interpretiert — das in [[16_MCP2_Zielarchitektur]] §19 Risiko 9 benannte „FTS5-Query-Escaping" ist damit erledigt.

### Fehlerbehandlung
Identische Taxonomie wie `LocalBibleTextProvider` (Phase 3D-4): fehlende/korrupte/falsch strukturierte Korpusdatei → klare, unterscheidbare Fehler; nicht unterstützte Übersetzung → klarer Fehler mit Liste der verfügbaren Übersetzungen; **keine Treffer ist kein Fehler** (`resultCount: 0, results: []`), konsistent mit dem bereits bestehenden `index.ts`-Verhalten (`"No results for ..."`).

---

## 4. Test- und Build-Ergebnisse

```
npm run build   → keine Fehler
npm test        → 19 Testdateien, 241/241 Tests grün (211 bestehend + 30 neu)
```

**15 neue `LocalSearchProvider`-Unit-Tests:** Wortsuche, Wortgruppensuche (inkl. Negativtest — Wörter vorhanden, aber nicht benachbart → kein Treffer, beweist Phrasen- statt UND-Semantik), keine Treffer, leere/Whitespace-Anfrage, `resultCount` vs. `limit`, Default-`limit` (20), zwei FTS5-Injection-Sicherheitstests (Operator-Schlüsselwort „AND" als Literal, eingebettete Anführungszeichen ohne Absturz), nicht unterstützte Übersetzung, Default-Auflösung auf `LEB` (die dieses Fixture nicht abdeckt → korrekter Fehler), plus 3 Dateifehlerbehandlungstests.

**10 neue `SearchResolver`-Unit-Tests:** lokal bevorzugt; Default-Auflösung vor der Routing-Entscheidung; Fallback bei fehlender lokaler Abdeckung (LEB-Fall); Fallback bei `local === null`; klarer Fehler, wenn keiner zuständig ist; lokale und Biblia-eigene Fehler propagieren unverändert (kein stiller Fallback bei einem echten Fehler); `supports()` in drei Kombinationen.

**5 neue echte End-to-End-Tests** (`tests/index.local-search-resolver.integration.test.ts`): Wortsuche und Wortgruppensuche für WEB lokal, `biblia-api.ts`-Mock nachweislich nie aufgerufen; keine Treffer lokal ohne Biblia-Aufruf; Fallback zu Biblia für `LEB` (Default) weiterhin funktionsfähig, mit exakt demselben Argumentmuster wie vor dieser Phase; **`get_cross_references` bleibt nachweislich unverändert Biblia-gebunden** (siehe Abschnitt 6).

---

## 5. Ergebnis der manuellen Prüfung gegen den Produktionskorpus

Gegen den echten, in Phase 3D-2/3D-3 gebauten Korpus (93.307 Verse, WEB+KJV+ASV) mit dem echten `SearchResolver` verifiziert:

| Anfrage | Ergebnis |
|---|---|
| `search("begotten", {bible:"KJV", limit:5})` | 24 Treffer gesamt, sinnvoll gerankt (u. a. Hiob 38,28, Philemon 1,10) |
| `search("God so loved", {bible:"WEB"})` | **Genau 1** Treffer (Johannes 3:16) — exakte Phrasensuche bestätigt |
| `search("love", {bible:"ASV", limit:3})` | 307 Treffer gesamt, plausibel gerankt |
| `search("xenophobia", {bible:"WEB"})` | 0 Treffer, kein Fehler |
| `search("love", {bible:"LEB"})` | Fällt korrekt zu Biblia durch, identischer Fehler wie vor dieser Phase (`BIBLIA_API_KEY is not set...`, da kein Key konfiguriert) — **Beweis, dass sich das Fallback-Verhalten nicht verändert hat** |

---

## 6. Bekannte Einschränkungen

1. **`get_cross_references` bleibt vollständig Biblia-gebunden — durch diese Phase nicht verbessert.** Wie bereits in [[22_Phase3D5_BibleTextResolver]] Abschnitt 4 als Einschränkung notiert: `HeuristicCrossReferenceProvider` reicht nie einen `bible`-Wert an `search()` durch, sodass sowohl der interne Bibeltext-Lookup als auch die Such-Anfrage stets auf `DEFAULT_BIBLE` (`LEB`) auflösen und damit **immer** über Biblia laufen, selbst wenn `key_terms` explizit angegeben wird. Per End-to-End-Test explizit bestätigt (nicht nur vermutet). Eine Behebung würde das Durchreichen einer Nutzerübersetzung durch `get_cross_references` erfordern — außerhalb des Scopes dieser Phase (Auftrag nannte ausdrücklich nur `search_bible`).
2. **Suchqualität ist strukturell einfacher als Biblias Dienst.** `bm25()`-Ranking ohne Stemming/Synonymerweiterung — bereits in [[17_Phase3B_Korpus_Produktentscheidungen]] als erwartetes, akzeptiertes Risiko dokumentiert, hier nicht neu, aber jetzt produktiv beobachtbar (z. B. „love" findet nicht automatisch „loved"/„loves" als separate Formen, sofern `unicode61` sie nicht ohnehin gleich tokenisiert).
3. **Phrasensuche ist strikt.** Eine Anfrage mit mehreren Wörtern verlangt exakte Adjazenz — Nutzer, die eine lockere „enthält alle Wörter irgendwo"-Suche erwarten (wie es Biblias tatsächliches Verhalten gewesen sein könnte, aber wegen P1 nie verifizierbar war, siehe [[15_Biblia_Restabhaengigkeit_Analyse]]), bekommen möglicherweise weniger Treffer als erwartet. Bewusste, dokumentierte Designentscheidung (Abschnitt 3), keine Falle, aber ein Verhaltensunterschied.
4. **Keine Deduplizierung/gemeinsame Verbindung zwischen `LocalBibleTextProvider` und `LocalSearchProvider`.** Zwei unabhängige SQLite-Verbindungen auf dieselbe Datei — unkritisch (SQLite unterstützt parallele Leser problemlos), aber eine spätere Optimierung könnte beide Provider eine gemeinsame Verbindung teilen lassen.
5. **Kein Zweitquellen-Abgleich der Suchergebnisse selbst**, nur der zugrundeliegende Text wurde bereits in Phase 3D-1/3D-2/3D-3 verifiziert — die Suchqualität/Rankingsinnhaftigkeit wurde nur stichprobenartig manuell begutachtet (Abschnitt 5), nicht systematisch bewertet.

---

## 7. Vorgeschlagene Commit-Nachricht

```
feat: add LocalSearchProvider with local-first routing and Biblia fallback for search_bible (Phase 3D-6)
```

---

**Kein Commit, kein Tag, kein Push.** Warte auf Freigabe.
