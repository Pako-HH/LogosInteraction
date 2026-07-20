# 30 — Phase 4C-1: Lizenz- und Verifikations-Spike (Cross-Reference-Korpus)

**Status: Reiner Verifikations-Spike, keine Codeänderung, kein Datenimport.** Diese Datei ist die einzige Änderung dieses Schritts. Der geprüfte Rohdatensatz wurde ausschließlich in einem temporären, nicht versionierten Verzeichnis außerhalb des Repositories heruntergeladen (Scratchpad) und **nicht** in das Projekt übernommen — konsistent mit der Vorgabe aus [[28_Phase4_Masterplan]] §6 („Kein Import von Daten ohne dokumentierte Lizenzklärung") und dem in [[18_Phase3C_Verifikations_Spike]] etablierten Verfahren.

Grundlage: [[28_Phase4_Masterplan]] §6 (Definition von Schritt 4C-1), [[27_Architecture_Review_und_Strategie_v2]] Teil II §4 (verbindliche Lizenz-Prüfcheckliste), [[25_Phase4A_Architektur_Machbarkeitsanalyse]] §7 (ursprüngliche Kandidatenbenennung: openbible.info Cross References).

---

## 1. Was geprüft wurde

Gemäß der in [[27_Architecture_Review_und_Strategie_v2]] Teil II §4 festgelegten Checkliste, angewendet auf den Kandidatendatensatz **openbible.info Cross References**:

1. Lizenz des Ursprungsdatensatzes (Treasury of Scripture Knowledge).
2. Lizenz der konkret verwendeten Aufbereitung/Kompilation (openbible.info-Datensatz selbst) — **getrennt** von Punkt 1 geprüft.
3. Stichprobenvergleich gegen eine zweite, unabhängige Quelle.
4. Rohformat-Analyse (Datenstruktur, Referenzformat, Kompatibilität mit dem bestehenden 66-Bücher-Versifikationsmodell).
5. Attribution/Lizenztext-Dokumentation.

## 2. Ergebnisse je Prüfpunkt

### 2.1 Lizenz des Ursprungsdatensatzes

Die Treasury of Scripture Knowledge (R.A. Torrey, 19. Jahrhundert) ist gemeinfrei — unstrittig, keine bekannten Einschränkungen.

### 2.2 Lizenz der konkreten Aufbereitung — **Korrektur gegenüber [[25_Phase4A_Architektur_Machbarkeitsanalyse]]**

**Wichtiger Befund:** [[25_Phase4A_Architektur_Machbarkeitsanalyse]] §7 hatte den Datensatz vorläufig als „CC0" bezeichnet. Das ist **nicht korrekt** und wird hiermit ausdrücklich richtiggestellt: Die offizielle openbible.info-Seite ([www.openbible.info/labs/cross-references/](https://www.openbible.info/labs/cross-references/)) erklärt: „Unless otherwise indicated, all content is licensed under a Creative Commons Attribution License" (CC BY 4.0). Die heruntergeladene Rohdatendatei selbst trägt in ihrer Kopfzeile den identischen Hinweis: `#www.openbible.info CC-BY 2026-07-13`. **Der Datensatz ist CC BY 4.0, nicht CC0** — erfordert Namensnennung, ist aber weiterhin uneingeschränkt für dieses Projekt nutzbar (dieselbe Lizenzkategorie wie die bereits in [[26_Strategiedokument_Logos_MCP_3.0]]/[[27_Architecture_Review_und_Strategie_v2]] für Morphologie-Datensätze wie MACULA akzeptierte CC-BY-Klasse).

Diese Aufbereitung ist explizit **mehr** als eine reine TSK-Digitalisierung — sie verbindet TSK mit zusätzlichen Quellen (Topical Bible, Twitter Bible Search) und einer eigenen, community-basierten Gewichtung (`Votes`-Spalte) — eine eigenständige, urheberrechtlich relevante Kompilation, die zu Recht eine eigene (wenn auch permissive) Lizenz trägt, getrennt von der gemeinfreien TSK-Grundlage.

### 2.3 Stichprobenvergleich gegen eine unabhängige Quelle

Verglichen: openbible.info-Datensatz (heruntergeladen 2026-07-20, Stand laut Dateikopf 2026-07-13) gegen die auf [biblehub.com/john/3-16.htm](https://biblehub.com/john/3-16.htm) unabhängig gelistete Cross-Reference-Übersicht für Johannes 3:16.

| biblehub.com (unabhängig gelistet) | Im openbible.info-Datensatz für John.3.16 enthalten? | Stimmenrang im Datensatz |
|---|---|---|
| Römer 5:8 | ✅ Ja (`Rom.5.8`) | **#1 von 44** (977 Stimmen, höchster Wert) |
| 1. Johannes 4:9–10 | ✅ Ja (`1John.4.9-1John.4.10`) | #2 (691 Stimmen) |
| Römer 8:32 | ✅ Ja (`Rom.8.32`) | #3 (505 Stimmen) |
| Johannes 10:28 | ✅ Ja (`John.10.28`) | #9 (316 Stimmen) |
| Epheser 2:4–5 | ✅ Ja (`Eph.2.4`) | #15 (202 Stimmen) |

Die drei höchstbewerteten Einträge im gesamten Datensatz für Johannes 3:16 sind exakt drei der auf biblehub.com unabhängig gelisteten Referenzen — ein starkes Konsistenzsignal. Nicht jede biblehub.com-Referenz taucht im Datensatz auf (z. B. „1. Johannes 3:1" nicht gefunden) und umgekehrt enthält der Datensatz deutlich mehr Einträge insgesamt (44 für diese eine Stelle) als die kürzere biblehub-Liste — das ist erwartungsgemäß, da openbible.info bewusst mehrere Quellen bündelt, nicht nur TSK. **Bewertung: Der Datensatz ist mit einer unabhängigen Quelle konsistent, insbesondere bei den am höchsten bewerteten (community-validierten) Einträgen** — genau diese würden bei einer künftigen Implementierung mit Stimmen-basiertem Ranking zuerst angezeigt.

Zusätzlich stichprobenartig geprüft (nur Strukturplausibilität, kein Vollvergleich): Römer 8:28 (44 Einträge), Epheser 2:8 (36 Einträge), Psalm 23:1 (23 Einträge) — alle strukturell einwandfrei, plausible thematische Verknüpfungen.

### 2.4 Rohformat-Analyse

- **Format:** Tab-getrennte Textdatei (TSV), 3 Spalten: `From Verse`, `To Verse`, `Votes`.
- **Umfang:** 344.800 Zeilen (1 Kopfzeile + 344.799 Cross-Reference-Einträge) — deckt sich mit der auf openbible.info genannten Zahl „about 340,000".
- **Referenzformat:** Abgekürzte englische Buchcodes mit Punktnotation, z. B. `Gen.1.1`, `1Tim.1.15`; Versbereiche als Bindestrich zwischen zwei vollständigen Referenzen, z. B. `Prov.8.22-Prov.8.30`.
- **Bücher:** Alle 66 Bücher des protestantischen Kanons vertreten (Prüfung: `awk`-Extraktion aller distinkten Buchcodes ergab genau 66 Werte) — **keine Apokryphen**, vollständig kompatibel mit dem bestehenden, bereits verifizierten 66-Bücher-Versifikationsmodell des Projekts ([[14_Project_Completion_Report]]).
- **Kompatibilität mit bestehender Codebasis:** Die verwendeten Buchcodes (`Gen`, `1Tim`, `Ps`, `Song`, …) unterscheiden sich von den in `reference-parser.ts` bereits vorhandenen kanonischen Bezeichnern — **eine Mapping-Tabelle wird in 4C-2 benötigt**, nach demselben Muster wie die bereits bewährte `SIL_TO_CANONICAL_BOOK`-Zuordnung aus dem Bibelkorpus-Build (Phase 3D-2). Kein Blocker, aber ein einzuplanender, klar umrissener Arbeitsschritt.
- **Datenqualität:** Keine strukturellen Auffälligkeiten — jede Datenzeile hat exakt 3 Felder (verifiziert), keine leeren/fehlerhaften Zeilen gefunden.

### 2.5 Attribution/Lizenztext

Erforderliche Namensnennung bei Bündelung (CC BY 4.0): Verweis auf „openbible.info" und die Lizenz-URL (`https://creativecommons.org/licenses/by/4.0/`). Umsetzung als eigener Eintrag in einer künftigen `logos-mcp-server/data/CORPUS_LICENSES.md` (bereits als Konzept in [[17_Phase3B_Korpus_Produktentscheidungen]] §5 für die Bibelübersetzungen vorgesehen, hier erstmals auf einen zweiten Korpustyp ausgeweitet) — Umsetzung ist Teil von 4C-2, nicht dieses Schritts.

## 3. Bewertung und Entscheidung

**Go.** Alle fünf Prüfpunkte sind zufriedenstellend geklärt:

- Ursprungslizenz (TSK): gemeinfrei, unstrittig.
- Aufbereitungslizenz (openbible.info): **CC BY 4.0** (korrigiert gegenüber der vorläufigen „CC0"-Annahme aus [[25_Phase4A_Architektur_Machbarkeitsanalyse]]) — permissiv, mit überschaubarer, klar dokumentierbarer Attributionspflicht.
- Stichprobenvergleich: konsistent mit unabhängiger Quelle, insbesondere bei den am höchsten bewerteten Einträgen.
- Format: sauber, gut strukturiert, vollständig kompatibel mit dem bestehenden 66-Bücher-Modell; Buchcode-Mapping als klar umrissene Aufgabe für 4C-2 identifiziert.
- Attribution: unproblematisch dokumentierbar.

**Empfehlung: Mit Schritt 4C-2 (Build-Skript + Korpus) fortfahren**, unter Verwendung genau dieses Datensatzes (`https://a.openbible.info/data/cross-references.zip`), mit CC BY 4.0 statt CC0 in allen künftigen Lizenzdokumentationen.

## 4. Offene Risiken (nach diesem Schritt)

1. **Buchcode-Mapping-Tabelle noch nicht erstellt** — Aufgabe von 4C-2, aber bereits als überschaubar (66 Werte, bekanntes Muster) eingestuft.
2. **Versbereichs-Semantik bei Cross-References noch nicht in eine Zieldatenstruktur übersetzt** — z. B. ob `Prov.8.22-Prov.8.30` als ein einzelner Eintrag mit Start-/End-Referenz oder als mehrere Einzeleinträge im künftigen SQLite-Schema abgebildet wird, ist eine Design-Entscheidung für 4C-2, nicht dieses Schritts.
3. **`Votes`-Spalte-Nutzung noch nicht entschieden** — ob/wie das Ranking (z. B. Sortierung nach Stimmen, Mindestschwelle) im künftigen `LocalCrossReferenceProvider` verwendet wird, ist ebenfalls Teil von 4C-3, nicht dieses Schritts.
4. **Datensatz wird von openbible.info „regelmäßig aktualisiert"** (laut Seitenbeschreibung) — der für dieses Projekt zu bündelnde Stand muss beim tatsächlichen Build in 4C-2 fixiert und dokumentiert werden (Datum, Prüfsumme), analog zur bereits etablierten Praxis bei den Bibelübersetzungen.

## 5. Nicht Teil dieses Schritts

- Kein Build-Skript, keine SQLite-Tabelle, kein dauerhafter Datenimport.
- Keine Buchcode-Mapping-Tabelle.
- Keine Entscheidung über die genaue Zielschema-Struktur (Ranges, Votes-Nutzung) — das ist Aufgabe von 4C-2/4C-3.
- Die temporär heruntergeladene Rohdatendatei liegt ausschließlich im Scratchpad-Verzeichnis dieser Sitzung, außerhalb des Repositories, und ist nicht Teil dieses oder eines künftigen Commits in dieser Form — der tatsächliche, dauerhaft zu bündelnde Download erfolgt eigenständig in 4C-2.
