# FeatherWorks Author – Technische Roadmap (Rust/Tauri/React)

Diese Roadmap priorisiert Core vs. Pro, ordnet die Features in Phasen und liefert pro Punkt konkrete Umsetzungsideen (Backend Rust/Tauri + Frontend React/TS), inkl. Datenmodell- und UX-Hinweisen. Ziel: schnell ein stabiles Core-MVP, danach systematisch ausbauen.

Hinweis zu aktuellen Capabilities (Stand jetzt):
- Projekt öffnen/neu, Kapitel/Szenen, Editor-Basics, Settings: vorhanden und lauffähig.
- DB: SQLite mit WAL, Migrations bei Open, rusqlite. Frontend: React + Tauri invoke.

## Priorisierung in Phasen

- Phase 0 Stabilisierung (laufend)
  - Crash-Schutz (Auto-Recovery), Autosave robust, Logging/Telemetry lokal, Basis-Tests.
- Phase 1 Core Schreibumgebung (MVP v1)
  - Rich-Text/Styles, Sidebar Kap./Szenen mit DnD, Live Wort-/Zeichen, Suchen & Ersetzen, Undo/Redo, Fokus-/Fullscreen, Schrift/Zeilenhöhe/Abstände, Seitenränder/Padding, WPM, Rechtschreibprüfung (DE/EN) – minimal.
- Phase 2 Projekt- & Datei-Basics (MVP v2)
  - Hierarchische Struktur (Reihe→Buch→Teil→Kapitel→Szene), Backups, Recents, Templates, TXT Export, einfache PDF/EPUB Export.
- Phase 3 Knowledge (Charaktere/Orte) & Plot-Grundlagen
  - Charakter-DB & Sheets, Highlight/Hover, Beziehungen; Orts-DB & Highlight; Plot-Notizen, Szenen-Status, POV.
- Phase 4 Text-Analyse Basics & Statistiken
  - Wiederholungen, Vampirverben, Readability, Statistik-Dashboards.
- Phase 5 Exports voll & Publishing
  - DOCX verlustarm, PDF sauber, ePub stabil, Export-Templates/Styling.
- Phase 6 Collaboration/Workflow
  - Versionen, visuelle Diffs, Kommentare, Track Changes.
- Phase 7 Pro: Cloud-Sync & KI (Fontain)
  - Sync (iCloud/Drive/OneDrive), lokales LLM, Chat, RAG, Coaching.

Akzeptanzkriterien je Phase: App startet, keine Datenverluste, Features end-to-end (UI→Command→DB) mit Basistests.

## Core vs. Pro (Überblick)

- Core: Alles zum Offline-Schreiben, Organisieren, Analysieren, Exportieren ohne Online-Dienste. Kein Cloud/LLM.
- Pro: Cloud-Sync, Kollaboration in Echtzeit, KI/LLM-Features, erweiterte Analyse/Workflows, KDP/Publishing-Extras.

---

## 📝 Schreibumgebung & Editor (Core zuerst)

1) Rich Text Editor mit Formatierung
- Tech: CodeMirror 6 (empfohlen) mit Prosemirror-Markup für Rich-Text; Alternative: TipTap (CM+PM Wrapper) – funktioniert im Tauri-WebView.
- Backend: Speichern als strukturierter JSON-Doc (Prosemirror-like) oder HTML+Marks; SQLite Tabellen: scenes(id, title, order, chapter_id, …), scene_content(scene_id TEXT, doc_json TEXT, ver INT, updated_at).
- UI/UX: Floating Toolbar bei Selektion, Shortcuts (Cmd/Ctrl+B/I/U), Inline-Marks, Block-Types (Überschrift, Absatz, Zitat, Liste). Persistenz debounced.

2) Kapitel-Navigation in Sidebar (Drag & Drop)
- Tech: React DnD Kit/Sortable; Persistenz: sort_order Spalte, Transaktionen bei Reorder.
- Backend: Commands reorder_chapter(s)/reorder_scene(s); DB-Constraint: UNIQUE(chapter_id, sort_order).
- UI/UX: Collapsible Tree, Kontextmenü (Neu, Umbenennen, Löschen, Duplizieren), Auto-Scroll.

3) Wort- und Zeichenzählung (live)
- Tech: WebWorker berechnet Tokens/Zeichen aus Editor-Doc; Debounce ~200–300ms.
- Backend: Caches pro Szene/Kapitel/Projekt in counts(scene_id INT, words INT, chars INT, updated_at).
- UI/UX: Footer Counter; Hover zeigt per Kapitel/Szene; Tagesziel-Progress (später Phase 3/4).

