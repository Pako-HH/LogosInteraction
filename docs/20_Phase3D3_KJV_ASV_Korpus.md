# 20 — Phase 3D-3: Erweiterung des lokalen Korpus um KJV und ASV

**Status: Erweiterung der Build-Pipeline um Mehrsprachigkeit. Kein `LocalBibleTextProvider`, kein `BibleTextResolver`, keine Änderung an `src/index.ts` oder der öffentlichen API. Kein Commit, kein Tag, kein Push.**

Grundlage: [[19_Phase3D2_WEB_Korpus_Build]] (Architektur, Schema, Muster), [[17_Phase3B_Korpus_Produktentscheidungen]] (V1-Übersetzungsumfang: WEB, KJV, ASV), [[16_MCP2_Zielarchitektur]] §5 (Zieldesign: eine kombinierte Korpusdatei für alle Übersetzungen).

---

## 1. Geänderte Dateien

**Geändert:**

| Datei | Änderung |
|---|---|
| `logos-mcp-server/scripts/build-bible-corpus.ts` | CLI-Signatur erweitert: `<TRANSLATION_CODE> <sourcePath> [outputPath]` statt hartkodiertem `"WEB"`; Standard-Ausgabedatei umbenannt von `web.db` auf `bible-corpus.db` (da jetzt mehrere Übersetzungen in derselben Datei); alle Kernfunktionen (`parseVplText`, `checkCompleteness`, `createCorpusDb`, `insertCorpusVerses`) **unverändert** — waren bereits übersetzungsagnostisch |
| `logos-mcp-server/tests/scripts/build-bible-corpus.test.ts` | +4 neue Tests für den kombinierten Mehrübersetzungs-Korpus |

**Neu erzeugt, nicht versioniert** (per `.gitignore`s bestehender `*.db`-Regel): `logos-mcp-server/data/bible-corpus/bible-corpus.db` — 24 MB, 93.307 Verse über 3 Übersetzungen (ersetzt das vorherige `web.db` aus Phase 3D-2, das denselben Zweck jetzt mit neuem Dateinamen erfüllt).

**Unverändert (verifiziert per `git diff`/`git status`):** `src/index.ts`, `src/services/providers/*` (alle 8 Dateien), `reference-parser.ts`, `versification.ts`, alle vorherigen Tests.

---

## 2. Implementierungsbeschreibung

### Datenbeschaffung (analog Phase 3D-1, jetzt für KJV/ASV)
Beide Übersetzungen über dieselbe eBible.org-VPL-Infrastruktur wie WEB bezogen:
- `https://eBible.org/Scriptures/eng-kjv_vpl.zip` (5.227.237 Bytes)
- `https://eBible.org/Scriptures/eng-asv_vpl.zip` (4.333.032 Bytes)

Beide deterministisch per `curl` heruntergeladen (kein KI-vermitteltes Fetch-Tool), beide per SHA-256 gegen die im Archiv mitgelieferte, signierte `signature.txt.asc`-Prüfsumme verifiziert — **Integrität in beiden Fällen bestätigt**, identisches Vorgehen wie in Phase 3D-1/3D-2.

### Lizenzstatus (Volltext direkt aus den Archiven, deckt sich mit [[17_Phase3B_Korpus_Produktentscheidungen]])
- **KJV**: „Public Domain" außerhalb des UK; innerhalb des UK Letters-Patent-Beschränkung (Queen's Printer-Druckmonopol) — wortgleich mit der bereits in Phase 3B recherchierten Quelle, jetzt zusätzlich direkt im Archiv selbst bestätigt. Textgrundlage: „the standardized text of 1769".
- **ASV**: „Public Domain", keine Einschränkung, „first published in 1901".

### Pipeline-Erweiterung
Die in Phase 3D-2 gebaute Pipeline war bereits so entworfen, dass `translation` ein Parameter von `insertCorpusVerses()` ist, nicht Teil der Parsing-/Schema-Logik. Für Phase 3D-3 musste daher **nur der CLI-Einstiegspunkt** (`main()`) geändert werden: Der Übersetzungscode ist jetzt explizites erstes Argument statt hartkodiertem `"WEB"`. Alle anderen Funktionen — `parseVplText()`, `checkCompleteness()`, `createCorpusDb()`, `insertCorpusVerses()` — sind **unverändert** aus Phase 3D-2 übernommen.

Der kombinierte Korpus entsteht durch dreimaligen Aufruf desselben Skripts gegen dieselbe Ausgabedatei (additiv, da `CREATE TABLE IF NOT EXISTS` und die Übersetzungen sich über den `UNIQUE(translation, book, chapter, verse)`-Schlüssel nicht überschneiden):
```
tsx scripts/build-bible-corpus.ts WEB <eng-web_vpl.txt>
tsx scripts/build-bible-corpus.ts KJV <eng-kjv_vpl.txt>
tsx scripts/build-bible-corpus.ts ASV <eng-asv_vpl.txt>
```

### Vollständigkeits-/Qualitätsbefunde je Übersetzung

| Übersetzung | Verse (66 Bücher) | Abweichung ggü. `versification.ts` | Leere Verstexte |
|---|---|---|---|
| WEB (zur Erinnerung, aus 3D-2) | 31.103 | Römer 14/16 (Doxologie-Verschiebung, siehe [[19_Phase3D2_WEB_Korpus_Build]]) | 5 |
| **KJV** | **31.102** | **Keine** — exakte Übereinstimmung mit `versification.ts` | **0** |
| **ASV** | **31.102** | **Keine** Kapitel-/Verszahl-Abweichung | **16** |

