# 06 — Roadmap ("Logos MCP 2.0")

Kleine, unabhängig testbare Schritte, priorisiert nach Aufwand/Nutzen-Verhältnis. Jeder Schritt ist einzeln committ- und verifizierbar.

## Phase 1 — Wiederherstellung der vollen Funktionsfähigkeit

**Ziel:** Alle 20 Tools wieder lauffähig, ohne Architekturänderung.

| Schritt | Beschreibung | Betrifft | Test |
|---|---|---|---|
| 1.1 | `LOGOS_DATA_DIR`/`LOGOS_CATALOG_DIR` korrekt setzen bzw. Autodetection des einzigen Unterordners unter `Logos4/Documents/` und `Logos4/Data/` einbauen (`config.ts`) | 7 DB-Tools | `get_favorites` liefert Daten statt „Database not found" |
| 1.2 | Gültigen Biblia-API-Key beschaffen (bibliaapi.com, E-Mail-Bestätigung nicht vergessen) und in `.mcp.json` eintragen | 7 API-Tools | Direkter curl-Test liefert HTTP 200 statt 403 |
| 1.3 | `search_bible`-Feldmapping (`title` vs. `passage`) anhand einer echten API-Antwort verifizieren und ggf. korrigieren | `search_bible`, `get_cross_references` | Neuer Vitest-Fall mit anonymisiertem Response-Sample |

## Phase 2 — Code-Hygiene

**Ziel:** Keine Verwirrung durch totem/parallelem Code, bevor neue Features entstehen.

| Schritt | Beschreibung | Test |
|---|---|---|
| 2.1 | `src/tools/*.ts` (7 Dateien) löschen — nirgends importiert | `npm run build && npm test` bleibt grün, Tool-Anzahl unverändert |
| 2.2 | `isLogosRunning()` und `searchBibleInLogos()` aus `logos-app.ts` entfernen | dito |
| 2.3 | Fehlerbehandlung vereinheitlichen: alle Tools sollen wie `get_library_catalog` explizit try/catch + `isError: true` mit Klartext nutzen, statt rohe Exceptions durchzureichen | Manuelle Stichprobe: fehlerhafter Aufruf liefert lesbare Meldung |

## Phase 3 — Diagnose & Beobachtbarkeit

**Ziel:** Konfigurationsprobleme sollen sich selbst erklären, nicht erst durch manuelle Recherche auffallen.

| Schritt | Beschreibung | Test |
|---|---|---|
| 3.1 | Bestehenden Community-Branch `feature/phase3-diagnose-qa` (21. Tool `diagnose`) auf aktuellen `main` rebasen (Konflikte mit den `stripXml`/`stripRichText`-Commits auflösen, `useCount`-Feld übernehmen) | Nach Rebase: `npm test` grün, keine Regression bei Notiz-Bereinigung |
| 3.2 | `diagnose`-Tool um einen echten Live-Check der Biblia-API erweitern (aktuell prüft es nur „Key gesetzt", nicht „Key funktioniert") | Mit ungültigem Key zeigt `diagnose` „403 – Key ungültig" statt nur „set" |
| 3.3 | Diagnose-Ausgabe so gestalten, dass ein Erstnutzer ohne Repo-Kenntnisse den Fehler selbst beheben kann (Link zu bibliaapi.com, Beispiel-`.mcp.json`) | Manuelle Durchsicht der Ausgabetexte |

## Phase 4 — Portabilität & Beitrag an Upstream

**Ziel:** Das Projekt soll für andere Logos-Nutzer ohne manuelle Pfadsuche funktionieren.

| Schritt | Beschreibung | Test |
|---|---|---|
| 4.1 | Autodetection aus Schritt 1.1 als eigenständigen PR gegen `robrawks/LogosBibleSoftwareMCP` stellen (schließt Issue #3) | Upstream-Review/CI |
| 4.2 | README um klaren Troubleshooting-Abschnitt „Woher weiß ich meine Logos-Installations-ID?" ergänzen | Manuelle Durchsicht |
| 4.3 | Offene Issues #2 („working within coworker") und #4 („Windows support roadmap?") bewerten und Antwort/Entscheidung dokumentieren | — |

## Phase 5 — Automatisierte Tests für Service-Schichten

**Ziel:** Die bisher ungetesteten Schichten (`biblia-api.ts`, `sqlite-reader.ts`, `catalog-reader.ts`, `logos-app.ts`) bekommen Testabdeckung.

| Schritt | Beschreibung | Test |
|---|---|---|
| 5.1 | `biblia-api.ts`: `fetch` mocken, Erfolgs- und 4xx/5xx-Pfade testen | Vitest |
| 5.2 | `sqlite-reader.ts`/`catalog-reader.ts`: Test-Fixture-DBs (`better-sqlite3` in-memory) mit Beispielschema anlegen | Vitest |
| 5.3 | `logos-app.ts`: `child_process.execFile` mocken, URL-Konstruktion pro Tool verifizieren | Vitest |
| 5.4 | CI-Workflow (GitHub Actions) einrichten, der `npm run build && npm test` bei jedem PR ausführt | Grüner CI-Lauf |

## Phase 6 — Erweiterungen (optional, nach Stabilisierung)

Nur nach Abschluss der Phasen 1–5 sinnvoll:

- Thompson-Chain-Reference-Studienmodus (bereits als Designdokument in `docs/plans/` vorhanden)
- Fallback auf eine lokale/offline Bibeltextquelle, falls Biblia-API nicht erreichbar ist
- Caching-Schicht für häufige Biblia-Anfragen (reduziert externe Latenz/Rate-Limit-Risiko)

## Nicht-Ziele (bewusst ausgeklammert)

- Kein Windows-/Linux-Support in absehbarer Zeit (Logos-URL-Schema und Pfadstruktur sind macOS-spezifisch; Issue #4 offen, aber nicht priorisiert)
- Kein Schreibzugriff auf Logos-Daten (bewusste Design-Entscheidung, siehe [[02_Architektur]])
