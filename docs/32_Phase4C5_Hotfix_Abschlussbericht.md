# 32 — Phase 4C.5 Hotfix: Preview-Text-Fehlschlag darf lokale Cross-References nicht verwerfen (Abschlussbericht)

**Status: Abschlussbericht für den Live-Incident-Hotfix nach Phase 4C.5.**

Grundlage: [[28_Phase4_Masterplan]] (Phase-4-Roadmap), [[31_Phase4C_CrossReferenceKorpus_Abschlussbericht]] (Abschlussbericht des Phase-4C-Features, auf dem dieser Hotfix aufbaut).

**Abgeschlossen mit:**
- Commit: `a1dbc2b`
- Tag: `logos-mcp-v3.5-phase4c5-fix`
- Datum: 20.07.2026
- Tests: 300/300 grün
- Build: erfolgreich

---

## 1. Welche Probleme Phase 4C ursprünglich lösen sollte

Laut Masterplan (`docs/28_Phase4_Masterplan.md`, Abschnitt 6) sollte Phase 4C die bis dahin einzige Quelle für `get_cross_references` — eine reine Heuristik (Stichwort-Überlappung + Volltextsuche) — um einen **gemeinfreien, kuratierten Cross-Reference-Datensatz** (openbible.info) ergänzen, lokal-first vor der Heuristik. Zentrale Anforderung dabei: erstmals ein **Provenienz-Feld**, das für jede Antwort sichtbar macht, ob sie aus dem kuratierten lokalen Korpus oder aus der KI-Heuristik stammt — Umsetzung des in `docs/27` geforderten Zitationsprinzips im Code, nicht nur als Dokumentationsvorgabe.

## 2. Während der Entwicklung entdeckte Bugs

**Ein Live-Incident nach Auslieferung von 4C.5:** `LocalCrossReferenceProvider.findCrossReferences()` behandelte "kuratierter Treffer gefunden" und "Preview-Text erfolgreich geladen" als untrennbare Einheit. Da `DEFAULT_BIBLE="LEB"` lokal nie abgedeckt ist (bewusste Design-Entscheidung, LEB ist proprietär) und der Biblia-Fallback mit einem abgelehnten API-Key 403 lieferte, warf **ein einziger fehlschlagender Preview-Text-Lookup** die gesamte Methode — und damit wurden alle bereits aus SQLite gelesenen kuratierten Treffer verworfen. Der breite `catch {}` in `CrossReferenceResolver` schluckte das unterschiedslos und fiel auf die Heuristik zurück, die denselben LEB→Biblia-Pfad ein zweites Mal, diesmal ungeschützt, durchlief — Ergebnis: kompletter Absturz mit roher Biblia-403-HTML statt einer strukturierten Antwort, obwohl lokal echte Daten vorlagen.

## 3. Vorgenommene Architekturänderungen

- **4C-3:** `LocalCrossReferenceProvider` — liest den kuratierten SQLite-Korpus exakt nach Referenz.
- **4C-4:** `CrossReferenceResolver` — komponiert `LocalCrossReferenceProvider` (lokal-first) mit der bestehenden `HeuristicCrossReferenceProvider`, führt das Provenienz-Feld (`source: "local-curated" | "heuristic"`) ein.
- **4C-5:** Verdrahtung in `index.ts`; `get_cross_references` zeigt die Quelle jetzt sichtbar in der Tool-Antwort (`_Source: ...`).
- **Hotfix (v3.5-phase4c5-fix):** In `LocalCrossReferenceProvider` wird der Preview-Text-Lookup pro Zeile einzeln per `try/catch` behandelt; ein Fehlschlag ersetzt nur die Preview durch den dokumentierten Platzhalter `PREVIEW_UNAVAILABLE_TEXT`, der Treffer selbst (`title`) bleibt erhalten. `CrossReferenceResolver` wurde bewusst **nicht** verändert — sein breiter `catch`-Block bleibt für echte "lokal nicht anwendbar"-Fälle (unbekannte Referenz, Ganzkapitel, DB-Fehler) notwendig, kann aber strukturell nicht mehr durch Preview-Fehlschläge ausgelöst werden.

## 4. Erfolgreiche Live-Tests

