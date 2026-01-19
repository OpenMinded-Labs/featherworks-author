# FeatherWorks Author – Roadmap 2025

> **Stand:** Januar 2025  
> Diese Roadmap fasst den aktuellen Implementierungsstand zusammen und priorisiert verbleibende Features in sinnvoller Arbeitsreihenfolge.

---

## Legende

| Status | Bedeutung |
|--------|-----------|
| ✅ | Vollständig implementiert |
| 🔶 | Teilweise implementiert / Grundgerüst vorhanden |
| ⏳ | Noch nicht begonnen |
| 🔵 | Pro-Feature (später) |

---

## 📊 Aktueller Implementierungsstand

### ✅ Core – Vollständig implementiert

| Feature | Details |
|---------|---------|
| **Projekt-Management** | Öffnen, Erstellen, Speichern (.fwauthor SQLite), Verschlüsselter Export |
| **Projekt-Bibliothek** | Grid/List-View, Sortierung, Filterung, Serien-Gruppierung, Metadaten (Autor, Genre, Reihe, Tags, Wortzahl) |
| **Kapitel/Szenen-Hierarchie** | Flache Struktur (Kapitel → Szenen), Drag & Drop Sortierung, Umbenennen, Löschen |
| **Rich-Text Editor** | CodeMirror 6, Formatierung (Bold/Italic/Underline/Strike), Fokus-Modus, Zeilennummern |
| **Editor-Settings** | Schriftart, Schriftgröße, Zeilenhöhe, Ränder, Akzentfarbe, Theme (Light/Dark) |
| **Word Count** | Live-Zählung (Wörter, Zeichen, Sätze), WebWorker für Performance |
| **Smart Pacing Widget** | Tagesziel-Ring mit Ampel-Logik, Hover-Stats, Genre-Presets, Settings-Panel |
| **Autosave** | Debounced Speicherung mit Status-Anzeige |
| **Szenen-Notizen** | Notizen pro Szene, persistiert in DB |
| **Rechtschreibprüfung** | LanguageTool-Integration (DE/EN), Fehler-Overlay, Korrekturvorschläge |
| **Thesaurus** | Synonyme-Panel mit DE/EN Wörterbüchern |
| **Suchen & Ersetzen** | CodeMirror Search-Extension, Regex-Support |
| **i18n** | Deutsch/Englisch, i18next, Sprache persistiert |
| **Theme-System** | Light/Dark, CSS-Variables, Glassmorphism Design |
| **Crash Recovery** | Recovery-Dialog bei App-Start, Auto-Backups |
| **Auto-Update** | Tauri Updater mit Release-Banner |

### 🔶 Teilweise implementiert

| Feature | Status | Fehlt |
|---------|--------|-------|
| **Fontaine KI-Chat** | Grundgerüst vorhanden (UI Panel, Request/Response Types) | Kein lokales LLM, nur API-Anbindung vorbereitet |
| **Charaktere-Panel** | UI mit Placeholder-Daten | Keine DB-Tabelle, kein CRUD, keine Beziehungen |
| **Analyse-Panel** | UI mit "Coming Soon" | Keine echten Analysen implementiert |
| **Undo/Redo** | CodeMirror-internes Undo | Keine projektweite History |

### ⏳ Noch nicht begonnen

| Feature | Priorität |
|---------|-----------|
| **Orte/Locations** | Hoch |
| **Pinboard** | Hoch |
| **Timeline/Outline** | Mittel |
| **Plot-Notizen & Struktur** | Mittel |
| **Export: TXT/PDF/DOCX/ePub** | Hoch |
| **Buchlayout & Druckfertige PDF** | Mittel |
| **Versionierung & Diffs** | Mittel |
| **Statistik-Dashboards** | Niedrig |
| **Text-Analyse (Vampirverben, Wiederholungen)** | Mittel |

---

## 🎯 Priorisierte Roadmap

### Phase 1: Foundation Features (2-3 Wochen)
*Fokus: Fehlende Core-Features für produktives Arbeiten*

#### 1.1 Export-System ⏳
Ohne Export ist die App nicht produktionsreif.

- [ ] **Plain Text Export** (einfachster Start)
- [ ] **Markdown Export**
- [ ] **HTML Export** (als Basis für PDF/ePub)
- [ ] Export-Dialog mit Format-Auswahl
- [ ] Kapitel-Trenner, Titel-Seite Option

**Tech:** Rust Backend Templates (Tera), Frontend Export-Wizard

#### 1.2 Charaktere-System 🔶 → ✅
Placeholder existiert, muss produktionsreif werden.

