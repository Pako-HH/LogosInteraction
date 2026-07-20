# 31 — Phase 4C: Lokaler Cross-Reference-Korpus (Abschlussbericht)

**Status: Abschlussbericht für Phase 4C. Schritt 4C-5 gemäß [[28_Phase4_Masterplan]].**

Grundlage: [[25_Phase4A_Architektur_Machbarkeitsanalyse]] §7 (Architektur A, Kandidatenquelle), [[28_Phase4_Masterplan]] §4/6 (verbindliche Definition und Zerlegung von Phase 4C), [[27_Architecture_Review_und_Strategie_v2]] Teil II §5/6 (Zitations-/Provenienzprinzip).

---

## 1. Ziel

Den bestehenden `HeuristicCrossReferenceProvider` (reine Stichwort-Heuristik, bekannte Qualitätslücke laut [[24_Phase3_Abschlussbericht]] §6) um einen strukturierten, gemeinfreien Cross-Reference-Korpus ergänzen — nach demselben lokal-first-Muster wie der Bibelkorpus aus Phase 3 — und dabei erstmals ein Provenienz-Feld einführen, das in der Tool-Antwort sichtbar macht, ob ein Ergebnis aus dem kuratierten Korpus oder aus der Heuristik stammt.

## 2. Umsetzung

| Schritt | Inhalt | Commit | Tag |
|---|---|---|---|
| **4C-1** | Lizenz- und Verifikations-Spike (openbible.info Cross References) — Lizenzkorrektur CC BY 4.0 statt der vorläufig angenommenen CC0 | `1abe8e9` | `logos-mcp-v3.0-phase4c1` |
| **4C-2** | Build-Pipeline (`scripts/build-cross-reference-corpus.ts`) + realer Korpus (344.799 Einträge) | `dded08e` | `logos-mcp-v3.1-phase4c2` |
| **4C-3** | `LocalCrossReferenceProvider` (liest den Korpus, löst Vorschautext über einen injizierten `BibleTextProvider` auf) | `909fe6e` | `logos-mcp-v3.2-phase4c3` |
| **4C-4** | `CrossReferenceResolver` (lokal-first, Fallback auf `HeuristicCrossReferenceProvider`, additives Provenienz-Feld `source`) | `f057486` | `logos-mcp-v3.3-phase4c4` |
| **4C-5** | Integration in `index.ts`, Provenienz sichtbar in der Tool-Antwort, End-to-End-Tests, dieser Bericht | *(dieser Commit)* | *(folgt nach Freigabe)* |

## 3. Architekturentscheidungen (Rückblick über die gesamte Phase)

- **Bereichs-Modellierung (4C-2):** Cross-Reference-Zielbereiche (z. B. `Prov.8.22-Prov.8.30`) werden als vollständiges Start- **und** Endreferenz-Paar gespeichert, nicht nur als Verszahlen — nötig, da Bereiche in seltenen Fällen kapitel- (637×) und sogar buchübergreifend (18×) sein können.
- **Vorzeichenbehaftete Stimmen (4C-2):** Der Datensatz enthält negative `Votes`-Werte (Community-Abwertungen) — als Integer, nicht als vorzeichenlose Zahl behandelt.
- **Vorschautext nur vom Startvers eines Bereichs (4C-3):** Bewusste Vereinfachung — eine „Preview" ist per Definition ein kurzer Ausschnitt, dieselbe Praxis wie bei `HeuristicCrossReferenceProvider`s Suchtreffer-Previews.
- **Fallback-Auslöser des Resolvers (4C-4):** Anders als `BibleTextResolver`/`SearchResolver` (die nur auf Basis von `supports()` zurückfallen) fällt `CrossReferenceResolver` **sowohl bei einem Fehler als auch bei leerem lokalem Ergebnis** auf die Heuristik zurück — begründet damit, dass `CrossReferenceProvider` kein `supports()` kennt und ein leeres kuratiertes Ergebnis für eine gültige Referenz ein legitimes „hier nicht lokal abgedeckt"-Signal ist, kein Datenfehler.
- **Provenienz additiv, vom Resolver gesetzt, nicht von den einzelnen Providern (4C-4/4C-5):** `LocalCrossReferenceProvider` und `HeuristicCrossReferenceProvider` bleiben selbst unverändert; `CrossReferenceResolver` markiert das Ergebnis nachträglich mit `source: "local-curated" | "heuristic"` — ein optionales, additives Feld auf `CrossReferenceResult`.
- **Provenienz-Text additiv in der Tool-Antwort (4C-5):** Der bisherige Antworttext (`Cross-references for **X**:\n\n...` bzw. `No cross-references found for X.`) bleibt als Präfix vollständig erhalten; die Quellenangabe wird angehängt (`\n\n_Source: ...\n` bzw. ` (Source: ...)`), nicht ersetzt — kein stiller Breaking Change, analog zur bereits in Phase 3 geübten Sorgfalt beim `bible`-Parameter.

