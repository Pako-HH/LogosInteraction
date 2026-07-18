# 11 — Architekturvorschlag „Logos MCP 2.0": Lokal-first, Biblia als optionaler Fallback

**Status: Vorschlag, noch nicht freigegeben.** Dieses Dokument beschreibt eine mögliche Zielarchitektur und eine schrittweise Migration dorthin. Es wurde **keine Codeänderung** vorgenommen; die Umsetzung jedes Schritts erfordert eine gesonderte Freigabe.

## Ausgangslage

Aktuell (siehe [[02_Architektur]], [[10_Tool_Kategorisierung]]) hängen 7 von 20 Tools **hart** von der externen Biblia-API ab — inklusive zweier Tools (`scan_references`, `compare_passages`), die konzeptionell reine Referenz-*Logik* sind und keinen externen Bibeltext benötigen. Fällt die Biblia-API aus (wie aktuell durch P1), sind alle 7 Tools vollständig blockiert, obwohl ein Teil davon prinzipiell offline lösbar wäre. Die anderen 13 Tools (lokale SQLite-Daten, URL-Steuerung) sind bereits unabhängig von externen Diensten.

## Zielarchitektur (Prinzip)

1. **Lokale Quelle zuerst:** Für Bibeltext-Abfragen wird zuerst eine lokal verfügbare Quelle befragt.
2. **Biblia nur als optionaler Fallback:** Die Biblia-API wird nur konsultiert, wenn (a) `BIBLIA_API_KEY` gesetzt ist **und** (b) die lokale Quelle die Anfrage nicht bedienen kann (z. B. nicht gebündelte Übersetzung, echte Volltextsuche).
3. **Reine Referenzlogik bleibt immer lokal:** Tools, die nur mit Referenzen (nicht mit Bibeltext-Inhalt) arbeiten, sollen nie einen Netzwerkaufruf benötigen.
4. **Server startet und funktioniert ohne jeden externen API-Key.** Ein fehlender/ungültiger Biblia-Key soll künftig nur die *erweiterten* Funktionen einschränken, nicht den Kernbetrieb.

```
                         ┌───────────────────────────┐
Tool-Aufruf ───────────► │  BibleTextProvider (neu)   │
                         │  - resolve(passage, bible) │
                         └─────────────┬─────────────┘
                                       │
                     ┌─────────────────┴─────────────────┐
                     ▼                                     ▼
          LocalBibleProvider (neu, primär)        BibliaApiProvider (bestehend, Fallback)
          - gebündelte public-domain-Texte         - nur wenn Key gesetzt & lokal nicht
            (z. B. KJV/ASV/WEB, lizenzfrei)           ausreichend (Übersetzung/Suche)
          - kein Netzwerk, kein Key nötig
```

## Schrittweise Migration

Jeder Schritt ist einzeln umsetz- und testbar; die Reihenfolge minimiert Risiko, indem zuerst Abstraktion, dann Ergänzung, erst zuletzt Verhaltensänderung erfolgt.

### Schritt 1 — Provider-Abstraktion einführen (reines Refactoring, kein Verhaltenswechsel)
- Neues Interface `BibleTextProvider` (`resolveText`, `search`, `listAvailableBibles`) in einer neuen Datei, z. B. `services/bible-provider.ts`.
- `biblia-api.ts` wird unverändert als **einzige** Implementierung dieses Interfaces hinter der Abstraktion verdrahtet — `index.ts` ruft nur noch das Interface auf, nicht mehr `biblia-api.ts` direkt.
- **Test:** `npm test` bleibt grün, Tool-Verhalten unverändert (kann per Diff/Snapshot der Tool-Antworten verifiziert werden).

### Schritt 2 — Referenzlogik von Bibeltext-Abruf entkoppeln
- `scan_references` und `compare_passages` prüfen: Beide benötigen aktuell nur die Biblia-`/scan`- bzw. `/compare`-Endpunkte, nicht den eigentlichen Bibeltext. Prüfen, ob eine lokale Implementierung in `reference-parser.ts` (Referenz-Erkennung per Regex/Grammatik, Bereichsvergleich per Kapitel/Vers-Zahlen) die gleiche Funktionalität ohne Netzwerk abdecken kann.
- Falls machbar: Diese 2 Tools verlassen Kategorie (a) vollständig und werden Teil von Kategorie (b)/lokal — **reduziert die Biblia-Abhängigkeit von 7 auf 5 Tools**, unabhängig vom Rest dieses Plans.
- **Test:** Neue Vitest-Fälle mit bekannten Referenzpaaren (Teilmenge, Überlappung, Reihenfolge) gegen die bisherigen Biblia-Antworten aus [[08_Testprotokoll]] validieren, sobald P1 behoben ist (Vergleichsbasis).

