# Featherworks Author v1.0 - Feature-Plan

> Vollständige Autorensoftware für professionelles Publizieren

---

## 📖 1. Layout-Engine (Typst-basiert)

### Ausgabeformate

| Format | Priorität | Status | Technologie |
|--------|-----------|--------|-------------|
| PDF (Druckfertig) | ⭐⭐⭐⭐⭐ | 🔲 TODO | Typst |
| EPUB 3 | ⭐⭐⭐⭐⭐ | 🔲 TODO | epub-builder |
| DOCX | ⭐⭐⭐⭐ | 🔲 TODO | docx-rs |
| RTF | ⭐⭐⭐ | 🔲 TODO | rtf-writer |
| MOBI/KF8 | ⭐⭐ (optional) | 🔲 TODO | Calibre CLI oder kindlegen |

### Layout-Editor Komponenten

```
┌─────────────────────────────────────────────────────────────┐
│  BUCHFORMAT                                                 │
│  ├── Vorlagen: Taschenbuch, Hardcover, E-Book, Custom      │
│  ├── Maße in mm (Breite × Höhe)                            │
│  └── Beschnittzugabe für Druck                             │
├─────────────────────────────────────────────────────────────┤
│  SATZSPIEGEL & RÄNDER                                       │
│  ├── Innen/Außen/Oben/Unten (mm)                           │
│  ├── Bundsteg (extra Rand für Bindung)                     │
│  └── Live-Vorschau mit Raster                              │
├─────────────────────────────────────────────────────────────┤
│  TYPOGRAFIE                                                 │
│  ├── Fließtext: Schriftart, Größe, Zeilenabstand           │
│  ├── Überschriften: Kapitel, Szenen                        │
│  ├── Absatzformat: Einzug vs. Abstand                      │
│  └── Silbentrennung: An/Aus, Sprache                       │
├─────────────────────────────────────────────────────────────┤
│  TITELEI (Frontmatter)                                      │
│  ├── Schmutztitel (Halbtitel)                              │
│  ├── Titelseite (Titel, Untertitel, Autor)                 │
│  ├── Impressum (Verlag, ISBN, Copyright)                   │
│  ├── Widmung                                               │
│  ├── Motto/Epigraph                                        │
│  └── Inhaltsverzeichnis (auto-generiert)                   │
├─────────────────────────────────────────────────────────────┤
│  KAPITEL-GESTALTUNG                                         │
│  ├── Kapitelanfang: Neue Seite / Neue rechte Seite         │
│  ├── Kapitelnummer-Stil: "Kapitel 1" / "I" / "Eins"        │
│  ├── Initiale (Drop Cap): Größe, Schrift                   │
│  └── Szenen-Trenner: *** / ⁂ / Ornament / Leerzeile        │
├─────────────────────────────────────────────────────────────┤
│  PAGINIERUNG                                                │
│  ├── Seitenzahlen: Position, Schrift, Start-Seite          │
│  ├── Lebende Kolumnentitel: Autor / Buchtitel / Kapitel    │
│  └── Titelei: Römische Ziffern (optional)                  │
├─────────────────────────────────────────────────────────────┤
│  BILDER & ORNAMENTE                                         │
│  ├── Kapitel-Vignetten hochladen                           │
│  ├── Szenen-Trenner (SVG/PNG)                              │
│  └── Vollseiten-Illustrationen                             │
└─────────────────────────────────────────────────────────────┘
```

### Technische Umsetzung

**Typst Integration:**
```rust
// Typst als Library einbinden (nicht CLI)
// Crate: typst, typst-pdf
// 
// Workflow:
// 1. Generiere .typ Datei aus Manuskript + Layout-Settings
// 2. Kompiliere mit typst::compile()
// 3. Exportiere als PDF

// Für EPUB/DOCX: Separate Exporter, Typst nur für PDF
```

**Vorteile Typst:**
- Native Rust (kein externes Binary nötig)
- Schnelle Kompilierung
- Moderne Syntax, einfacher als LaTeX
- Gute Typografie out-of-the-box

---

## 📊 2. Plot-Helper (Visuell)

### UI-Konzept: **Hybrid Timeline + Kanban**