**KJV passt perfekt**, was erwartbar ist: `versification.ts`s eigener Kommentar bezeichnet die Tabelle explizit als „Standard (traditional/KJV) chapter-verse counts" — dieser Lauf ist die erste tatsächliche Verifikation dieser Aussage am realen KJV-Text, nicht nur eine Namensangabe.

**ASV hat 16 leere Verstexte** (Matthäus 17,21 · 18,11 · 23,14 · Markus 7,16 · 9,44 · 9,46 · 11,26 · 15,28 · Lukas 17,36 · 23,17 · Johannes 5,4 · Apostelgeschichte 8,37 · 15,34 · 24,7 · 28,29 · Römer 16,24) — dieselbe Art von Befund wie WEBs 5 leere Verse (Phase 3D-1/3D-2), nur eine größere, ebenfalls textkritisch gut dokumentierte Menge: Verse, die in älteren Handschriften fehlen und in kritischen Textausgaben (ASV folgt dem Westcott-Hort-Text, näher an modernen kritischen Ausgaben als KJV) als nummerierte Leerstellen erhalten bleiben. **Kein Datenfehler.** Bemerkenswert: ASVs Kapitel-/Verszahlen weichen trotzdem **nicht** von `versification.ts` ab (anders als bei WEB) — ASV behält die traditionelle Nummerierung bei und lässt einzelne Verse leer, während WEB in Römer 14/16 den Text tatsächlich in ein anderes Kapitel verschoben hat. Zwei unterschiedliche redaktionelle Lösungen für dasselbe textkritische Problem.

### Weiterer Beobachtungsbefund (keine Korrektur nötig, nur dokumentiert)
KJV-Verstexte enthalten gelegentlich ein „¶"-Zeichen (Absatzmarkierung, Teil der originalen KJV-Formatierungstradition), KJV verwendet zusätzlich eckige Klammern für vom Übersetzerteam ergänzte, im Urtext nicht vorhandene Wörter (z. B. „[was]" in Genesis 1,2). Beides wird unverändert im Korpus gespeichert — reine Beobachtung für eine mögliche spätere Textbereinigung, außerhalb des Scopes dieser Phase.

---

## 3. Testergebnisse

```
npm run build   → keine Fehler
npm test        → 13 Testdateien, 181/181 Tests grün (177 bestehend + 4 neu)
```

Die 4 neuen Tests (`describe("Phase 3D-3 — combined multi-translation corpus")`) prüfen: (1) drei Übersetzungen akkumulieren korrekt über drei separate Build-Läufe in derselben Datei, (2) jede Übersetzung bleibt für dieselbe Referenz unabhängig mit eigenem Wortlaut abrufbar, (3) FTS5-Suche lässt sich auf eine einzelne Übersetzung filtern, (4) ein versehentlicher zweiter Build-Lauf derselben Übersetzung wird durch den UNIQUE-Constraint zuverlässig abgelehnt statt still zu duplizieren.

### Manuelle Verifikation des echten kombinierten Korpus
| Prüfung | Ergebnis |
|---|---|
| Gesamtzahl Verse | 93.307 (WEB 31.103 + KJV 31.102 + ASV 31.102) |
| Dateigröße | 24 MB |
| Johannes 3:16 in allen drei Übersetzungen abrufbar | Ja, mit jeweils eigenem, korrektem Wortlaut („only born Son" WEB / „only begotten Son" KJV+ASV) |
| FTS5-Suche gefiltert auf `translation='KJV'` (Wort „begotten") | Korrekte, auf KJV beschränkte Treffer |

---

## 4. Bekannte Risiken

1. **Gleiches Risiko wie Phase 3D-2:** Der reale Build ist nicht Teil von `npm test` (Rohquellen bewusst nicht im Repo) — nur fixture-basiert automatisiert.
2. **Repo-Größenschätzung nach oben korrigiert.** [[17_Phase3B_Korpus_Produktentscheidungen]] schätzte „15–25 MB Rohtext gesamt" für **5** Übersetzungen — bereits **3** Übersetzungen ergeben 24 MB (inkl. FTS5-Index). Für DARBY/YLT (Version 2) ist daher eher mit ca. 35–40 MB Gesamtgröße zu rechnen, nicht mit den ursprünglich geschätzten 15–25 MB. Ändert nichts an der Auslieferungsentscheidung (Release Asset), ist aber eine Korrektur der bisherigen Schätzung.
3. **`web.db` aus Phase 3D-2 ist mit dieser Phase überholt** (ersetzt durch `bible-corpus.db`) — betrifft nur den lokalen, nicht versionierten Build-Output, keine Auswirkung auf das Repository selbst.
4. **KJVs „¶"-Zeichen und eckige Klammern** sind unverändert im Text gespeichert — falls ein künftiger `LocalBibleTextProvider`/`search_bible` diese als störend empfindet (z. B. bei der Anzeige), ist eine Textbereinigung eine spätere, bewusste Entscheidung, keine dieser Phase.
5. **Kein Zweitquellen-Abgleich**, weiterhin offen aus Phase 3B/3C/3D-1/3D-2 — betrifft jetzt auch KJV und ASV.
6. **DARBY/YLT (Version 2) noch nicht begonnen** — bewusst außerhalb des Scopes von Phase 3D-3.

---

## 5. Vorgeschlagene Commit-Nachricht

```
feat: extend local Bible corpus build pipeline with KJV and ASV (Phase 3D-3)
```

---

**Kein Commit, kein Tag, kein Push.** Warte auf Freigabe.