### Schritt 3 — `LocalBibleProvider` mit gebündelten public-domain-Texten
- Eine oder mehrere lizenzfreie Übersetzungen (z. B. KJV, ASV, WEB — public domain, keine Faithlife-Lizenz nötig) als lokale, durchsuchbare Textquelle bündeln (z. B. als kompaktes JSON/SQLite-Datenfile im Repo oder als separates, dokumentiertes Download-Asset).
- `LocalBibleProvider` implementiert `resolveText` (Referenz → Text) rein lokal, ohne Netzwerk.
- **Test:** Vitest gegen bekannte Referenzen (`John 3:16` etc.) mit erwartetem Text; kein externer Aufruf im Test nötig (Determinismus, keine Flakes).

### Schritt 4 — Provider-Priorisierung im `BibleTextProvider`
- `resolve()` fragt zuerst `LocalBibleProvider`. Nur wenn die angeforderte Übersetzung dort nicht gebündelt ist **oder** eine Funktion angefragt wird, die der lokale Provider nicht abdeckt (z. B. Volltext-`search_bible` über viele Übersetzungen), wird `BibliaApiProvider` konsultiert — und **nur falls `BIBLIA_API_KEY` gesetzt ist**. Fehlt der Key, wird das transparent kommuniziert („Lokale Übersetzung X verwendet; Online-Suche/weitere Übersetzungen benötigen einen Biblia-Key)", statt hart zu fehlern.
- **Test:** Provider-Priorisierung mit gemocktem Biblia-Provider (Key gesetzt/nicht gesetzt, lokale Übersetzung vorhanden/nicht vorhanden) — 4 Kombinationen als Vitest-Matrix.

### Schritt 5 — Diagnose-Tool erweitern (aufbauend auf `feature/phase3-diagnose-qa`, siehe [[06_Roadmap]] 3.1)
- Diagnose-Ausgabe zeigt pro Bibeltext-Anfrage, **welcher Provider** tatsächlich geantwortet hat (lokal vs. Biblia), nicht nur ob ein Key gesetzt ist.
- **Test:** Manuelle Durchsicht der Diagnose-Ausgabe in beiden Provider-Zuständen.

### Schritt 6 — Bestehende P1–P9 im neuen Licht neu bewerten
- Nach Abschluss der Schritte 1–5: [[07_Bekannte_Probleme]] aktualisieren — P1 (Biblia 403) wird von „blockiert 7 Tools vollständig" zu „schränkt erweiterte Funktionen ein, Kernfunktion bleibt lokal verfügbar" herabgestuft.
- **Test:** Vollständiger Tool-Durchlauf wie in [[08_Testprotokoll]], diesmal *ohne* gesetzten `BIBLIA_API_KEY`, um „Fail-soft ohne Key" zu verifizieren.

## Bewusste Nicht-Ziele dieses Vorschlags

- **Kein Ersatz für Biblia-Funktionen, die lokal prinzipiell nicht abbildbar sind** (z. B. Volltextsuche über viele moderne, lizenzierte Übersetzungen) — dafür bleibt Biblia zuständig, als bewusster Fallback, nicht als zu eliminierende Abhängigkeit.
- **Keine Extraktion von Bibeltext aus Logos' eigenen (lizenzierten) Ressourcendateien** — das wäre ein DRM-/Lizenzrisiko und ist nicht Teil dieses Vorschlags. „Lokal" bezieht sich hier ausschließlich auf mit dem MCP-Server gebündelte public-domain-Texte, nicht auf Logos' proprietäre Bibliotheksdaten.
- **Keine Änderung an Kategorie (b) und (c)** (SQLite-Lesezugriff, URL-Steuerung) — diese sind bereits lokal-first und bleiben unverändert.

## Offene Fragen zur Freigabe

1. Welche Übersetzung(en) sollen initial gebündelt werden (Lizenz-/Größenabwägung)?
2. Soll Schritt 2 (Referenzlogik entkoppeln) unabhängig von Schritt 3+ vorgezogen werden — er reduziert die Biblia-Abhängigkeit bereits ohne Textbündelung?
3. Soll das Bündeln lokaler Texte im Repo selbst erfolgen oder als optionaler, dokumentierter Download bei Erstinstallation?
