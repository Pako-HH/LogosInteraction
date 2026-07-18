# 09 — Changelog

Diese Datei fasst die Git-Historie des Projekts zusammen und wird um wesentliche zukünftige Änderungen ergänzt. Quelle: `git log` auf `main`, Branch `robrawks/LogosInteraction` (jetzt `robrawks/LogosBibleSoftwareMCP`).

## main-Branch-Historie

| Datum | Commit | Beschreibung |
|---|---|---|
| 2026-02-22 | `f2261e6` | Initialer Commit: Logos-Bible-Software-MCP-Server und Socratic-Bible-Study-Agent hinzugefügt |
| 2026-02-22 | `e1cacb2` | README mit Setup-Anleitung und Tool-Referenz ergänzt |
| 2026-02-22 | `9d2e86b` | Sokratischer Agent konfessionsneutral gemacht |
| 2026-02-24 | `173806b` | 8 weitere, recherche-orientierte MCP-Tools ergänzt (12 → 20 Tools) |
| 2026-02-25 | `05f4d84` | Design-Dokument für Thompson-Chain-Reference-Integration |
| 2026-02-25 | `d6d66f5` | Implementierungsplan für Thompson-Chain-Study-Modus |
| 2026-02-25 | `5d4fb1b` | `.claude/agents/` zu `.gitignore` hinzugefügt, `chain-studies`-Verzeichnis angelegt |
| 2026-02-25 | `847f6c5` | `.worktrees/` zu `.gitignore` hinzugefügt |
| 2026-02-25 | `3630ba0` | `tool-tester`-QA-Agent ins Repo aufgenommen |
| 2026-02-25 | `a7f2d2b` | `stripXml`/`stripRichText`-Markup-Utilities inkl. Tests ergänzt |
| 2026-02-25 | `f41aedf` | MCP-Tool-Antworten für LLM-Konsum bereinigt *(aktueller `main`-Stand)* |

## Offene, nicht gemergte Branches

| Branch | Basis-Commit | Eigene Commits | Status |
|---|---|---|---|
| `feature/phase3-diagnose-qa` | `847f6c5` (3 Commits hinter `main`) | `32e538b` — „Add diagnose tool (#21), CLI diagnose command, and QA agent" | Nicht gemergt; müsste vor Merge rebast werden, siehe [[07_Bekannte_Probleme]] P9 und [[06_Roadmap]] Schritt 3.1 |

## Dokumentations-Historie (dieses `docs/`-Verzeichnis)

| Datum | Änderung |
|---|---|
| 2026-07-18 | Ersterstellung der strukturierten Projektdokumentation (`01_Projektvision.md` bis `09_Changelog.md`) auf Basis einer vollständigen Code- und Live-Test-Analyse. Keine Quellcodeänderung. |
| 2026-07-18 | [[07_Bekannte_Probleme]] aktualisiert: Biblia-API-Key wird als **kompromittiert** eingestuft (P1) und darf nicht weiterverwendet werden; P2-Status um Hinweis auf bereits im Arbeitsverzeichnis vorhandenen, aber noch nicht committeten Autodetection-Fix ergänzt. `docs/10_Tool_Kategorisierung.md` und `docs/11_MCP2_Architektur_Vorschlag.md` neu angelegt. Keine Quellcodeänderung durch diesen Schritt; `npm run build` und `npm test` (66/66) zum bestehenden, unveränderten Arbeitsstand grün. |

## Hinweis zur Pflege

Diese Datei sollte bei jedem inhaltlich relevanten Commit (nicht bei reinen Formatierungs-/Dokumentationsänderungen) um eine Zeile ergänzt werden. Bei Behebung eines in [[07_Bekannte_Probleme]] gelisteten Problems sollte hier zusätzlich vermerkt werden, welches Problem (P1–P9) dadurch geschlossen wurde.
