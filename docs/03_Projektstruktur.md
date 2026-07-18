# 03 — Projektstruktur

## Verzeichnisbaum (relevante Dateien)

```
LogosInteraction/
├── .mcp.json                              # MCP-Server-Konfiguration (enthält BIBLIA_API_KEY)
├── README.md                              # Setup-Anleitung, Tool-Übersicht (Englisch)
├── .claude/
│   └── agents/
│       ├── socratic-bible-study.md        # Sokratischer Bibelstudien-Agent
│       └── tool-tester.md                 # QA-Agent zum systematischen Testen der 20 Tools
├── docs/
│   ├── chain-studies/                     # (leer, .gitkeep) — geplant für Thompson-Chain-Feature
│   ├── plans/                             # Design-/Implementierungspläne (Thompson Chain, Response Cleanup)
│   └── 01–09_*.md                         # diese Dokumentation
└── logos-mcp-server/
    ├── package.json                       # npm-Metadaten, Dependencies, Scripts
    ├── tsconfig.json
    ├── src/
    │   ├── index.ts                       # ★ AKTIV: MCP-Server-Einstieg, alle 20 Tools inline registriert
    │   ├── config.ts                      # Pfade (DB_PATHS), Biblia-API-Konstanten, Server-Metadaten
    │   ├── types.ts                       # Gemeinsame TypeScript-Typen
    │   ├── services/
    │   │   ├── biblia-api.ts              # Biblia.com REST-Client (Bibeltext, Suche, Scan, Compare, Find)
    │   │   ├── logos-app.ts               # macOS `open` + `logos4:`-URLs zur UI-Steuerung
    │   │   ├── sqlite-reader.ts           # Notizen, Highlights, Favoriten, Workflows, Leseplan-Fortschritt
    │   │   ├── catalog-reader.ts          # Bibliothekskatalog-Suche (catalog.db)
    │   │   └── reference-parser.ts        # Bibelreferenz-Normalisierung (3 Formate)
    │   ├── tools/                         # ☠ TOTER CODE — nirgends importiert, siehe unten
    │   │   ├── bible-text.ts
    │   │   ├── cross-references.ts
    │   │   ├── navigate.ts
    │   │   ├── reading.ts
    │   │   ├── search.ts
    │   │   ├── user-data.ts
    │   │   └── workflows.ts
    │   └── utils/
    │       └── strip-markup.ts            # stripXml / stripRichText (XAML-Bereinigung)
    ├── tests/
    │   ├── reference-parser.test.ts
    │   └── strip-markup.test.ts
    └── dist/                              # kompiliertes Build-Ergebnis (npm run build), inkl. totem dist/tools/
```

## Rolle jeder aktiven Datei

| Datei | Rolle |
|---|---|
| `src/index.ts` | Registriert alle 20 MCP-Tools direkt via `server.tool(name, description, zodSchema, handler)`. Ruft ausschließlich Funktionen aus `services/*` auf, enthält selbst kaum Geschäftslogik außer der Ausgabeformatierung (Markdown-Strings für Claude) und der Stoppwort-Filterung für `get_cross_references`. |
| `src/config.ts` | Definiert `LOGOS_DATA_DIR`/`LOGOS_CATALOG_DIR` (mit hartcodiertem Fallback-Pfad), `DB_PATHS` (Pfade zu allen 10 SQLite-Dateien), `BIBLIA_API_KEY`/`BIBLIA_API_BASE`/`DEFAULT_BIBLE`, `LOGOS_URL_BASE`. |
| `src/types.ts` | Zentrale Interfaces für Referenzen, Biblia-API-Antworten, SQLite-Ergebnisse, Katalog-Ressourcen, Tool-Rückgabeformat. |
| `src/services/biblia-api.ts` | Einziger Ort mit `fetch()`-Aufrufen an eine externe URL. Baut Query-Parameter, wirft bei Nicht-OK-Status einen `Error` mit Statuscode + Response-Body. |
| `src/services/logos-app.ts` | Führt `open <logos4-url>` per `execFile` aus. Enthält auch die tote Funktion `isLogosRunning()` (AppleScript via `osascript`) und `searchBibleInLogos()` (nie aufgerufen). |
| `src/services/sqlite-reader.ts` | Fünf Lesefunktionen für `visualmarkup.db`, `favorites.db`, `Workflows.db`, `ReadingLists.db`, `notestool.db`. Jede öffnet/schließt ihre eigene DB-Verbindung. |
| `src/services/catalog-reader.ts` | Durchsucht `catalog.db` nach Typ/Autor/Stichwort, enthält eine ~90 Einträge große Mapping-Tabelle von Logos-internen Typcodes (`text.monograph.commentary.bible`) auf lesbare Labels (`Commentary`). |
| `src/services/reference-parser.ts` | Reine Funktionen ohne I/O: `parseReference`, `toLogosUrlRef`, `toBibliaRef`, `toHumanReadable`, `expandRange`. Bildet ~66 biblische Buchnamen + gängige Abkürzungen ab. |
| `src/utils/strip-markup.ts` | `stripXml` (generisches Tag-Strippen + Entity-Decoding) und `stripRichText` (spezialisiert auf Logos' XAML-`<Run Text="...">`-Format für Notizen). |

## Toter Code (zur Bereinigung vorgemerkt)

`grep` über `src/index.ts` bestätigt: **keine** Datei unter `src/tools/` wird importiert. Diese sieben Dateien sind eine ältere, parallele Implementierung derselben 20 Tools (Muster `{name, description, inputSchema, handler}` statt `server.tool(...)`), die beim Refactoring zur aktuellen `index.ts`-Struktur nicht gelöscht wurde. Sie werden von `tsc` mitkompiliert (`dist/tools/*.js` existiert), aber zur Laufzeit nie ausgeführt.

Ebenfalls unbenutzt: `isLogosRunning()` und `searchBibleInLogos()` in `logos-app.ts` (keine Aufrufstelle im gesamten `src/`-Baum).

Siehe [[06_Roadmap]] Schritt „Toten Code entfernen".

## Tests

Nur zwei Testdateien existieren, beide für reine, I/O-freie Logik:
- `tests/reference-parser.test.ts` — Referenz-Parsing/-Formatierung
- `tests/strip-markup.test.ts` — Markup-Bereinigung

Für die Service-Schichten mit externen Abhängigkeiten (Biblia-API, SQLite, `logos-app`) existieren **keine automatisierten Tests** — diese wurden bisher nur manuell / durch den `tool-tester`-QA-Agenten geprüft (siehe [[08_Testprotokoll]]).
