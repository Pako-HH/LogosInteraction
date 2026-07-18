# 17 — Phase 3B: Produktentscheidungen für den lokalen Bibeltext-Korpus

**Status: Reine Entscheidungs- und Planungsphase. Keine Codeänderung, kein Commit, kein Tag, kein Push.**

Grundlage: [[15_Biblia_Restabhaengigkeit_Analyse]], [[16_MCP2_Zielarchitektur]] (insbesondere §18 Phase B), `README.md`, `logos-mcp-server/src/config.ts`, `logos-mcp-server/src/services/providers/` (Stand nach Phase 3A), `logos-mcp-server/src/index.ts`. Ergänzend: gezielte externe Recherche zum Lizenzstatus der fünf Kandidatenübersetzungen (Quellen am Ende jedes Abschnitts bzw. in Abschnitt 5), da die bisherigen Dokumente ([[13_Implementierungsplan_Migration]], [[15_Biblia_Restabhaengigkeit_Analyse]]) „gemeinfrei" bislang nur pauschal behauptet, nicht im Detail verifiziert hatten.

## Ausgangslage

Nach Phase 3A ruft `index.ts` die vier verbleibenden Biblia-abhängigen Tools ausschließlich über `BibliaBibleTextProvider`/`BibliaSearchProvider` auf; `DEFAULT_BIBLE = "LEB"` in `config.ts:66` ist unverändert. Es existiert noch kein `LocalBibleTextProvider`, kein `LocalSearchProvider`, kein Korpus. [[16_MCP2_Zielarchitektur]] §18 benennt „Phase B — Offene Produktentscheidungen klären" explizit als Voraussetzung, bevor Phase C (Korpusbeschaffung) beginnen darf, um das in Risiko 11 (§19) beschriebene Szenario zu vermeiden: eine Provider-Abstraktion ohne funktionalen Mehrwert, weil nie eine lokale Implementierung folgt. Dieser Bericht schließt genau diese Lücke.

---

## 1. Default-Übersetzung

| Option | Bewertung |
|---|---|
| **LEB beibehalten** | Nicht gemeinfrei (Lexham/Faithlife-Copyright, siehe [[15_Biblia_Restabhaengigkeit_Analyse]] Abschnitt 4/5) — kann nicht lokal gebündelt werden. Als Default würde LEB den Kernbetrieb dauerhaft an `BIBLIA_API_KEY` binden und damit dem Leitprinzip „Server funktioniert ohne jeden externen Key" ([[16_MCP2_Zielarchitektur]] §1) widersprechen. |
| **WEB** | Vollständig gemeinfrei, **ohne** geografische Einschränkung (siehe Abschnitt 5). Moderne, gut lesbare Sprache — passend zu einem Studienwerkzeug, das nicht nur liturgisch geschulte Muttersprachler bedient. Bereits heute einer der 6 von Biblia unterstützten Codes, also kein neues Mapping nötig. Aktiv gepflegte Quelle (ebible.org / worldenglish.bible). |
| **KJV** | Bekannteste und meistzitierte englische Übersetzung, in vielen Studienkontexten Referenzstandard. Archaisches Englisch kann für heutige oder nicht-muttersprachliche Nutzer eine Hürde sein. Lizenzlich außerhalb des Vereinigten Königreichs uneingeschränkt gemeinfrei, **innerhalb** des UK jedoch einer Crown-„Letters Patent"-Beschränkung unterworfen (kein klassisches Copyright, aber ein Druck-/Vertriebsmonopol der Queen's Printer) — Detail siehe Abschnitt 5. |
| **Andere gemeinfreie Übersetzung (ASV/YLT/DARBY)** | ASV: ebenfalls archaisch, historisch als Übergangswerk vor moderneren Übersetzungen konzipiert — als *Default* weniger geeignet als als Zweitübersetzung. YLT: extrem wortwörtlich, für tägliches Lesen ungeeignet, aber wertvoll für Wortstudien. DARBY: Nischenübersetzung (Versammlungs-/Brethren-Tradition), unüblich als Standardvorgabe. Keine der drei eignet sich besser als WEB als *Default*. |

