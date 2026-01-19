# FeatherWorks Author – Technische Roadmap# FeatherWorks Author – Technische Roadmap (Rust/Tauri/React)



**Letzte Aktualisierung:** 11. Dezember 2024Diese Roadmap priorisiert Core vs. Pro, ordnet die Features in Phasen und liefert pro Punkt konkrete Umsetzungsideen (Backend Rust/Tauri + Frontend React/TS), inkl. Datenmodell- und UX-Hinweisen. Ziel: schnell ein stabiles Core-MVP, danach systematisch ausbauen.



Diese Roadmap dokumentiert den aktuellen Implementierungsstand und die nächsten Schritte.Hinweis zu aktuellen Capabilities (Stand jetzt):

- Projekt öffnen/neu, Kapitel/Szenen, Editor-Basics, Settings: vorhanden und lauffähig.

---- DB: SQLite mit WAL, Migrations bei Open, rusqlite. Frontend: React + Tauri invoke.



## Legende## Priorisierung in Phasen



- ✅ Vollständig implementiert- Phase 0 Stabilisierung (laufend)

- 🔄 In Arbeit / Teilweise implementiert    - Crash-Schutz (Auto-Recovery), Autosave robust, Logging/Telemetry lokal, Basis-Tests.

- ⏳ Geplant- Phase 1 Core Schreibumgebung (MVP v1)

- 🎯 Priorität für nächste Phase  - Rich-Text/Styles, Sidebar Kap./Szenen mit DnD, Live Wort-/Zeichen, Suchen & Ersetzen, Undo/Redo, Fokus-/Fullscreen, Schrift/Zeilenhöhe/Abstände, Seitenränder/Padding, WPM, Rechtschreibprüfung (DE/EN) – minimal.

- Phase 2 Projekt- & Datei-Basics (MVP v2)

---  - Hierarchische Struktur (Reihe→Buch→Teil→Kapitel→Szene), Backups, Recents, Templates, TXT Export, einfache PDF/EPUB Export.

- Phase 3 Knowledge (Charaktere/Orte) & Plot-Grundlagen

## Phase 0: Stabilisierung ✅  - Charakter-DB & Sheets, Highlight/Hover, Beziehungen; Orts-DB & Highlight; Plot-Notizen, Szenen-Status, POV.

- Phase 4 Text-Analyse Basics & Statistiken

| Feature | Status | Details |  - Wiederholungen, Vampirverben, Readability, Statistik-Dashboards.

|---------|--------|---------|- Phase 5 Exports voll & Publishing

| Autosave | ✅ | Debounced, Hash-basiert |  - DOCX verlustarm, PDF sauber, ePub stabil, Export-Templates/Styling.

| Crash-Recovery | ✅ | Backup-System, Recovery-Dialog |- Phase 6 Collaboration/Workflow

| Logging | ✅ | File + Console Logging |  - Versionen, visuelle Diffs, Kommentare, Track Changes.

| WAL-Modus | ✅ | SQLite mit Write-Ahead-Log |- Phase 7 Pro: Cloud-Sync & KI (Fontain)

| Basis-Tests | ✅ | Container Roundtrip, Entity Scan |  - Sync (iCloud/Drive/OneDrive), lokales LLM, Chat, RAG, Coaching.



---Akzeptanzkriterien je Phase: App startet, keine Datenverluste, Features end-to-end (UI→Command→DB) mit Basistests.



## Phase 1: Core Schreibumgebung ✅## Core vs. Pro (Überblick)



| Feature | Status | Details |- Core: Alles zum Offline-Schreiben, Organisieren, Analysieren, Exportieren ohne Online-Dienste. Kein Cloud/LLM.

|---------|--------|---------|- Pro: Cloud-Sync, Kollaboration in Echtzeit, KI/LLM-Features, erweiterte Analyse/Workflows, KDP/Publishing-Extras.

| Rich-Text Editor | ✅ | CodeMirror 6 + ProseMirror-Style Marks |

| Formatierung (B/I/U) | ✅ | FormatToolbar mit Shortcuts |---

| Kapitel-Navigation | ✅ | Sidebar mit Drag & Drop |

