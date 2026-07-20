# 33 — Phase 4D-1: `readingprogressmanager.db`-Fix (Abschlussbericht)

**Status: Abschlussbericht für Phase 4D-1. Schritt 1 von 3 aus [[28_Phase4_Masterplan]] Abschnitt 6 (Phase 4D).**

Grundlage: [[12_Lokale_Datenquellen_Analyse]] §4 (Diskrepanz-Befund), [[28_Phase4_Masterplan]] Abschnitt 6 (Definition 4D-1), [[07_Bekannte_Probleme]] P10 (Problem- und Fix-Dokumentation).

---

## 1. Ziel

`get_reading_progress` las bisher `Documents/.../ReadingLists/ReadingLists.db` (Leseplan-Checklisten) — auf der verifizierten lokalen Installation strukturell leer (0 Zeilen in beiden Tabellen), unabhängig vom tatsächlichen Leseverhalten des Nutzers. Die DB mit echtem, laufend geführtem Leseforschritt pro Ressource (`Data/.../ReadingProgressManager/readingprogressmanager.db`, 201 Zeilen) war nicht angebunden. Ziel: `get_reading_progress` auf die korrekte Datenquelle umstellen.

## 2. Umsetzung

| Schritt | Inhalt | Commit |
|---|---|---|
| **4D-1.1** | `DB_PATHS`-Eintrag `readingProgress` in `config.ts` ergänzt (`LOGOS_CATALOG_DIR`-basiert) — reine Infrastruktur, noch nicht gelesen | `77a4cd3` |
| **4D-1.2** | `getReadingProgress()` in `sqlite-reader.ts` auf die `ReadingStatus`-Tabelle umgestellt; `types.ts` entsprechend angepasst (`ReadingProgress` → `{entries, totalResources}`) | `1ecec80` |
| **4D-1.3** | `get_reading_progress`-Tool-Handler in `index.ts` an die neue Datenstruktur angepasst | `2417469` |
| **4D-1.4** | Dokumentation (`docs/07` P10, dieser Bericht) | *(dieser Commit)* |

## 3. Architekturentscheidungen

- **Kein Kompatibilitäts-Shim für die alte `ReadingProgress`-Form:** Die alte Struktur (`statuses`, `items`, `totalItems`, `completedItems`, `percentComplete`) bildete Checklisten-Semantik ab, die es in der neuen Datenquelle nicht gibt (kontinuierlicher Prozentsatz statt binärem „gelesen/nicht gelesen"). Ein Shim hätte eine Bedeutung vorgetäuscht, die nicht mehr zutrifft — stattdessen wurde die Struktur ersatzlos durch `{entries, totalResources}` ersetzt.
- **Drei separate, einzeln committete Schritte** (Infrastruktur → Reader → Tool-Response) statt eines Gesamt-Commits — auf ausdrücklichen Wunsch, um jede Änderungsebene isoliert prüfbar zu halten.
- **`LOGOS_CATALOG_DIR` statt `LOGOS_DATA_DIR`:** `readingprogressmanager.db` liegt unter `Data/`, nicht `Documents/` — trotz der irreführenden Namen der beiden Root-Konstanten in `config.ts` (dokumentiert als Kommentar am neuen `DB_PATHS`-Eintrag).

## 4. Ergebnis

`get_reading_progress` liefert auf der verifizierten lokalen Installation jetzt **201 reale Datensätze** (Ressourcen-ID + Prozent gelesen) statt einer strukturell leeren Antwort. Live-Verifikation über den echten MCP-Server steht noch aus (bisher nur Diff-Review je Schritt, kein Build/Test in dieser Teilphase durchgeführt — auf ausdrücklichen Wunsch für jeden Einzelschritt).

## 5. Offene Punkte für Phase 4D-1-Abschluss

- Build (`npm run build`) und Testsuite (`npm test`) wurden für 4D-1 noch nicht ausgeführt — steht als Qualitätssicherungsschritt vor Zusammenfassung/Push von Phase 4D-1 noch aus.
- Kein Unit-/Integrationstest für den neuen `getReadingProgress()`-Codepfad vorhanden (bewusst ausgeklammert für die einzelnen Commits 4D-1.1–4D-1.4, siehe jeweilige Vorgaben).
- Live-Test gegen den echten, neu gestarteten MCP-Server (analog zur Vorgehensweise bei Phase 4C.5) noch nicht durchgeführt.
