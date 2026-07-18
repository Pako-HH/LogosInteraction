# 14 — Project Completion Report: Logos MCP lokal-first Migration

**Status:** Projekt an diesem Punkt als abgeschlossen betrachtet (Entscheidung des Nutzers, 2026-07-18). Dieser Bericht fasst den erreichten Stand zusammen und dient als Übergabepunkt für eine mögliche Fortsetzung unter „Logos MCP 2.0".

## Ausgangslage

Der Logos-MCP-Server startete mit 20 Tools, von denen 7 hart von einer externen, zum damaligen Zeitpunkt mit einem kompromittierten Key blockierten Biblia-API abhingen ([[07_Bekannte_Probleme]] P1), und 7 weitere durch einen hartcodierten, nutzerspezifischen Installationspfad blockiert waren (P2). Ziel dieser Arbeitsphase war, den Server zu einem robusteren, stärker lokal-first arbeitenden Forschungsassistenten für Logos Bible Software weiterzuentwickeln — mit Priorität auf lokale Logos-Daten und Biblia nur als optionalem Fallback, wie in [[11_MCP2_Architektur_Vorschlag]] skizziert.

## Erreichte Ziele

1. **Diagnose vollständig abgeschlossen:** Root Causes für beide kritischen Blocker (P1: kompromittierter Biblia-Key; P2: falsche hartcodierte Installations-ID) identifiziert und dokumentiert.
2. **P2 behoben:** `config.ts` erkennt den Logos-Installationsordner jetzt automatisch (`detectLogosInstallDir()`), statt eine feste ID anzunehmen — alle 7 zuvor durch P2 blockierten SQLite-Tools sind seitdem funktionsfähig.
3. **Systematische lokale Datenanalyse:** Vollständige Untersuchung aller lokalen Logos-SQLite-Datenbanken (`docs/12_Lokale_Datenquellen_Analyse.md`) — inklusive der zentralen, projektprägenden Erkenntnis, dass Bibeltext bei Logos in einem proprietären, DRM-geschützten Format (`.logos4`) liegt und **nicht** lokal extrahierbar ist.
4. **3 von 7 Biblia-abhängigen Tools erfolgreich auf lokale Datenquellen migriert**, jeweils mit dediziertem Implementierungsplan, Tests, Build-Verifikation und manuellem End-to-End-Test (siehe unten).
5. **Testabdeckung erheblich ausgebaut:** von 66 Tests (nur `reference-parser`/`strip-markup`) auf 116 Tests, inklusive der ersten automatisierten Tests für `catalog-reader.ts` (zuvor ungetestet, P8).
6. **Konsequente Dokumentationsdisziplin:** 14 strukturierte Dokumente (`docs/01`–`docs/14`), durchgängige Nachvollziehbarkeit jeder Entscheidung, jedes gefundenen Fehlers und jeder offenen Frage.

## Migrierte Tools (Biblia-API → lokal)

| Tool | Lokale Quelle | Tag |
|---|---|---|
| `get_available_bibles` | `catalog.db` (`Records` WHERE `Type='text.monograph.bible'`) | `logos-mcp-v1.2-local-catalog` |
| `compare_passages` | Reine Referenzlogik + neue Versifikationstabelle (`data/versification.ts`) | `logos-mcp-v1.3-reference-compare` |
| `scan_references` | Whitelist-basiertes Freitext-Scanning (Englisch + Deutsch) | `logos-mcp-v1.4-scan-references` |

Alle drei Migrationen sind vollständig unabhängig von `BIBLIA_API_KEY` — sie funktionieren auch ohne gültigen (oder ganz ohne) Biblia-Key.

Bemerkenswerte technische Nebenergebnisse aus diesen Migrationen:
- Eine verifizierte Versifikationstabelle (66 Bücher, 1189 Kapitel, 31.102 Verse — exakt gegen bekannte Standardwerte geprüft, ein eigener Transkriptionsfehler dabei gefunden und korrigiert).
- Deutsche Buchnamens-Erkennung (`GERMAN_ALIAS_TO_BOOK`) behebt eine dokumentierte funktionale Regression gegenüber dem letzten (nie erfolgreich abgeschlossenen) Biblia-Livetest.
- Eine Korrektur eines eigenen Dokumentationsfehlers (falsch erwartetes `subset`- statt `superset`-Ergebnis in einem Testfall aus `docs/13`).

## Nicht migrierte Tools