| Live Wort-/Zeichenzählung | ✅ | Footer mit Stats |## 📝 Schreibumgebung & Editor (Core zuerst)

| Suchen & Ersetzen | ✅ | FTS5 + Regex |

| Undo/Redo | ✅ | Editor-interne History |1) Rich Text Editor mit Formatierung

| Fokus-Modus | ✅ | CSS-basiert |- Tech: CodeMirror 6 (empfohlen) mit Prosemirror-Markup für Rich-Text; Alternative: TipTap (CM+PM Wrapper) – funktioniert im Tauri-WebView.

| Vollbildmodus | ✅ | Tauri Window API |- Backend: Speichern als strukturierter JSON-Doc (Prosemirror-like) oder HTML+Marks; SQLite Tabellen: scenes(id, title, order, chapter_id, …), scene_content(scene_id TEXT, doc_json TEXT, ver INT, updated_at).

| Schrift/Zeilenhöhe | ✅ | Editor Settings mit Presets |- UI/UX: Floating Toolbar bei Selektion, Shortcuts (Cmd/Ctrl+B/I/U), Inline-Marks, Block-Types (Überschrift, Absatz, Zitat, Liste). Persistenz debounced.

| Seitenränder/Padding | ✅ | Konfigurierbar |

| Autosave | ✅ | Debounced mit Dirty-State |2) Kapitel-Navigation in Sidebar (Drag & Drop)

- Tech: React DnD Kit/Sortable; Persistenz: sort_order Spalte, Transaktionen bei Reorder.

---- Backend: Commands reorder_chapter(s)/reorder_scene(s); DB-Constraint: UNIQUE(chapter_id, sort_order).

- UI/UX: Collapsible Tree, Kontextmenü (Neu, Umbenennen, Löschen, Duplizieren), Auto-Scroll.

## Phase 2: Projekt- & Dateiverwaltung ✅

3) Wort- und Zeichenzählung (live)

| Feature | Status | Details |- Tech: WebWorker berechnet Tokens/Zeichen aus Editor-Doc; Debounce ~200–300ms.

|---------|--------|---------|- Backend: Caches pro Szene/Kapitel/Projekt in counts(scene_id INT, words INT, chars INT, updated_at).

| Hierarchie (Kapitel→Szenen) | ✅ | Mit Reorder, Move, Delete |- UI/UX: Footer Counter; Hover zeigt per Kapitel/Szene; Tagesziel-Progress (später Phase 3/4).

| .fwauthor Projektformat | ✅ | SQLite + Container (Zip) |

| Backups | ✅ | Rolling Backups bei Close |4) Rechtschreibprüfung (DE/EN)

| Recent Projects | ✅ | Persistiert in Settings |- Tech: Hunspell via hunspell-rs; Dictionaries als Assets. Optional: spelling-worker in Rust-Thread.

| TXT Export | ✅ | Plain Text |- Backend: Command spell_check(text, lang) batchweise; Cache Vorschläge.

| PDF Export | ✅ | Basis-Layout |- UI/UX: rote Wellenlinien, Kontextmenü mit Vorschlägen + “Zum Wörterbuch hinzufügen”.

| DOCX Export | ✅ | Via docx-rs |

| Import (TXT/MD) | ✅ | Mit Dialog |5) Suchen & Ersetzen (Regex)

- Tech: SQLite FTS5 für Volltext über Szenen; rust-regex für Client-Regex.

---- Backend: Commands search(query, regex?, scope=project/chapter/scene), replace(ids, replacement, confirm?).

- UI/UX: Ctrl/Cmd+F Overlay, Treffer-List, Jump-Navigation, Replace All / Single.

## Phase 3: Knowledge & Plot ✅

6) Autosave

| Feature | Status | Details |- Tech: Frontend Timer/idle detection; Save nur bei Doc-Hash-Änderung.

|---------|--------|---------|- Backend: Diff-Speicher (optional später). Transaktional; WAL aktiv.

| Charakter-Datenbank | ✅ | CRUD + Sheets |- UI/UX: dezenter Saved-Indicator, Warnung bei Close mit Dirty State.

| Charakter-Highlight | ✅ | Aho-Corasick Matching |

