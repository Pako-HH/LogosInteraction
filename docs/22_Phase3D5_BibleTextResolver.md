# 22 — Phase 3D-5: BibleTextResolver — lokal-first mit Biblia-Fallback

**Status: BibleTextResolver implementiert und in `index.ts` verdrahtet. Öffentliche API unverändert. Kein Tag, kein Push ohne Freigabe.**

Grundlage: [[16_MCP2_Zielarchitektur]] §4/§15 (Resolver-Vertrag), [[17_Phase3B_Korpus_Produktentscheidungen]] (öffentliche API bleibt kompatibel, `DEFAULT_BIBLE` bleibt `LEB`), [[21_Phase3D4_LocalBibleTextProvider]] (`LocalBibleTextProvider`).

---

## 1. Geänderte Dateien

**Neu:**

| Datei | Zweck |
|---|---|
| `logos-mcp-server/src/services/providers/bible-text-resolver.ts` | Der `BibleTextResolver` |
| `logos-mcp-server/tests/providers/bible-text-resolver.test.ts` | 11 Unit-Tests (reine Resolver-Logik, Fake-Provider) |
| `logos-mcp-server/tests/index.local-bible-resolver.integration.test.ts` | 5 echte End-to-End-Tests über das MCP-Protokoll mit Fixture-Korpus |

**Geändert:**

| Datei | Änderung |
|---|---|
| `logos-mcp-server/src/index.ts` | `bibleTextProvider` ist jetzt ein `BibleTextResolver` aus `LocalBibleTextProvider` (mit sicherem Null-Fallback, siehe Abschnitt 2) + `BibliaBibleTextProvider`, statt direkt `BibliaBibleTextProvider`. Kein Tool, keine Tool-Beschreibung, kein Parameter geändert. |
| `logos-mcp-server/tests/index.integration.test.ts` | Ein bestehender Test nutzte `bible: "WEB"`, um den Biblia-Pfad zu prüfen — das ist seit dieser Phase sachlich falsch (WEB löst jetzt lokal auf). Auf `bible: "LEB"` umgestellt (siehe Abschnitt 3) |

**Bestätigt unverändert** (per `git diff --stat`, leere Ausgabe): `biblia-bible-text-provider.ts`, `biblia-search-provider.ts`, `local-translation-provider.ts`, `heuristic-cross-reference-provider.ts`, `local-bible-text-provider.ts`. `search_bible` unverändert (weiterhin ausschließlich Biblia — kein `SearchResolver` in dieser Phase).

---

## 2. Implementierungsbeschreibung