Nach echtem Neustart des laufenden MCP-Serverprozesses (verifiziert über Prozessstart-Zeitstempel vs. Datei-mtime, um einen veralteten In-Memory-Stand auszuschließen):

- `get_cross_references("John 3:16")` → `source: local-curated`, alle 23 kuratierten Treffer vollständig, kein Absturz
- `get_cross_references("Romans 5:8")` → `source: local-curated`, alle 13 Treffer vollständig
- `get_cross_references("Psalm 23:1")` → `source: local-curated`, alle 23 Treffer vollständig (inkl. korrekter Normalisierung "Psalm" → "Psalms")

In allen drei Fällen: kein Heuristik-Fallback, kein Biblia-403-Abbruch, Trefferzahlen deckungsgleich mit direkten SQL-Abfragen des Korpus. 300/300 automatisierte Tests grün, Build fehlerfrei.

## 5. Bekannte, weiterhin bestehende Einschränkungen

- **`BIBLIA_API_KEY` ist weiterhin ungültig (403 bei jedem Biblia-Aufruf).** Nicht Gegenstand dieses Fixes. Konsequenzen: Passagen ganz ohne lokale Cross-Reference-Abdeckung bleiben komplett funktionsunfähig (Heuristik-Fallback hängt vollständig an Biblia); Preview-Texte für lokale Treffer zeigen weiterhin nur den Platzhalter statt echtem Bibeltext, solange `DEFAULT_BIBLE=LEB` bleibt.
- **UX-Degradation durch den Platzhalter:** Nutzer sehen bei jedem Aufruf ohne explizites `bible="WEB"` o. ä. `"(preview unavailable ...)"` statt echtem Text — korrekt und transparent, aber spürbar eingeschränkt, solange der Key nicht erneuert ist.
- **Der Upfront-Check `bibleText.supports(effectiveBible)`** in `LocalCrossReferenceProvider` ist in der Praxis totes Gewicht, da `BibliaBibleTextProvider.supports()` unbedingt `true` liefert — dieser Pfad wird nie ausgelöst. Nicht angefasst (außerhalb des Bugfix-Scopes), aber als latente Inkonsistenz dokumentiert.
- **Ein angepasster Regressionstest** (`index.local-search-resolver.integration.test.ts`) hängt am Inhalt des echten, auf der Platte liegenden Produktionskorpus statt einer isolierten Fixture — vorbestehendes Testdesign, Wartungsrisiko bei künftigen Korpus-Änderungen.
- **Kein Hot-Reload-Mechanismus** für den lokalen MCP-Serverprozess — jede künftige Code-Änderung erfordert einen manuellen Neustart (wie in dieser Session demonstriert), da der MCP-Client einen beendeten Serverprozess nicht automatisch neu spawnt.

## 6. Empfehlung für Phase 4D

Laut Masterplan bereits verbindlich geplant:
- **4D-1:** `get_reading_progress` von der leeren `ReadingLists.db` auf `ReadingProgressManager/readingprogressmanager.db` umstellen.
- **4D-2:** neues Tool „zuletzt besuchte Stellen" (`HistoryManager/history.db`).
- **4D-3:** neues Tool „Sammlungen/Regale" (`ResourceCollectionManager.db`).

Zusätzlich, nicht im Masterplan verankert, aber aus diesem Vorfall abgeleitet:
- **Vor oder parallel zu 4D:** `BIBLIA_API_KEY` erneuern/ersetzen — er ist aktuell der einzige Blocker dafür, dass Heuristik-Fallback und Preview-Texte tatsächlich funktionieren, unabhängig vom hier behobenen Bug.
- **Kandidat für 4H (Code-Hygiene):** den toten `supports()`-Check in `LocalCrossReferenceProvider` bereinigen oder durch eine tatsächlich wirksame Prüfung ersetzen.

## Lessons Learned

- Live-Verifikation gegen einen echten MCP-Server ist unverzichtbar.
- Preview-Erzeugung darf niemals den Verlust lokaler Cross-Reference-Daten verursachen.
- Datengewinnung und Darstellung müssen voneinander getrennt bleiben.
- Nach Änderungen am MCP-Server ist ein vollständiger Serverneustart erforderlich, weil Node.js den geladenen Code nicht automatisch aktualisiert.
- Lokale Daten müssen auch bei Ausfall externer Dienste zuverlässig erhalten bleiben.
