# 05 — Datenfluss

Es gibt drei grundlegend verschiedene Datenflüsse im System, je nach Tool-Kategorie.

## 1. Biblia-API-Fluss (Bibeltext & Suche)

```
Claude ──tool call──► index.ts ──► services/biblia-api.ts ──► bibliaFetch()
                                                                    │
                                                    URL: https://api.biblia.com/v1/bible/{path}
                                                    Query: passage=..., key=BIBLIA_API_KEY
                                                                    │
                                                                    ▼
                                                          fetch() [Node native]
                                                                    │
                                                                    ▼
                                                        api.biblia.com (Faithlife)
                                                                    │
                                                    ┌───────────────┴───────────────┐
                                                    ▼                               ▼
                                              HTTP 200 + JSON/Text            HTTP 4xx/5xx + Fehlerseite
                                                    │                               │
                                                    ▼                               ▼
                                        Parsing (JSON oder Text je            throw new Error(
                                        nach Content-Type)                    `Biblia API error ${status}: ${body}`)
                                                    │                               │
                                                    ▼                               ▼
                                          index.ts formatiert Markdown        Tool gibt isError:true zurück
                                                    │                               │
                                                    └───────────────┬───────────────┘
                                                                    ▼
                                                              Claude erhält Ergebnis
```

**Betroffene Tools:** `get_bible_text`, `get_passage_context`, `search_bible`, `get_cross_references`, `scan_references`, `compare_passages`, `get_available_bibles`.

**Wichtig:** `get_passage_context` und `get_cross_references` rufen intern *zusätzlich* `reference-parser.ts` (`expandRange`) bzw. führen *zwei* Biblia-Aufrufe hintereinander aus (erst `getBibleText` zur Stichwort-Extraktion, dann `searchBible`).

## 2. SQLite-Lesefluss (persönliche Daten & Katalog)

```
Claude ──tool call──► index.ts ──► services/sqlite-reader.ts oder catalog-reader.ts
                                                    │
                                          openDb(DB_PATHS.xyz)
                                                    │
                                    existsSync(path)? ──nein──► throw "Database not found: <path>"
                                                    │ ja
                                                    ▼
                                    new Database(path, { readonly: true, fileMustExist: true })
                                                    │
                                                    ▼
                                          db.prepare(sql).all(params)   [better-sqlite3, synchron]
                                                    │
                                                    ▼
                                    Mapping Row → TypeScript-Objekt
                                    (ggf. stripXml/stripRichText für Textfelder)
                                                    │
                                                    ▼
                                              db.close()  [immer, auch bei Fehler — finally]
                                                    │
                                                    ▼
                                    index.ts formatiert Markdown-Liste
                                                    │
                                                    ▼
                                              Claude erhält Ergebnis
```

**Betroffene Tools:** `get_user_notes`, `get_user_highlights`, `get_favorites`, `get_reading_progress`, `get_study_workflows` (alle → `sqlite-reader.ts`) sowie `get_library_catalog`, `get_resource_types` (→ `catalog-reader.ts`).

**Wichtig:** Es gibt **keinen Cache** und **keine offene Verbindung** — jeder Tool-Aufruf öffnet und schließt die jeweilige `.db`-Datei neu. Der Pfad kommt aus `config.ts` → `DB_PATHS`, basierend auf `LOGOS_DATA_DIR`/`LOGOS_CATALOG_DIR` (Env-Var oder hartcodierter Fallback).

## 3. UI-Steuerungsfluss (Logos-Oberfläche)

```
Claude ──tool call──► index.ts ──► services/logos-app.ts
                                                    │
                                    toLogosUrlRef(reference)   [reference-parser.ts]
                                    z.B. "Romans 8:28" → "Ro8.28"
                                                    │
                                                    ▼
                                    URL bauen: "logos4:///Bible/Ro8.28"
                                                    │
                                                    ▼
                                    execFileAsync("open", [url])   [child_process, asynchron]
                                                    │
                                                    ▼
                                    macOS Launch Services registriert
                                    Logos.app als Handler für `logos4:`-Schema
                                                    │
                                                    ▼
                                    Logos.app (falls nicht offen: wird gestartet)
                                    verarbeitet die URL intern — AUSSERHALB
                                    der Kontrolle/Sichtbarkeit des MCP-Servers
                                                    │
                                                    ▼
                                    `open`-Prozess beendet sich mit Exit-Code 0
                                    (unabhängig davon, ob Logos die URL
                                    tatsächlich sinnvoll verarbeiten konnte!)
                                                    │
                                                    ▼
                                    Tool meldet "Opened ... in Logos." zurück
```

**Betroffene Tools:** `navigate_passage`, `open_word_study`, `open_factbook`, `open_resource`, `open_guide`, `search_all`.

**Wichtige Eigenschaft — einseitiger („fire-and-forget") Kanal:** Der MCP-Server bekommt **keine Rückmeldung von Logos selbst**. Ein Erfolg bedeutet nur „macOS konnte die URL an einen Handler übergeben", nicht „Logos hat die Stelle tatsächlich angezeigt". Ist Logos nicht installiert oder das `logos4:`-Schema nicht registriert, schlägt bereits `execFileAsync` fehl (im Fehlerfall) — läuft Logos aber z. B. mit einem Dialog im Vordergrund, kann die URL im Hintergrund verpuffen, ohne dass der MCP-Server das merkt.

## Cross-Cutting: Referenz-Normalisierung

Alle drei Flüsse können `reference-parser.ts` durchlaufen, das zwischen drei Formaten übersetzt:

| Format | Beispiel | Verwendung |
|---|---|---|
| Menschenlesbar | `Romans 8:28-30` | Nutzereingabe, Claude-Ausgabe |
| Logos-URL-Format | `Ro8.28-30` | `logos4:///Bible/...`-URLs |
| Biblia-Format | `Romans+8:28-30` | (aktuell ungenutzt — `get_bible_text` übergibt Referenzen unverändert mit Leerzeichen an die Biblia-API, siehe [[07_Bekannte_Probleme]]) |

## Fehlerpropagation

- **Biblia-API-Fehler**: `bibliaFetch()` wirft einen `Error`; in `index.ts` sind `get_bible_text`, `compare_passages`, `scan_references`, `get_available_bibles` **ungefangen** (kein try/catch) → die MCP-SDK-Fehlerbehandlung greift generisch. Nur `get_library_catalog` und `get_resource_types` (DB-Fluss) fangen Fehler explizit ab und geben `isError: true` mit Klartext zurück.
- **SQLite-Fehler** (`Database not found`): Bei `get_user_notes`, `get_user_highlights`, `get_favorites` etc. ebenfalls ungefangen im DB-Fluss über `openDb()` — propagiert als generische Exception.
- **UI-Fluss**: Einzige Schicht mit konsistentem `{success, command, error}`-Rückgabewert statt geworfener Exceptions — dadurch geben alle UI-Tools sauber `isError: true` mit lesbarer Meldung zurück, statt eine rohe Exception durchzureichen.