### `BibleTextResolver`
Implementiert `BibleTextProvider` durch Komposition zweier Provider gemäß [[16_MCP2_Zielarchitektur]] §15:
```ts
async resolveText(passage, translation) {
  if (this.local?.supports(translation)) return this.local.resolveText(passage, translation);
  if (this.biblia?.supports(translation)) return this.biblia.resolveText(passage, translation);
  throw new Error(`Translation "${translation}" is not available ...`);
}
```
`supports()` analog: lokal ODER Biblia. Beide Fehlerarten (lokaler Fehler wie „No verses found", Biblia-Fehler wie ein 403) propagieren **unverändert** — der Resolver fängt sie nicht ab und versucht **nicht**, bei einem echten lokalen Fehler stillschweigend auf Biblia auszuweichen (das wäre ein „stiller Fallback bei Datenproblemen", nicht das hier beabsichtigte „Fallback bei fehlender Abdeckung").

### Bewusste Abweichung von der dokumentierten Signatur — und warum
[[16_MCP2_Zielarchitektur]] §15 skizziert `constructor(local: LocalBibleTextProvider, biblia: BibliaBibleTextProvider | null)` — `local` dort **nicht** nullable. Diese Phase weicht davon ab: **beide** Parameter sind `BibleTextProvider | null`.

**Grund:** `LocalBibleTextProvider`s Konstruktor öffnet die Korpusdatei sofort und **wirft**, wenn sie fehlt (Phase 3D-4, bewusst so entworfen für einen direkten Aufrufer). Die Instanziierung in `index.ts` geschieht aber auf Modulebene, beim Serverstart. Würde dieser Wurf ungefangen durchgereicht, **stünde der gesamte Server nicht mehr, sobald der lokale Korpus fehlt** (z. B. bei einem frischen Checkout ohne vorherigen `npm run build:corpus`-Lauf) — eine deutlich größere Regression als ein einzelner fehlschlagender Tool-Aufruf. `index.ts` fängt diesen Konstruktionsfehler jetzt ab und übergibt `null`:
```ts
function createLocalBibleTextProviderOrNull(): LocalBibleTextProvider | null {
  try {
    return new LocalBibleTextProvider();
  } catch (e) {
    console.error(`Local Bible corpus unavailable, falling back to Biblia only: ${e.message}`);
    return null;
  }
}
```
Fehlt der Korpus, verhält sich der Server **exakt wie vor Phase 3D-5** (ausschließlich Biblia, für alle Übersetzungen) — kein Absturz, keine neue harte Abhängigkeit, rein additive Fähigkeit.

### Auswirkung auf `DEFAULT_BIBLE`/öffentliche API
`DEFAULT_BIBLE` bleibt `"LEB"` (Phase-3B-Entscheidung, **nicht angetastet**). Da `index.ts` immer `bible ?? DEFAULT_BIBLE` auflöst, **bevor** es den Provider aufruft, erhält der Resolver nie eine undefinierte Übersetzung — Standardverhalten ohne expliziten `bible`-Parameter bleibt unverändert Biblia (LEB), da `LocalBibleTextProvider.supports("LEB")` `false` liefert. **Nur** wer explizit `bible: "WEB"`, `"KJV"` oder `"ASV"` angibt, bekommt ab jetzt eine lokale, netzwerklose Antwort. Kein Tool-Name, kein Parameter, kein Rückgabeformat hat sich geändert.

### `get_cross_references`/`get_passage_context` profitieren automatisch
Beide nutzen dieselbe `bibleTextProvider`-Instanz (Modulvariable) — keine eigene Änderung an ihrem Code nötig, per End-to-End-Test bestätigt (Abschnitt 3).

---

## 3. Testergebnis

```
npm run build   → keine Fehler
npm test        → 16 Testdateien, 211/211 Tests grün (195 bestehend + 16 neu)
```

**11 neue Resolver-Unit-Tests** (Fake-Provider, reine Logik): lokal bevorzugt und Biblia nie kontaktiert, wenn lokal zuständig; Fallback zu Biblia bei fehlender lokaler Abdeckung (der reale LEB-Fall); Fallback bei `local === null`; klarer Fehler, wenn weder lokal noch Biblia zuständig sind; lokale und Biblia-eigene Fehler propagieren unverändert (kein stiller Fallback bei einem echten Fehler); `supports()` in allen vier Kombinationen.

**5 neue echte End-to-End-Tests** (`tests/index.local-bible-resolver.integration.test.ts`, realer MCP-Client über `InMemoryTransport`, Fixture-Korpus über `LOCAL_BIBLE_CORPUS_PATH`): WEB/KJV/ASV werden lokal aufgelöst, **`biblia-api.ts`-Mock wird dabei nachweislich nie aufgerufen** (`expect(getBibleTextMock).not.toHaveBeenCalled()`); LEB fällt weiterhin korrekt auf den (gemockten) Biblia-Pfad zurück; `get_passage_context` profitiert transparent mit.

**Notwendige Korrektur an einem bestehenden Test** (`tests/index.integration.test.ts`): Ein Test aus Phase 3A nutzte `bible: "WEB"`, um „geht über Biblia" zu demonstrieren — das ist seit dieser Phase per Design nicht mehr wahr. Auf `bible: "LEB"` umgestellt (permanent stabile Wahl, da LEB laut [[15_Biblia_Restabhaengigkeit_Analyse]] nie lokal gebündelt wird) und mit erklärendem Kommentar versehen. Ohne diese Korrektur wäre der Test auf einer Maschine mit gebautem Korpus fehlgeschlagen, auf einer Maschine ohne Korpus aber zufällig weiterhin grün gewesen — ein latentes Umgebungsabhängigkeits-Risiko, das so vermieden wurde.

### Manuelle Verifikation gegen den echten Produktionskorpus
Zusätzlich mit dem echten `BibleTextResolver` gegen den realen 93.307-Vers-Korpus (WEB+KJV+ASV) geprüft: `supports("WEB")` → `true` (lokal), `resolveText("John 3:16", "WEB")` liefert den erwarteten lokalen Text ohne Netzwerk. `resolveText(..., "LEB")` fällt korrekt zu Biblia durch und liefert denselben, unveränderten Fehler wie vor dieser Phase („BIBLIA_API_KEY is not set...", da in dieser Umgebung kein Key konfiguriert ist) — **exakter Nachweis, dass sich das Fallback-Verhalten für LEB nicht verändert hat.**

---

## 4. Bekannte Einschränkungen

1. **`search_bible` weiterhin ausschließlich Biblia.** Kein `SearchResolver`/`LocalSearchProvider` existiert — bewusst außerhalb des Scopes dieser Phase (Auftrag nannte explizit nur `BibleTextResolver`).
2. **Kein Caching der `LocalBibleTextProvider`-Konstruktionsentscheidung über Prozessgrenzen hinweg.** Fehlt der Korpus beim Start, bleibt der Server bis zum nächsten Neustart dauerhaft im „Biblia-only"-Modus — kein Nachladen zur Laufzeit, falls der Korpus währenddessen gebaut wird. Für den aktuellen Entwicklungsstand unkritisch (kein Live-Reload-Mechanismus existiert ohnehin), aber ein Punkt für eine spätere Diagnose-/Health-Check-Phase.
3. **Die Abweichung von der `local`-Nicht-Nullable-Signatur aus [[16_MCP2_Zielarchitektur]] §15 ist dokumentiert, aber die Architekturdatei selbst wurde nicht aktualisiert** — eine künftige Dokumentationspflege-Phase sollte §15 an den tatsächlich umgesetzten Stand angleichen.
4. **`get_cross_references`s Stichwort-Extraktion** ruft weiterhin `DEFAULT_BIBLE` (also `LEB`) für den ersten `resolveText`-Aufruf ohne explizite Übersetzung auf (unverändert seit Phase 3A) — profitiert also **nicht** automatisch von der lokalen Auflösung, es sei denn, `key_terms` wird explizit übergeben oder eine künftige Änderung reicht die Nutzerübersetzung durch. Nicht Teil dieser Phase, nur zur Kenntnisnahme.

---

## 5. Vorgeschlagene Commit-Nachricht

```
feat: add BibleTextResolver, local-first for WEB/KJV/ASV with Biblia fallback (Phase 3D-5)
```

---

**Kein Tag, kein Push ohne Freigabe.** Warte auf Rückmeldung.