| Hover-Tooltips | ✅ | Entity-Info im Editor |7) Undo/Redo (unbegrenzt)

| Orte-Datenbank | ✅ | CRUD + Beschreibungen |- Tech: Editor-interne History (CM6) für Session; persistente Versions-Snapshots separat (Phase 6).

| Orte-Highlight | ✅ | Farbcodiert |- Backend: Optional Snapshots bei größeren Intervallen in versions(scene_id, snapshot_json, created_at).

| Entity-Typen | ✅ | Figuren, Orte, Fraktionen, Items |- UI/UX: Shortcuts, optional History-Panel.

| Plot-Notizen | ✅ | Pro Szene/Kapitel |

| Szenen-Status | ✅ | Idea/Draft/Written |8) Fokus-Modus & 9) Vollbildmodus

| POV-Tracking | ✅ | Charakter-Zuweisung |- Tech: CSS Klassen + Tauri Window API für Fullscreen.

| Entity-Beziehungen | ✅ | Basis-Implementierung |- Backend: Settings speichern (focus_mode, fullscreen_on_toggle).

- UI/UX: Fade-out anderer Absätze; Esc beendet.

---

10) Schrift/Zeilenhöhe/Abstände/Seitenränder/Padding

## Phase 4: Text-Analyse & Lektorat ✅- Tech: CSS Custom Properties, Settings→EditorSettings Tabelle.

- Backend: get/save_editor_settings erweitert (font_family, font_size, line_height, paragraph_spacing, page_padding).

| Feature | Status | Details |- UI/UX: Live Preview; Presets.

|---------|--------|---------|

| Stil-Analyse | ✅ | `analysis/style.rs` |11) Live-WPM

| Vampirverben-Erkennung | ✅ | Deutsche Wortlisten |- Tech: Frontend misst Eingaben pro Minute; smoothing window.

| Wortwiederholungen | ✅ | Sliding-Window Analyse |- Backend: optional Logging in writing_sessions.

| Readability-Score | ✅ | Flesch-Kincaid (DE/EN) |- UI/UX: Badge im Footer.

| Satzlängen-Analyse | ✅ | Verteilung |

| Passiv-Erkennung | ✅ | Heuristiken |Nice to have (später): Typewriter-Modus, Key Sounds (WebAudio), Pomodoro (Tauri Notifications + sessions Tabelle), tägliche Ziele, Heatmap, Statistiken, Markdown-Support (Export/Import), LaTeX-Export, Speech-to-Text (macOS API), Seitenrand-Kommentare, Split-Screen.

| Export-Analyse | ✅ | `analysis/export.rs` JSON/Markdown |

## 🗂️ Projekt- & Dateiverwaltung

---

Core

## Phase 5: KI-Integration (Fontaine) ✅- Hierarchie Reihe→Buch→Teil→Kapitel→Szene

  - DB: entities(id, parent_id, type ENUM('series','book','part','chapter','scene'), sort_order, title, meta_json).

| Feature | Status | Details |  - Migration: existierende chapters/scenes in entities überführen (Kompat Schicht beibehalten bis Abschluss).

|---------|--------|---------|  - UI: Tree mit Filtern, Breadcrumbs; Commands: create_entity, move_entity, rename_entity, delete_entity.

| Lokales LLM | ✅ | llama-cpp-2 mit Metal/GPU |- Projekte .fwauthor

| GGUF Modell-Laden | ✅ | Registry + Loader |  - Struktur: SQLite + assets/ (Medien) in Ordner, gepackt als zip (Phase später) oder Dateipfad (wie bisher). Beibehaltung aktueller DB-Datei, optional Projektordner nebenan.

| Streaming-Antworten | ✅ | Token-by-Token via Events |- Backups

| Chat-Panel | ✅ | FontainePanel.tsx |  - Rolling tar.gz in .backups/ im Projektordner; keep N (konfigurierbar). Hintergrund-Task nach Saves.

| AI Request Queue | ✅ | Prioritäten (Interactive > Analysis > Background) |- Im-/Export

| Background Jobs | ✅ | Entity-Scan, Summarization |  - TXT (einfach); PDF/ePub minimal: HTML+CSS Rendering → wkhtmltopdf/printpdf; epub-builder.