**Empfehlung (zweistufig — öffentliche API vs. interne Implementierung):** Diese Entscheidung wird bewusst in zwei getrennte Ebenen aufgeteilt, statt sie — wie in einer früheren Fassung dieses Abschnitts — als einen einzigen Schritt zu behandeln:

1. **Öffentliche API (Kompatibilität):** Das nach außen sichtbare Verhalten der vier betroffenen Tools (`get_bible_text`, `get_passage_context`, `search_bible`, `get_cross_references`) bleibt **zunächst unverändert kompatibel** zum bisherigen Stand. `DEFAULT_BIBLE` in `config.ts` wird durch diese Entscheidungsphase **nicht** angetastet — kein Tool-Parameter, keine Tool-Beschreibung, kein beobachtbarer Default ändert sich. Ein Wechsel des öffentlich sichtbaren Defaults ist eine eigene, spätere Entscheidung, keine Voraussetzung für den Korpusaufbau.
2. **Interne Implementierung des `LocalBibleProvider`:** Sobald der lokale Provider existiert (Phase D), **darf** er intern `WEB` als eigenen Standard verwenden, wenn er ohne explizit angegebene Übersetzung einen lokal auflösbaren Text sucht — unabhängig davon, was `DEFAULT_BIBLE` öffentlich weiterhin vorgibt.
3. **Verhalten bei nicht lokal verfügbarem `LEB`:** Ob und wie eine `LEB`-Anfrage (weiterhin öffentlicher Default) auf eine lokale Übersetzung umgeleitet, an Biblia weitergereicht oder mit einem Hinweis abgelehnt wird, entscheidet **künftig die Provider-/Resolver-Schicht** (`BibleTextResolver`, [[16_MCP2_Zielarchitektur]] §15) zur Laufzeit — **nicht** diese Entscheidungsphase und **nicht** eine vorgezogene API-Änderung. Diese Frage wird explizit auf Phase D/E vertagt.

**Warum diese Trennung langfristig wartungsfreundlicher ist:** Die öffentliche API (Tool-Namen, Parameter, Rückgabeformat, beobachtbares Default-Verhalten) und die interne Implementierung (welcher Provider welche Übersetzung tatsächlich liefert) folgen unterschiedlichen Änderungsrhythmen und Stabilitätsanforderungen. Würde `DEFAULT_BIBLE` bereits jetzt auf `WEB` umgestellt, koppelte man eine reine Implementierungsentscheidung (welcher Korpus zuerst befüllt wird) an eine nach außen wirksame Verhaltensänderung — bevor die eigentliche technische Grundlage (Korpus, Resolver) überhaupt existiert, und im Widerspruch zum in [[16_MCP2_Zielarchitektur]] §15 formulierten Ziel „kein Breaking Change für Claude/den Nutzer". Die getrennte Betrachtung erlaubt es, den `LocalBibleProvider` frei zu implementieren, zu testen und iterativ zu verbessern, ohne bei jeder internen Änderung erneut über die öffentliche Vorgabe entscheiden zu müssen — und vermeidet, dass eine spätere, bewusste API-Entscheidung („Default jetzt wirklich auf WEB umstellen") rückwirkend mit unfertigen Zwischenständen der Korpusarbeit verwechselt wird.

---

## 2. Übersetzungsumfang für Version 1

