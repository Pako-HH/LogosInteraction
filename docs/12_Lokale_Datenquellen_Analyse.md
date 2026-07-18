# 12 — Analysebericht: Lokale Logos-Datenquellen (Phase 2)

**Status: Analysebericht, keine Codeänderung.** Grundlage: schreibgeschützte Untersuchung der lokalen Logos-Installation (`~/Library/Application Support/Logos4/`, Installations-ID `lpfinojk.yny`) per `sqlite3`, `find`, `file`. Ziel: Klären, welche der 20 MCP-Tools — insbesondere die 7 Biblia-abhängigen (siehe [[10_Tool_Kategorisierung]]) — auf rein lokale Daten umgestellt werden können.

## 1. Welche SQLite-Datenbanken Logos lokal verwendet

Die 10 bisher vom MCP-Server genutzten DBs (siehe `config.ts` `DB_PATHS`) sind nur ein Ausschnitt. Die tatsächliche Installation enthält deutlich mehr:

**Unter `Documents/lpfinojk.yny/`** (24 Unterordner) — zusätzlich zu den bekannten 7 (`visualmarkup.db`, `favorites.db`, `Workflows.db`, `ReadingLists.db`, `shortcuts.db`, `guides.db`, `notestool.db`):

| Pfad | Zweck (beobachtet) |
|---|---|
| `CopyBibleVerses/CopyBibleVerses.db` | Nur Formatvorlagen für „Vers kopieren", **keine** Verstexte |
| `DeviceResourceManager/MobileResourcesSyncManager.db` | Sync-Metadaten für Mobilgeräte |
| `Documents/{BibleStudy,Bibliography,Canvas,DocumentInfo,MorphGrid,Notes,PrayerList,ReadingPlan,Sermon,SentenceDiagram,SyntaxSearch,VisualFilter,WordFind,WordList}.db` | Je ein Dokumenttyp-Store für Logos' Autoren-/Studienwerkzeuge |
| `GuidedLearning/GuidedLearning.db` | 130 MB, Lernpfad-Daten |
| `KeyLinkManager/KeyLinkSyncManager.db` | Verknüpfungs-Sync |
| `LayoutManager/layouts.db` | 13 MB, UI-Layout-Zustand |
| `LibraryCatalog/LibraryCatalogSync.db` | Katalog-Sync-Metadaten (nicht der Katalog selbst — der liegt unter `Data/`) |
| `LocalUserPreferences/PreferencesManager.db`, `UserPreferences2/PreferencesManager.db` | App-Einstellungen |
| `PersonalBooks/PersonalBookManager.db` | Eigene/importierte Bücher |
| `ReferenceWordCounts/ReferenceWordCountManager.db` | Wortstatistik |
| `ResourceCollectionManager/ResourceCollectionManager.db` | Ressourcen-Sammlungen (Regale) |
| `ResourceManager/ResourceSyncManager.db` | Sync-Status installierter Ressourcen |
| `SelfTests/SelfTests.db` | interne Diagnose |
| `UserInputs/UserInputs2.db` | Eingabeverlauf |

**Unter `Data/lpfinojk.yny/`** (28 Unterordner) — zusätzlich zu `catalog.db`:

| Pfad | Zweck (beobachtet) | Relevanz |
|---|---|---|
| `LibraryCatalog/catalog.db` (20,7 MB) + `catalog.{met,fld,dcm,lxn,idx,lck}` | Bibliografische Metadaten + Lucene-artiger Volltextindex (kein reines SQLite, separate Indexdateien) | **hoch**, siehe §2 |
| `AutoComplete/AutoComplete.db` (502 MB) | UI-Autovervollständigung | keine |
| `AtlasManager/AtlasCache.db` (44 MB) | Kartenmaterial-Cache | keine |
| `ReadingProgressManager/readingprogressmanager.db` (352 KB) | **Echter** Leseforschritt pro Ressource (`PercentageRead`, `Ranges`) | **hoch**, siehe §4/Diskrepanz unten |
| `HistoryManager/history.db` (909 KB, 321 Zeilen) | Zuletzt besuchte Stellen/Ressourcen (`Title`, `Subtitle`, `LastVisited`, `Bookmark`) | mittel, neue Tool-Idee |
| `Concordance/*` | Konkordanz-Indizes zu installierten Ressourcen (kein reiner Bibeltext-Volltext) | gering |
| `ResourceManager/<DataType>/{Identified,Discovered}.db` (~40 Paare) | Metadaten, welche Datentypen (z. B. `BibleCrossReferences`, `Maps`, `Lemmas`) in welchen installierten Ressourcen vorhanden sind — Indizes, kein Inhalt | gering |
| `ResourceManager/Resources/*.logos4` (969 Dateien) | **Tatsächlicher Ressourceninhalt** inkl. Bibeltext, proprietäres Format | **kritisch**, siehe §3 |
| `Users/UserManager.db` | Account-Metadaten, keine Studiendaten | keine |
| `Shared/` | Produkt-/Fehlermetadaten | keine |