| Hardware-Erkennung | ✅ | RAM, GPU, optimale Parameter |- Templates

| Kontext-Sammlung | ✅ | Szene + Charaktere + Plot |  - JSON-Blueprints für Standard-Strukturen (Roman/Sachbuch); Wizard beim Erstellen.

| Auto-Summarization | ✅ | Szenen-/Kapitelzusammenfassungen |

| Entity-Scan (AI) | ✅ | Entitäten aus Text extrahieren |Pro (später)

| Szenen-Analyse (AI) | ✅ | Stil-Feedback |- Cloud-Sync (OAuth2, Delta Sync, Konfliktlösung), ODT/HTML Export, Scrivener Import, Archivierung, Statistiken/Erstelldatum, Sharing, Git-Integration optional.

| Provider-System | ✅ | Lokal, OpenAI, Anthropic |

## 👥 Charakter-Management

---

Core

## Phase 6: Support & Wartung ✅- DB: characters(id, name, summary, avatar_path, meta_json), character_notes, character_relations(a_id, b_id, type).

- Sheets: Flexible Felder via JSON Schema in meta_json; Form-Rendering im Frontend.

| Feature | Status | Details |- Highlight/Hover: Aho-Corasick über bekannte Namen; Cache im Frontend; Hover-Tooltip via Portal.

|---------|--------|---------|- UI: Cards/Grid + Detail-Drawer; Suche/Filter; Beziehungen als einfache Liste, später Graph.

| Bug-Report System | ✅ | Modal + Webhook + lokale Speicherung |

| System-Info Sammlung | ✅ | OS, RAM, CPU, GPU, App-State |Pro

| Hilfe-Menü | ✅ | Fehler melden, Feedback, Logs |- Konsistenz-Check via lokales LLM (RAG über Charakterdaten).

| Rechtschreibprüfung | 🔄 | Hunspell DE/EN (Basis) |

## 🗺️ Welt- & Ortsverwaltung

---

Core

## Phase 7: Nächste Schritte 🎯- DB: locations(id, parent_id, name, description, meta_json, sort_order).

- Highlight/Hover analog Charaktere, mit anderer Farbpalette.

### Hohe Priorität- UI: Tree + Karten-Placeholder (Hooks für spätere Kartenintegration).



| Feature | Status | Aufwand | Beschreibung |Pro

|---------|--------|---------|--------------|- Karten-Upload, Annotation, Zoom/Pan, Bildspeicher in assets/locations/.

| Collaboration Basics | ⏳ | Mittel | Versionierung, lokale Snapshots, Diffs |

| Track Changes | ⏳ | Mittel | Insert/Delete Markierungen |## 📋 Plot & Struktur-Tools

| Kommentare im Text | ⏳ | Mittel | Anchor-basiert |

| ePub Export (verbessert) | ⏳ | Klein | Styles, ToC |Core

| Print-Layout | ⏳ | Groß | Schmutztitel, Titelei, Hurenkinder |- Szenen-Übersicht/Status: scenes.status ENUM('idea','draft','written'); Board (Kanban) per Status.

- Plot-Notizen: notes(id, entity_id, type('plot','general'), content_json, updated_at).

### Mittlere Priorität- POV-Tracking: scenes.pov_character_id (FK characters.id), Validierung beim Speichern.

- DnD Szenen: Reorder zwischen Kapiteln (move_entity).

| Feature | Status | Aufwand | Beschreibung |

|---------|--------|---------|--------------|Pro

| Cloud-Sync | ⏳ | Groß | iCloud/Drive/OneDrive |- Story-Templates (JSON), visuelle Timeline (SVG/Canvas), Spannungskurven.

| RAG/Embeddings | ⏳ | Mittel | Vektorsuche für Kontext |

| Karten-Integration | ⏳ | Mittel | Upload + Annotation |## 🔍 Text-Analyse & Lektorat

| Timeline-Visualisierung | ⏳ | Mittel | SVG/Canvas Plot |

| Plugin-System | ⏳ | Groß | WASM Sandbox |Core

- Vampirverben: Wortlisten + einfache Heuristiken (POS optional später), Markierung im Editor.