4) Rechtschreibprüfung (DE/EN)
- Tech: Hunspell via hunspell-rs; Dictionaries als Assets. Optional: spelling-worker in Rust-Thread.
- Backend: Command spell_check(text, lang) batchweise; Cache Vorschläge.
- UI/UX: rote Wellenlinien, Kontextmenü mit Vorschlägen + “Zum Wörterbuch hinzufügen”.

5) Suchen & Ersetzen (Regex)
- Tech: SQLite FTS5 für Volltext über Szenen; rust-regex für Client-Regex.
- Backend: Commands search(query, regex?, scope=project/chapter/scene), replace(ids, replacement, confirm?).
- UI/UX: Ctrl/Cmd+F Overlay, Treffer-List, Jump-Navigation, Replace All / Single.

6) Autosave
- Tech: Frontend Timer/idle detection; Save nur bei Doc-Hash-Änderung.
- Backend: Diff-Speicher (optional später). Transaktional; WAL aktiv.
- UI/UX: dezenter Saved-Indicator, Warnung bei Close mit Dirty State.

7) Undo/Redo (unbegrenzt)
- Tech: Editor-interne History (CM6) für Session; persistente Versions-Snapshots separat (Phase 6).
- Backend: Optional Snapshots bei größeren Intervallen in versions(scene_id, snapshot_json, created_at).
- UI/UX: Shortcuts, optional History-Panel.

8) Fokus-Modus & 9) Vollbildmodus
- Tech: CSS Klassen + Tauri Window API für Fullscreen.
- Backend: Settings speichern (focus_mode, fullscreen_on_toggle).
- UI/UX: Fade-out anderer Absätze; Esc beendet.

10) Schrift/Zeilenhöhe/Abstände/Seitenränder/Padding
- Tech: CSS Custom Properties, Settings→EditorSettings Tabelle.
- Backend: get/save_editor_settings erweitert (font_family, font_size, line_height, paragraph_spacing, page_padding).
- UI/UX: Live Preview; Presets.

11) Live-WPM
- Tech: Frontend misst Eingaben pro Minute; smoothing window.
- Backend: optional Logging in writing_sessions.
- UI/UX: Badge im Footer.

Nice to have (später): Typewriter-Modus, Key Sounds (WebAudio), Pomodoro (Tauri Notifications + sessions Tabelle), tägliche Ziele, Heatmap, Statistiken, Markdown-Support (Export/Import), LaTeX-Export, Speech-to-Text (macOS API), Seitenrand-Kommentare, Split-Screen.

## 🗂️ Projekt- & Dateiverwaltung

Core
- Hierarchie Reihe→Buch→Teil→Kapitel→Szene
  - DB: entities(id, parent_id, type ENUM('series','book','part','chapter','scene'), sort_order, title, meta_json).
  - Migration: existierende chapters/scenes in entities überführen (Kompat Schicht beibehalten bis Abschluss).
  - UI: Tree mit Filtern, Breadcrumbs; Commands: create_entity, move_entity, rename_entity, delete_entity.
- Projekte .fwauthor
  - Struktur: SQLite + assets/ (Medien) in Ordner, gepackt als zip (Phase später) oder Dateipfad (wie bisher). Beibehaltung aktueller DB-Datei, optional Projektordner nebenan.
- Backups
  - Rolling tar.gz in .backups/ im Projektordner; keep N (konfigurierbar). Hintergrund-Task nach Saves.
- Im-/Export
  - TXT (einfach); PDF/ePub minimal: HTML+CSS Rendering → wkhtmltopdf/printpdf; epub-builder.
- Templates
  - JSON-Blueprints für Standard-Strukturen (Roman/Sachbuch); Wizard beim Erstellen.

Pro (später)
- Cloud-Sync (OAuth2, Delta Sync, Konfliktlösung), ODT/HTML Export, Scrivener Import, Archivierung, Statistiken/Erstelldatum, Sharing, Git-Integration optional.

## 👥 Charakter-Management

Core
- DB: characters(id, name, summary, avatar_path, meta_json), character_notes, character_relations(a_id, b_id, type).
- Sheets: Flexible Felder via JSON Schema in meta_json; Form-Rendering im Frontend.
- Highlight/Hover: Aho-Corasick über bekannte Namen; Cache im Frontend; Hover-Tooltip via Portal.
- UI: Cards/Grid + Detail-Drawer; Suche/Filter; Beziehungen als einfache Liste, später Graph.

Pro
- Konsistenz-Check via lokales LLM (RAG über Charakterdaten).

## 🗺️ Welt- & Ortsverwaltung