## 4. Test- und Build-Ergebnisse

```
npm run build   → keine Fehler
npm test        → 25 Testdateien, 296/296 Tests grün
```

Testzuwachs über Phase 4C: von 253 Tests (Stand Phase 4B) auf 296 Tests (+43 — 0 in 4C-1 (reine Analyse), 20 Build-Pipeline-Tests in 4C-2, 14 Provider-Tests in 4C-3, 7 Resolver-Tests in 4C-4, 2 End-to-End-Integrationstests in 4C-5). Jeder Teilschritt wurde einzeln mit grünem Build+Testlauf abgeschlossen, einzeln freigegeben, committet, getaggt und gepusht, bevor der jeweils nächste begann.

## 5. Verifiziertes Verhalten

- Eine Anfrage, deren Buch/Kapitel/Vers **und** Übersetzung sowohl im lokalen Cross-Reference-Korpus als auch im lokalen Bibelkorpus abgedeckt sind, wird vollständig lokal beantwortet — Biblia wird nie aufgerufen — und die Tool-Antwort zeigt `_Source: local cross-reference corpus_`.
- Eine Anfrage ohne lokale Cross-Reference-Abdeckung fällt transparent auf die bestehende Heuristik zurück; die Tool-Antwort zeigt `_Source: heuristic keyword search_` bzw. `(Source: heuristic keyword search)` bei leerem Ergebnis.
- Fehlt der lokale Cross-Reference-Korpus vollständig (z. B. nicht gebaut), degradiert der Server exakt auf das Vor-4C-5-Verhalten (reine Heuristik) — kein Absturz beim Serverstart, dasselbe Muster wie bei `LocalBibleTextProvider`/`LocalSearchProvider`.
- Alle vier bereits bestehenden `get_cross_references`-Tests (aus Phase 3) sind ohne Anpassung weiterhin grün — verifiziert, dass die additive Fehlerbehandlung des Resolvers auch dann korrekt auf die Heuristik zurückfällt, wenn der reale, bereits lokal gebaute Cross-Reference-Korpus (aus 4C-2) mit einer im jeweiligen Test verwendeten, kleineren Bibeltext-Fixture kollidiert.

## 6. Bekannte Einschränkungen / bewusst zurückgestellte Punkte

- **Test-Isolation der vier bestehenden `index.*.test.ts`-Dateien beruht auf konvergentem Fallback-Verhalten, nicht auf expliziter Pfad-Isolation.** Diese Testdateien setzen `LOCAL_CROSS_REFERENCE_CORPUS_PATH` nicht explizit, wodurch sie (auf dieser Maschine) den echten, in 4C-2 gebauten Korpus vorfinden. Das führt zu Vorschautext-Auflösungsfehlern gegen die jeweils kleinen Bibeltext-Fixtures dieser Tests, die vom `CrossReferenceResolver` sauber abgefangen werden und auf die Heuristik zurückfallen — beobachtbar identisch zu einem fehlenden Korpus. Die Tests bleiben dadurch korrekt, aber die Isolation ist implizit statt explizit. **Bewusst nicht behoben in diesem Schritt** (kein Vorgabe im Masterplan, keine zusätzliche Refaktorierung außerhalb des definierten Umfangs) — als Beobachtung für eine künftige Aufräumphase festgehalten.
- **`get_cross_references`-Heuristik-Qualitätslücke aus [[24_Phase3_Abschlussbericht]] §6** bleibt für alle Fälle bestehen, die nicht lokal-curated abgedeckt sind — unverändert durch Phase 4C.
- **Korpus noch nicht als Release Asset veröffentlicht** — wie schon beim Bibelkorpus in Phase 3, aktuell nur per lokalem Build verfügbar.

## 7. Empfehlung für die nächste Phase

Gemäß [[28_Phase4_Masterplan]] §6: **Phase 4D** (Anbindung ungenutzter lokaler Nutzerdaten-DBs: `readingprogressmanager.db`-Fix, `history.db`-Tool, `ResourceCollectionManager.db`-Tool) — jeweils klein, unabhängig, ohne neuen Provider/Resolver. Beginn erst nach expliziter Freigabe.

---

## Nicht Teil dieser Phase

- Keine Änderung an bereits committeten Schritten 4C-1–4C-4.
- Keine explizite Test-Isolation der vier bestehenden `index.*.test.ts`-Dateien (siehe Abschnitt 6).
- Kein Beginn von Phase 4D.