### Nice-to-Have- Wortwiederholungen: Sliding-Window, Frequenzanalyse.

- Readability: Flesch/Flesch-Kincaid in Rust.

| Feature | Status | Aufwand | Beschreibung |- Statistiken: Aggregation je Szene/Kapitel/Projekt; Speicherung in analytics_* Tabellen.

|---------|--------|---------|--------------|

| Speech-to-Text | ⏳ | Klein | macOS API |Pro

| Typewriter-Modus | ⏳ | Klein | Scroll-Lock auf Cursor |- KI-Stilanalyse, Dialog-Balance, Show vs Tell, Emotionen, Klischees, Logik-Checks – über lokale LLM-Pipelines.

| Key Sounds | ⏳ | Klein | WebAudio |

| Pomodoro Timer | ⏳ | Klein | Mit Notifications |## 🤖 KI-Integration (Pro)

| Theme-Editor | ⏳ | Mittel | Custom Themes |

- Chat: UI Panel, WebSocket/Tauri Stream; Backend Chat-Loop mit lokalem LLM (candle/tch), Prompt-Tools.

---- Kontext/RAG: Embeddings (fastembed/onnx), Vektorspeicher (sqlite-vss oder tantivy), Chunking aus Szenen, Charakter/Plot/Notizen-Index.

- Privacy: Offline Model Bundles, Settings für Performance.

## Technische Architektur

## 📊 Statistiken & Analytics

### Backend (Rust/Tauri)

Core

```- Wort-/Zeichen, Fortschritt, Lese-/Seitenzahl-Schätzung (parametrisierbar), Charakterverteilung; Chart.js oder Recharts.

src-tauri/src/- DB: writing_sessions(id, start, end, words); analytics_counters per Tag.

├── main.rs          # Tauri Commands & Menüs

├── lib.rs           # Module-ExportsPro

├── models.rs        # Datenstrukturen- Produktivitäts-Heatmap (D3), WPM über Zeit, Streaks, Mood-Tracking.

├── types.rs         # Type Aliases

├── ai/## 🎨 Themes & Personalization

│   ├── mod.rs       # AI-Koordination, Model-Management

│   ├── engines/Core

│   │   └── llamacpp.rs  # Native llama.cpp Integration- Light/Dark via CSS Vars; Settings persistiert.

│   ├── stream.rs    # Token-Streaming- Schriftarten (UI/Editor getrennt), Größe; Systemfont-Liste via Tauri; Google Fonts optional (Offline Cache).

│   ├── context.rs   # Kontext-Sammlung für Prompts- Farbakzente & Sprache (DE/EN) – i18n Infrastructure (i18next), Strings in JSON.

│   ├── queue.rs     # Request-Queue mit Prioritäten

│   ├── background.rs # Background-JobsPro

│   ├── hardware.rs  # Hardware-Erkennung- Theme-Editor (Export/Import JSON), Ambient Sounds (WebAudio), High Contrast, Sepia, Custom Themes.

│   ├── registry.rs  # Model-Registry

│   └── loader.rs    # Model-Loader Trait## 📤 Export & Publishing

├── analysis/

│   ├── mod.rs### Core Export

│   ├── style.rs     # Stil-Analyse- Export-Templates (Tera/Handlebars), HTML/CSS→PDF/ePub; Plain Text; Styles konfigurierbar.

│   └── export.rs    # Analyse-Export- UI: Export-Dialog mit Template/Style Auswahl, Preview (HTML Render im WebView).

├── storage/

│   ├── mod.rs### 📖 Print-Layout & Druckfertige PDF (Core/Pro)

│   ├── database.rs  # SQLite Operations

│   └── container.rs # .fwauthor Zip-Format**Seitenaufbau & Struktur**

├── entities/        # Entity-Management- Buchformat-Presets: A5, A4, US Letter, US Trade (6x9"), Taschenbuch (12.5x19cm), Custom

├── editor/          # Editor-spezifische Logik- Seitenränder: Innen/Außen/Oben/Unten getrennt einstellbar (Bundsteg berücksichtigen)

├── error/           # Error Types- Satzspiegel-Berechnung mit goldener Schnitt Option

└── support.rs       # Bug Reports & Feedback- Beschnittzugabe (Bleed) für Druckereien (3mm Standard)

```- Gerade/Ungerade Seiten spiegeln (recto/verso)