Core
- DB: locations(id, parent_id, name, description, meta_json, sort_order).
- Highlight/Hover analog Charaktere, mit anderer Farbpalette.
- UI: Tree + Karten-Placeholder (Hooks für spätere Kartenintegration).

Pro
- Karten-Upload, Annotation, Zoom/Pan, Bildspeicher in assets/locations/.

## 📋 Plot & Struktur-Tools

Core
- Szenen-Übersicht/Status: scenes.status ENUM('idea','draft','written'); Board (Kanban) per Status.
- Plot-Notizen: notes(id, entity_id, type('plot','general'), content_json, updated_at).
- POV-Tracking: scenes.pov_character_id (FK characters.id), Validierung beim Speichern.
- DnD Szenen: Reorder zwischen Kapiteln (move_entity).

Pro
- Story-Templates (JSON), visuelle Timeline (SVG/Canvas), Spannungskurven.

## 🔍 Text-Analyse & Lektorat

Core
- Vampirverben: Wortlisten + einfache Heuristiken (POS optional später), Markierung im Editor.
- Wortwiederholungen: Sliding-Window, Frequenzanalyse.
- Readability: Flesch/Flesch-Kincaid in Rust.
- Statistiken: Aggregation je Szene/Kapitel/Projekt; Speicherung in analytics_* Tabellen.

Pro
- KI-Stilanalyse, Dialog-Balance, Show vs Tell, Emotionen, Klischees, Logik-Checks – über lokale LLM-Pipelines.

## 🤖 KI-Integration (Pro)

- Chat: UI Panel, WebSocket/Tauri Stream; Backend Chat-Loop mit lokalem LLM (candle/tch), Prompt-Tools.
- Kontext/RAG: Embeddings (fastembed/onnx), Vektorspeicher (sqlite-vss oder tantivy), Chunking aus Szenen, Charakter/Plot/Notizen-Index.
- Privacy: Offline Model Bundles, Settings für Performance.

## 📊 Statistiken & Analytics

Core
- Wort-/Zeichen, Fortschritt, Lese-/Seitenzahl-Schätzung (parametrisierbar), Charakterverteilung; Chart.js oder Recharts.
- DB: writing_sessions(id, start, end, words); analytics_counters per Tag.

Pro
- Produktivitäts-Heatmap (D3), WPM über Zeit, Streaks, Mood-Tracking.

## 🎨 Themes & Personalization

Core
- Light/Dark via CSS Vars; Settings persistiert.
- Schriftarten (UI/Editor getrennt), Größe; Systemfont-Liste via Tauri; Google Fonts optional (Offline Cache).
- Farbakzente & Sprache (DE/EN) – i18n Infrastructure (i18next), Strings in JSON.

Pro
- Theme-Editor (Export/Import JSON), Ambient Sounds (WebAudio), High Contrast, Sepia, Custom Themes.

## 📤 Export & Publishing

### Core Export
- Export-Templates (Tera/Handlebars), HTML/CSS→PDF/ePub; Plain Text; Styles konfigurierbar.
- UI: Export-Dialog mit Template/Style Auswahl, Preview (HTML Render im WebView).

### 📖 Print-Layout & Druckfertige PDF (Core/Pro)

