# 16 — Logos MCP 2.0: Zielarchitektur (Phase-2-Abschluss)

**Status: Architektur-Dokumentation. Keine Codeänderung, kein Refactoring, kein Commit, kein Tag, kein Push.**

Dieses Dokument beschreibt die vorgeschlagene Zielarchitektur für Logos MCP 2.0 auf Basis der in Phase 1 und Phase 2 durchgeführten Analysen — insbesondere [[11_MCP2_Architektur_Vorschlag]] (erste Skizze), [[12_Lokale_Datenquellen_Analyse]] (verifizierte Datenlage), [[14_Project_Completion_Report]] (erreichter Stand) und [[15_Biblia_Restabhaengigkeit_Analyse]] (Detailanalyse der 4 verbleibenden Biblia-Tools). Es ist ein **Zielbild und Migrationsplan**, kein Implementierungsstand — jede hier beschriebene Komponente, die noch nicht existiert, ist explizit als „geplant"/„neu" markiert.

---

## 1. Zielarchitektur

### Leitprinzipien

1. **Lokal-first:** Jede Datenabfrage wird zuerst gegen eine lokale Quelle aufgelöst — Logos' eigene SQLite-Datenbanken, den Bibliothekskatalog oder einen gebündelten Public-Domain-Textkorpus. Externe Netzwerkaufrufe (Biblia API) sind **optional**, nicht zwingend.
2. **Biblia als reiner Fallback, nicht als Kernabhängigkeit:** Der Server startet und die Kernfunktionen laufen vollständig **ohne** `BIBLIA_API_KEY`. Ein fehlender/ungültiger Key schränkt nur einzelne Erweiterungsfälle ein (z. B. die urheberrechtlich geschützte Übersetzung `LEB`), nicht den Betrieb insgesamt.
3. **Provider-Abstraktion statt direkter API-Kopplung:** Der Tool-Layer (`index.ts`) kennt keine Implementierungsdetails mehr (weder Biblia noch lokale SQLite-Struktur) — er ruft ausschließlich stabile Provider-Interfaces auf.
4. **Kein Verhaltensbruch für bereits migrierte/funktionierende Tools:** Die 16 Tools, die laut [[14_Project_Completion_Report]] bereits lokal-first oder UI-basiert funktionieren (`compare_passages`, `scan_references`, `get_available_bibles`, alle SQLite- und UI-Tools), werden von dieser Zielarchitektur **nicht** angetastet.
5. **Jeder Migrationsschritt einzeln test- und commit-fähig**, konsistent mit der bisherigen Vorgehensweise (siehe [[06_Roadmap]], [[13_Implementierungsplan_Migration]]).

### Zielbild (High-Level)

```
┌────────────┐   stdio (MCP)   ┌───────────────────────────────────────────┐
│ Claude Code│ ◄─────────────► │  logos-mcp-server (Node)                   │
└────────────┘                 │  src/index.ts — 20 Tools, dünner Layer     │
                                └───────────────────┬─────────────────────┘
                                                     │
        ┌───────────────────┬────────────────────┬─┴───────────────┬──────────────────────┐
        ▼                   ▼                    ▼                  ▼                       ▼
 Provider-Layer (NEU)  Provider-Layer (NEU) Provider-Layer (NEU) sqlite-reader /       services/logos-app.ts
 BibleTextProvider     SearchProvider       CrossReferenceProvider catalog-reader        (unverändert, macOS
 (lokal-first)         (lokal-first)        + TranslationProvider  (unverändert)          `logos4:`-URLs)
        │                   │                    │                  │                       │
        ▼                   ▼                    ▼                  ▼                       ▼
 LocalBibleTextProvider  LocalSearchProvider  komponiert aus      10 lokale .db-Dateien   Logos.app (macOS)
 (SQLite-Korpus, neu)    (SQLite FTS5, neu)    Bible-/Search-       (read-only)
        │                   │                   Provider
        ▼                   ▼
 BibliaBibleTextProvider BibliaSearchProvider
 (bestehend, Fallback)   (bestehend, Fallback)
```

Die drei bereits heute lokal-first arbeitenden Kanäle (SQLite-Lesezugriff, Katalog, macOS-URL-Steuerung) bleiben unverändert. Neu ist ausschließlich die **Provider-Schicht** zwischen `index.ts` und den vier verbleibenden Biblia-abhängigen Tools.

---

## 2. Komponenten

| Komponente | Datei (bestehend/geplant) | Status | Verantwortung |
|---|---|---|---|
| MCP Tool-Layer | `src/index.ts` | bestehend, Vertrag unverändert | Registriert 20 Tools, delegiert an Provider bzw. bestehende Services, formatiert Markdown-Antworten |
| `BibleTextProvider` (Interface) | `src/services/providers/bible-text-provider.ts` | **neu** | Abstrahiert Bibeltext-Abruf (`resolveText`) |
| `LocalBibleTextProvider` | `src/services/providers/local-bible-text-provider.ts` | **neu** | Lookup gegen gebündelten PD-Textkorpus (SQLite) |
| `BibliaBibleTextProvider` | `src/services/providers/biblia-bible-text-provider.ts` | **neu** (dünner Wrapper um bestehendes `biblia-api.ts`) | Fallback via Biblia REST API |
| `SearchProvider` (Interface) | `src/services/providers/search-provider.ts` | **neu** | Abstrahiert Volltextsuche |
| `LocalSearchProvider` | `src/services/providers/local-search-provider.ts` | **neu** | SQLite-FTS5-Suche über denselben Korpus |
| `BibliaSearchProvider` | `src/services/providers/biblia-search-provider.ts` | **neu** (Wrapper um bestehendes `biblia-api.ts`) | Fallback via Biblia-Suche |
| `CrossReferenceProvider` (Interface) | `src/services/providers/cross-reference-provider.ts` | **neu** | Abstrahiert Cross-Reference-Ermittlung |
| `HeuristicCrossReferenceProvider` | `src/services/providers/heuristic-cross-reference-provider.ts` | **neu** (bestehende Stopword-Heuristik aus `index.ts` extrahiert) | Komponiert `BibleTextProvider` + `SearchProvider` zu Stichwort-basierten Cross-References |
| `TranslationProvider` (Interface) | `src/services/providers/translation-provider.ts` | **neu** | Abstrahiert „welche Übersetzungen sind verfügbar" |
| `LocalTranslationProvider` | `src/services/providers/local-translation-provider.ts` | **neu** (Wrapper um bestehendes `catalog-reader.getInstalledBibles`) | Liest installierte Übersetzungen aus `catalog.db` |
| `BibleTextResolver` / `SearchResolver` | `src/services/providers/resolver.ts` | **neu** | Orchestriert Priorisierung „lokal zuerst, Biblia nur bei Bedarf + Key" |
| `services/biblia-api.ts` | bestehend | **unverändert im Kern**, nur noch von den `Biblia*Provider`-Wrappern aufgerufen statt direkt von `index.ts` | Biblia-REST-Client |
| `services/sqlite-reader.ts`, `services/catalog-reader.ts` | bestehend | unverändert | Notizen, Highlights, Favoriten, Workflows, Katalog |
| `services/logos-app.ts` | bestehend | unverändert | macOS-URL-Steuerung |
| `services/reference-parser.ts`, `reference-compare.ts`, `reference-scanner.ts`, `data/versification.ts` | bestehend | unverändert, aber von `LocalBibleTextProvider` mitgenutzt (Referenz → Zeilenbereich) | Referenzlogik |
| `services/utils/strip-markup.ts` | bestehend | unverändert | Textbereinigung |
| `config.ts` | bestehend | **erweitert** (siehe Abschnitt 9) | Zentrale Konfiguration inkl. neuer Provider-Parameter |

