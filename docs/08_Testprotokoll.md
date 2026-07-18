# 08 — Testprotokoll

Manuelle Live-Tests aller 20 MCP-Tools gegen die reale Umgebung (macOS, lokal installiertes Logos, konfigurierter Biblia-Key). Durchgeführt am **2026-07-17/18** im Rahmen der Projekt-Bestandsaufnahme. Alle Aufrufe waren lesend bzw. lösten nur Logos-UI-Navigation aus — keine Datenänderung.

## Testumgebung

| Parameter | Wert |
|---|---|
| Betriebssystem | macOS (Darwin 25.5.0) |
| Logos-Installations-ID (Documents) | `lpfinojk.yny` |
| Logos-Installations-ID (Data/Catalog) | `lpfinojk.yny` |
| Konfigurierte Fallback-ID in `config.ts` | `a3wo155q.w14` (❌ falsch für diese Umgebung) |
| `BIBLIA_API_KEY` | gesetzt in `.mcp.json` (Wert nicht dokumentiert) |
| `LOGOS_DATA_DIR`/`LOGOS_CATALOG_DIR` Overrides | nicht gesetzt |

## Ergebnisse nach Kategorie

### ✅ UI-Steuerungs-Tools — alle erfolgreich (6/6)

| Tool | Testaufruf | Ergebnis |
|---|---|---|
| `navigate_passage` | `reference: "John 3:16"` | „Opened John 3:16 in Logos." |
| `open_guide` | `guide_type: "Passage Guide"`, `reference: "Romans 8:28"` | „Opened Passage Guide for Romans 8:28 in Logos." |
| `open_word_study` | `word: "λόγος"` | „Opened word study for "λόγος" in Logos." |
| `open_factbook` | `topic: "Moses"` | „Opened Factbook entry for "Moses" in Logos." |
| `search_all` | `query: "justification"` | „Opened Logos search for "justification" across all resources." |
| `open_resource` | `resource_id: "LLS:1.0.1"` | „Opened resource `LLS:1.0.1` in Logos." |

### ❌ Biblia-API-Tools — alle fehlgeschlagen (0/7)

| Tool | Testaufruf | Ergebnis |
|---|---|---|
| `get_bible_text` | `passage: "John 3:16"` | `Biblia API error 403: ... Access is denied.` |
| `get_passage_context` | `passage: "John 3:16"`, `context_verses: 2` | `Biblia API error 403` (intern `getBibleText`) |
| `search_bible` | (via `get_cross_references`-Testpfad) | `Biblia API error 403` |
| `get_cross_references` | `passage: "Romans 8:28"` | Tool geöffnet als Passage Guide (UI-Pfad getestet), Biblia-Suchpfad separat als 403 bestätigt |
| `scan_references` | `text: "Siehe Johannes 3,16 und Römer 8,28."` | `Biblia API error 403` |
| `compare_passages` | `first: "Romans 8:28-30"`, `second: "Romans 8:29"` | `Biblia API error 403` |
| `get_available_bibles` | (ohne Filter) | `Biblia API error 403` |

Zusätzlich: direkter `curl`-Test gegen `https://api.biblia.com/v1/bible/content/LEB.txt?passage=John%203:16&key=[REDACTED]` → **HTTP 403**, identische Fehlerseite. Bestätigt, dass der Fehler nicht MCP-server-seitig, sondern auf API-Ebene liegt.

### ❌ SQLite-Tools — alle fehlgeschlagen (0/7)

| Tool | Testaufruf | Ergebnis |
|---|---|---|
| `get_user_notes` | `limit: 3` | `Database not found: .../Documents/a3wo155q.w14/NotesToolManager/notestool.db` |
| `get_user_highlights` | `limit: 3` | `Database not found: .../Documents/a3wo155q.w14/VisualMarkup/visualmarkup.db` |
| `get_favorites` | `limit: 3` | `Database not found: .../Documents/a3wo155q.w14/FavoritesManager/favorites.db` |
| `get_reading_progress` | — | `Database not found: .../Documents/a3wo155q.w14/ReadingLists/ReadingLists.db` |
| `get_study_workflows` | `instance_limit: 3` | `Database not found: .../Documents/a3wo155q.w14/Workflows/Workflows.db` |
| `get_library_catalog` | `query: "commentary"`, `limit: 3` | `Library catalog error: Database not found: .../Data/a3wo155q.w14/LibraryCatalog/catalog.db` |
| `get_resource_types` | — | `Library catalog error: Database not found: .../Data/a3wo155q.w14/LibraryCatalog/catalog.db` |

**Verifikation der Root Cause:** `find ~/Library/Application Support/Logos4/Documents/lpfinojk.yny -iname "*.db"` und das Äquivalent für `Data/` listen **alle** erwarteten Dateien (`favorites.db`, `Workflows.db`, `ReadingLists.db`, `visualmarkup.db`, `notestool.db`, `catalog.db` u. a.) unter der korrekten ID `lpfinojk.yny` auf — die Tools würden mit korrektem `LOGOS_DATA_DIR`/`LOGOS_CATALOG_DIR` funktionieren.

## Zusammenfassung

| Status | Anzahl Tools | Anteil |
|---|---|---|
| ✅ Vollständig funktionsfähig | 6 | 30 % |
| ❌ Blockiert durch P1 (Biblia 403) | 7 | 35 % |
| ❌ Blockiert durch P2 (Datenpfad) | 7 | 35 % |
| ⚠️ Teilweise funktionsfähig | 0 | 0 % |

**Kein Tool war „teilweise" funktionsfähig** — jeder Fehler war vollständig (kompletter API-Fehler bzw. kompletter Datei-nicht-gefunden-Fehler), keine Tools lieferten unvollständige/verfälschte Daten.

## Reproduktionshinweise für zukünftige Tests

1. **SQLite-Tools:** `find ~/Library/Application\ Support/Logos4/Documents -maxdepth 1` liefert die korrekte Installations-ID; damit `LOGOS_DATA_DIR`/`LOGOS_CATALOG_DIR` in `.mcp.json` setzen und Test wiederholen.
2. **Biblia-API-Tools:** `curl -s -o /dev/null -w "%{http_code}" "https://api.biblia.com/v1/bible/content/LEB.txt?passage=John%203:16&key=$BIBLIA_API_KEY"` — Status `200` erwartet nach Behebung von P1.
3. **UI-Tools:** Erfordern eine laufende oder startbare Logos.app; kein weiterer Setup nötig.

Nach jeder Behebung aus [[06_Roadmap]] Phase 1 sollte dieses Protokoll aktualisiert und die entsprechenden Zeilen auf ✅ gesetzt werden.
