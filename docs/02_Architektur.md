# 02 — Architektur

## Überblick

Der Logos-MCP-Server ist ein einzelner Node.js-Prozess, der über **stdio** mit Claude Code spricht (`StdioServerTransport` aus `@modelcontextprotocol/sdk`). Er registriert 20 Tools bei einer `McpServer`-Instanz und leitet jeden Tool-Aufruf an eine von vier Service-Schichten weiter.

```
┌─────────────┐   stdio (MCP)   ┌──────────────────────────┐
│ Claude Code │ ◄─────────────► │  logos-mcp-server (Node)  │
└─────────────┘                 │  src/index.ts (20 Tools)  │
                                 └────────────┬──────────────┘
                                              │
              ┌───────────────────┬──────────┼──────────────┬────────────────┐
              ▼                   ▼          ▼               ▼
      services/biblia-api  services/logos-app  services/sqlite-reader  services/catalog-reader
              │                   │          │               │
              ▼                   ▼          ▼               ▼
      HTTPS api.biblia.com   macOS `open` +  better-sqlite3   better-sqlite3
      (Faithlife REST API)   `logos4:` URLs  (10 lokale .db)  (catalog.db)
                                   │
                                   ▼
                            Logos.app (macOS)
```

Eine Hilfsschicht (`services/reference-parser.ts`) übersetzt zwischen drei Referenzformaten (menschenlesbar, Logos-URL-Format, Biblia-Format) und wird von mehreren Services genutzt. `utils/strip-markup.ts` bereinigt XML/XAML-Rohdaten aus den SQLite-Feldern, bevor sie an Claude zurückgehen.

## Die drei Integrationskanäle

### 1. Biblia REST API (`services/biblia-api.ts`)

Externe HTTPS-Anfragen an `https://api.biblia.com/v1/bible` (Faithlife). Liefert Bibeltext, Suchergebnisse, Referenz-Vergleiche und -Scans. Authentifizierung per Query-Parameter `key`. **Einziger Kanal mit echter externer Netzwerkabhängigkeit** — siehe [[07_Bekannte_Probleme]] zum aktuellen 403-Fehler.

### 2. macOS-URL-Schema-Steuerung (`services/logos-app.ts`)

Kein AppleScript im aktiven Pfad (trotz anderslautender README-Aussage) — die Tools rufen `child_process.execFile("open", [url])` mit `logos4:///...`-URLs auf. macOS' Launch-Services-Mechanismus öffnet daraufhin Logos.app und übergibt die URL. Dieser Kanal ist **einseitig** (fire-and-forget): Der Server erhält nur zurück, ob `open` erfolgreich gestartet wurde, nicht ob Logos die URL tatsächlich verarbeitet hat.

AppleScript (`osascript`) wird nur in der ungenutzten Funktion `isLogosRunning()` verwendet (toter Code, siehe [[03_Projektstruktur]]).

### 3. Direkter SQLite-Zugriff (`services/sqlite-reader.ts`, `services/catalog-reader.ts`)

`better-sqlite3` öffnet Logos' eigene lokale Datenbanken **read-only** (`{ readonly: true, fileMustExist: true }`) direkt vom Dateisystem — ohne über die Logos-App oder eine API zu gehen. Das funktioniert auch, während Logos läuft (SQLite unterstützt parallele Lesezugriffe), und **schreibt niemals** in die Datenbanken.

## Designprinzipien im bestehenden Code

- **Read-only bei allen Datenzugriffen**: Weder die SQLite- noch die Biblia-Schicht führen schreibende Operationen aus.
- **Kein Zustand im Server**: Jeder Tool-Aufruf öffnet/schließt seine eigene DB-Verbindung (`openDb()` … `db.close()` in `finally`); es gibt keinen Cache, keine Session.
- **Fail-soft bei Text-Bereinigung**: `stripXml`/`stripRichText` geben `null` statt zu werfen, wenn Eingabe leer/unparsbar ist.
- **Schema-Validierung über Zod**: Jedes Tool definiert seine Eingabeparameter als Zod-Schema direkt bei der Registrierung in `index.ts`.

## Architektonische Schwächen (Ist-Zustand)

- **Zwei parallele Tool-Definitionen**: `index.ts` enthält die *aktive* Tool-Registrierung; `src/tools/*.ts` ist eine *zweite, unbenutzte* Implementierung derselben Tools in einem anderen Muster (`{name, description, inputSchema, handler}`). Das ist Altlast aus einer früheren Refactoring-Phase und wird mitkompiliert, aber nie ausgeführt.
- **Kein zentraler Fehler-/Health-Check**: Fehler (403, „Database not found") werden pro Tool-Aufruf sichtbar, es gibt (im aktuellen `main`-Branch) kein zusammenfassendes Diagnose-Tool. Ein solches existiert bereits als unfertiger Community-Beitrag (siehe [[06_Roadmap]]).
- **Hartcodierter Installationspfad**: `config.ts` geht von einer festen Logos-Benutzer-ID (`a3wo155q.w14`) aus, die nur beim ursprünglichen Autor stimmt (überschreibbar per `LOGOS_DATA_DIR`/`LOGOS_CATALOG_DIR`, aber nicht automatisch erkannt).
