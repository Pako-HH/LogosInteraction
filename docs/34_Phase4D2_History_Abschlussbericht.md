# 34 — Phase 4D-2: Neues Tool „zuletzt besuchte Stellen" (Abschlussbericht)

**Status: Abschlussbericht für Phase 4D-2. Schritt 2 von 3 aus [[28_Phase4_Masterplan]] Abschnitt 6 (Phase 4D).**

Grundlage: [[28_Phase4_Masterplan]] Abschnitt 6 (Definition 4D-2), Analyse zu Beginn dieser Teilphase (Schema-Untersuchung von `HistoryManager/history.db` auf der verifizierten lokalen Installation).

---

## 1. Ziel

Logos führt in `Data/.../HistoryManager/history.db` einen laufenden Verlauf zuletzt besuchter Stellen (Ressourcen, Suchen, Faktenbuch-Einträge etc.), der bisher über keinen MCP-Tool angebunden war. Ziel: ein neues, rein additives Tool `get_history`, das diesen Verlauf oberflächlich zugänglich macht — analog zu den bestehenden 13 lokalen Tools, ohne neuen Provider/Resolver.

## 2. Umsetzung

| Schritt | Inhalt | Commit |
|---|---|---|
| **4D-2.1** | `DB_PATHS`-Eintrag `history` in `config.ts` ergänzt (`LOGOS_CATALOG_DIR`-basiert, analog zu `readingProgress`/`catalog`) — reine Infrastruktur, noch nicht gelesen | `472da6b` |
| **4D-2.2** | `getHistory(limit?)` in `sqlite-reader.ts` ergänzt (liest `History`, gefiltert nach `IsDeleted = 0`, sortiert nach `LastVisited DESC`); `HistoryEntry`-Interface in `types.ts` | `baa5acd` |
| **4D-2.3** | `tests/sqlite-reader.test.ts` neu angelegt — Fixture-Tests für `getHistory()` (Sortierung, `IsDeleted`-Filter, Feld-Mapping, `limit`-Parameter, leere Historie, fehlende DB-Datei) | `28332e5` |
| **4D-2.4** | Tool `get_history` in `index.ts` registriert (Muster `get_favorites`/`get_reading_progress`, optionaler `limit`-Parameter, Default 20) | `3d68e18` |
| **4D-2.5** | Dokumentation (dieser Bericht) | *(dieser Commit)* |

## 3. Architekturentscheidungen

- **Kein Parsing des `Bookmark`-Felds:** Die Spalte enthält ein internes, pipe-getrenntes und teils URL-encodiertes Logos-Freitextformat (`Resource|Id=...|Milestone=...`, `Search|...`, `Factbook|...` usw.) ohne dokumentierten Vertrag. `get_history` gibt ausschließlich `Title`, `Subtitle` und `LastVisited` roh aus — analog dazu, wie `get_favorites` `AppCommand` unverarbeitet durchreicht. Ein Parser hätte stille Breakage bei künftigen Logos-Versionen riskiert und war nicht Teil des Auftrags.
- **Keine Typ-Filterung** (z. B. nur `Resource`-Einträge ohne `Search`/`Factbook`/`HelpCenter`): auf ausdrücklichen Wunsch für den ersten Wurf nicht umgesetzt; die in der Analysephase offen gelassene Entscheidung wurde zugunsten der ungefilterten Variante getroffen.
- **`ParentId` und `SyncState` bleiben ungenutzt:** Auf der verifizierten lokalen Installation ist `ParentId` bei allen Zeilen die Nullwert-GUID (keine echte Hierarchie), und die Bedeutung von `SyncState` ist nicht dokumentiert. Beide Felder wurden daher weder in `HistoryEntry` noch in der SQL-Abfrage berücksichtigt.
- **`IsDeleted = 0`-Filter trotz aktuell leerer Beobachtung:** Auf der lokalen Installation kommt `IsDeleted = 1` in keiner der 323 Zeilen vor; der Filter wurde dennoch aufgenommen (analog zu `getFavorites`), da das Schema ihn als Soft-Delete-Flag vorsieht.
- **`LOGOS_CATALOG_DIR` statt `LOGOS_DATA_DIR`:** `history.db` liegt wie `readingprogressmanager.db` und `catalog.db` unter `Data/`, nicht `Documents/` — im entsprechenden `DB_PATHS`-Kommentar dokumentiert.
- **Vier separate, einzeln committete Schritte** (Infrastruktur → Reader+Typ → Tests → Tool-Registrierung) statt eines Gesamt-Commits — auf ausdrücklichen Wunsch, um jede Änderungsebene isoliert prüfbar zu halten, analog zu Phase 4D-1.

## 4. Ergebnis

`get_history` liefert auf der verifizierten lokalen Installation Zugriff auf die zuletzt besuchten Stellen (323 Zeilen im zugrunde liegenden Verlauf, Zeitraum der Stichprobe: 2026-04-15 bis 2026-07-21), standardmäßig auf die 20 zuletzt besuchten begrenzt. Anders als bei 4D-1 handelt es sich um ein **neues** Tool, keinen Fix eines bestehenden — `docs/07_Bekannte_Probleme.md` ist daher nicht betroffen.

## 5. Validierung

- **Build:** `npm run build` erfolgreich, keine Fehler.
- **Testsuite:** `npm test` — alle **307 Tests** (26 Testdateien) grün, inklusive der 7 neuen `getHistory`-Fixture-Tests aus 4D-2.3.
- **Live-Test (Claude Desktop):** `get_history` wurde erkannt und hat die letzten 20 Einträge korrekt aus Logos geliefert.
  - **Besonderheit dabei:** Der zunächst laufende `logos`-MCP-Serverprozess in Claude Desktop stammte noch von einem Neustart vor Beginn der 4D-2-Implementierung und meldete `get_history` deshalb nicht (MCP-Clients fragen `tools/list` nur einmalig beim Verbindungsaufbau ab; ein neuer Build auf der Festplatte wirkt sich nicht auf einen bereits laufenden Prozess aus). Erst nach Neustart von Claude Desktop — wodurch der Serverprozess neu gespawnt wurde und die aktuelle `dist/index.js` lud — war `get_history` sichtbar und lieferte korrekte Ergebnisse. Für künftige Teilphasen (4D-3) relevant: nach jedem Build, der ein neues Tool hinzufügt, muss Claude Desktop neu gestartet werden, bevor ein Live-Test aussagekräftig ist.

## 6. Offene Punkte für Phase 4D-2-Abschluss

- Keine — Build, Tests und Live-Test sind erfolgreich abgeschlossen. Commits 4D-2.1–4D-2.5 sind bereit für Push nach `origin/main` und die Vergabe des Versions-Tags.
