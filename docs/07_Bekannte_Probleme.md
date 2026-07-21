# 07 — Bekannte Probleme & Risiken

Stand dieser Analyse: 2026-07-18 (zuletzt aktualisiert: 2026-07-21, Phase 4H: P2/P6/P7/P8/P9 neu verifiziert). Alle Punkte wurden durch Code-Lektüre und/oder Live-Tests der MCP-Tools verifiziert (siehe [[08_Testprotokoll]]), sofern nicht anders vermerkt.

**Bestätigter Gesamtstatus (2026-07-18):**
- Claude Code läuft im korrekten Projektordner; der lokale Logos-MCP-Server ist verbunden.
- Alle 20 Tools werden vom Server registriert (siehe `index.ts`).
- Die Logos-Steuerung über URL-Schema (6 UI-Tools) funktioniert einwandfrei.
- Die Biblia-basierten Tools erhalten unabhängig vom MCP-Server einen HTTP-403 (per direktem `curl`-Test gegen die Biblia-API bestätigt, siehe P1).
- Der aktuell in `.mcp.json` hinterlegte Biblia-API-Key gilt als **kompromittiert** und darf nicht weiterverwendet werden. Der Wert wird in dieser Dokumentation grundsätzlich nicht ausgegeben.

## Kritische Probleme (blockieren Tools vollständig)

### P1 — Biblia-API lehnt den konfigurierten Key ab (403) — Key als kompromittiert eingestuft