```
┌─────────────────────────────────────────────────────────────────────┐
│  PLOT-BOARD                                            [+ Neuer Punkt]
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ══════════════════════════════════════════════════════════════    │
│  │ SETUP │ KONFLIKT │ MIDPOINT │ KRISE │ KLIMAX │ AUFLÖSUNG │      │
│  ══════════════════════════════════════════════════════════════    │
│        ↓         ↓          ↓         ↓        ↓         ↓         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                               │
│  │ Intro   │ │ Angriff │ │ Wendep. │  ...                          │
│  │ ─────── │ │ ─────── │ │ ─────── │                               │
│  │ Kap 1-3 │ │ Kap 5   │ │ Kap 12  │                               │
│  │ 🔗 3 Sz │ │ 🔗 1 Sz │ │ 🔗 2 Sz │                               │
│  └─────────┘ └─────────┘ └─────────┘                               │
│                                                                     │
│  ── SUBPLOT: Liebesgeschichte ──────────────────────────────────   │
│  ┌─────────┐           ┌─────────┐                 ┌─────────┐     │
│  │ Treffen │           │ Streit  │                 │ Versöhn │     │
│  └─────────┘           └─────────┘                 └─────────┘     │
│                                                                     │
│  ── SUBPLOT: Familiengeheimnis ─────────────────────────────────   │
│  ┌─────────┐                     ┌─────────┐       ┌─────────┐     │
│  │ Hinweis │                     │ Entdeck │       │ Konfron │     │
│  └─────────┘                     └─────────┘       └─────────┘     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Features

- **Horizontale Timeline** mit Struktur-Markern (3-Akt, Heldenreise, etc.)
- **Subplots als separate Lanes** (farbcodiert)
- **Drag & Drop** zwischen Positionen
- **Szenen-Verknüpfung**: Plotpunkt → zugehörige Szenen
- **Templates**: Vorgefertigte Strukturen laden
  - 3-Akt-Struktur
  - Heldenreise (12 Stufen)
  - Save the Cat (15 Beats)
  - 7-Punkte-System
  - Freytags Pyramide
  - Eigene erstellen

### Datenmodell

```sql
-- Neue Tabellen
CREATE TABLE plot_points (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    structure_position TEXT,  -- 'setup', 'konflikt', 'midpoint', etc.
    subplot_id TEXT,          -- NULL = Hauptplot
    order_num INTEGER,
    color TEXT,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE subplots (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,
    order_num INTEGER
);

CREATE TABLE plot_scene_links (
    plot_point_id TEXT,
    scene_id TEXT,
    PRIMARY KEY (plot_point_id, scene_id)
);
```

---

## 🔍 3. Recherche-Modul

### Konzept: **Recherche-Cache mit KI-Extraktion**

```
┌─────────────────────────────────────────────────────────────────────┐
│  RECHERCHE                                           [+ Neue Quelle]│
├─────────────────────────────────────────────────────────────────────┤
│  🔍 Suche in Recherche...                                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  📁 Mittelalter-Setting                                             │
│  ├── 📄 Wikipedia: Feudalsystem                    [KI-Extraktion] │
│  │       "Das Lehnswesen war ein System..."                        │
│  │       → Relevante Fakten: Lehnsherr, Vasall, Lehen              │
│  ├── 📄 Blogpost: Alltag im Mittelalter           [KI-Extraktion] │
│  │       "Ein typischer Tag begann..."                             │
│  └── 🔗 URL: medieval-life.com/daily-routines                      │
│                                                                     │
│  📁 Charaktere                                                      │
│  ├── 📄 Notiz: Ritter-Ausbildung                                   │
│  └── 📄 PDF-Import: Waffenkunde.pdf                                │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  💡 KI-ASSISTENT                                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Frage: "Was aßen Ritter im Mittelalter?"                    │   │
│  │                                                              │   │
│  │ [Suche in meiner Recherche]                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Antwort (basierend auf deiner Recherche):                         │
│  "Laut deinem Wikipedia-Artikel über Feudalsystem und dem          │
│   Blogpost 'Alltag im Mittelalter' ernährten sich Ritter           │
│   hauptsächlich von..."                                            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Features

1. **Quellen-Typen:**
   - Freier Text (Notizen)
   - URL + eingefügter Text
   - PDF-Import (Text extrahieren)
   - Bild + Beschreibung

2. **Ordner/Tags** zur Organisation

3. **KI-Funktionen:**
   - "Extrahiere relevante Fakten" (pro Quelle)
   - "Suche in meiner Recherche" (Query über alle Quellen)
   - "Fasse Thema zusammen" (mehrere Quellen kombinieren)
   - Integration mit Fontaine-Chat

4. **Kein Web-Scraping** - User fügt Inhalte selbst ein

### Datenmodell

```sql
CREATE TABLE research_folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT,
    order_num INTEGER
);

CREATE TABLE research_items (
    id TEXT PRIMARY KEY,
    folder_id TEXT,
    type TEXT,           -- 'note', 'url', 'pdf', 'image'
    title TEXT NOT NULL,
    content TEXT,        -- Der eigentliche Text
    source_url TEXT,     -- Optional: Ursprungs-URL
    extracted_facts TEXT, -- KI-extrahierte Fakten (JSON)
    tags TEXT,           -- Komma-separiert
    created_at TEXT,
    updated_at TEXT
);
```

---

## 📅 Implementierungs-Reihenfolge

### Phase 1: Layout-Engine (Fundament)
1. Typst-Integration in Rust
2. Basis-Template für Buchexport
3. PDF-Export mit Grundeinstellungen
4. Layout-Editor UI (Einstellungen)

### Phase 2: Erweiterte Formate
5. EPUB-Export
6. DOCX-Export
7. RTF-Export
8. Titelei-Editor

### Phase 3: Plot-Helper
9. Datenbank-Schema
10. Plot-Board UI
11. Drag & Drop
12. Szenen-Verknüpfung
13. Struktur-Templates

### Phase 4: Recherche
14. Datenbank-Schema
15. Quellen-Verwaltung UI
16. KI-Extraktion
17. Recherche-Suche

### Phase 5: Polish
18. Vorschau-Modus (Live-Layout-Preview)
19. KDP/BoD/Tredition Presets
20. MOBI-Export (optional)

---

## 🎯 Zielgruppen-spezifische Features

### Self-Publisher (KDP, BoD, Tredition)
- [ ] Format-Presets für Anbieter
- [ ] Beschnittzugabe automatisch
- [ ] Cover-Maße anzeigen
- [ ] ISBN-Feld im Impressum

### Verlagsautoren
- [ ] DOCX-Export mit Formatvorlagen
- [ ] Normseiten-Berechnung
- [ ] Exposé-Export

### Lektoren
- [ ] Track Changes (v1.1)
- [ ] Kommentar-Export
- [ ] Änderungs-Protokoll

---

## 💡 Offene Design-Entscheidungen

1. **Layout-Vorschau:** Echtzeit im Editor oder separater Preview-Modus?
2. **Schriften:** System-Fonts nutzen oder eigene mitliefern?
3. **Plot-Board Position:** Eigenes Panel oder in Sidebar integriert?
4. **Recherche-Position:** Eigenes Panel oder Tab in Weltdatenbank?