### `search_bible`, `get_bible_text`, `get_passage_context`, `get_cross_references` (4 von 7)
**Nicht migrierbar aus lokalen Logos-Daten — technisch verifiziert, keine Umsetzungslücke.** Bibeltext liegt ausschließlich in `.logos4`-Dateien (`Data/.../ResourceManager/Resources/`), proprietäres Format (`"LRES01"`-Header), kein SQLite, keine lesbaren Textfunde, keine Kompressionsreduktion (konsistent mit DRM/Verschlüsselung). Es existiert keine lokale Volltextindex-Quelle über Verstext. Eine Migration wäre nur mit einer **externen**, nicht aus Logos stammenden, gebündelten Übersetzung plus eigenem Suchindex möglich — bewusst nicht verfolgt, da außerhalb des Rahmens „ausschließlich lokale Logos-Datenbanken" (siehe Sitzungsentscheidung zu Phase 4).

Diese vier Tools bleiben vollständig auf die Biblia-API angewiesen und sind damit weiterhin durch P1 blockiert, solange kein gültiger `BIBLIA_API_KEY` hinterlegt ist.

### 13 ursprünglich bereits lokale/UI-Tools
Unverändert: `navigate_passage`, `open_word_study`, `open_factbook`, `open_resource`, `open_guide`, `search_all` (URL-Schema, nie Biblia-abhängig) sowie `get_user_notes`, `get_user_highlights`, `get_favorites`, `get_reading_progress`, `get_study_workflows`, `get_library_catalog`, `get_resource_types` (SQLite, durch P2-Fix funktionsfähig).

## Technischer Stand

- **Build:** `npm run build` grün (siehe Verifikation unten).
- **Tests:** 116/116 grün, verteilt auf 6 Testdateien (`strip-markup`, `versification`, `reference-compare`, `reference-parser`, `reference-scanner`, `catalog-reader`).
- **Neue Module seit Projektbeginn:** `data/versification.ts`, `services/reference-compare.ts`, `services/reference-scanner.ts`.
- **Erweiterte Module:** `config.ts` (Autodetection), `services/catalog-reader.ts` (+`getInstalledBibles`, sichere Fehlerbehandlung ohne Pfad-Leak), `services/reference-parser.ts` (+`BOOK_ORDER`, deutsche Aliase, `KNOWN_BOOK_TOKENS`).
- **Bekannte, weiterhin offene Probleme** (unverändert seit [[07_Bekannte_Probleme]], soweit nicht oben als behoben vermerkt): P3 (unverifiziertes `search_bible`-Feldmapping), P4 (einseitiges Erfolgsfeedback bei UI-Tools), P5 (inkonsistente Fehlerbehandlung zwischen Tools), P6 (toter Parallelcode in `src/tools/*.ts`), P7 (unbenutzte Funktionen in `logos-app.ts`), P9 (divergenter Feature-Branch).
- **Git-Historie dieser Arbeitsphase:** 5 inhaltliche Commits, getaggt `logos-mcp-v1.1-stable` bis `logos-mcp-v1.4-scan-references` (plus dieser Report als `v1.5`). Kein Push zu `origin` — alles bleibt lokal, bis explizit freigegeben.

## Offene Architekturentscheidung

Der zentrale, bewusst offen gelassene Punkt für eine Fortsetzung ist die in [[11_MCP2_Architektur_Vorschlag]] beschriebene Frage:

**Soll eine externe, lizenzfreie Bibelübersetzung (z. B. KJV, ASV, WEB) gebündelt werden, um `get_bible_text`, `get_passage_context`, `search_bible` und `get_cross_references` von Biblia unabhängig zu machen?**

