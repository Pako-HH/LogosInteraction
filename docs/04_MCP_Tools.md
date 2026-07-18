# 04 — MCP-Tools (vollständige Referenz)

Alle 20 Tools sind in `logos-mcp-server/src/index.ts` registriert. Legende Kategorie: **API** = Biblia-REST-API · **UI** = macOS-URL-Steuerung von Logos · **DB** = lokaler SQLite-Lesezugriff.

## Bibeltext & Lesen

| Tool | Kategorie | Parameter | Beschreibung |
|---|---|---|---|
| `get_bible_text` | API | `passage` (Pflicht), `bible` (optional, Default LEB) | Ruft den Text einer Bibelstelle ab (`/content/{bible}.txt`) |
| `get_passage_context` | API | `passage`, `context_verses` (Default 5), `bible` | Wie oben, aber mit umgebenden Versen (nutzt `expandRange` aus `reference-parser.ts`) |
| `compare_passages` | API | `first`, `second` | Vergleicht zwei Referenzen auf Überlappung/Reihenfolge (`/compare`) |
| `get_available_bibles` | API | `query` (optional) | Listet verfügbare Bibelübersetzungen (`/find`) |

## Navigation & UI-Steuerung

| Tool | Kategorie | Parameter | Beschreibung |
|---|---|---|---|
| `navigate_passage` | UI | `reference` | Öffnet eine Bibelstelle in Logos (`logos4:///Bible/{ref}`) |
| `open_word_study` | UI | `word` | Öffnet eine Wortstudie (`logos4:///WordStudy?word=...`) |
| `open_factbook` | UI | `topic` | Öffnet einen Factbook-Eintrag (`logos4:///Factbook?ref=...`) |
| `open_resource` | UI | `resource_id`, `reference` (optional) | Öffnet eine bestimmte Ressource, optional an einer Bibelstelle (`logosres:...`) |
| `open_guide` | UI | `guide_type`, `reference` | Öffnet einen Guide-Typ (z. B. „Passage Guide", „Exegetical Guide") |

## Suche & Entdeckung

| Tool | Kategorie | Parameter | Beschreibung |
|---|---|---|---|
| `search_bible` | API | `query`, `limit` (Default 20), `bible` | Volltextsuche über Bibeltext (`/search/{bible}`) |
| `get_cross_references` | API | `passage`, `key_terms` (optional) | Extrahiert Schlüsselwörter aus der Stelle (Stoppwort-gefiltert) und sucht damit verwandte Verse |
| `scan_references` | API | `text`, `tag_chapters` (Default true) | Erkennt Bibelstellen in freiem Text (`/scan`) |
| `search_all` | UI | `query` | Öffnet eine bibliotheksweite Suche in der Logos-Oberfläche |

## Bibliothek & Ressourcen

| Tool | Kategorie | Parameter | Beschreibung |
|---|---|---|---|
| `get_library_catalog` | DB | `type`, `query`, `author`, `limit` (Default 25) | Durchsucht `catalog.db` nach Typ/Stichwort/Autor |
| `get_resource_types` | DB | — | Aggregierte Anzahl der Ressourcen je Typ aus `catalog.db` |

## Persönliche Studiendaten

| Tool | Kategorie | Parameter | Beschreibung |
|---|---|---|---|
| `get_user_notes` | DB | `notebook_title`, `limit` (Default 20) | Liest Notizen aus `notestool.db`, bereinigt XAML-Rich-Text |
| `get_user_highlights` | DB | `resource_id`, `style_name`, `limit` (Default 50) | Liest Markierungen aus `visualmarkup.db` |
| `get_favorites` | DB | `limit` (Default 30) | Liest Favoriten aus `favorites.db` |
| `get_reading_progress` | DB | — | Liest Leseplan-Status aus `ReadingLists.db` |

## Studien-Workflows

| Tool | Kategorie | Parameter | Beschreibung |
|---|---|---|---|
| `get_study_workflows` | DB | `include_instances` (Default true), `instance_limit` (Default 10) | Liest Workflow-Vorlagen und aktive Instanzen aus `Workflows.db` |

## Rückgabeformat

Jedes Tool gibt entweder `{ content: [{ type: "text", text: "..." }] }` (Erfolg) oder zusätzlich `isError: true` (Fehlerfall) zurück — MCP-Standardformat. Erfolgstexte sind Markdown-formatiert (fett, Listen, Überschriften) für gute Lesbarkeit im Claude-Chat.

## Bekannte Implementierungsdetails mit Risiko

- `search_bible` und `get_cross_references` lesen ein Feld `r.title` aus der Biblia-Suchantwort (`biblia-api.ts`). Aktuelle Biblia-Dokumentation deutet auf ein Feld `passage` statt `title` hin — **nicht verifizierbar**, solange die API 403 liefert (siehe [[07_Bekannte_Probleme]]).
- `get_cross_references` und `get_passage_context` haben **keine eigene Fehlerbehandlung** — ein Biblia-API-Fehler in der internen `getBibleText`/`searchBible`-Aufruf propagiert als ungefangene Exception nach oben (MCP-SDK fängt sie vermutlich generisch ab, aber es gibt keine spezifische, hilfreiche Fehlermeldung für den Nutzer).