### Frontend (React/TypeScript)**Schmutztitel & Titelei**

- Schmutztitel (Halbtitel): nur Buchtitel, minimalistisch

```- Frontispiz: Bild gegenüber Titelseite (optional)

src/frontend/- Haupttitel: Titel, Untertitel, Autor, ggf. Verlag

├── main.tsx         # App-Root, Routing, State- Impressum: Konfigurierbare Felder (Copyright, ISBN, Auflage, Druck, CIP, Widmung)

├── i18n.ts          # Internationalisierung- Widmungsseite (optional)

├── featureFlags.ts  # Feature-Toggles- Motto/Epigraph-Seite (optional)

├── components/- Inhaltsverzeichnis (automatisch generiert, Stil wählbar)

│   ├── CodeMirrorEditor.tsx  # Haupt-Editor- Vorwort/Prolog-Seiten

│   ├── FormatToolbar.tsx     # Formatierungs-Toolbar

│   ├── RichEditor.tsx        # Rich-Text Wrapper**Typografie & Schriften**

│   ├── FontainePanel.tsx     # AI-Chat Panel- Schriftarten-Management:

│   ├── EntitiesPanel.tsx     # Entity-Management  - Fließtext (Serif empfohlen: Garamond, Palatino, Georgia, Crimson)

│   ├── BugReportModal.tsx    # Support-Modal  - Überschriften (Kapitel): Schrift, Größe, Stil, Abstand oben/unten

│   └── ...  - Unterüberschriften (Szenen): Schrift, Größe, Stil

├── styles/  - Kopf-/Fußzeilen: Schrift, Größe

│   ├── design-system.css  - Seitenzahlen: Schrift, Stil, Position

│   └── welcome.css- Schriftgrößen-Hierarchie (pt): Fließtext, H1-H4

└── locales/- Zeilenhöhe/Durchschuss (leading)

    ├── de.json- Zeichenabstand (tracking/letter-spacing)

    └── en.json- Ligaturen (fi, fl, ff) aktivieren

```- Kapitälchen für Szenenanfänge/Akronyme

- Initialen/Drop Caps (Schmuckbuchstaben) für Kapitelanfänge:

### Datenbank (SQLite)  - Größe (2-5 Zeilen)

  - Schriftart (separat wählbar)

Wichtige Tabellen:  - Abstand zum Text

- `projects` - Projektmetadaten

- `chapters` - Kapitel mit sort_order**Absatz- & Textformatierung**

- `scenes` - Szenen mit Inhalt, Status, POV- Absatzeinzug (erste Zeile) vs. Leerzeile zwischen Absätzen

- `scene_content` - Rich-Text JSON- Blocksatz mit Silbentrennung (DE/EN Hyphenation via hyphen-rs)

- `scene_summaries` - AI-generierte Zusammenfassungen- Flattersatz links/rechts Option

- `entity_types` - Figur, Ort, Fraktion, Item- Absatzabstand (space before/after)

- `entities` - Alle Entitäten- Szenentrenner/Asterism (*** oder ⁂ oder Bild)

- `entity_mentions` - Erwähnungen in Szenen- Kapitelanfang: neue Seite (rechts), Abstand von oben

- `settings` - App-Einstellungen- Leerzeilen vor/nach Szenenüberschriften

- `editor_settings` - Editor-Konfiguration

- `ai_settings` - KI-Parameter**Hurenkinder & Schusterjungen (Widows & Orphans)**

- Hurenkind-Vermeidung: letzte Zeile eines Absatzes nicht allein auf neuer Seite

---- Schusterjunge-Vermeidung: erste Zeile eines Absatzes nicht allein am Seitenende

- Mindestzeilenanzahl einstellbar (Standard: 2)

## Build & Development- Automatische Umbruch-Optimierung

- Manuelle Seitenumbruch-Marker im Editor