- [ ] DB-Schema: `characters(id, name, role, description, notes, color, created_at, updated_at)`
- [ ] Tauri Commands: `list_characters`, `create_character`, `update_character`, `delete_character`
- [ ] Frontend CRUD UI
- [ ] Farb-Zuweisung für Editor-Highlighting

**Tech:** rusqlite Migrations, React State

#### 1.3 Orte/Locations ⏳
Parallel zu Charakteren, gleiche Architektur.

- [ ] DB-Schema: `locations(id, name, description, notes, created_at, updated_at)`
- [ ] Tauri Commands
- [ ] Frontend Panel mit CRUD
- [ ] Optional: Verknüpfung zu Szenen

---

### Phase 2: Schreibwerkzeuge (2-3 Wochen)
*Fokus: Tools für Plotten und Strukturieren*

#### 2.1 Pinboard ⏳
Freiform-Notizen, Ideen sammeln, visuelle Planung.

- [ ] Canvas-basierte UI (Drag & Drop Karten)
- [ ] Karten-Typen: Notiz, Idee, Charakter-Link, Ort-Link, Bild
- [ ] Verbindungslinien zwischen Karten
- [ ] Farbkodierung
- [ ] DB: `pinboard_cards(id, type, x, y, width, height, content_json)`

**Tech:** React DnD oder Zustand für State, Canvas/SVG für Linien

#### 2.2 Plot-Notizen & Szenen-Metadaten ⏳
Strukturierte Planung auf Szenen-Ebene.

- [ ] Szenen-Felder erweitern: `pov`, `status` (Entwurf/In Arbeit/Fertig), `summary`, `tags`
- [ ] POV-Auswahl aus Charakteren
- [ ] Status-Badges in Sidebar
- [ ] Szenen-Zusammenfassung als Outline exportieren

#### 2.3 Outline-View ⏳
Schneller Überblick über Manuskript-Struktur.

- [ ] Kompakte Liste: Kapitel → Szenen mit Status, Wortzahl, POV
- [ ] Click-to-navigate
- [ ] Drag & Drop Reorder
- [ ] Filter nach Status

---

### Phase 3: Text-Analyse & Lektorat (2-3 Wochen)
*Fokus: Schreibqualität verbessern*

#### 3.1 Stilanalyse-Engine ⏳
Lokale Analyse ohne LLM.

- [ ] **Wortwiederholungen** (N-Gram Analyse pro Absatz/Seite)
- [ ] **Vampirverben** (sein, haben, werden - Wörterbuch-basiert)
- [ ] **Füllwörter** (eigentlich, irgendwie, quasi - konfigurierbares Set)
- [ ] **Satzlängen-Variation** (Lesbarkeits-Metrik)
- [ ] Inline-Markierung im Editor

**Tech:** Rust Analyse-Modul, WebWorker für Frontend-Highlighting

#### 3.2 Dialog-Balance ⏳
- [ ] Dialog vs. Narration Verhältnis pro Szene
- [ ] Visualisierung (Balken/Torte)

#### 3.3 AnalysisPanel produktionsreif 🔶 → ✅
- [ ] Integration der Analyse-Engine
- [ ] Ergebnisse als klickbare Liste
- [ ] Sprung zur Fundstelle im Editor

---

### Phase 4: Export Pro (3-4 Wochen)
*Fokus: Professionelle Ausgabeformate*

#### 4.1 PDF Export ⏳
- [ ] HTML → PDF via headless Chrome oder weasyprint
- [ ] Einfache Seitenformate (A4, A5, US Letter)
- [ ] Schrift-Einbettung
- [ ] Seitenzahlen

#### 4.2 Buchlayout-System ⏳
*Das vollständige Print-Layout wie in alter ROADMAP beschrieben:*

- [ ] Buchformat-Presets (A5, US Trade, Taschenbuch, Custom)
- [ ] Seitenränder mit Bundsteg
- [ ] Beschnittzugabe (Bleed)
- [ ] Schmutztitel, Titelei, Impressum
- [ ] Inhaltsverzeichnis (auto-generiert)
- [ ] Kopf-/Fußzeilen (lebende Kolumnentitel)
- [ ] Hurenkinder/Schusterjungen-Vermeidung
- [ ] Drop Caps / Initialen
- [ ] Szenentrenner (Asterism)

**Tech:** CSS Paged Media, printpdf oder weasyprint Sidecar, hyphenation-rs

#### 4.3 ePub Export ⏳
- [ ] Reflowable ePub 3
- [ ] Kapitel als separate XHTML
- [ ] Cover-Integration
- [ ] Metadaten (Autor, Titel, ISBN)

