# 29 — Phase 4B: `DEFAULT_BIBLE` konfigurierbar (Abschlussbericht)

**Status: Abschlussbericht für Phase 4B. Schritt 4B.4 gemäß [[28_Phase4_Masterplan]].**

Grundlage: [[25_Phase4A_Architektur_Machbarkeitsanalyse]] §5 (Entscheidungsanalyse, Option C empfohlen), [[28_Phase4_Masterplan]] §4/5 (verbindliche Definition und Zerlegung von Phase 4B), [[24_Phase3_Abschlussbericht]] §8 Punkt 1 (Auslöser: „Offene Entscheidung explizit treffen: `DEFAULT_BIBLE`").

---

## 1. Ziel

Die in [[17_Phase3B_Korpus_Produktentscheidungen]] bewusst vertagte `DEFAULT_BIBLE`-Frage umsetzen — als konfigurierbarer Default (Option C aus [[25_Phase4A_Architektur_Machbarkeitsanalyse]] §5): eingebauter Wert bleibt `"LEB"` (kein Breaking Change ohne explizites Opt-in), aber per Umgebungsvariable überschreibbar, damit Nutzer mit gebautem lokalen Korpus einen vollständig lokalen, key-freien Standardpfad wählen können.

## 2. Umsetzung

| Schritt | Inhalt | Commit | Tag |
|---|---|---|---|
| **4B.1** | `config.ts`: `DEFAULT_BIBLE` liest optional `process.env.DEFAULT_BIBLE` (getrimmt), Fallback `"LEB"`; 4 neue Unit-Tests (`tests/config.test.ts`) | `8e429bb` | `logos-mcp-v2.6-phase4b1` |
| **4B.2** | End-to-End-Integrationstest über den echten MCP-Client (`tests/index.default-bible-override.integration.test.ts`, 3 neue Tests): beweist, dass ein gesetztes `DEFAULT_BIBLE=WEB` bis in `get_bible_text`/`get_cross_references` ohne expliziten `bible`-Parameter durchschlägt und lokal aufgelöst wird, während der unveränderte Default (`LEB`) weiterhin über Biblia läuft | `98b9a9c` | `logos-mcp-v2.7-phase4b2` |
| **4B.3** | Dokumentation: neuer README-Abschnitt „Optional: Set a fully local default translation" mit `.mcp.json`-Beispiel; datiertes Addendum in `docs/07_Bekannte_Probleme.md` P1 | `b023fae` | `logos-mcp-v2.8-phase4b3` |
| **4B.4** | Dieser Abschlussbericht | *(dieser Commit)* | `logos-mcp-v2.9-phase4b-complete` |

**Keine neuen Provider oder Resolver** — wie in [[28_Phase4_Masterplan]] §4 begründet vorweggenommen, war dies eine reine Erweiterung der bestehenden Konfigurationsschicht, da alle Tools `DEFAULT_BIBLE` bereits zuvor als einfachen exportierten Wert konsumierten.

## 3. Architekturentscheidungen (Rückblick)

- **`||` statt `??`** bei der Env-Var-Auswertung: bewusste Abweichung vom sonst in `config.ts` konsistenten `??`-Muster, damit ein gesetzter, aber leerer oder nur aus Leerzeichen bestehender Wert ebenfalls auf `"LEB"` zurückfällt, statt als ungültiger leerer String durchgereicht zu werden.
- **Keine Wertvalidierung** des Override-Werts: ein unbekannter oder nicht lokal verfügbarer Wert wird bereits von der bestehenden Resolver-Fallback-Logik (`BibleTextResolver`/`SearchResolver`) korrekt auf Biblia umgeleitet — zusätzliche Validierung an der Konfigurationsschicht hätte bestehende Logik dupliziert.

## 4. Test- und Build-Ergebnisse

```
npm run build   → keine Fehler
npm test        → 21 Testdateien, 253/253 Tests grün
```

Testzuwachs über Phase 4B: von 246 Tests (Stand Phase 3, siehe [[24_Phase3_Abschlussbericht]] §5) auf 253 Tests (+7 — 4 Unit-Tests für die Konfigurationslogik, 3 End-to-End-Integrationstests über das echte MCP-Protokoll). Jeder Teilschritt wurde einzeln mit grünem Build+Testlauf abgeschlossen und einzeln freigegeben, committet, getaggt und gepusht (siehe Tabelle in Abschnitt 2), bevor der jeweils nächste begann.

## 5. Verifiziertes Verhalten

- Ohne gesetztes `DEFAULT_BIBLE`: unverändertes Bestandsverhalten — `LEB` bleibt Default, weiterhin über Biblia (kein Breaking Change).
- Mit `DEFAULT_BIBLE=WEB` **und** gebautem lokalen Korpus: `get_bible_text`, `get_passage_context`, `search_bible` und `get_cross_references` lösen **ohne** expliziten `bible`-Parameter vollständig lokal auf — Biblia wird für diese Fälle nie aufgerufen (End-to-End über den echten `Client`/`InMemoryTransport`-Verbindungsaufbau bewiesen, nicht nur unit-getestet).
- Ein expliziter `bible`-Parameter (egal welcher Wert) funktioniert unverändert wie vor Phase 4B — die Änderung betrifft ausschließlich das Default-Verhalten bei fehlendem Parameter.

## 6. Bekannte Einschränkungen (unverändert, nicht Gegenstand dieser Phase)

- **P1 (kompromittierter Biblia-Key) bleibt bestehen.** Phase 4B löst P1 nicht, sondern macht die Blockade **umgehbar**: Nutzer, die `DEFAULT_BIBLE` explizit setzen und den lokalen Korpus gebaut haben, sind vom Standardpfad her nicht mehr betroffen; wer nichts konfiguriert oder explizit `LEB`/eine andere nicht lokal gebündelte Übersetzung anfragt, bleibt weiterhin blockiert (siehe aktualisiertes Addendum in [[07_Bekannte_Probleme]]).
- **`get_cross_references`-Suchqualitäts-Einschränkung** aus [[24_Phase3_Abschlussbericht]] §6 Punkt 1 (Heuristik passt schlecht zur strikten lokalen Phrasensuche) ist von Phase 4B unberührt und weiterhin offen.

## 7. Empfehlung für die nächste Phase

Gemäß [[28_Phase4_Masterplan]] §6: **Phase 4C** (gemeinfreier Cross-Reference-Korpus, mit erstmaliger Einführung eines Provenienz-Felds gemäß [[27_Architecture_Review_und_Strategie_v2]] Teil II §5/6) — Beginn erst nach expliziter Freigabe, feinere Zerlegung in commit-große Schritte analog zu 4B.1–4B.3 zu Phasenbeginn.

---

## Nicht Teil dieser Phase

- Keine Codeänderung außer dieser einen neuen Datei.
- Keine Änderung an bereits committeten Schritten 4B.1–4B.3.
- Kein Beginn von Phase 4C.
