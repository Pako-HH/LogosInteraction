# 07 — Bekannte Probleme & Risiken

Stand dieser Analyse: 2026-07-18 (zuletzt aktualisiert: 2026-07-18, Diagnosesitzung Teil 2). Alle Punkte wurden durch Code-Lektüre und/oder Live-Tests der MCP-Tools verifiziert (siehe [[08_Testprotokoll]]), sofern nicht anders vermerkt.

**Bestätigter Gesamtstatus (2026-07-18):**
- Claude Code läuft im korrekten Projektordner; der lokale Logos-MCP-Server ist verbunden.
- Alle 20 Tools werden vom Server registriert (siehe `index.ts`).
- Die Logos-Steuerung über URL-Schema (6 UI-Tools) funktioniert einwandfrei.
- Die Biblia-basierten Tools erhalten unabhängig vom MCP-Server einen HTTP-403 (per direktem `curl`-Test gegen die Biblia-API bestätigt, siehe P1).
- Der aktuell in `.mcp.json` hinterlegte Biblia-API-Key gilt als **kompromittiert** und darf nicht weiterverwendet werden. Der Wert wird in dieser Dokumentation grundsätzlich nicht ausgegeben.

## Kritische Probleme (blockieren Tools vollständig)

### P1 — Biblia-API lehnt den konfigurierten Key ab (403) — Key als kompromittiert eingestuft

- **Betrifft:** `get_bible_text`, `get_passage_context`, `search_bible`, `get_cross_references`, `scan_references`, `compare_passages`, `get_available_bibles` (7 von 20 Tools)
- **Symptom:** Jeder Aufruf liefert `Biblia API error 403: ... Access is denied.` (IIS-Fehlerseite von Faithlife)
- **Verifiziert:** Direkter `curl`-Test gegen `https://api.biblia.com/v1/bible/content/LEB.txt` bzw. `/find` mit dem in `.mcp.json` hinterlegten Key liefert denselben 403 — unabhängig vom MCP-Server, also kein serverseitiger Bug im Projektcode.
- **Bestätigter Status:** Der Key gilt als **kompromittiert** und darf nicht weiterverwendet oder neu aktiviert werden. Er ist ungültig zu behandeln, unabhängig von der genauen Ursache der Kompromittierung.
- **Kein bekanntes Upstream-Issue** dazu — betrifft nur diese lokale Key-Konfiguration, nicht den Projektcode selbst.
- **Fix:** Neuen Key unter bibliaapi.com beantragen und in `.mcp.json` (gitignored, niemals versionieren) eintragen; alter Key bleibt dauerhaft gesperrt. Siehe [[06_Roadmap]] Schritt 1.2.

### P2 — Hartcodierter Logos-Datenpfad passt nicht zur lokalen Installation

