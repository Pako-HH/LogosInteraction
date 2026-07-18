# 01 — Projektvision

## Was ist dieses Projekt?

**LogosBibleSoftwareMCP** (Repo-Name auf GitHub: `robrawks/LogosBibleSoftwareMCP`, ehemals `LogosInteraction`) verbindet **Claude** über das **Model Context Protocol (MCP)** mit **Logos Bible Software** auf macOS. Es besteht aus zwei Teilen:

1. **`logos-mcp-server`** — ein Node/TypeScript-MCP-Server mit 20 Tools, die Claude erlauben, Bibeltext zu lesen, zu suchen, die Logos-Oberfläche zu steuern und persönliche Studiendaten (Notizen, Highlights, Favoriten, Lesepläne, Workflows) sowie den Bibliothekskatalog auszulesen.
2. **`socratic-bible-study`** — ein Claude-Agent, der diese Tools nutzt, um geführte, sokratische Bibelstudien anzubieten (vier Ebenen: Beobachtung, Interpretation, Korrelation, Anwendung), konfessionsneutral.

## Zielsetzung

Das Projekt macht ein persönliches, lokal installiertes Bibelprogramm (Logos) für ein KI-Sprachmodell **ansprechbar und steuerbar**, ohne die Logos-Daten zu verändern (alle Datenbankzugriffe sind read-only). Es soll Bibelstudium durch KI-gestützte Recherche, Navigation und sokratischen Dialog unterstützen — die theologische Deutungshoheit bleibt beim Nutzer, das Tool liefert Fakten, Querverweise und Struktur.

## Aktueller Reifegrad

Das Projekt befindet sich im Stadium eines **funktionierenden Prototyps mit bekannten Konfigurationslücken** (siehe [[07_Bekannte_Probleme]]):

- Die UI-Steuerungs-Tools (Navigation, Wortstudien, Factbook, Ressourcen öffnen) funktionieren zuverlässig.
- Die Biblia-API-Anbindung (Bibeltext/-suche) ist aktuell durch einen ungültigen/abgelehnten API-Key blockiert.
- Der Zugriff auf persönliche Logos-Daten (Notizen, Favoriten etc.) ist aktuell durch einen hartcodierten, nutzerspezifischen Datenpfad blockiert.
- Es existiert bereits ein offener (aber nicht fertig integrierter) Community-Beitrag mit einem Diagnose-Tool, der genau diese Konfigurationsprobleme sichtbar machen soll.

## Langfristige Vision ("Logos MCP 2.0")

Für die professionelle Weiterentwicklung werden folgende Leitlinien angestrebt:

- **Robustheit vor Funktionsumfang**: Bestehende 20 Tools zuverlässig zum Laufen bringen, bevor neue hinzukommen.
- **Portabilität**: Keine hartcodierten, nutzerspezifischen Pfade mehr — automatische Erkennung der Logos-Installation.
- **Diagnostizierbarkeit**: Ein eingebautes Diagnose-Tool, das Konfigurationsprobleme (fehlender Key, falscher Pfad) sofort und verständlich meldet.
- **Sauberer Code**: Kein toter/unbenutzter Code, konsistente Architektur, automatisierte Tests für die Kernlogik (Referenz-Parsing, Markup-Bereinigung).
- **Dokumentierte Architektur**: Dieses `docs/`-Verzeichnis als lebende Referenz für neue Mitwirkende.

Der konkrete Weg dorthin ist in [[06_Roadmap]] beschrieben.