## 2. Tabellen mit Bibelstellen, Ressourcen, Notizen, Highlights, Favoriten

### `notestool.db` (`Documents/.../NotesToolManager/`, 438 KB, 158 Notizen)
- `Notes`: `ContentRichText` (XML-artiges Rich-Text-Markup, z. B. `<Paragraph><Run FontSize="11" Text="..."/></Paragraph>`), `Kind`, `AnchorBibleBook`, `NotebookExternalId`.
- `NoteAnchorFacetReferences`: **separate** Verknüpfungstabelle — `NoteId`, `DataTypeId`, `BibleBook`, `Reference` (Textformat).
- `NoteAnchorTextRanges`: verankert Notizen an exakten Textoffsets in Ressourcen (`ResourceIdId`, `Offset`, `PastEnd`) — für Notizen ohne Bibelstellenbezug.

### `visualmarkup.db` (114 KB, aktuell 0 Zeilen in `Markup`)
- `Markup(ResourceId, ResourceVersion, SavedTextRange, MarkupStyleName, ...)` — `SavedTextRange` ist ein ressourcen-relativer Offset-Bereich, **keine** menschenlesbare Referenz.

### `favorites.db` (45 KB, 4 Zeilen)
- `Favorites(Id, Title, Rank, ...)` ⋈ `Items(FavoriteId, AppCommand, ResourceId)`.
- `AppCommand` ist ein pipe-getrennter Befehlsstring, z. B.:
  `Resource|Id=LLS:GRMNBBLSCHL2000|Reference=bible+schlacter2000.64.5.46-64.5.47|...`

### `ReadingLists.db` (`Documents/.../ReadingLists/`, 32 KB, **0 Zeilen** in beiden Tabellen)
- `Items(ItemId, ReadingListPathNormalized, IsRead)`, `ReadingListStatuses(Title, Author, Path, Status)` — bildet Leseplan-*Checklisten* ab, nicht generischen Leseforschritt.
- **Wichtig:** Dies ist die DB, die das aktuell registrierte Tool `get_reading_progress` liest — auf dieser Installation liefert sie leere Ergebnisse, weil es keine aktiven Leseplan-Checklisten gibt (siehe Diskrepanz-Hinweis in §4).

### `Workflows.db` (2,3 MB)
- `Templates(ExternalId, TemplateJson, ...)` (16 Zeilen), `Instances(ExternalId, TemplateId, Key, CurrentStep, CompletedStepsJson, ...)` (3 Zeilen).