| Übersetzung | Lizenzklarheit | Nutzen | Versifikations­risiko | Zusatzaufwand | Empfehlung V1 |
|---|---|---|---|---|---|
| **WEB** | Vollständig unproblematisch (Abschnitt 5) | Hoch (Default, moderne Sprache) | Gering (englische Standardtradition erwartet) | Referenz (Basis) | ✅ Aufnehmen |
| **KJV** | Unproblematisch außerhalb UK, dokumentationspflichtiger Hinweis (Abschnitt 5) | Sehr hoch (meisterwartete/-zitierte Übersetzung, deckt Nutzererwartung aus der bisherigen Biblia-Liste) | Gering | Gering (gleiche Quelle/Pipeline wie WEB) | ✅ Aufnehmen |
| **ASV** | Unproblematisch (PD seit 1957) | Mittel (wörtlicher Referenzstandard, u. a. Basis vieler Konkordanzen) | Gering | Gering | ✅ Aufnehmen |
| **DARBY** | Unproblematisch | Niedrig–mittel (Nischenpublikum, Wort-für-Wort-Vergleich) | Unbestätigt (noch nicht am Text verifiziert) | Gering, aber zusätzlicher Verifikationsaufwand | ⏸ Auf V2 verschieben |
| **YLT** | Unproblematisch | Niedrig–mittel (Ursprachennähe, kein Fließtext) | Unbestätigt (noch nicht am Text verifiziert) | Gering, aber zusätzlicher Verifikationsaufwand | ⏸ Auf V2 verschieben |

**Empfehlung:** **WEB + KJV + ASV** für Version 1 (3 von 5 Übersetzungen). Das ist eine bewusste Verkleinerung gegenüber der „alle 5" ­Formulierung in [[15_Biblia_Restabhaengigkeit_Analyse]]/[[16_MCP2_Zielarchitektur]]: Bei ~31.100 Versen je Übersetzung ([[14_Project_Completion_Report]]) bedeuten 3 Übersetzungen bereits ~93.300 zu verifizierende Verse — konsistent mit der Projektregel „kleine, abgeschlossene Schritte" und mit Risiko 2 aus [[16_MCP2_Zielarchitektur]] §19 (Datenqualitätsrisiko wächst mit dem Umfang). DARBY und YLT sind als klar benannte V2-Erweiterung vorgesehen, sobald Beschaffungs-/Build-/Verifikationspipeline an 3 Übersetzungen bewährt ist — reine Datenerweiterung ohne Codeänderung an `LocalBibleTextProvider` selbst (siehe [[16_MCP2_Zielarchitektur]] §13 Punkt 1).

---

## 3. Auslieferungsform

| Option | Bewertung |
|---|---|
| **Direkt im Repository** | Einfachstes Setup (funktioniert sofort nach `git clone` + `npm install`, keine Netzwerkabhängigkeit selbst bei Erstinstallation). Aber: mehrere MB Binärdaten je Übersetzung, Git ist für große binäre SQLite-Dateien nicht gut geeignet (jede Korrektur bläht die Historie dauerhaft auf), erschwert Clone-/Fork-Größe langfristig. |
| **GitHub Release Asset** | Repository bleibt schlank, Download nur bei Bedarf, sauber versionierbar über Release-Tags (passend zum bestehenden `logos-mcp-v*`-Tag-Schema). Erfordert einen zusätzlichen, aber einmaligen Setup-Schritt. Nach dem Download vollständig offline nutzbar. |
| **Download beim Setup (automatisiert, z. B. `postinstall`)** | Bequemster Nutzerfluss, aber automatische Netzwerkzugriffe bei `npm install` sind ein bekanntes Supply-Chain-Risikomuster und sollten in einem Projekt, das gerade erst „lokal-first, kein Zwangs-Netzwerkzugriff" als Leitprinzip etabliert hat ([[16_MCP2_Zielarchitektur]] §1), vermieden werden. |
| **Separates Repository** | Sauberste Code/Daten-Trennung, eigener Lebenszyklus für den Korpus, potenziell wiederverwendbar für andere Projekte. Für ein Projekt dieser Größe strukturell überdimensioniert (zwei Repos pflegen, Submodule oder manuelles Nachziehen nötig). |