```bash

# Development**Kopf- & Fußzeilen (Running Headers)**

export MACOSX_DEPLOYMENT_TARGET=11.0- Lebende Kolumnentitel:

npm run tauri dev  - Gerade Seiten: Buchtitel oder Autorenname

  - Ungerade Seiten: Kapitelname

# Build- Seitenzahlen: Position (unten Mitte, außen, innen)

npm run tauri build- Erste Seite eines Kapitels: Kopfzeile ausblenden Option

- Linie unter/über Kopfzeile (optional)

# Tests- Schriftart & Größe separat

cargo test --manifest-path src-tauri/Cargo.toml

npm test**Bilder & Illustrationen**

```- Bilder pro Kapitel/Szene einfügen

- Bildplatzierung: In-Text, Ganzseitig, Halbseitig

### Feature Flags (Cargo)- Bildunterschriften (Captions): Schrift, Position

- Bildauflösung prüfen (min. 300 DPI für Druck)

- `local-llm` - Aktiviert echte llama.cpp Inferenz- Schwarz-Weiß Konvertierung für S/W-Druck

- Ohne Flag: Simulierte Antworten für Entwicklung- Umfluss-Optionen (Text um Bild)



---**Spezielle Elemente**

- Fußnoten: Nummerierung (pro Seite/Kapitel/Buch), Trennlinie, Schriftgröße

## Qualitätssicherung- Endnoten: Sammlung am Buchende

- Zitate/Blockquotes: Einrückung, Schriftgröße, kursiv

- **Rust**: `cargo clippy`, `cargo fmt`- Gedichte/Verse: Zentriert, spezielle Formatierung

- **TypeScript**: ESLint, Prettier- Briefe/Dokumente im Text: eigener Stil

- **Tests**: - Kapitel-Epigraphen: Zitat + Quelle über Kapiteltext

  - `tests/container_roundtrip.rs`

  - `tests/encrypted_roundtrip.rs`**Inhaltsverzeichnis & Verzeichnisse**

  - `tests/entities_scan.rs`- Automatisches ToC mit Seitenzahlen

  - `tests/style_analysis.rs`- ToC-Tiefe wählbar (nur Kapitel, + Szenen, + Unterabschnitte)

- Punktlinie zu Seitenzahlen (dotted leader)

---- Personenregister (optional, Pro)

- Ortsregister (optional, Pro)

*Diese Roadmap wird kontinuierlich aktualisiert.*- Glossar (optional, Pro)


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

## 🎨 UX & Usability Verbesserungen (In Arbeit)

### Tooltips für alle Icons 🔄
- Status: Rudimentär angelegt
- Tech: Custom Tooltip-Komponente mit i18n-Support
- Umsetzung: Alle Icon-Buttons bekommen hover-Tooltips mit lokalisierten Beschreibungen
- Dateien: `src/frontend/components/ui/Tooltip.tsx`

### Mini-Browser im Research-Panel 🔄
- Status: Rudimentär angelegt
- Tech: Tauri Shell für externe Links oder WebView-Komponente
- Features:
  - URL-Eingabe und Navigation
  - Lesezeichen-Verwaltung (SQLite Tabelle `bookmarks`)
  - Tab-ähnliche Verwaltung mehrerer Quellen
  - Quick-Capture: Text markieren → in Notizen übernehmen
- Dateien: `src/frontend/components/ResearchBrowser.tsx`

### Fontaine AI Recherche-Assistent 🔄
- Status: Rudimentär angelegt
- Tech: Lokales LLM (bereits integriert) + RAG für Projekt-Kontext
- Features:
  - "Recherche"-Modus: Fragen zur Story/Welt beantworten
  - Faktenfragen mit Web-Suche (optional, Pro)
  - Kontext-aware: Kennt Charaktere, Orte, Plotlinien
  - Research-to-Notes: Ergebnisse als Notizen speichern
- Dateien: `src/frontend/components/FontaineResearch.tsx`

### Preview-Fenster Verbesserungen 🔄
- Status: In Arbeit
- Bekannte Issues:
  - Fenster lässt sich nach Schließen nicht wieder öffnen (stale handle)
  - Settings-Panel braucht bessere Integration
- Nächste Schritte:
  - Window-Handle korrekt invalidieren bei Close
  - Settings live synchronisieren

---

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