Dies erfordert vorab drei konkrete Entscheidungen (siehe [[11_MCP2_Architektur_Vorschlag]], „Offene Fragen zur Freigabe"):
1. Welche Übersetzung(en) initial bündeln (Lizenz-/Umfangsabwägung)?
2. Bündelung im Repository selbst oder als optionaler Download bei Erstinstallation?
3. Aufbau eines lokalen Suchindex (z. B. SQLite FTS5) — eigenständiges technisches Vorhaben, nicht Teil der bisherigen Migrationen.

Diese Entscheidung wurde in der aktuellen Phase bewusst **nicht** getroffen, da sie über den Rahmen „ausschließlich lokale Logos-Daten" hinausgeht und eine separate Produkt-/Lizenzentscheidung darstellt.

## Lessons Learned

1. **Technische Prämissen vor Umsetzung verifizieren, nicht annehmen.** Die zentrale Weichenstellung des gesamten Projekts — dass Bibeltext bei Logos lokal nicht zugänglich ist — wurde durch tatsächliche Byte-Level-Untersuchung (`file`, `strings`, Kompressionstest) verifiziert, nicht nur vermutet. Das hat spätere Fehlentscheidungen (z. B. Versuch, `search_bible` „vollständig lokal" umzusetzen) frühzeitig verhindert.
2. **Offene Entscheidungen explizit machen, statt sie stillschweigend zu treffen.** Sowohl die Versifikationsfrage (`compare_passages`) als auch der Sprachumfang (`scan_references`) waren im Plan als klärungsbedürftig markiert — beide wurden vor Umsetzung aktiv beim Nutzer erfragt, statt eine Annahme zu treffen, die sich später als falsch herausstellen könnte.
3. **Selbst erstellte Planungsdokumente sind nicht unfehlbar.** Zwei eigene Fehler wurden im Verlauf gefunden und korrigiert: ein Transkriptionsfehler in der Versifikationstabelle (Numeri 23) und eine falsch dokumentierte Erwartung (`subset` statt `superset`) in `docs/13`. Beide wurden durch automatisierte Tests bzw. rechnerische Gegenprobe aufgedeckt, nicht durch Zufall — ein Argument für konsequente Verifikationstests auch bei scheinbar einfachen Daten/Logik.
4. **Ein Scanner ist kein Parser — beide brauchen unterschiedliche Fehlertoleranz.** Die Trennung zwischen `reference-parser.ts` (strikt, einzelne vollständige Referenz) und `reference-scanner.ts` (tolerant, Freitext, Whitelist-basiert) hat sich als tragfähiges Muster erwiesen und zwei eigene Implementierungsfehler (Buchnamen mit führender Ziffer, Kapitel- vs. Versbereich-Verwechslung) durch dedizierte Tests sichtbar gemacht, bevor sie in Produktion gelangten.
5. **„Lokal" ist kein Freibrief für Genauigkeit.** Ein regelbasierter Freitext-Scanner bleibt strukturell unschärfer als eine dedizierte API — das wurde von Anfang an offen kommuniziert (Precision-Risiko in `docs/13`) statt im Nachhinein relativiert.
6. **Nutzeranfragen können auf überholten oder falschen Annahmen beruhen — das gehört benannt, nicht stillschweigend umgesetzt.** Als die Anforderung „vollständig lokale Suche ausschließlich aus Logos-Daten" auf einen bereits verifiziert unmöglichen Sachverhalt traf, wurde dies transparent gemacht und eine Entscheidung eingeholt, statt eine irreführende Notlösung zu liefern.

## Empfehlungen für Logos MCP 2.0

1. **Kurzfristig, ohne neue Abhängigkeiten:** P6 (toten Parallelcode in `src/tools/*.ts` entfernen) und P7 (unbenutzte Funktionen in `logos-app.ts` entfernen) beheben — geringer Aufwand, reduziert Wartungslast, siehe [[06_Roadmap]] Phase 2.
2. **Vor jeder Fortsetzung von `search_bible`/`get_bible_text`:** Die offene Architekturentscheidung (siehe oben) explizit treffen — Übersetzung, Lizenz, Bündelungsform. Ohne diese Entscheidung ist an diesen 4 Tools kein weiterer technischer Fortschritt sinnvoll möglich.
3. **P1 kurzfristig entschärfen:** Neuen, gültigen Biblia-Key beschaffen (bibliaapi.com), um die verbleibenden 4 Tools zumindest im aktuellen (Biblia-abhängigen) Zustand wieder funktionsfähig zu machen, unabhängig von der langfristigen Architekturfrage.
4. **P3 nach Vorliegen eines gültigen Keys verifizieren:** Das unverifizierte Feldmapping (`r.title` vs. `passage`) in `search_bible`/`get_cross_references` kann erst mit einer echten Biblia-Antwort geprüft werden.
5. **Diagnose-Tool aus `feature/phase3-diagnose-qa` rebasen und integrieren** (P9) — würde die in dieser Phase mehrfach hilfreiche „ist der Key/Pfad überhaupt gültig"-Frage für zukünftige Nutzer automatisieren, statt sie manuell zu diagnostizieren.
6. **Testabdeckung auf die verbleibenden ungetesteten Schichten ausweiten:** `sqlite-reader.ts` und `logos-app.ts` haben weiterhin keine automatisierten Tests (P8), im Gegensatz zu `catalog-reader.ts`, `reference-parser.ts`, `reference-compare.ts` und `reference-scanner.ts`, die in dieser Phase Testabdeckung erhalten haben.
7. **Bei einer zukünftigen Corpus-Entscheidung:** Das in dieser Phase etablierte Muster wiederverwenden — Provider-Abstraktion zuerst (Schritt 1 aus [[11_MCP2_Architektur_Vorschlag]]), dann lokale Implementierung, Biblia als Fallback, jeder Schritt einzeln test- und commit-fähig.