> **Update nach Phase 3 (2026-07-20, siehe [[24_Phase3_Abschlussbericht]], [[22_Phase3D5_BibleTextResolver]], [[23_Phase3D6_LocalSearchProvider]]):** Die ursprüngliche Einstufung „blockiert 7 von 20 Tools vollständig" ist **nicht mehr aktuell**. Seit Phase 3 (`BibleTextResolver`/`SearchResolver`, lokal-first) sind **keine** der ursprünglich betroffenen Tools mehr *zwingend* auf Biblia angewiesen, wenn eine lokal gebündelte Übersetzung (`WEB`, `KJV`, `ASV`) verwendet wird — `scan_references`, `compare_passages` und `get_available_bibles` waren bereits seit Phase 2 vollständig lokal, `get_bible_text`, `get_passage_context`, `search_bible` und `get_cross_references` sind es jetzt zusätzlich, sofern (a) der lokale Korpus gebaut wurde (`npm run build:corpus`, siehe README) und (b) explizit `bible: WEB|KJV|ASV` angefragt wird. **P1 bleibt weiterhin gültig und blockierend** für: jede Anfrage nach `LEB` (dem weiterhin unveränderten Default — Phase-3B-Entscheidung, siehe [[17_Phase3B_Korpus_Produktentscheidungen]]) oder einer anderen nicht lokal gebündelten Übersetzung, sowie für `get_cross_references`-Aufrufe ohne explizit gesetzten `bible`-Parameter (Default bleibt `LEB`). Der unten beschriebene 403-Befund selbst (kompromittierter Key) ist davon unberührt und weiterhin ungelöst — er betrifft nur noch einen kleineren Ausschnitt der Funktionalität als ursprünglich dokumentiert.
>
> **Update nach Phase 4B.1/4B.2 (2026-07-20, siehe [[28_Phase4_Masterplan]]):** `DEFAULT_BIBLE` ist jetzt per Umgebungsvariable überschreibbar (`config.ts`, dokumentiert im README-Abschnitt „Optional: Build the Local Bible Corpus"). Mit gesetztem `DEFAULT_BIBLE=WEB` (oder `KJV`/`ASV`) **und** gebautem lokalen Korpus ist der Standardpfad — also jeder Tool-Aufruf **ohne** expliziten `bible`-Parameter, einschließlich `get_cross_references` — trotz P1 nutzbar; die Blockade betrifft dann nur noch explizite Anfragen nach `LEB` oder einer anderen, nicht lokal gebündelten Übersetzung. Ohne gesetzte Variable bleibt der eingebaute Default unverändert `LEB`, und P1 blockiert den Standardpfad wie oben beschrieben weiter.

- **Betrifft (Stand ursprüngliche Analyse, siehe Update oben):** `get_bible_text`, `get_passage_context`, `search_bible`, `get_cross_references`, `scan_references`, `compare_passages`, `get_available_bibles` (7 von 20 Tools)
- **Symptom:** Jeder Aufruf liefert `Biblia API error 403: ... Access is denied.` (IIS-Fehlerseite von Faithlife)
- **Verifiziert:** Direkter `curl`-Test gegen `https://api.biblia.com/v1/bible/content/LEB.txt` bzw. `/find` mit dem in `.mcp.json` hinterlegten Key liefert denselben 403 — unabhängig vom MCP-Server, also kein serverseitiger Bug im Projektcode.
- **Bestätigter Status:** Der Key gilt als **kompromittiert** und darf nicht weiterverwendet oder neu aktiviert werden. Er ist ungültig zu behandeln, unabhängig von der genauen Ursache der Kompromittierung.
- **Kein bekanntes Upstream-Issue** dazu — betrifft nur diese lokale Key-Konfiguration, nicht den Projektcode selbst.
- **Fix:** Neuen Key unter bibliaapi.com beantragen und in `.mcp.json` (gitignored, niemals versionieren) eintragen; alter Key bleibt dauerhaft gesperrt — weiterhin relevant für `LEB`-Anfragen und `get_cross_references` ohne `bible`-Parameter. Siehe [[06_Roadmap]] Schritt 1.2.

### P2 — Hartcodierter Logos-Datenpfad passt nicht zur lokalen Installation — behoben

> **Update Phase 4H (2026-07-21, siehe [[28_Phase4_Masterplan]]): Behoben, Statuszeile unten war veraltet.** Die als „noch nicht committet" beschriebene `detectLogosInstallDir()`-Funktion ist seit Langem fest committeter Bestandteil von `config.ts` und Grundlage aller `DB_PATHS`-Einträge — auch der in Phase 4D-1 bis 4D-3 neu hinzugekommenen (`readingProgress`, `history`, `resourceCollections`). Live-Verifikation liegt inzwischen mehrfach vor (u. a. `get_reading_progress`: 201 reale Datensätze, `get_history`/`get_resource_collections` über Claude Desktop bestätigt).

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

### P6 — Toter, paralleler Code in `src/tools/*.ts` — gegenstandslos

> **Update Phase 4H (2026-07-21, siehe [[28_Phase4_Masterplan]]): Gegenstandslos.** Der Ordner `src/tools/` existiert nicht mehr (verifiziert per `ls`/`find` — keine Treffer). Der beschriebene tote Code wurde zwischenzeitlich entfernt, ohne dass dieser Eintrag aktualisiert wurde.

- Sieben Dateien implementieren dieselben 20 Tools in einem anderen Muster, werden aber nirgends importiert (verifiziert per `grep`). Risiko: Ein Entwickler ändert versehentlich die falsche Implementierung und wundert sich, warum sich nichts ändert.
- Fix: [[06_Roadmap]] Schritt 2.1.

### P7 — Unbenutzte Funktionen `isLogosRunning()`, `searchBibleInLogos()` — gegenstandslos

> **Update Phase 4H (2026-07-21, siehe [[28_Phase4_Masterplan]]): Gegenstandslos.** `logos-app.ts` enthält beide Funktionen nicht mehr (aktueller Inhalt: `navigateToPassage`, `openWordStudy`, `openFactbook`, `openResource`, `openGuide`, `searchAll` — verifiziert per Volllektüre der Datei). Bereits entfernt, ohne dass dieser Eintrag aktualisiert wurde.

- In `logos-app.ts` definiert, nirgends aufgerufen. Geringes Risiko, aber unnötige Wartungslast.
- Fix: [[06_Roadmap]] Schritt 2.2.

### P8 — Ungetestete Service-Schichten — teilweise behoben

> **Update Phase 4H (2026-07-21, siehe [[28_Phase4_Masterplan]]): Teilweise behoben.** `sqlite-reader.ts` (`tests/sqlite-reader.test.ts`, aus Phase 4D-2/4D-3) und `catalog-reader.ts` (`tests/catalog-reader.test.ts`) haben inzwischen Unit-Tests. `biblia-api.ts` und `logos-app.ts` — beide mit externen Seiteneffekten (Netzwerk bzw. Prozessaufruf) — sind weiterhin ungetestet.

- Nur `reference-parser.ts` und `strip-markup.ts` haben Unit-Tests. `biblia-api.ts`, `sqlite-reader.ts`, `catalog-reader.ts`, `logos-app.ts` — also alle Schichten mit externen Seiteneffekten (Netzwerk, Dateisystem, Prozessaufruf) — sind ungetestet.
- Fix: [[06_Roadmap]] Phase 5.

### P9 — Divergenter, ungemergter Feature-Branch — gegenstandslos

> **Update Phase 4H (2026-07-21, siehe [[28_Phase4_Masterplan]]): Gegenstandslos.** `git ls-remote --heads origin` liefert für `feature/phase3-diagnose-qa` keinen Treffer mehr — der Branch existiert auf dem aktuellen Remote nicht mehr. Kein Merge-Risiko mehr. (Eine veraltete lokale Remote-Tracking-Referenz kann weiterhin sichtbar sein, spiegelt aber nicht den tatsächlichen Remote-Zustand wider.)

- `origin/feature/phase3-diagnose-qa` liegt 3 Commits hinter `main` zurück und würde bei direktem Merge zwei bereits gemergte Verbesserungen (stripXml/stripRichText-Utilities, Response-Cleanup) zurückrollen.
- Fix: Rebase vor Merge, siehe [[06_Roadmap]] Schritt 3.1.

### P10 — `get_reading_progress` las die falsche Datenbank — behoben in Phase 4D-1

> **Update Phase 4D-1 (2026-07-20, siehe [[28_Phase4_Masterplan]], [[33_Phase4D1_ReadingProgress_Abschlussbericht]]): Behoben.** `get_reading_progress` liest jetzt `Data/.../ReadingProgressManager/readingprogressmanager.db` (Tabelle `ReadingStatus`: `ResourceId`, `PercentageRead`, `Ranges`) statt der zuvor gelesenen `Documents/.../ReadingLists/ReadingLists.db`. Auf der verifizierten lokalen Installation liefert das Tool jetzt 201 reale Datensätze statt strukturell leerer Ergebnisse.

- **Betrifft:** `get_reading_progress`
- **Symptom:** Das Tool lieferte auf dieser Installation durchgehend leere/bedeutungslose Ergebnisse (`0/0 items (0%)`), unabhängig vom tatsächlichen Leseverhalten des Nutzers.
- **Root Cause (verifiziert, siehe [[12_Lokale_Datenquellen_Analyse]] §4):** `get_reading_progress` las `ReadingLists.db` (Leseplan-*Checklisten*, auf der verifizierten Installation 0 Zeilen in beiden Tabellen) statt `readingprogressmanager.db`, das den tatsächlichen, laufend geführten Leseforschritt pro Ressource enthält (201 Zeilen). Kein Zugriffs- oder Pfadfehler im engeren Sinn (die DB war da und lesbar) — die Datenquelle war schlicht die falsche.
- **Fix:** Neuer `DB_PATHS`-Eintrag `readingProgress` (`LOGOS_CATALOG_DIR`-basiert), `getReadingProgress()` auf die `ReadingStatus`-Tabelle umgestellt, Tool-Antwortformat entsprechend angepasst. Rückgabestruktur geändert von `{statuses, items, totalItems, completedItems, percentComplete}` (Checklisten-Semantik) zu `{entries, totalResources}` (Ressourcen-Fortschritt in Prozent) — kein Kompatibilitäts-Shim, da die alte Struktur eine andere, jetzt nicht mehr zutreffende Bedeutung hatte.

## Organisatorische Beobachtungen

- Drei offene GitHub-Issues im Upstream-Repo (`robrawks/LogosBibleSoftwareMCP`): #2 „working within coworker" (unklar/unspezifisch), #3 (siehe P2), #4 „Windows support roadmap?" (nicht priorisiert, siehe Nicht-Ziele in [[06_Roadmap]]).
- Keine CI-Pipeline vorhanden — Tests laufen nur lokal/manuell.
- Setup erfordert manuelle Schritte (Biblia-Key besorgen, ggf. Pfade anpassen), die für Erstnutzer eine Hürde darstellen — genau hier soll das Diagnose-Tool aus Phase 3 ansetzen.