#### 4.4 DOCX Export ⏳
- [ ] Manuskript-Format für Verlage
- [ ] docx-rs oder pandoc Sidecar

---

### Phase 5: Fontaine KI (3-4 Wochen)
*Fokus: Lokale KI-Assistenz*

#### 5.1 LLM-Backend 🔶 → ✅
- [ ] Lokales LLM einbinden (llama.cpp, candle, oder onnx)
- [ ] Model-Download & Management
- [ ] Streaming-Responses via Tauri Events
- [ ] Performance-Settings (Threads, Context Size)

#### 5.2 KI-Features ⏳
- [ ] **Schreibassistent:** Textvorschläge, Formulierungshilfen
- [ ] **Charakter-Konsistenz:** Prüfung gegen Charakter-Profile
- [ ] **Plotlücken:** Analyse der Handlungslogik
- [ ] **Stilvorschläge:** Show don't tell, Dialog-Verbesserungen

#### 5.3 Kontext/RAG ⏳
- [ ] Embeddings (fastembed/onnx)
- [ ] Vektor-Index für Szenen, Charaktere, Orte
- [ ] Chunk-basierte Kontextauswahl

---

### Phase 6: Versionierung & Collaboration (4+ Wochen)
*Fokus: Professionelle Workflow-Features*

#### 6.1 Versionierung ⏳
- [ ] Lokale Snapshots (JSON-Diffs)
- [ ] Versions-Liste mit Zeitstempel
- [ ] Side-by-Side Diff-Viewer
- [ ] Rollback zu Version

#### 6.2 Kommentare & Track Changes ⏳
- [ ] Inline-Kommentare mit Anker
- [ ] Track Changes (Insert/Delete Markierung)
- [ ] Änderungen annehmen/ablehnen

---

### Phase 7: Statistik & Analytics (iterativ)
*Fokus: Produktivitäts-Insights*

#### 7.1 Dashboard ⏳
- [ ] Schreibfortschritt über Zeit
- [ ] Wortzahl pro Tag/Woche/Monat
- [ ] Sitzungsdauer-Tracking

#### 7.2 Pro Analytics 🔵
- [ ] Produktivitäts-Heatmap
- [ ] WPM über Zeit
- [ ] Streak-Tracking
- [ ] Zielerreichungs-Statistik

---

## 📋 Nächste Konkrete Aufgaben

### Sofort (diese Woche)
1. **Plain Text Export** implementieren
2. **Characters DB-Schema** + Tauri Commands
3. **Locations DB-Schema** + Tauri Commands

### Kurzfristig (nächste 2 Wochen)
4. Characters & Locations UI produktionsreif
5. Export-Dialog mit Format-Auswahl
6. Markdown Export
7. Szenen-Metadaten (POV, Status)

### Mittelfristig (Monat 1-2)
8. Pinboard MVP
9. PDF Export basic
10. Stilanalyse-Engine (Wiederholungen, Vampirverben)
11. Analyse-Panel Integration

---

## 🔧 Technische Schulden

| Item | Priorität |
|------|-----------|
| Characters Placeholder → echte Implementierung | Hoch |
| Analysis Placeholder → echte Implementierung | Mittel |
| Fontaine LLM → lokales Modell statt API-Stub | Mittel |
| Hierarchie-Refactor (Reihe → Buch → Teil → Kapitel → Szene) | Niedrig |
| FTS5-Index für Volltext-Suche | Niedrig |
| Test-Coverage erhöhen | Mittel |

---

## 💡 Feature-Requests & Ideen (Backlog)

- [ ] Timeline-View mit Zeitstrahl
- [ ] Beziehungsdiagramm für Charaktere
- [ ] Mood-Tracking pro Szene
- [ ] Ambient Sounds
- [ ] Custom Themes (Export/Import)
- [ ] Plugin/Extension API (WASM)
- [ ] Cloud-Sync (Pro)
- [ ] Echtzeit-Kollaboration (Pro)
- [ ] KDP-Ready Checks
- [ ] ISBN-Generator
- [ ] Hörbuch-Kapitelmarker

---

## Zeitschätzung bis MVP "Print-Ready"

| Phase | Wochen |
|-------|--------|
| Phase 1: Foundation | 2-3 |
| Phase 2: Schreibwerkzeuge | 2-3 |
| Phase 3: Text-Analyse | 2-3 |
| Phase 4: Export Pro | 3-4 |
| **Gesamt bis Print-Ready MVP** | **9-13 Wochen** |

---

*Diese Roadmap ist ein lebender Plan und wird iterativ angepasst.*