**Empfehlung:** **GitHub Release Asset**, verbunden mit einem **expliziten, dokumentierten** Setup-Schritt (kein automatischer Hook) — z. B. ein `npm run fetch-corpus`-Skript oder eine manuelle Download-Anleitung im README, analog zum bestehenden Muster `LOGOS_DATA_DIR`/`LOGOS_CATALOG_DIR` (Umgebungsvariable `LOCAL_BIBLE_CORPUS_PATH`, bereits in [[16_MCP2_Zielarchitektur]] §9 vorgesehen). Das hält das Repository schlank, vermeidet Git-Bloat, bleibt aber deutlich einfacher zu pflegen als ein separates Repository.

---

## 4. Dateiformat

| Format | Bewertung |
|---|---|
| **SQLite + FTS5** | Deckt Lookup (`get_bible_text`) *und* Volltextsuche (`search_bible`) aus einer einzigen Datei ab. `better-sqlite3` ist bereits Projektabhängigkeit — kein neues Package. Read-only-Zugriffsmuster identisch zu `sqlite-reader.ts`/`catalog-reader.ts` (konsistentes Codemuster). Kompakt durch Indexierung. Nachteil: binäres Format, in Git nicht sinnvoll diffbar (spricht zusätzlich für Auslieferung außerhalb des Repos, siehe Abschnitt 3); FTS5-Tokenizer-Wahl muss bewusst getroffen werden. |
| **JSON** | Menschenlesbar, gut diffbar, kein natives Modul nötig. Aber: keine eingebaute Volltextsuche — müsste vollständig selbst in JavaScript implementiert werden (linearer Scan oder eigener Index), größere Dateigröße ohne Indexkompression, muss beim Start vollständig in den Speicher geladen werden statt per SQL-Query abgefragt zu werden. |
| **Mehrere Textdateien (z. B. je Buch/Kapitel)** | Nah am Quellformat, leicht gegen die Originalquelle zu verifizieren. Aber: Lookup erfordert eigene Datei-Parsing-/Indexierungslogik zur Laufzeit, Range-Queries über Kapitel-/Versgrenzen hinweg sind unhandlich, Volltextsuche noch aufwändiger als bei JSON selbst zu bauen. |
| **Andere Alternativen** (z. B. eingebettete Key-Value-Stores wie LevelDB, eigene Lucene-artige Indexdateien wie Logos' `catalog.db`-Volltextindex, siehe [[12_Lokale_Datenquellen_Analyse]] §1) | Zusätzliche Abhängigkeit ohne Mehrwert gegenüber SQLite, das bereits Projektstandard ist und FTS5 bereits fertig mitliefert — kein Bedarf für exotischere Lösungen in diesem Projektumfang. |

**Empfehlung:** **SQLite + FTS5**, wie bereits in [[16_MCP2_Zielarchitektur]] §5/§7 vorgesehen — die einzige geprüfte Option, die Lookup und Suche aus einer Datei mit bereits vorhandener Projektabhängigkeit und konsistentem Zugriffsmuster abdeckt.

---

## 5. Lizenz- und Quellenprüfung je Übersetzung

Recherchiert direkt an den Copyright-Seiten der jeweiligen Quelle (nicht nur aus Sekundärangaben übernommen), da frühere Projektdokumente „gemeinfrei" pauschal ohne Einzelprüfung angenommen hatten.

| Übersetzung | Gemeinfrei-Status | Besonderheit | Empfohlene Quelle |
|---|---|---|---|
| **WEB** | Vollständig gemeinfrei, weltweit, keine geografische Einschränkung. Ausdrücklich der Public Domain gewidmet. | Namensschutz **nur auf den Titel** „World English Bible" bei inhaltlicher Textänderung (Trademark, nicht Copyright) — bei unveränderter Textübernahme unkritisch. | ebible.org / worldenglish.bible (Primärquelle des Übersetzungsprojekts selbst) |
| **KJV** | Gemeinfrei außerhalb des Vereinigten Königreichs. Innerhalb des UK: keine Urheberrechte im eigentlichen Sinn, aber eine **Crown-„Letters Patent"-Beschränkung** — Druck-/Vertriebsmonopol für den Queen's Printer (Cambridge University Press, Oxford University Press, Collins). | Für dieses Projekt (digitale Bereitstellung über GitHub, kein gezielter Druck/Vertrieb im UK) praktisch geringes Risiko, **muss aber dokumentiert werden** (README/Lizenzhinweis), damit UK-Nutzer informiert sind. | ebible.org, dessen eigene Copyright-Seite genau diese Unterscheidung explizit macht |
| **ASV (1901)** | Gemeinfrei seit 1957 (Ablauf des US-Copyrights nach Übertragung an das International Council of Religious Education). Keine bekannten Einschränkungen. | — | ebible.org |
| **DARBY** | Gemeinfrei, keine bekannten Einschränkungen (Übersetzung von 1890, Autor 1882 verstorben). | — | ebible.org |
| **YLT** | Gemeinfrei, keine bekannten Einschränkungen (Übersetzung von 1862/1898). | — | ebible.org |

**Genereller Prüfschritt vor jeder tatsächlichen Bündelung (für alle 5, nicht nur V1), als Teil von Phase C, nicht dieser Phase:**
1. Copyright-/Lizenzseite der gewählten Quelle unmittelbar vor dem Download erneut prüfen (Statusänderungen sind bei diesen historischen Texten unwahrscheinlich, aber nicht auszuschließen).
2. Stichprobenvergleich (mindestens 10 bekannte Verse je Übersetzung) gegen eine zweite, unabhängige Quelle — prüft Texttreue der gewählten Quelle selbst, nicht nur deren Lizenz.
3. Attribution/Lizenztext im Repository dokumentieren (z. B. `logos-mcp-server/data/CORPUS_LICENSES.md`), auch wenn bei gemeinfreien Werken rechtlich nicht zwingend erforderlich — konsistent mit der bisherigen Dokumentationsdisziplin des Projekts.

**Quellen dieser Recherche:**
- [King James Version + Apocrypha — Copyright](https://ebible.org/kjv/copyright.htm)
- [World English Bible — Copyright](https://ebible.org/eng-web/copyright.htm)
- [World English Bible — Wikipedia](https://en.wikipedia.org/wiki/World_English_Bible)
- [American Standard Version — Wikipedia](https://en.wikipedia.org/wiki/American_Standard_Version)
- [American Standard Version (1901) — eBible.org](https://ebible.org/asv/copyright.htm)
- [Young's Literal Translation — eBible.org](https://ebible.org/find/show.php?id=engylt)
- [Darby Bible — Wikipedia](https://en.wikipedia.org/wiki/Darby_Bible)

---

## 6. Mindestanforderungen

| Bereich | Mindestanforderung |
|---|---|
| **Datenqualität** | Stichprobenverifikation gegen mindestens 2 unabhängige Quellen je Übersetzung (siehe Abschnitt 5); automatisierter Vollständigkeits-Check (Versanzahl je Buch/Kapitel muss exakt mit `versification.ts` übereinstimmen); Hash-/Checksummenvergleich bei jedem Korpus-Rebuild zur Regressionserkennung. |
| **Verszählung** | Muss exakt der bereits bestehenden, verifizierten `versification.ts` entsprechen (66 Bücher, 1.189 Kapitel, 31.102 Verse, [[14_Project_Completion_Report]]) — **keine neue Versifikationstabelle**, sofern empirisch bestätigt wird, dass WEB/KJV/ASV derselben Standard-Englisch-Versifikation folgen (begründete Erwartung, da alle der englisch-protestantischen Tradition entstammen — **aber noch nicht am realen Text verifiziert**, siehe Risiken unten). |
| **Psalmenüberschriften** | Bekannte Diskrepanz zwischen masoretischer/hebräischer Zählung (Überschrift = Vers 1) und englischer Tradition (Überschrift nicht mitgezählt). Erwartung: Alle Kandidatenübersetzungen folgen der englischen Tradition — **muss vor Korpusaufbau an den bekanntermaßen betroffenen Psalmen (z. B. Psalm 3, 51, 60) am realen Text verifiziert werden**, sonst sind Versgrenzen im Korpus falsch. |
| **Deutsche und englische Buchnamen** | Bereits vorhanden in `reference-parser.ts` (`BOOK_TO_LOGOS`, `GERMAN_ALIAS_TO_BOOK` aus der `scan_references`-Migration, [[14_Project_Completion_Report]]). Der Korpus-Build-Schritt muss dieselben kanonischen Buchbezeichner verwenden — keine zweite, parallele Buchnamens-Wahrheit. |
| **Referenznormalisierung** | Lookup muss über dieselbe `parseReference()`-Pipeline laufen wie alle anderen Tools — kein separater Parser für den Korpus. `LocalBibleTextProvider` (Phase D) muss `reference-parser.ts` direkt wiederverwenden. |
| **Suchindex** | FTS5 mit bewusst gewähltem Tokenizer (z. B. `unicode61` mit Case-Folding); deterministisches `bm25()`-Ranking (reproduzierbare Ergebnisse bei gleicher Anfrage); Query-Escaping gegen FTS5-Sonderzeichen (bereits als Risiko 9 in [[16_MCP2_Zielarchitektur]] §19 benannt). |
| **Offline-Nutzung** | Nach einmaligem Download/Setup darf für die gebündelten Übersetzungen **kein** weiterer Netzwerkzugriff mehr nötig sein — verifizierbar durch einen Testlauf ohne aktive Netzwerkverbindung. |
| **Update-Strategie** | Korpusdatei erhält eine eigene Versionierung, unabhängig von `SERVER_VERSION` (z. B. Dateiname `bible-corpus-v1.db` oder Metadatentabelle in der SQLite-Datei); der Server prüft beim Laden ein Schema-/Versionsfeld und meldet klar, wenn eine inkompatible/veraltete Korpusdatei vorliegt, statt kryptisch zu scheitern (konsistent mit der in [[16_MCP2_Zielarchitektur]] §11 vorgesehenen Fehlertaxonomie „Korpus-Fehler"). |

---

## 7. Entscheidungsmatrix

### 7.1 Default-Übersetzung

Diese Matrix vergleicht die Übersetzungsoptionen als reine *Textwahl*, unabhängig davon, auf welcher Ebene sie zum Tragen kommen. Die maßgebliche, zweistufige Empfehlung (öffentliche API vs. interne `LocalBibleProvider`-Implementierung) steht in Abschnitt 1 — die Spalte „Empfehlung" bezieht sich hier auf die **interne** Standardübersetzung des `LocalBibleProvider`, nicht auf `DEFAULT_BIBLE`/die öffentliche API, die vorerst unverändert bleibt.

| Option | Vorteile | Nachteile | Risiko | Aufwand | Empfehlung (intern) |
|---|---|---|---|---|---|
| LEB beibehalten (weiterhin öffentlicher Default) | Kein Bruch mit aktueller Nutzererwartung/README-Text; kein API-Risiko | Nicht gemeinfrei, kann von `LocalBibleProvider` nie selbst bedient werden | Keines auf API-Ebene (Status quo bleibt) | Keiner (keine Änderung) | ✅ **Für die öffentliche API unverändert beibehalten** |
| **WEB** | Vollständig gemeinfrei, modern, bereits unterstützter Code | Weniger „kanonisch" als KJV | Gering | Gering (interne Providerlogik, keine API-Änderung) | ✅ **Als interner `LocalBibleProvider`-Standard empfohlen** |
| KJV | Meistbekannt/-zitiert | Archaisches Englisch, UK-Sonderfall | Gering–mittel (Dokumentationspflicht UK) | Gering | ⚠️ Gute interne Alternative, aber Zweitwahl |
| ASV/YLT/DARBY | Gemeinfrei, unproblematisch | Archaisch bzw. Nischenpublikum, ungeeignet als Erstkontakt | Gering | Gering | ❌ Als interner Standard ungeeignet |

### 7.2 Übersetzungsumfang Version 1

| Option | Vorteile | Nachteile | Risiko | Aufwand | Empfehlung |
|---|---|---|---|---|---|
| Nur WEB (Default allein) | Minimaler Scope, schnellster erster Durchlauf | `get_available_bibles` verspricht mehr, als `get_bible_text` lokal böte (Erwartungslücke, siehe [[13_Implementierungsplan_Migration]] Tool 1 Risiko) | Gering | Sehr gering | ❌ Zu knapp |
| **WEB + KJV + ASV** | Deckt modernen, bekanntesten und wörtlicheren Standard ab; überschaubarer Verifikationsaufwand (~93.300 Verse) | DARBY/YLT-Nutzer müssen auf V2 warten | Gering–mittel (Datenqualität bei 3 Übersetzungen) | Mittel | ✅ **Empfohlen** |
| Alle 5 (WEB, KJV, ASV, DARBY, YLT) | Vollständige Parität mit bisheriger Biblia-Übersetzungsliste | ~155.500 Verse zu verifizieren, höheres Fehlerrisiko in einem Schritt | Mittel–hoch (Risiko 2, [[16_MCP2_Zielarchitektur]] §19) | Hoch | ⚠️ Möglich, aber nicht empfohlen für V1 |

### 7.3 Auslieferungsform

| Option | Vorteile | Nachteile | Risiko | Aufwand | Empfehlung |
|---|---|---|---|---|---|
| Im Repository | Kein Zusatzschritt, sofort offline | Git-Bloat, wächst mit jeder Korrektur dauerhaft | Mittel (Repo-Hygiene) | Gering (einmalig) | ❌ |
| **GitHub Release Asset** | Repo bleibt schlank, versionierbar, danach vollständig offline | Ein zusätzlicher, aber einmaliger Setup-Schritt | Gering | Mittel (Release-Pflege) | ✅ **Empfohlen** |
| Automatischer Download beim Setup | Bequemster Nutzerfluss | Unerwünschter automatischer Netzwerkzugriff (Supply-Chain-Muster), widerspricht Lokal-first-Prinzip | Mittel–hoch | Gering | ❌ |
| Separates Repository | Sauberste Trennung, wiederverwendbar | Struktureller Mehraufwand für Projektgröße unangemessen | Gering | Hoch | ❌ Überdimensioniert |

### 7.4 Korpusformat

| Option | Vorteile | Nachteile | Risiko | Aufwand | Empfehlung |
|---|---|---|---|---|---|
| **SQLite + FTS5** | Lookup + Suche aus einer Datei, bestehende Abhängigkeit, konsistentes Codemuster | Binär, nicht diffbar in Git | Gering | Mittel (Tokenizer-Wahl) | ✅ **Empfohlen** |
| JSON | Menschenlesbar, diffbar | Keine eingebaute Suche, muss komplett selbst gebaut werden, kein Index | Mittel (Performance/Komplexität bei Suche) | Hoch (Suchimplementierung) | ❌ |
| Mehrere Textdateien | Quellnah, gut verifizierbar | Kein SQL, eigene Lookup-/Suchlogik nötig | Mittel | Hoch | ❌ |
| Andere (LevelDB u. Ä.) | — | Neue Abhängigkeit ohne Mehrwert ggü. SQLite | Gering–mittel | Hoch (neue Technologie) | ❌ Unnötig |

---

## 8. Empfehlung

| Entscheidung | Empfehlung |
|---|---|
| **Default-Übersetzung** | Zweistufig: **öffentliche API bleibt vorerst kompatibel** (`DEFAULT_BIBLE` unverändert, kein Tool-Verhalten ändert sich) · **intern** darf der künftige `LocalBibleProvider` `WEB` als eigenen Standard verwenden · das Verhalten bei lokal nicht verfügbarem `LEB` entscheidet später die Provider-/Resolver-Schicht (Phase D/E), nicht diese Phase (siehe Abschnitt 1) |
| **Übersetzungsumfang Version 1** | `WEB` (Default) + `KJV` + `ASV` — `DARBY` und `YLT` explizit für Version 2 vorgemerkt |
| **Korpusformat** | SQLite + FTS5, in einer Datei (Lookup-Tabelle + FTS5-Virtual-Table) |
| **Auslieferungsform** | GitHub Release Asset, expliziter (nicht automatischer) Setup-Schritt über `LOCAL_BIBLE_CORPUS_PATH` |
| **Nächste technische Phase** | **Phase C** aus [[16_MCP2_Zielarchitektur]] §18 (Korpus beschaffen und aufbereiten) — aber erst nach expliziter Freigabe dieser vier Punkte durch den Nutzer. Empfohlener **erster Teilschritt** von Phase C: ein reiner Verifikations-Spike (Stichprobenverse + Psalmenüberschriften-Check am tatsächlichen Rohtext der 3 gewählten Übersetzungen, **vor** dem eigentlichen Build-Skript) — konsistent mit der in [[14_Project_Completion_Report]] dokumentierten Lehre „technische Prämissen vor Umsetzung verifizieren, nicht annehmen". |

---

## Offene Risiken nach dieser Phase

1. **Versifikations-/Psalmenüberschriften-Gleichheit ist noch nicht am realen Text verifiziert** (nur begründet erwartet) — größtes technisches Restrisiko vor Phase C, siehe Abschnitt 6.
2. **Exaktes Rohformat der Quelle (USFM, Klartext, o. Ä.) ist noch nicht abschließend geprüft** — diese Recherche hat den Lizenzstatus verifiziert, nicht das genaue maschinenlesbare Downloadformat von ebible.org; das ist ein Verifikationsschritt für den Beginn von Phase C, keine Blockade für diese Entscheidungsphase.
3. **KJV-UK-Sonderfall muss dokumentiert werden**, sobald KJV tatsächlich gebündelt wird (README/Lizenzhinweis) — sonst besteht ein (geringes, aber unnötiges) Transparenzrisiko gegenüber UK-Nutzern.
4. **Release-Asset-Pflege ist ein neuer wiederkehrender Aufwand** (Punkt „Update-Strategie", Abschnitt 6) — bislang hatte das Projekt keine Binärartefakte zu pflegen.
5. **Scope-Reduktion auf 3 Übersetzungen für V1 ist eine Abweichung** von der in [[15_Biblia_Restabhaengigkeit_Analyse]]/[[16_MCP2_Zielarchitektur]] skizzierten „alle 5"-Variante — bewusst und begründet (Abschnitt 2), aber explizit zur Freigabe vorgelegt, nicht stillschweigend festgelegt.
6. **`get_available_bibles`/`locallyRetrievable`-Erwartungslücke bleibt für DARBY/YLT bis V2 bestehen** — bereits als Risiko in [[13_Implementierungsplan_Migration]] und [[16_MCP2_Zielarchitektur]] §19 Risiko 6 benannt, hier für den konkreten V1-Scope bestätigt.

## Nicht Teil dieser Phase

- Keine Codeänderung, kein Build-Skript, kein tatsächlicher Download von Bibeltext.
- Keine finale Entscheidung, sondern eine zur Freigabe vorgelegte Empfehlung — die vier Kernpunkte in Abschnitt 8 sind noch vom Nutzer zu bestätigen, bevor Phase C beginnt.
- Keine Bewertung nicht-englischer Korpora (z. B. Luther 1912, Schlachter 1951) — bleibt wie in [[16_MCP2_Zielarchitektur]] §13 als spätere Erweiterungsmöglichkeit vorgemerkt, nicht Teil von V1.