---

## 3. Datenfluss

### 3.1 Neuer Fluss für die 4 verbleibenden Tools (Zielbild)

```
Claude ──tool call──► index.ts ──► Resolver (BibleTextResolver / SearchResolver)
                                          │
                          ┌───────────────┴───────────────┐
                          ▼                                 ▼
              1. Frage LocalBibleTextProvider /   2. Nur falls (a) Übersetzung dort
                 LocalSearchProvider                  nicht abgedeckt UND
                          │                            (b) BIBLIA_API_KEY gesetzt:
                          │                            Frage Biblia*Provider
                          ▼                                 ▼
                 Treffer? ──ja──► BibleTextResult /   Treffer? ──ja──► dito
                 BibleSearchResult                          │
                          │                                  ▼ nein
                          │                          Fehler: „Übersetzung X ist
                          │                          weder lokal gebündelt noch
                          │                          über Biblia erreichbar
                          │                          (kein/ungültiger Key)."
                          ▼
                 index.ts formatiert Markdown
                          │
                          ▼
                    Claude erhält Ergebnis
```

### 3.2 `get_cross_references` (Zielbild)

```
Claude ──tool call──► index.ts ──► HeuristicCrossReferenceProvider.findCrossReferences(passage, keyTerms?)
                                          │
                          ┌───────────────┴───────────────┐
                          ▼                                 ▼
              kein keyTerms: BibleTextResolver          keyTerms gegeben:
              .resolveText(passage) → Stichwort-        direkt weiter zu Suche
              extraktion (Stopword-Filter, wie bisher)
                          │
                          ▼
              SearchResolver.search(keyTerms/Stichwörter)
                          │
                          ▼
              Selbstreferenz-Ausschluss (wie bisher)
                          │
                          ▼
                 index.ts formatiert Markdown
```

### 3.3 Unveränderte Flüsse

Die SQLite-Lesefluss- und UI-Steuerungsflüsse aus [[05_Datenfluss]] Abschnitt 2 und 3 bleiben exakt wie beschrieben — diese Architektur ändert ausschließlich den in [[05_Datenfluss]] Abschnitt 1 beschriebenen Biblia-API-Fluss, und auch dort nur für die 4 noch offenen Tools.

---

## 4. Provider-Modell

Alle vier Provider-Typen (Bibeltext, Suche, Cross-Reference, Übersetzung) folgen demselben strukturellen Muster:

1. **Ein schlankes TypeScript-Interface** pro Datentyp, unabhängig von der konkreten Quelle (lokal oder Biblia).
2. **Mindestens eine lokale Implementierung** (`Local*Provider`), die ohne Netzwerk und ohne API-Key funktioniert.
3. **Optional eine Biblia-Implementierung** (`Biblia*Provider`) als dünner Wrapper um das bestehende, unveränderte `biblia-api.ts`.
4. **Ein Resolver** pro Datentyp, der die Priorisierung kapselt: „frage zuerst lokal, frage Biblia nur wenn nötig und erlaubt". Der Resolver ist die **einzige** Stelle, die beide Implementierungen kennt — weder `index.ts` noch die einzelnen Provider kennen sich gegenseitig.
5. **Einheitliches Ergebnis-Envelope** (optional, siehe Abschnitt 15): Rückgabewerte können um ein `source: "local" | "biblia"`-Feld ergänzt werden, um Diagnose/Transparenz zu ermöglichen (siehe [[11_MCP2_Architektur_Vorschlag]] Schritt 5 / Abschnitt 13 dieses Dokuments), ohne den bestehenden Tool-Vertrag zu brechen (optionales Feld, additive Änderung).

Der `TranslationProvider` ist ein Sonderfall: Er hat **keinen** sinnvollen Biblia-Fallback mehr, da `catalog.db` (bereits implementiert für `get_available_bibles`) eine strikt reichhaltigere Quelle ist (70 vs. 6 Übersetzungen, siehe [[12_Lokale_Datenquellen_Analyse]] §2). Er wird dennoch als formales Provider-Interface geführt, um konsistent mit den anderen drei zu bleiben und künftige Erweiterungen (z. B. Kennzeichnung „lokal durchsuchbar" vs. „nur installiert", siehe [[13_Implementierungsplan_Migration]] Tool 1 Risiko) strukturell vorzubereiten.

---

## 5. Bibeltext-Provider

**Zweck:** Ersetzt die direkten Aufrufe von `getBibleText()` in `get_bible_text` und `get_passage_context`.

```ts
interface BibleTextProvider {
  supports(translation: string): boolean;
  resolveText(passage: string, translation: string): Promise<BibleTextResult>;
}
```