- **Betrifft:** `get_user_notes`, `get_user_highlights`, `get_favorites`, `get_reading_progress`, `get_study_workflows`, `get_library_catalog`, `get_resource_types` (7 von 20 Tools)
- **Symptom:** `Database not found: /Users/.../Logos4/Documents/a3wo155q.w14/...`
- **Root Cause (verifiziert):** `config.ts` hatte `a3wo155q.w14` als Fallback-Installations-ID hartcodiert. Die tatsächliche lokale ID lautet `lpfinojk.yny` — bestätigt durch Auflisten von `~/Library/Application Support/Logos4/Documents/` und `.../Data/`. Alle erwarteten `.db`-Dateien existieren dort.
- **Entspricht:** GitHub Issue [#3](https://github.com/robrawks/LogosBibleSoftwareMCP/issues/3) „Hardcoded Logos data path breaks for all users except the author".
- **Workaround (vom README bereits dokumentiert, aber nicht automatisch angewendet):** `LOGOS_DATA_DIR`/`LOGOS_CATALOG_DIR` in `.mcp.json` manuell setzen.
- **Status: Fix bereits im Arbeitsverzeichnis vorhanden, aber noch nicht committet.** `config.ts` enthält lokal (uncommitted) eine `detectLogosInstallDir()`-Funktion, die den einzigen Unterordner unter `Logos4/Documents/` bzw. `Logos4/Data/` automatisch ermittelt, statt eine ID hartzucodieren. `npm run build` und `npm test` sind mit diesem Stand grün. Ein Live-Test der 7 betroffenen DB-Tools mit dem neuen Code steht noch aus.
- **Fix:** Autodetection statt Hardcoding, siehe [[06_Roadmap]] Schritt 1.1 / Phase 4.

## Mittlere Risiken (funktionieren, aber fragil oder unbestätigt)

### P3 — Möglicher Feldnamen-Mismatch in `search_bible`

- **Betrifft:** `search_bible`, `get_cross_references`
- **Beschreibung:** `biblia-api.ts` liest `r.title` aus jedem Suchtreffer. Öffentliche Biblia-API-Doku (Stand Recherche) nennt das Feld `passage`, nicht `title`.
- **Status: unbestätigt**, da die API durchgehend 403 liefert und keine echte Antwort beobachtet werden konnte. Auch der offene Community-Branch mit neueren Änderungen hat diesen Code unverändert übernommen — deutet darauf hin, dass es dem Maintainer noch nicht aufgefallen ist (oder dass die Doku ungenau ist).
- **Risiko falls zutreffend:** Suchergebnisse würden nach Behebung von P1 mit leeren Titeln (`**:** Vorschautext`) zurückkommen, ohne Fehler zu werfen — ein „silent failure".
- **Fix:** Nach Behebung von P1 mit echter Antwort verifizieren, siehe [[06_Roadmap]] Schritt 1.3.

### P4 — Einseitige Fehlerrückmeldung bei UI-Steuerungs-Tools

- **Betrifft:** `navigate_passage`, `open_word_study`, `open_factbook`, `open_resource`, `open_guide`, `search_all`
- **Beschreibung:** Diese Tools melden Erfolg, sobald macOS' `open`-Befehl fehlerfrei zurückkehrt — unabhängig davon, ob Logos die Aktion tatsächlich ausführen konnte (z. B. wenn Logos gerade einen blockierenden Dialog zeigt oder der Resource-Identifier ungültig ist).
- **Risiko:** Claude könnte fälschlich „Opened ... in Logos" melden, obwohl in der Logos-Oberfläche nichts sichtbar passiert ist.
- **Fix:** Kein einfacher Fix möglich (Logos bietet keine Callback-API); höchstens Nutzerhinweis in Tool-Beschreibung ergänzen.

### P5 — Inkonsistente Fehlerbehandlung zwischen Tools

- **Beschreibung:** Nur `get_library_catalog`/`get_resource_types` fangen Exceptions explizit mit try/catch ab und liefern lesbare Fehlermeldungen. Alle Biblia-API-Tools und die übrigen DB-Tools lassen Exceptions ungefangen durchreichen.
- **Risiko:** Uneinheitliches Nutzererlebnis; schwerer zu debuggen, welches Tool welchen Fehlerstil hat.
- **Fix:** Siehe [[06_Roadmap]] Schritt 2.3.

## Code-Qualitäts-Risiken (kein Laufzeitfehler, aber Wartungsrisiko)

### P6 — Toter, paralleler Code in `src/tools/*.ts`

- Sieben Dateien implementieren dieselben 20 Tools in einem anderen Muster, werden aber nirgends importiert (verifiziert per `grep`). Risiko: Ein Entwickler ändert versehentlich die falsche Implementierung und wundert sich, warum sich nichts ändert.
- Fix: [[06_Roadmap]] Schritt 2.1.

### P7 — Unbenutzte Funktionen `isLogosRunning()`, `searchBibleInLogos()`

- In `logos-app.ts` definiert, nirgends aufgerufen. Geringes Risiko, aber unnötige Wartungslast.
- Fix: [[06_Roadmap]] Schritt 2.2.

### P8 — Ungetestete Service-Schichten

- Nur `reference-parser.ts` und `strip-markup.ts` haben Unit-Tests. `biblia-api.ts`, `sqlite-reader.ts`, `catalog-reader.ts`, `logos-app.ts` — also alle Schichten mit externen Seiteneffekten (Netzwerk, Dateisystem, Prozessaufruf) — sind ungetestet.
- Fix: [[06_Roadmap]] Phase 5.

### P9 — Divergenter, ungemergter Feature-Branch

- `origin/feature/phase3-diagnose-qa` liegt 3 Commits hinter `main` zurück und würde bei direktem Merge zwei bereits gemergte Verbesserungen (stripXml/stripRichText-Utilities, Response-Cleanup) zurückrollen.
- Fix: Rebase vor Merge, siehe [[06_Roadmap]] Schritt 3.1.

## Organisatorische Beobachtungen

- Drei offene GitHub-Issues im Upstream-Repo (`robrawks/LogosBibleSoftwareMCP`): #2 „working within coworker" (unklar/unspezifisch), #3 (siehe P2), #4 „Windows support roadmap?" (nicht priorisiert, siehe Nicht-Ziele in [[06_Roadmap]]).
- Keine CI-Pipeline vorhanden — Tests laufen nur lokal/manuell.
- Setup erfordert manuelle Schritte (Biblia-Key besorgen, ggf. Pfade anpassen), die für Erstnutzer eine Hürde darstellen — genau hier soll das Diagnose-Tool aus Phase 3 ansetzen.