**Seitenaufbau & Struktur**
- Buchformat-Presets: A5, A4, US Letter, US Trade (6x9"), Taschenbuch (12.5x19cm), Custom
- Seitenränder: Innen/Außen/Oben/Unten getrennt einstellbar (Bundsteg berücksichtigen)
- Satzspiegel-Berechnung mit goldener Schnitt Option
- Beschnittzugabe (Bleed) für Druckereien (3mm Standard)
- Gerade/Ungerade Seiten spiegeln (recto/verso)

**Schmutztitel & Titelei**
- Schmutztitel (Halbtitel): nur Buchtitel, minimalistisch
- Frontispiz: Bild gegenüber Titelseite (optional)
- Haupttitel: Titel, Untertitel, Autor, ggf. Verlag
- Impressum: Konfigurierbare Felder (Copyright, ISBN, Auflage, Druck, CIP, Widmung)
- Widmungsseite (optional)
- Motto/Epigraph-Seite (optional)
- Inhaltsverzeichnis (automatisch generiert, Stil wählbar)
- Vorwort/Prolog-Seiten

**Typografie & Schriften**
- Schriftarten-Management:
  - Fließtext (Serif empfohlen: Garamond, Palatino, Georgia, Crimson)
  - Überschriften (Kapitel): Schrift, Größe, Stil, Abstand oben/unten
  - Unterüberschriften (Szenen): Schrift, Größe, Stil
  - Kopf-/Fußzeilen: Schrift, Größe
  - Seitenzahlen: Schrift, Stil, Position
- Schriftgrößen-Hierarchie (pt): Fließtext, H1-H4
- Zeilenhöhe/Durchschuss (leading)
- Zeichenabstand (tracking/letter-spacing)
- Ligaturen (fi, fl, ff) aktivieren
- Kapitälchen für Szenenanfänge/Akronyme
- Initialen/Drop Caps (Schmuckbuchstaben) für Kapitelanfänge:
  - Größe (2-5 Zeilen)
  - Schriftart (separat wählbar)
  - Abstand zum Text

**Absatz- & Textformatierung**
- Absatzeinzug (erste Zeile) vs. Leerzeile zwischen Absätzen
- Blocksatz mit Silbentrennung (DE/EN Hyphenation via hyphen-rs)
- Flattersatz links/rechts Option
- Absatzabstand (space before/after)
- Szenentrenner/Asterism (*** oder ⁂ oder Bild)
- Kapitelanfang: neue Seite (rechts), Abstand von oben
- Leerzeilen vor/nach Szenenüberschriften

**Hurenkinder & Schusterjungen (Widows & Orphans)**
- Hurenkind-Vermeidung: letzte Zeile eines Absatzes nicht allein auf neuer Seite
- Schusterjunge-Vermeidung: erste Zeile eines Absatzes nicht allein am Seitenende
- Mindestzeilenanzahl einstellbar (Standard: 2)
- Automatische Umbruch-Optimierung
- Manuelle Seitenumbruch-Marker im Editor

**Kopf- & Fußzeilen (Running Headers)**
- Lebende Kolumnentitel:
  - Gerade Seiten: Buchtitel oder Autorenname
  - Ungerade Seiten: Kapitelname
- Seitenzahlen: Position (unten Mitte, außen, innen)
- Erste Seite eines Kapitels: Kopfzeile ausblenden Option
- Linie unter/über Kopfzeile (optional)
- Schriftart & Größe separat

**Bilder & Illustrationen**
- Bilder pro Kapitel/Szene einfügen
- Bildplatzierung: In-Text, Ganzseitig, Halbseitig
- Bildunterschriften (Captions): Schrift, Position
- Bildauflösung prüfen (min. 300 DPI für Druck)
- Schwarz-Weiß Konvertierung für S/W-Druck
- Umfluss-Optionen (Text um Bild)

**Spezielle Elemente**
- Fußnoten: Nummerierung (pro Seite/Kapitel/Buch), Trennlinie, Schriftgröße
- Endnoten: Sammlung am Buchende
- Zitate/Blockquotes: Einrückung, Schriftgröße, kursiv
- Gedichte/Verse: Zentriert, spezielle Formatierung
- Briefe/Dokumente im Text: eigener Stil
- Kapitel-Epigraphen: Zitat + Quelle über Kapiteltext

**Inhaltsverzeichnis & Verzeichnisse**
- Automatisches ToC mit Seitenzahlen
- ToC-Tiefe wählbar (nur Kapitel, + Szenen, + Unterabschnitte)
- Punktlinie zu Seitenzahlen (dotted leader)
- Personenregister (optional, Pro)
- Ortsregister (optional, Pro)
- Glossar (optional, Pro)

**PDF-Ausgabe Optionen**
- PDF/X-1a oder PDF/X-3 für Druckereien
- Farbprofil einbetten (CMYK für Druck, RGB für Screen)
- Schriften einbetten (Subset)
- Komprimierung wählbar (Qualität vs. Dateigröße)
- Einzelseiten vs. Druckbögen (Spreads)
- Schnittmarken (Crop Marks) und Passermarken
- Cover separat oder integriert
- Leseprobe-Export (erste X Seiten/Kapitel)

**Druck-Validierung & Checks**
- Seitenanzahl-Prüfung (für Buchrücken-Berechnung)
- Bildauflösung unter 300 DPI warnen
- Überlaufender Text warnen
- Schriftarten-Embedding prüfen
- Farbmodus-Check (CMYK vs. RGB)
- Seitenzahl für Druckerei (4er/8er/16er Bogen)
- KDP/BoD/Epubli Formatvorlagen

**Tech-Umsetzung**
- Backend: printpdf oder weasyprint (Python) via Sidecar; Alternative: headless Chrome/Puppeteer für HTML→PDF
- Layout-Engine: CSS Paged Media (@page, @top-center, widows, orphans) oder eigene Rust-Engine
- Hyphenation: hyphenation-rs mit Sprachspezifischen Patterns
- Font-Subsetting: fonttools oder subsetter-rs
- DB: book_layout_settings(project_id, settings_json), page_overrides(page_num, custom_css)
- Preview: HTML/CSS Render im WebView mit Seitenansicht (paginated)

### Pro Export-Features
- KDP-Ready Checks (Amazon Kindle Direct Publishing Spezifikationen)
- Batch-Export (mehrere Formate gleichzeitig)
- ToC/Index Generator (automatisch)
- ISBN Integration & Barcode-Generator
- Buchrücken-Text Generator (basierend auf Seitenzahl)
- E-Book Konvertierung (Reflowable ePub, Fixed Layout ePub, Mobi/KF8)
- Hörbuch-Kapitelmarker Export
- Manuskript-Formatierung (für Verlage: Courier, doppelter Zeilenabstand)

## 🔄 Collaboration & Workflow

Core
- Versionierung: lokale Commits (snapshot_json + diff), visuelle Diffs (side-by-side), Kommentare im Text (Anchors im Doc JSON), Track Changes (Mark-Insert/Delete).
- DB: versions, comments, change_sets.

Pro
- Echtzeit-Kollab (OT/CRDT – yjs/yrs), WebRTC/Relay, Lektoratsmodus, Approval-Workflow.

## ⚙️ Technische Features

Core
- Auto-Update: Tauri Updater, Code Signing, Delta Updates.
- Crash Recovery: Panic Hook, letzte Autosave-Snapshots; Recovery-Dialog bei App-Start.
- Performance Monitoring: lokal (fps/input latency), Debug Panel (dev only).
- Keyboard Shortcuts: Keymap Engine, persistente Bindings, Konfliktprüfung.
- Plugin/Extension API (später in Core oder Early-Prototyp in Pro): WASM Sandbox, klarer API-Scope.

Pro
- Profiling/Memory Tools, Offline-Mode Optimierungen, Cross-Platform Sync, Third-Party API, CLI.

---

## Architektur- und Schema-Notizen

- DB Layer
  - rusqlite, WAL an; Migrations bei Open. FTS5 für Suche. JSON in Spalten meta_json für flexible Felder.
  - Wichtige Tabellen (Start): projects, entities, scenes(scene_id FK→entities), scene_content, counts, notes, characters, character_relations, locations, settings, backups, versions, comments, analytics_*.
- Commands (Tauri)
  - Je Feature klare Commands, z. B. list_entities, create_entity, move_entity, get_scene, save_scene_content, search_fts, spell_check, list_characters, save_character, etc.
- Frontend
  - State via React Query/Zustand; Workers für schwere Tasks (counts, spellcheck). Komponenten: Editor, Sidebar Tree, Inspector, SearchOverlay, ExportWizard, Analytics.

## Qualitätssicherung

- Build: Rust + Vite; Lints; ts/rs Format.
- Tests: Rust unit/integration für DB/Commands; frontend vitest für Stores/Utils.
- Smoke: E2E happy-path (Projekt anlegen → Szene schreiben → speichern → wieder öffnen → Export TXT).

## Milestones (konkret)

- M1 (2–3 Wochen):
  - Editor Rich-Text (CM6), Toolbar/Shortcuts, Autosave; Sidebar DnD; Live Counter; Fullscreen/Fokus; Settings: Fonts/Lineheight/Margins.
- M2 (2–3 Wochen):
  - Suchen/Ersetzen (FTS5), Rechtschreibung DE/EN; TXT/PDF basic; Backups; Templates.
- M3 (3–4 Wochen):
  - Hierarchie-Refactor (entities), Migration; Charakter/Orte Basics + Highlight/Hover; Plot-Notizen, Szene-Status, POV.
- M4 (3–4 Wochen):
  - Analyse (Wiederholungen/Vampirverben/Readability), Statistik-Dashboards; Export Templates.
- M5+ (iterativ):
  - DOCX/ePub stabil, Versionierung/Diff/Kommentare, Track Changes; Pro-Features vorbereiten.

## Nächste konkrete Aufgaben (Startpunkt)

- Frontend
  - Editor-Stack auf CodeMirror 6 umstellen, Toolbar + Marks (bold/italic/underline/strike), Block types, Autosave debounced.
  - Sidebar: DnD Sortierung persistieren (commands + DB order).
  - Search Overlay (UI Skelett) + Tauri FTS.
- Backend
  - scene_content Tabelle (doc_json) und counts Tabelle einführen; Commands get/save_scene_content anpassen für Rich-Doc.
  - FTS5-Index auf scene_content; search/replace Commands.
  - Hunspell Integration als optionaler Worker (DE/EN Wörterbücher laden).

Diese Datei ist ein lebender Plan – wir passen sie iterativ an.