### `catalog.db` (`Data/.../LibraryCatalog/`, 20,7 MB, 1166 Datensätze)
- `Records(ResourceId, Type, Title, Authors, Languages, Description, Copyright, IsDataset, UseCount, ...)` — **reine bibliografische Metadaten**, keine Verstexte.
- `Type = 'text.monograph.bible'` identifiziert zuverlässig installierte Bibelübersetzungen — **70 Treffer** lokal (u. a. `LLS:LEB` „The Lexham English Bible", `LLS:KJV1900` „King James Version", `LLS:1.0.710` „English Standard Version", plus ca. 65 weitere, größtenteils deutschsprachig).
- `AlternateResourceIds(RecordId, AlternateResourceId)`: Kurzcode-Mapping. `leb` → `LLS:LEB` stimmt exakt mit Biblias `LEB`-Code überein; `kjv1900` ≠ Biblias `KJV`; Biblias `ASV`/`DARBY`/`YLT`/`WEB` haben **keine** passende lokale Alternate-ID (nicht installiert oder anders benannt). → **Kein verlässliches automatisches 1:1-Code-Mapping**, eine kuratierte Übersetzungstabelle wäre nötig.

### Weitere geprüfte DBs (kurz)
- `guides.db` (65 KB): `Guides(GuideId, TemplateName, Key, Xml)` — 0 Zeilen (Guides werden on-demand generiert, nicht persistiert).
- `shortcuts.db` (28 KB, 3 Zeilen): `Shortcuts(Title, AppCommand, ResourceId, ...)` — gleiches `AppCommand`-Format wie Favoriten.
- `Clippings.db` (61 KB, 0 Zeilen): `Clippings(ResourceId, StartPosition, EndPosition, Title/Content/Notes als Blob)`.
- `PassageList.db` (94 KB, 1 Zeile): `PassageLists(Title, CompressedItems blob, ResourceList)` — Referenzen liegen in einem **komprimierten Blob**, nicht direkt abfragbar ohne Dekompressions-Logik.

## 3. Relevante Dateien unter Documents/ und Data/ — und wo der eigentliche Bibeltext liegt

Der tatsächliche Ressourceninhalt (inkl. Bibeltext) liegt **nicht** in einer der obigen SQLite-DBs, sondern unter:

```
Data/lpfinojk.yny/ResourceManager/Resources/<ResourceId ohne "LLS:">.logos4
```

969 Dateien, Dateiname = ResourceId (z. B. `LEB.logos4` = 17,5 MB, `ESV.logos4` = 25,5 MB, `KJV1900.logos4` = 33 MB).

- Header-Bytes: `4c52 4553 3031` = `"LRES01"` — Logos' proprietäres Format, **nicht** SQLite (kein `SQLite format 3`-Magic-Byte).
- `strings -n 6` auf `LEB.logos4` findet **keinen** lesbaren Text (gezielte Suche nach „beginning" aus Gen 1:1 — null Treffer).
- `gzip`-Kompressionsrate auf `LEB.logos4` = 1,000 (keine Größenreduktion) — hohe Entropie, konsistent mit bereits komprimiertem/verschlüsseltem Inhalt.

**Befund (bestätigt, nicht nur vermutet): Bibeltext ist lokal nicht in lesbarer Form zugänglich, ohne Logos' proprietäres Ressourcenformat zurückzuentwickeln.** `CopyBibleVerses.db`, trotz vielversprechendem Namen, enthält nur Kopier-Formatvorlagen, keinen gecachten Verstext.

## 4. Was direkt lokal lesbar ist, ohne die Biblia-API

Alle 7 bereits als „lokal" kategorisierten Tools (siehe [[10_Tool_Kategorisierung]] Kategorie b), plus neu identifiziert:

- **Bibelübersetzungs-Inventar** aus `catalog.db` (`Type='text.monograph.bible'`, 70 lokal installierte Übersetzungen mit Titel/Sprache/ResourceId) — reichhaltiger als Biblias Liste (nur 6 Übersetzungen).
- **`HistoryManager/history.db`** (321 Zeilen): zuletzt besuchte Stellen/Ressourcen — Potenzial für ein neues Tool (z. B. „zuletzt angesehene Bibelstellen"), aktuell nicht angebunden.
- **`ReadingProgressManager/readingprogressmanager.db`** (207/201 Zeilen): echter, pro Ressource geführter Leseforschritt (`PercentageRead`, `Ranges` als JSON-Offset-Array).

**Diskrepanz festgestellt (unabhängig von der Biblia-Migration, zur Kenntnisnahme):** Das aktuell registrierte Tool `get_reading_progress` liest `Documents/.../ReadingLists/ReadingLists.db` (Leseplan-Checklisten, auf dieser Installation 0 Zeilen). Die DB mit tatsächlich befüllten Fortschrittsdaten ist `Data/.../ReadingProgressManager/readingprogressmanager.db` — **diese ist aktuell nicht in `config.ts`s `DB_PATHS` eingetragen.** Das ist ein separates, von der Biblia-Frage unabhängiges Verbesserungspotenzial, keine Auswirkung auf die hier untersuchten 7 Biblia-Tools.

## 5. Migrationsfähigkeit der 7 Biblia-abhängigen Tools

| Tool | Migrierbar auf lokal? | Begründung |
|---|---|---|
| `scan_references` | ✅ **Ja, vollständig** | Reine Referenz-String-Logik (Erkennung von Bibelstellen in Text); benötigt keinen Bibeltext-Inhalt. Grammatik-Basis existiert teilweise bereits in `reference-parser.ts`. |
| `compare_passages` | ✅ **Ja, vollständig** | Reiner Zahlenvergleich (Buch.Kapitel.Vers-Bereiche); kein externer Datenzugriff nötig. |
| `get_available_bibles` | ✅ **Ja, vollständig** | `catalog.db` liefert 70 lokal installierte Übersetzungen mit Metadaten — mehr als Biblia bietet. |
| `get_bible_text` | ❌ **Nein, nicht ohne Zusatzquelle** | Verstext liegt in DRM-geschütztem `.logos4`-Format, kein lokaler Lesezugriff möglich (§3). |
| `get_passage_context` | ❌ **Nein** | Ruft intern `get_bible_text` auf — gleiche Blockade. |
| `search_bible` | ❌ **Nein** | Erfordert Volltextsuche über Bibeltext-Inhalt; kein lokaler Volltextindex auf Verstext-Ebene gefunden (Concordance-DBs indizieren Ressourcen allgemein, nicht Verstext separat). |
| `get_cross_references` | ❌ **Nein** | Ruft intern `get_bible_text` + `search_bible` auf — gleiche Blockade wie beide. |

**Ergebnis: 3 von 7 Tools (`scan_references`, `compare_passages`, `get_available_bibles`) können sofort und vollständig auf lokale Daten umgestellt werden, ohne neue Datenquelle.** Die verbleibenden 4 Tools benötigen entweder weiterhin die Biblia-API oder eine **externe, nicht-Logos-eigene** öffentlich-lizenzfreie Textquelle (z. B. gebündelte public-domain-Übersetzung) — aus Logos' eigenen lokalen Daten ist der Verstext wegen des proprietären Ressourcenformats nicht extrahierbar.

## Migrationsstrategie (Vorschlag, ungeprüft im Code)

Konsistent mit dem bereits vorliegenden Architekturvorschlag in [[11_MCP2_Architektur_Vorschlag]], jetzt mit den konkreten Befunden aus dieser Analyse präzisiert:

1. **Sofort umsetzbar, kein neuer Datenspeicher nötig:**
   - `scan_references` und `compare_passages` auf lokale Referenzlogik umstellen (Erweiterung von `reference-parser.ts`).
   - `get_available_bibles` auf `catalog.db`-Abfrage (`Type='text.monograph.bible'`) umstellen — liefert lokal installierte Übersetzungen statt Biblias fixer 6er-Liste.
   - Reduziert die Biblia-Abhängigkeit unmittelbar von 7 auf 4 Tools, ganz ohne Textbündelung.

2. **Erfordert externe (nicht-Logos-) Textquelle:** `get_bible_text`, `get_passage_context`, `search_bible`, `get_cross_references` bleiben auf eine Textquelle angewiesen — entweder weiterhin Biblia (mit Fallback-Charakter, siehe [[11_MCP2_Architektur_Vorschlag]]) oder eine separat gebündelte public-domain-Übersetzung. Diese Entscheidung ist unabhängig von den lokalen Logos-Datenbanken zu treffen, da Logos selbst keine zugängliche Textquelle bereitstellt.

3. **Referenzformat-Mapping als Voraussetzung:** Alle lokalen Quellen mit Bibelstellenbezug (Notizen, Favoriten, Highlights) verwenden **unterschiedliche** Referenzformate (`AppCommand`-String mit `Reference=bible+<code>.<b>.<c>.<v>`, `NoteAnchorFacetReferences.Reference` als Text, komprimierte Blobs in `PassageList.db`). Eine Migration sollte zuerst ein einheitliches internes Referenzmodell festigen (Erweiterung von `reference-parser.ts`), bevor weitere lokale Quellen angebunden werden.

4. **Nicht Teil dieser Analyse, aber notiert:** Das `readingprogressmanager.db`/`ReadingLists.db`-Mismatch (§4) betrifft ein bereits bestehendes, von Biblia unabhängiges Tool und sollte separat bewertet werden.

## Nicht untersucht / bewusst ausgeklammert

- Keine Codeänderung, keine neue Tool-Implementierung.
- Keine Bewertung von Lizenzfragen einer gebündelten public-domain-Übersetzung (siehe dazu die offenen Fragen in [[11_MCP2_Architektur_Vorschlag]]).
- Keine Analyse von `AutoComplete.db`, `AtlasCache.db`, `GuidedLearning.db` und weiteren nicht bibelstellenrelevanten DBs — als irrelevant für diese Fragestellung eingestuft.