- **`LocalBibleTextProvider`** (neu): hält eine gebündelte SQLite-Datenbank mit einer Verse-Tabelle (`book`, `chapter`, `verse`, `translation`, `text`) für die gemeinfreien Übersetzungen `KJV`, `ASV`, `DARBY`, `YLT`, `WEB` (siehe [[15_Biblia_Restabhaengigkeit_Analyse]] Abschnitt 4: 5 von 6 aktuell genutzten Codes sind bereits public domain). `resolveText()` übersetzt die Referenz per `reference-parser.ts`/`versification.ts` in einen Zeilenbereich und liefert einen zusammengesetzten Text. `supports()` prüft nur Mitgliedschaft in der bekannten Übersetzungsliste — kein Netzwerk, keine Ausnahme im Normalfall.
- **`BibliaBibleTextProvider`** (neu, Wrapper): ruft unverändert `getBibleText()` aus `biblia-api.ts` auf. `supports()` liefert immer `true` (Biblia deckt formal alle 6 Codes ab, inkl. `LEB`), wird vom Resolver aber nur konsultiert, wenn `LocalBibleTextProvider.supports()` `false` liefert oder ein Key explizit für eine nicht-lokale Übersetzung angefragt wird.
- **`get_passage_context`** bleibt strukturell unverändert: Es ruft weiterhin zuerst lokal `expandRange()` (`reference-parser.ts`, unverändert) auf, um den erweiterten Referenzbereich zu bilden, und übergibt diesen dann an denselben `BibleTextResolver` wie `get_bible_text`.
- **Sonderfall `LEB`:** Da `LEB` nicht gemeinfrei ist, liefert `LocalBibleTextProvider.supports("LEB")` `false` — jede `LEB`-Anfrage geht damit automatisch (transparent für den Nutzer, aber abhängig vom Key) an `BibliaBibleTextProvider`. Siehe Abschnitt 9 zur Default-Übersetzungs-Entscheidung.

---

## 6. Cross-Reference-Provider

**Zweck:** Formalisiert die bereits heute in `index.ts` (Zeilen 96–133) inline implementierte Heuristik als eigene, testbare Komponente.

```ts
interface CrossReferenceProvider {
  findCrossReferences(passage: string, keyTerms?: string): Promise<CrossReferenceResult>;
}
```

- **`HeuristicCrossReferenceProvider`** (neu, reine Extraktion des bestehenden Codes, keine Verhaltensänderung): 
  1. Falls `keyTerms` übergeben ist, wird direkt gesucht.
  2. Sonst: `BibleTextResolver.resolveText(passage)` → Stopword-gefilterte Extraktion der ersten 5 relevanten Wörter (identische Stopword-Liste und Logik wie aktuell in `index.ts`, unverändert übernommen).
  3. `SearchResolver.search(stichwörter, { limit: 15 })`.
  4. Selbstreferenz-Ausschluss (Treffer mit `title === passage` werden gefiltert, wie bisher).
