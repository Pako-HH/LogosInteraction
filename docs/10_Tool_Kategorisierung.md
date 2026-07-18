# 10 — Tool-Kategorisierung (Analysebericht)

Stand: 2026-07-18. Grundlage: `logos-mcp-server/src/index.ts` (die einzige tatsächlich aktive Tool-Registrierung; siehe [[07_Bekannte_Probleme]] P6 zu totem Parallelcode in `src/tools/*.ts`). Keine Codeänderung durch diese Analyse.

Alle 20 vom Server registrierten Tools lassen sich eindeutig einer von drei Datenquellen zuordnen. Es gibt **kein** Tool, das nur ein reiner Platzhalter/Stub ist — alle 20 sind vollständig implementiert. Kategorie (d) unten listet stattdessen unbenutzten bzw. unverifizierten Code, der Platzhalter-Charakter hat, aber nicht Teil der 20 registrierten Tools ist.

## a) Biblia-API (7 Tools)

Abhängig von `BIBLIA_API_KEY` / `biblia-api.ts`. Aktuell alle durch P1 (403, kompromittierter Key) blockiert.

| # | Tool | Bemerkung |
|---|---|---|
| 2 | `get_bible_text` | Direkter `bibliaFetch`-Aufruf |
| 3 | `get_passage_context` | Ruft intern `getBibleText` auf |
| 4 | `search_bible` | Direkter `bibliaFetch`-Aufruf; betroffen von P3 (Feldnamen unverifiziert) |
| 5 | `get_cross_references` | Ruft intern `getBibleText` + `searchBible` auf; betroffen von P3 |
| 17 | `scan_references` | Direkter `bibliaFetch`-Aufruf |
| 18 | `compare_passages` | Direkter `bibliaFetch`-Aufruf |
| 19 | `get_available_bibles` | Direkter `bibliaFetch`-Aufruf |

## b) Lokale Logos-Daten / SQLite (7 Tools)

Lesen direkt aus den `.db`-Dateien unter `LOGOS_DATA_DIR`/`LOGOS_CATALOG_DIR` (`sqlite-reader.ts`, `catalog-reader.ts`). Aktuell durch P2 blockiert (Fix lokal vorhanden, siehe [[07_Bekannte_Probleme]] P2, noch nicht committet/live verifiziert).

| # | Tool | Quelle |
|---|---|---|
| 6 | `get_user_notes` | `notestool.db` |
| 7 | `get_user_highlights` | `visualmarkup.db` |
| 8 | `get_favorites` | `favorites.db` |
| 9 | `get_reading_progress` | `ReadingLists.db` |
| 12 | `get_study_workflows` | `Workflows.db` |
| 13 | `get_library_catalog` | `catalog.db` |
| 20 | `get_resource_types` | `catalog.db` |

## c) Logos-URL-Schemata (6 Tools)

Steuern die laufende Logos.app über `logos4:`/`logosres:`-URLs und macOS' `open` (`logos-app.ts`). Live getestet, alle funktionsfähig (siehe [[08_Testprotokoll]]). Betroffen von P4 (kein echtes Erfolgs-Feedback aus Logos selbst).

| # | Tool | URL-Schema |
|---|---|---|
| 1 | `navigate_passage` | `logos4:///Bible/...` |
| 10 | `open_word_study` | `logos4:///WordStudy?word=...` |
| 11 | `open_factbook` | `logos4:///Factbook?ref=...` |
| 14 | `open_resource` | `logosres:...` |
| 15 | `open_guide` | `logos4:///Guide?t=...&ref=...` |
| 16 | `search_all` | `logos4:///Search?kind=AllSearch...` |

## d) Platzhalter / unvollständig implementierte oder unverifizierte Logik

Kein registriertes Tool fällt in diese Kategorie. Folgender **nicht als Tool exponierter** Code hat jedoch Platzhalter-Charakter und sollte bei einer Architekturbereinigung berücksichtigt werden:

- **`isLogosRunning()`** (`logos-app.ts`) — vollständig implementiert (AppleScript-Check via `osascript`), aber von keinem der 20 Tools aufgerufen. Kandidat für eine zukünftige Vorprüfung vor UI-Tool-Aufrufen (siehe [[07_Bekannte_Probleme]] P7).
- **`searchBibleInLogos()`** (`logos-app.ts`) — vollständig implementiert, aber unbenutzt; `search_bible` (Tool #4) nutzt stattdessen die Biblia-API, nicht diese Funktion. Namensähnlichkeit ist eine Verwechslungsgefahr (P7).
- **`src/tools/*.ts`** (7 Dateien: `bible-text.ts`, `cross-references.ts`, `navigate.ts`, `reading.ts`, `search.ts`, `user-data.ts`, `workflows.ts`) — vollständige Parallelimplementierung derselben 20 Tools in einem anderen Muster, aber nirgends importiert; toter Code (P6).
- **Feldmapping in `search_bible`/`get_cross_references`** (`r.title`) — Code ist vollständig implementiert, aber **unverifiziert**, da die Biblia-API durchgehend 403 liefert. Laut Doku-Recherche könnte das Feld `passage` statt `title` heißen (P3); Risiko eines „silent failure" (leere Titel ohne Fehlermeldung) nach Behebung von P1.

## Zusammenfassung

| Kategorie | Anzahl Tools | Anteil | Aktueller Blocker |
|---|---|---|---|
| a) Biblia-API | 7 | 35 % | P1 (kompromittierter Key) |
| b) Lokale Logos-Daten | 7 | 35 % | P2 (Fix lokal vorhanden, ungetestet) |
| c) Logos-URL-Schemata | 6 | 30 % | Keiner — funktionsfähig |
| d) Reine Platzhalter unter den 20 Tools | 0 | 0 % | — |