- **Wichtige Klarstellung (siehe auch [[15_Biblia_Restabhaengigkeit_Analyse]] Risiko 5):** Dieser Provider liefert **keine kuratierten Cross-Reference-Daten** (wie z. B. eine „Treasury of Scripture Knowledge"-Datenbank), sondern bleibt strukturell eine Stichwort-Heuristik — unabhängig davon, ob die zugrundeliegenden `BibleText`-/`Search`-Aufrufe lokal oder über Biblia beantwortet werden. Die Migration verbessert die Datenquelle, nicht die fachliche Qualität der Cross-Reference-Logik selbst.
- **Erweiterungspunkt (nicht Teil dieser Phase):** Das Interface ist bewusst so geschnitten, dass eine spätere `CuratedCrossReferenceProvider`-Implementierung (z. B. auf Basis einer separat zu beschaffenden, gemeinfreien Cross-Reference-Datenquelle) denselben Vertrag erfüllen und ohne Änderung am Tool-Layer eingesetzt werden könnte — siehe Abschnitt 13.

---

## 7. Search-Provider

**Zweck:** Ersetzt die direkten Aufrufe von `searchBible()` in `search_bible` und `get_cross_references`.

```ts
interface SearchProvider {
  supports(translation: string): boolean;
  search(query: string, options?: { translation?: string; limit?: number; mode?: string }): Promise<BibleSearchResult>;
}
```

- **`LocalSearchProvider`** (neu): baut auf derselben SQLite-Datei wie `LocalBibleTextProvider` auf, zusätzlich eine **FTS5-Virtual-Table** über die Verse-Texte der gebündelten Übersetzungen. Ranking über `bm25()` (SQLite-eingebaut). Query-Escaping für FTS5-Sonderzeichen ist notwendig (Risiko, siehe Abschnitt 19).
- **`BibliaSearchProvider`** (neu, Wrapper): ruft unverändert `searchBible()` aus `biblia-api.ts` auf.
- **Feldmapping-Altlast (P3):** Bei der Neuimplementierung des lokalen Providers wird das bestehende, unverifizierte `title`-Feld **nicht** unreflektiert übernommen (siehe [[15_Biblia_Restabhaengigkeit_Analyse]] Risiko 8) — `LocalSearchProvider` definiert sein Rückgabeformat unabhängig und explizit (`title` = menschenlesbare Referenz, `preview` = Fundstellen-Ausschnitt).
- **Erwartungsmanagement:** Die Tool-Beschreibung von `search_bible` sollte im Zuge der Umsetzung klarstellen, dass die lokale Suchrelevanz einfacher ist als Biblias produktiver Suchdienst (siehe [[15_Biblia_Restabhaengigkeit_Analyse]] Risiko 4).

---

## 8. Translation-Provider

**Zweck:** Formalisiert das bereits produktive `get_available_bibles`-Tool als Provider-Interface, konsistent mit den anderen drei.

```ts
interface TranslationProvider {
  listAvailable(query?: string): Promise<TranslationInfo[]>;
}

interface TranslationInfo {
  resourceId: string;
  title: string;
  abbreviatedTitle: string | null;
  languages: string[];
  publishers: string[];
  locallyRetrievable: boolean;   // NEU: deckt LocalBibleTextProvider diese Übersetzung ab?
}
```

- **`LocalTranslationProvider`** (neu, dünner Wrapper): ruft unverändert `getInstalledBibles()` aus `catalog-reader.ts` auf — **keine Änderung an `catalog-reader.ts` selbst nötig**.
- **Neues Feld `locallyRetrievable`:** schließt die in [[13_Implementierungsplan_Migration]] (Tool 1, Risiko „Semantischer Bruch") beschriebene Erwartungslücke — `get_available_bibles` kann künftig kennzeichnen, welche der 70 installierten Übersetzungen tatsächlich über `get_bible_text`/`search_bible` abrufbar sind (die 5 gebündelten PD-Übersetzungen plus `LEB`, falls Biblia-Key gesetzt) vs. nur als Metadatensatz sichtbar sind. Diese Erweiterung ist additiv (neues optionales Feld) und bricht den bestehenden Tool-Vertrag nicht.
- Kein `BibliaTranslationProvider` vorgesehen — die bereits vorhandene, aber tote `getAvailableBibles()`-Funktion in `biblia-api.ts` (siehe [[15_Biblia_Restabhaengigkeit_Analyse]] Randbefund) wird im Zuge der Bereinigung entfernt, nicht reaktiviert.

---

## 9. Konfiguration

Erweiterung von `config.ts` (Zielbild, additiv zum Bestehenden):

| Variable | Status | Default (Vorschlag) | Zweck |
|---|---|---|---|
| `LOGOS_DATA_DIR`, `LOGOS_CATALOG_DIR` | bestehend, unverändert | Autodetection | wie bisher |
| `BIBLIA_API_KEY` | bestehend, **Bedeutung geändert**: nicht mehr Kernvoraussetzung | leer erlaubt | aktiviert nur noch den Biblia-Fallback (v. a. `LEB`) |
| `BIBLIA_API_BASE` | bestehend, unverändert | `https://api.biblia.com/v1/bible` | — |
| `LOCAL_BIBLE_CORPUS_PATH` | **neu** | gebündelter Pfad im Repo (Phase-B-Entscheidung, siehe Abschnitt 18) | Pfad zur SQLite-Korpusdatei für `LocalBibleTextProvider`/`LocalSearchProvider` |
| `DEFAULT_BIBLE` | bestehend, **Wert zur Entscheidung** | `WEB` oder `KJV` (statt `LEB`) — offene Entscheidung, siehe Abschnitt 18 Phase B | Default-Übersetzung für `get_bible_text` ohne explizite Angabe |
| `LOGOS_URL_BASE`, `SERVER_NAME`, `SERVER_VERSION` | bestehend, unverändert | — | — |

**Designprinzip:** Kein neuer Pflicht-Parameter. Fehlt `LOCAL_BIBLE_CORPUS_PATH` (z. B. bei optionalem Download statt Repo-Bündelung, siehe Abschnitt 18), meldet `LocalBibleTextProvider.supports()` konsequent `false` für alle Übersetzungen, und der Resolver fällt — falls möglich — auf Biblia zurück, statt hart zu fehlern. Der Server bleibt in jeder Konfigurationskombination startfähig.

---

## 10. Caching

**Ist-Zustand (unverändert für alle bestehenden Tools):** Kein Cache, kein persistenter Zustand im Server — jeder Tool-Aufruf öffnet/schließt seine DB-Verbindung neu (`openDb()` … `db.close()` in `finally`, siehe [[02_Architektur]]). Diese Eigenschaft bleibt für `sqlite-reader.ts`/`catalog-reader.ts` bewusst unverändert (Einfachheit, keine Stale-Data-Risiken bei einer App, die parallel läuft und sich ändert).

**Zielbild für die neue Provider-Schicht:**

- **`LocalBibleTextProvider`/`LocalSearchProvider`:** Der gebündelte Korpus ist **statisch** (wird nur durch einen expliziten Build-Schritt neu erzeugt, nicht zur Laufzeit verändert) — daher ist eine SQLite-Verbindung hier **unkritisch dauerhaft offenbar**, im Gegensatz zu den Logos-eigenen `.db`-Dateien, die sich während der Nutzung ändern können. Empfehlung: eine einzige, langlebige Read-Only-Verbindung pro Serverprozess statt Öffnen/Schließen pro Aufruf — spart wiederholten Dateisystem-Overhead ohne Stale-Data-Risiko, da die Datei nie extern verändert wird.
- **Kein Anwendungs-Cache für Lookup-Ergebnisse nötig:** Lokale SQLite-Lookups gegen einen kleinen, indexierten Korpus (siehe Abschnitt 12) sind bereits im Sub-Millisekunden-Bereich — ein zusätzlicher In-Memory-Cache (z. B. LRU über zuletzt abgefragte Referenzen) wäre Komplexität ohne meaningfulen Performancegewinn und wird **nicht** empfohlen.
- **Optionaler, klar abgegrenzter Cache für den Biblia-Fallback:** Da Netzwerkaufrufe (Timeout aktuell 10s, `biblia-api.ts:4`) im Vergleich zu lokalen Lookups teuer sind, wäre ein kurzlebiger In-Memory-Cache (TTL wenige Minuten) für `BibliaBibleTextProvider`/`BibliaSearchProvider`-Antworten sinnvoll — reduziert wiederholte Netzwerklatenz und ist rücksichtsvoll gegenüber Biblias Rate-Limits. **Nicht Bestandteil dieser Phase**, sondern eine spätere, unabhängige Optimierung (siehe [[06_Roadmap]] Phase 6 „Caching-Schicht").
- **Keine Invalidierungslogik nötig** für den gebündelten Korpus, da er nie zur Laufzeit verändert wird — vereinfacht die Cache-Entscheidung erheblich gegenüber einem hypothetischen „lokalen Spiegel, der synchron gehalten werden müsste".

---

## 11. Fehlerbehandlung

**Ist-Zustand (Risiko P5, [[07_Bekannte_Probleme]]):** Uneinheitlich — nur `get_library_catalog`/`get_resource_types` fangen Exceptions explizit ab; alle Biblia- und die meisten DB-Tools lassen Exceptions ungefangen durchreichen.

**Zielbild — einheitliche Fehlertaxonomie für die Provider-Schicht:**

| Fehlerklasse | Beispiel | Verhalten |
|---|---|---|
| **„Lokal nicht abgedeckt" (kein Fehler)** | `LocalBibleTextProvider.supports("LEB")` → `false` | Kein Wurf, kein Log-Rauschen — Resolver geht transparent zum nächsten Provider über |
| **„Kein Fallback verfügbar"** | `LEB` angefragt, `LocalBibleTextProvider` deckt nicht ab, `BIBLIA_API_KEY` leer | `isError: true` mit Klartext: „LEB ist lokal nicht verfügbar und erfordert einen Biblia-API-Key (siehe README)." — kein technischer Stacktrace |
| **Korpus-Fehler** | gebündelte SQLite-Datei fehlt/korrupt | `isError: true`, analog zum bereits bewährten Muster `openCatalogDbSafely()` in `catalog-reader.ts` (keine Pfad-Leaks, verständliche Meldung) |
| **Biblia-Netzwerkfehler** | Timeout, 4xx/5xx (wie aktuell P1) | `isError: true` mit Klartext inkl. Statuscode — Verhalten von `bibliaFetch()` bleibt hier inhaltlich unverändert, wird aber vom Resolver/Provider-Wrapper gefangen statt ungefangen durchgereicht |
| **Query-Fehler (z. B. ungültige FTS5-Syntax)** | Sonderzeichen in `search_bible`-Query | Escaping vor der Query (siehe Abschnitt 19), Restfehler als `isError: true` mit „Suchanfrage konnte nicht verarbeitet werden" |

**Konsequenz für `index.ts`:** Alle vier verbleibenden Tools erhalten dasselbe try/catch-Muster wie bereits `get_library_catalog` — dies behebt P5 **für diese vier Tools** als Nebeneffekt der Migration, ohne dass P5 vollständig (für alle 20 Tools) in dieser Phase gelöst werden muss.

---

## 12. Performance

- **Korpusgröße (Schätzung):** 5 Übersetzungen × ca. 31.100 Verse (siehe Versifikationstabelle, [[14_Project_Completion_Report]]) × durchschnittlich ~100–150 Byte Text ≈ **15–25 MB Rohtext gesamt**, plus FTS5-Index (typischerweise 1–3× Rohtextgröße) ≈ **insgesamt niedriger zweistelliger MB-Bereich**. Zum Vergleich: deutlich kleiner als bereits vorhandene Logos-Nebendaten wie `AutoComplete.db` (502 MB) oder `AtlasCache.db` (44 MB), siehe [[12_Lokale_Datenquellen_Analyse]] §1.
- **Lookup-Latenz:** Ein indizierter SQLite-Bereichs-Select (`get_bible_text`) liegt typischerweise im Sub-Millisekunden- bis niedrigen einstelligen Millisekundenbereich auf lokaler SSD — um Größenordnungen schneller als ein Netzwerk-Roundtrip zu `api.biblia.com` (Timeout aktuell auf 10s ausgelegt, `biblia-api.ts:4`).
- **FTS5-Suche:** Für einen Korpus dieser Größe (~155.000 Verse über 5 Übersetzungen) ist eine `bm25()`-gerankte FTS5-Abfrage ebenfalls im niedrigen einstelligen Millisekundenbereich zu erwarten — keine gesonderte Performance-Optimierung (Sharding, externe Suchmaschine) nötig.
- **Startup-Kosten:** Einmaliges Öffnen der Korpus-SQLite-Datei beim Serverstart (siehe Abschnitt 10, langlebige Verbindung) — vernachlässigbar gegenüber dem bereits bestehenden Node-Prozessstart.
- **Kein Connection-Pooling nötig:** Der MCP-Server bedient einen interaktiven Chat-Kontext (ein Nutzer, sequenzielle Tool-Aufrufe), keinen Hochlast-Serverbetrieb — die bereits etablierte „öffnen pro Aufruf"-Praxis der übrigen SQLite-Zugriffe ist für dieses Nutzungsprofil ausreichend; nur für den Korpus wird aus den in Abschnitt 10 genannten Gründen (Statik der Datei) eine dauerhafte Verbindung empfohlen, nicht aus Performancegründen.

---

## 13. Erweiterbarkeit

Das Provider-Modell ist bewusst so geschnitten, dass folgende künftige Erweiterungen **ohne Änderung am Tool-Layer** möglich werden:

1. **Weitere gemeinfreie Übersetzungen** (auch nicht-englische, z. B. Luther 1912, Schlachter 1951 — beide public domain) lassen sich als zusätzliche Zeilen im bestehenden Korpusschema ergänzen, ohne Codeänderung an `LocalBibleTextProvider` selbst — reine Datenerweiterung. Adressiert langfristig die in Abschnitt 8 / [[15_Biblia_Restabhaengigkeit_Analyse]] Risiko 6 genannte Sprachlücke gegenüber den 70 in `catalog.db` gelisteten, überwiegend deutschsprachigen Übersetzungen.
2. **Eine kuratierte Cross-Reference-Datenquelle** (z. B. eine gemeinfreie „Treasury of Scripture Knowledge"-artige Tabelle) könnte künftig als `CuratedCrossReferenceProvider` das `CrossReferenceProvider`-Interface aus Abschnitt 6 erfüllen und die heuristische Implementierung ablösen oder ergänzen (Resolver-Priorisierung analog zum Bibeltext-Muster) — bewusst **nicht** Teil dieser Phase, aber architektonisch bereits vorbereitet.
3. **Diagnose-Tool-Integration** (siehe [[06_Roadmap]] Phase 3, bereits als Community-Branch `feature/phase3-diagnose-qa` vorhanden): Mit dem optionalen `source: "local" | "biblia"`-Feld aus Abschnitt 4 kann ein künftiges `diagnose`-Tool pro Provider-Typ anzeigen, welche Quelle tatsächlich geantwortet hat — nicht nur, ob ein Key gesetzt ist.
4. **Plattformunabhängigkeit unverändert:** Die Provider-Schicht ist rein datenbasiert (SQLite, HTTP) und plattformneutral — nur `services/logos-app.ts` (UI-Steuerung) bleibt macOS-spezifisch und wird von dieser Architektur nicht berührt, siehe Nicht-Ziele in [[06_Roadmap]].
5. **Austauschbarkeit des Suchindex:** Sollte FTS5 sich als unzureichend erweisen, kann `LocalSearchProvider` intern ausgetauscht werden (z. B. gegen eine spezialisiertere Indexstruktur), ohne dass `SearchProvider`-Interface oder Aufrufer betroffen sind.

---

## 14. Verzeichnisstruktur

Zielbild, additiv zur bestehenden Struktur (siehe [[03_Projektstruktur]]) — neue Pfade mit „NEU" markiert:

```
logos-mcp-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                                # unverändert im Vertrag, ruft Provider statt biblia-api.ts direkt
│   ├── config.ts                                # erweitert, siehe Abschnitt 9
│   ├── types.ts                                 # erweitert um Provider-/TranslationInfo-Typen
│   ├── data/
│   │   ├── versification.ts                     # unverändert
│   │   └── bible-corpus.db                       # NEU — gebündelte SQLite-Korpusdatei (Phase-B-Entscheidung: hier oder als Download-Asset, siehe Abschnitt 18)
│   ├── services/
│   │   ├── biblia-api.ts                         # unverändert, nur noch von Biblia*Provider-Wrappern aufgerufen; toter Code entfernt (siehe Abschnitt 18 Phase A)
│   │   ├── logos-app.ts                          # unverändert
│   │   ├── sqlite-reader.ts                      # unverändert
│   │   ├── catalog-reader.ts                     # unverändert
│   │   ├── reference-parser.ts                   # unverändert
│   │   ├── reference-compare.ts                  # unverändert
│   │   ├── reference-scanner.ts                  # unverändert
│   │   └── providers/                            # NEU — gesamte Provider-Schicht
│   │       ├── bible-text-provider.ts            # NEU — Interface
│   │       ├── local-bible-text-provider.ts      # NEU
│   │       ├── biblia-bible-text-provider.ts     # NEU (Wrapper)
│   │       ├── search-provider.ts                # NEU — Interface
│   │       ├── local-search-provider.ts          # NEU
│   │       ├── biblia-search-provider.ts         # NEU (Wrapper)
│   │       ├── cross-reference-provider.ts       # NEU — Interface
│   │       ├── heuristic-cross-reference-provider.ts  # NEU
│   │       ├── translation-provider.ts           # NEU — Interface
│   │       ├── local-translation-provider.ts     # NEU (Wrapper um catalog-reader.ts)
│   │       └── resolver.ts                       # NEU — BibleTextResolver, SearchResolver
│   └── utils/
│       └── strip-markup.ts                       # unverändert
├── tests/
│   ├── reference-parser.test.ts                  # unverändert
│   ├── reference-compare.test.ts                 # unverändert
│   ├── reference-scanner.test.ts                 # unverändert
│   ├── catalog-reader.test.ts                    # unverändert
│   ├── versification.test.ts                     # unverändert
│   ├── strip-markup.test.ts                       # unverändert
│   └── providers/                                 # NEU
│       ├── local-bible-text-provider.test.ts     # NEU
│       ├── local-search-provider.test.ts         # NEU
│       ├── heuristic-cross-reference-provider.test.ts  # NEU
│       ├── local-translation-provider.test.ts    # NEU
│       └── resolver.test.ts                       # NEU — Fallback-Matrix (siehe Abschnitt 19)
├── scripts/
│   └── build-bible-corpus.ts                      # NEU — einmaliges Build-Skript, Rohtext → SQLite+FTS5 (kein Laufzeitpfad)
└── dist/                                           # kompiliertes Build-Ergebnis, unverändert im Prinzip
```

---

## 15. API-Design

### Tool-Layer (öffentlicher MCP-Vertrag — unverändert)

Alle vier betroffenen Tools behalten exakt ihre bestehende Signatur (Name, Parameter, Rückgabeformat `{ content: [...], isError?: boolean }`) — die Migration ist rein intern. Das ist ein bewusstes Designziel: **kein Breaking Change für Claude/den Nutzer.**

```ts
// unverändert:
get_bible_text(passage: string, bible?: string): ToolResult
get_passage_context(passage: string, context_verses?: number, bible?: string): ToolResult
search_bible(query: string, limit?: number, bible?: string): ToolResult
get_cross_references(passage: string, key_terms?: string): ToolResult
```

### Provider-Interfaces (intern, neu)

```ts
interface BibleTextProvider {
  supports(translation: string): boolean;
  resolveText(passage: string, translation: string): Promise<BibleTextResult>;
}

interface SearchProvider {
  supports(translation: string): boolean;
  search(query: string, options?: SearchOptions): Promise<BibleSearchResult>;
}

interface CrossReferenceProvider {
  findCrossReferences(passage: string, keyTerms?: string): Promise<CrossReferenceResult>;
}

interface TranslationProvider {
  listAvailable(query?: string): Promise<TranslationInfo[]>;
}

// Erweiterung von BibleTextResult / BibleSearchResult (additiv, optional):
interface BibleTextResult {
  passage: string;
  text: string;
  bible: string;
  source?: "local" | "biblia";   // NEU, optional — für Diagnose (Abschnitt 13)
}
```

### Resolver-Vertrag

```ts
class BibleTextResolver implements BibleTextProvider {
  constructor(local: LocalBibleTextProvider, biblia: BibliaBibleTextProvider | null);
  supports(translation: string): boolean;               // true, wenn lokal ODER Biblia (mit Key) verfügbar
  resolveText(passage: string, translation: string): Promise<BibleTextResult>;
    // 1. local.supports(translation) ? local.resolveText(...) 
    // 2. sonst: biblia !== null ? biblia.resolveText(...) 
    // 3. sonst: Error „nicht verfügbar" (siehe Abschnitt 11)
}
```

`SearchResolver` folgt demselben Muster für `SearchProvider`.

---

## 16. Klassendiagramm

```
                        «interface»
                     BibleTextProvider
                 ┌───────────────────────┐
                 │ + supports(t): bool   │
                 │ + resolveText(p,t)    │
                 └───────────┬───────────┘
                              △
              ┌───────────────┴────────────────┐
              │                                  │
 LocalBibleTextProvider              BibliaBibleTextProvider
 ┌──────────────────────┐            ┌──────────────────────┐
 │ - corpusDb            │            │ - (nutzt biblia-api)  │
 │ + supports(t)         │            │ + supports(t)=true    │
 │ + resolveText(p,t)     │            │ + resolveText(p,t)     │
 └──────────────────────┘            └──────────────────────┘
              △                                  △
              │ verwendet                        │ verwendet
              └────────────────┬─────────────────┘
                                │
                     BibleTextResolver
                 ┌───────────────────────┐
                 │ - local: Local...     │
                 │ - biblia: Biblia...?  │
                 │ + resolveText(p,t)    │
                 └───────────┬───────────┘
                              △ verwendet
                              │
                       index.ts (Tool-Layer)
                              │ verwendet auch
              ┌───────────────┼────────────────────────┬─────────────────────┐
              ▼                                          ▼                     ▼
      SearchResolver                        HeuristicCrossReferenceProvider   LocalTranslationProvider
 ┌───────────────────────┐                ┌──────────────────────────────┐  ┌───────────────────────┐
 │ - local: LocalSearch..  │  verwendet──►│ - bibleText: BibleTextResolver │  │ - (nutzt catalog-      │
 │ - biblia: BibliaSearch..│               │ - search: SearchResolver       │  │   reader.ts)            │
 │ + search(q, opts)      │◄──verwendet──│ + findCrossReferences(p, kt?)  │  │ + listAvailable(q?)     │
 └───────────────────────┘                └──────────────────────────────┘  └───────────────────────┘
              △
    ┌─────────┴─────────┐
    │                     │
LocalSearchProvider  BibliaSearchProvider
(SQLite FTS5, neu)   (Wrapper um biblia-api.ts)
```

Legende: `△` = „implementiert Interface", Pfeile ohne Dreieck = Nutzungs-/Kompositionsbeziehung.

---

## 17. Sequenzdiagramme

### 17.1 `get_bible_text` — Übersetzung lokal abgedeckt (Happy Path, z. B. `WEB`)

```
1. Claude          → index.ts: get_bible_text(passage="John 3:16", bible="WEB")
2. index.ts         → BibleTextResolver.resolveText("John 3:16", "WEB")
3. Resolver         → LocalBibleTextProvider.supports("WEB")  → true
4. Resolver         → LocalBibleTextProvider.resolveText("John 3:16", "WEB")
5. LocalProvider     → reference-parser.ts: parseReference("John 3:16") → {book:"John", chapter:3, verse:16}
6. LocalProvider     → corpusDb: SELECT text FROM verses WHERE book=... AND chapter=3 AND verse=16 AND translation='WEB'
7. LocalProvider    ← Text zurück
8. Resolver         ← BibleTextResult { passage, text, bible:"WEB", source:"local" }
9. index.ts         ← formatiert Markdown ("**John 3:16** (WEB)\n\n...")
10. Claude          ← Ergebnis
```
Kein Netzwerkaufruf, kein Biblia-Key erforderlich.

### 17.2 `get_bible_text` — Übersetzung nicht lokal gebündelt (`LEB`), Fallback zu Biblia

```
1. Claude          → index.ts: get_bible_text(passage="Romans 8:28")   [kein bible-Parameter → DEFAULT_BIBLE]
2. index.ts         → BibleTextResolver.resolveText("Romans 8:28", DEFAULT_BIBLE)
3. Resolver         → LocalBibleTextProvider.supports(DEFAULT_BIBLE)
      3a. Fall DEFAULT_BIBLE = "WEB" (empfohlen, siehe Abschnitt 18)       → true → weiter wie 17.1
      3b. Fall DEFAULT_BIBLE = "LEB" (bisheriger Default, nicht gemeinfrei) → false → weiter mit Schritt 4
4. Resolver         → BIBLIA_API_KEY gesetzt? 
      4a. nein → Error "LEB ist lokal nicht verfügbar und erfordert einen Biblia-API-Key" → isError:true
      4b. ja   → weiter mit Schritt 5
5. Resolver         → BibliaBibleTextProvider.resolveText("Romans 8:28", "LEB")
6. BibliaProvider   → biblia-api.ts: getBibleText() → bibliaFetch("/content/LEB.txt", {passage})
7. BibliaProvider   ← HTTP 200 + Text  (oder HTTP 4xx/5xx → Error, siehe Abschnitt 11)
8. Resolver         ← BibleTextResult { ..., source:"biblia" }
9. index.ts         ← formatiert Markdown
10. Claude          ← Ergebnis
```

### 17.3 `get_cross_references` — komponierter Ablauf über zwei Provider

```
1. Claude          → index.ts: get_cross_references(passage="Romans 8:28")   [kein key_terms]
2. index.ts         → HeuristicCrossReferenceProvider.findCrossReferences("Romans 8:28")
3. Provider         → BibleTextResolver.resolveText("Romans 8:28", DEFAULT_BIBLE)   [wie 17.1 oder 17.2]
4. Provider         ← Text der Stelle
5. Provider         → Stopword-Filter + Top-5-Wörter extrahieren (unverändert wie bisher)
6. Provider         → SearchResolver.search(stichwörter, {limit:15})
7. SearchResolver    → LocalSearchProvider.supports(DEFAULT_BIBLE)? 
      7a. true  → LocalSearchProvider.search(...)  [FTS5, bm25-Ranking]
      7b. false → BibliaSearchProvider.search(...)  [falls Key gesetzt, sonst Error]
8. Provider         ← Treffer, Selbstreferenz (title == passage) herausgefiltert
9. index.ts         ← formatiert Markdown ("Cross-references for **Romans 8:28**: ...")
10. Claude          ← Ergebnis
```

---

## 18. Migrationsstrategie

Übernimmt und verfeinert den Phasenplan aus [[15_Biblia_Restabhaengigkeit_Analyse]] Abschnitt 9, jetzt mit direktem Bezug zu den in diesem Dokument definierten Komponenten. Jede Phase ist einzeln commit- und testbar (`npm run build && npm test` grün pro Schritt); kein Schritt wird in der aktuellen Dokumentationsphase umgesetzt.

| Phase | Titel | Aufwand | Inhalt | Bezug |
|---|---|---|---|---|
| **A** | Provider-Abstraktion (reines Refactoring) | klein | `BibleTextProvider`/`SearchProvider`/`CrossReferenceProvider`/`TranslationProvider`-Interfaces einführen; `biblia-api.ts` unverändert hinter `Biblia*Provider`-Wrappern verdrahten; `LocalTranslationProvider` als Wrapper um bestehendes `catalog-reader.getInstalledBibles` einführen (kein Verhaltenswechsel bei `get_available_bibles`); toten Code (`parsePassage`, `scanReferences`, `comparePassages`, `getAvailableBibles` in `biblia-api.ts`) entfernen. Test: Tool-Antworten unverändert (Snapshot/Diff) | Abschnitte 4–8, 15 |
| **B** | Offene Produktentscheidungen klären | kein Code | Default-Übersetzung (`LEB` behalten vs. Wechsel zu `WEB`/`KJV`); Bündelungsform (Korpus im Repo vs. optionaler Download); Zielumfang (5 gemeinfreie Übersetzungen oder Teilmenge zuerst) | Abschnitt 9, 17.2 |
| **C** | Korpus beschaffen und aufbereiten | mittel | Gemeinfreien Rohtext sammeln/bereinigen, `scripts/build-bible-corpus.ts` (SQLite-Verse-Tabelle + FTS5-Index), Stichprobenverifikation gegen bekannte Referenzverse | Abschnitt 12, 14 |
| **D** | `LocalBibleTextProvider` + `LocalSearchProvider` implementieren | klein–mittel | `resolveText()`/`search()` gegen Korpus; `get_bible_text`/`get_passage_context`/`search_bible` auf Resolver umstellen; `HeuristicCrossReferenceProvider` folgt automatisch (nutzt dieselben Resolver) | Abschnitte 5, 6, 7, 17.1, 17.3 |
| **E** | Fallback-Priorisierung + Fehlertaxonomie | klein | `BibleTextResolver`/`SearchResolver` mit Priorisierungslogik aus Abschnitt 4; einheitliche Fehlerbehandlung aus Abschnitt 11 für alle vier Tools | Abschnitte 4, 11, 17.2 |
| **F** | Dokumentation aktualisieren | klein | README/[[07_Bekannte_Probleme]] aktualisieren: 0 von 20 Tools mehr zwingend Biblia-abhängig, `LEB`-Sonderfall dokumentieren, P1 herabstufen | — |

Reihenfolge ist bindend bis Phase C (Datenentscheidung vor Korpusaufbau); D–F sind sequenziell auf C aufbauend, aber jeweils klein genug für weitere Unterteilung bei Bedarf.

---

## 19. Risiken

Konsolidiert aus [[15_Biblia_Restabhaengigkeit_Analyse]] Abschnitt 8, ergänzt um architekturspezifische Risiken dieser Provider-Schicht:

| Nr. | Risiko | Beschreibung |
|---|---|---|
| 1 | Lizenz der Default-Übersetzung (`LEB`) | Nicht gemeinfrei — muss vor Phase C entschieden werden (siehe Phase B) |
| 2 | Datenqualität des gebündelten Korpus | ~155.000 Verse (5 × ~31.000) — höheres Fehlerrisiko als bei der bereits einmal fehlerhaften Versifikationstabelle; erfordert systematische Stichprobenverifikation |
| 3 | Repo-Größe | Mehrere MB Korpusdaten — Bündelung im Repo vs. Download muss bewusst entschieden werden (Phase B) |
| 4 | Suchqualität | FTS5-Ranking strukturell einfacher als Biblias produktiver Suchdienst — Erwartungshaltung muss in Tool-Beschreibung kommuniziert werden |
| 5 | `get_cross_references` bleibt Heuristik | Migration verbessert nur die Datenquelle, nicht die fachliche Qualität der Cross-Reference-Logik selbst — Missverständnis „echte Cross-Reference-Datenbank" muss vermieden werden |
| 6 | Sprachlücke bleibt bestehen | Überwiegend deutschsprachige, lokal installierte Übersetzungen bleiben weiterhin nicht durchsuchbar — verstärkt Erwartungslücke zwischen `TranslationProvider` (70 Übersetzungen) und `BibleTextProvider`/`SearchProvider` (5 englische + optional `LEB`) |
| 7 | Kein Ground-Truth-Vergleich | Solange P1 (kompromittierter Biblia-Key) nicht behoben ist, kann Verhaltensparität mit der bisherigen Biblia-Implementierung nicht empirisch verifiziert werden |
| 8 | Feldmapping-Altlast (P3) | Unverifiziertes `title`-vs.-`passage`-Mapping darf nicht unreflektiert in `LocalSearchProvider` übernommen werden |
| 9 | **(neu)** FTS5-Query-Escaping | Nutzereingaben mit FTS5-Sonderzeichen (`"`, `*`, `AND`/`OR`/`NOT` als reservierte Wörter) können ungültige Abfragen erzeugen — braucht Escaping/Validierung vor jeder `LocalSearchProvider.search()`-Anfrage, sonst Fehlerklasse „Query-Fehler" (Abschnitt 11) statt sinnvoller Ergebnisse |
| 10 | **(neu)** Fallback-Matrix-Testaufwand | Vier Kombinationen (lokal verfügbar × Key gesetzt) pro Resolver-Typ müssen einzeln getestet werden (siehe [[11_MCP2_Architektur_Vorschlag]] Schritt 4) — Testaufwand steigt gegenüber der bisherigen Direktkopplung, ist aber durch die Provider-Isolation gut eingrenzbar |
| 11 | **(neu)** Über-Abstraktion bei vorzeitigem Stopp | Wird nur Phase A umgesetzt (Provider-Interfaces) ohne B–D (Korpus), entsteht eine Abstraktionsschicht ohne funktionalen Mehrwert — Phase A sollte nur begonnen werden, wenn eine grundsätzliche Absicht besteht, mindestens bis Phase D fortzusetzen, sonst ist der Aufwand nicht gerechtfertigt |
| 12 | **(neu)** Konfigurationsoberfläche wächst | Ein neuer Pflicht-/Optional-Parameter (`LOCAL_BIBLE_CORPUS_PATH`) erhöht die Setup-Komplexität geringfügig — sollte in Phase F klar dokumentiert werden, insbesondere im Zusammenspiel mit der bereits bestehenden Autodetection-Logik für `LOGOS_DATA_DIR` |

---

## 20. Empfehlung für Phase 3

1. **Phase 3 sollte ausschließlich Migrationsphase A umsetzen** (Provider-Abstraktion, reines Refactoring ohne Verhaltensänderung) — kleinster, risikoärmster Schritt, der sofort Wert liefert (aufgeräumter Code, toter Code entfernt, siehe Randbefund in [[15_Biblia_Restabhaengigkeit_Analyse]]) und alle bestehenden Tests grün hält, ohne von noch offenen Produktentscheidungen abzuhängen.
2. **Phase B (Default-Übersetzung, Bündelungsform, Zielumfang) explizit als Entscheidungspunkt vor Phase 3 oder als expliziter erster Schritt darin behandeln** — nicht stillschweigend annehmen. Konsistent mit der in [[14_Project_Completion_Report]] dokumentierten Lehre „offene Entscheidungen explizit machen, statt sie stillschweigend zu treffen".
3. **Phasen C–F erst nach Phase-B-Entscheidung beginnen**, da sonst laut Risiko 11 eine Abstraktionsschicht ohne funktionalen Mehrwert entstehen könnte.
4. **Kein Big-Bang:** Die sechs Phasen bleiben bewusst einzeln committ- und testbar — passend zur durchgängig eingehaltenen Projektregel „kleine, abgeschlossene Schritte" (siehe Sitzungsvorgaben zu Phase 1 und 2).
5. **P1 (kompromittierter Biblia-Key) unabhängig davon kurzfristig angehen** — ermöglicht sowohl den `LEB`-Sonderfall in der neuen Architektur als auch endlich die Verifikation von P3 (Feldmapping), was aktuell blockiert ist.
6. **Diagnose-Tool-Integration (Abschnitt 13, Punkt 3) als natürliche Erweiterung nach Abschluss von Phase E** einplanen — das `source`-Feld ist dann bereits vorhanden und muss nur noch sichtbar gemacht werden.

---

## Nicht Teil dieses Dokuments

- Keine Codeänderung, keine neue Tool-Implementierung, kein Commit.
- Keine finale Entscheidung zu Lizenz/Bündelungsform des Textkorpus (Phase B) — bewusst als offene Entscheidung an den Nutzer zurückgegeben.
- Keine Bewertung einer kuratierten Cross-Reference-Datenquelle über die in Abschnitt 13 skizzierte Erweiterungsmöglichkeit hinaus.
