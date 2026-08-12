use crate::models::{Chapter, Project, Scene};
use rusqlite::{Connection, Result};
use std::fmt;
use std::sync::Mutex;

#[derive(Debug)]
pub enum DatabaseOperationError {
    Sql(rusqlite::Error),
    Io(std::io::Error),
    NotFound(String),
    // ... other error variants
}

impl fmt::Display for DatabaseOperationError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match *self {
            DatabaseOperationError::Sql(ref err) => write!(f, "SQL Error: {}", err),
            DatabaseOperationError::Io(ref err) => write!(f, "IO Error: {}", err),
            DatabaseOperationError::NotFound(ref msg) => write!(f, "Not Found: {}", msg),
        }
    }
}

impl std::error::Error for DatabaseOperationError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match *self {
            DatabaseOperationError::Sql(ref err) => Some(err),
            DatabaseOperationError::Io(ref err) => Some(err),
            DatabaseOperationError::NotFound(_) => None,
        }
    }
}

impl From<rusqlite::Error> for DatabaseOperationError {
    fn from(err: rusqlite::Error) -> DatabaseOperationError {
        DatabaseOperationError::Sql(err)
    }
}

// This struct holds the application's state, primarily the database connection.
#[derive(Default)]
pub struct AppState {
    pub db: Mutex<Option<Connection>>,
    // Absolute path of the currently opened project database (".fwauthor" file currently = raw sqlite)
    pub db_path: Mutex<Option<String>>,
    // Original encrypted container path if opened via import (optional)
    pub container_path: Mutex<Option<String>>,
    // Flag: current DB is from a temporary decrypted container (prompt user to Save As)
    pub db_is_temp: Mutex<bool>,
    // Journal path for crash recovery (JSON lines); set when project opened
    pub journal_path: Mutex<Option<String>>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct EditorSettings {
    pub font_family: String,
    pub font_size: u32,
    pub line_height: f32,
    #[serde(default)]
    pub paragraph_spacing: Option<f32>,
    #[serde(default)]
    pub page_padding: Option<u32>,
    #[serde(default)]
    pub editor_language: Option<String>,
    #[serde(default)]
    pub typewriter_mode: Option<bool>,
    #[serde(default)]
    pub typewriter_sound: Option<bool>,
    #[serde(default)]
    pub typewriter_volume: Option<u32>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct AiSettings {
    /// Is AI functionality enabled? (User can completely disable)
    pub enabled: bool,
    /// Currently selected model ID (e.g. gemma-4-e2b-mlx-q6 or mistral-7b)
    pub model_id: String,
    /// Generation temperature (0.0 - 1.0)
    pub temperature: f32,
    /// Maximum tokens to generate
    pub max_tokens: u32,
    /// Auto-load model on startup?
    pub auto_load: bool,
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            enabled: true,                          // AI enabled by default
            model_id: "gemma-4-e2b-mlx-q6".to_string(), // Gemma 4 E2B (MLX) is the default
            temperature: 0.7,
            max_tokens: 512,
            auto_load: true,
        }
    }
}

pub fn create_database(
    path: &str,
    title: &str,
    author: &str,
    short_name: Option<&str>,
    genre: Option<&str>,
    target_pages: Option<i32>,
) -> Result<Connection, DatabaseOperationError> {
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS project (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            author TEXT NOT NULL,
            short_name TEXT,
            genre TEXT,
            target_pages INTEGER
        );
        CREATE TABLE IF NOT EXISTS chapters (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            order_num INTEGER NOT NULL,
            summary TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS scenes (
            id TEXT PRIMARY KEY,
            chapter_id TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT,
            content_json TEXT,
            word_count INTEGER DEFAULT 0,
            order_num INTEGER NOT NULL,
            summary TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (chapter_id) REFERENCES chapters (id)
        );
        CREATE TABLE IF NOT EXISTS notes (
            scene_id TEXT PRIMARY KEY,
            content TEXT NOT NULL DEFAULT '',
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(scene_id) REFERENCES scenes(id)
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ai_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS entity_types (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            name_plural TEXT NOT NULL,
            icon TEXT DEFAULT '📌',
            default_color TEXT DEFAULT '#667eea',
            is_system INTEGER DEFAULT 0,
            order_num INTEGER DEFAULT 0,
            schema_json TEXT DEFAULT '[]',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS entities (
            id TEXT PRIMARY KEY,
            type_id TEXT NOT NULL,
            name TEXT NOT NULL,
            aliases TEXT DEFAULT '',
            description TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            color TEXT,
            metadata_json TEXT DEFAULT '{}',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (type_id) REFERENCES entity_types(id)
        );
        CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type_id);
        CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
        CREATE TABLE IF NOT EXISTS entity_images (
            id TEXT PRIMARY KEY,
            entity_id TEXT NOT NULL,
            name TEXT NOT NULL,
            file_name TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            data BLOB NOT NULL,
            order_num INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_entity_images_entity ON entity_images(entity_id);
        CREATE TABLE IF NOT EXISTS rag_documents (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            file_type TEXT NOT NULL,
            file_size INTEGER DEFAULT 0,
            content TEXT NOT NULL,
            added_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Plot System
        CREATE TABLE IF NOT EXISTS subplots (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            color TEXT DEFAULT '#667eea',
            is_main INTEGER DEFAULT 0,
            order_num INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS plot_points (
            id TEXT PRIMARY KEY,
            subplot_id TEXT,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            structure_position TEXT,
            position_percent REAL DEFAULT 0,
            status TEXT DEFAULT 'planned',
            order_num INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (subplot_id) REFERENCES subplots(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS plot_scene_links (
            id TEXT PRIMARY KEY,
            plot_point_id TEXT NOT NULL,
            scene_id TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (plot_point_id) REFERENCES plot_points(id) ON DELETE CASCADE,
            FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
            UNIQUE(plot_point_id, scene_id)
        );
        CREATE TABLE IF NOT EXISTS plot_templates (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            structure_json TEXT NOT NULL,
            is_system INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Recherche System
        CREATE TABLE IF NOT EXISTS research_folders (
            id TEXT PRIMARY KEY,
            parent_id TEXT,
            name TEXT NOT NULL,
            order_num INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (parent_id) REFERENCES research_folders(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS research_items (
            id TEXT PRIMARY KEY,
            folder_id TEXT,
            item_type TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT DEFAULT '',
            source_url TEXT,
            file_name TEXT,
            file_data BLOB,
            mime_type TEXT,
            extracted_facts TEXT,
            tags TEXT DEFAULT '',
            order_num INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (folder_id) REFERENCES research_folders(id) ON DELETE SET NULL
        );
        
        -- Layout System
        CREATE TABLE IF NOT EXISTS layout_presets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            settings_json TEXT NOT NULL,
            is_system INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS layout_settings (
            id TEXT PRIMARY KEY DEFAULT 'default',
            settings_json TEXT NOT NULL DEFAULT '{}',
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Book Metadata (shared across editions)
        CREATE TABLE IF NOT EXISTS book_metadata (
            id TEXT PRIMARY KEY DEFAULT 'main',
            subtitle TEXT,
            author_bio TEXT,
            publisher TEXT,
            publish_date TEXT,
            edition_text TEXT,
            language TEXT DEFAULT 'de',
            copyright_year INTEGER,
            copyright_holder TEXT,
            copyright_text TEXT,
            all_rights_reserved INTEGER DEFAULT 1,
            dedication TEXT,
            epigraph TEXT,
            epigraph_author TEXT,
            acknowledgments TEXT,
            foreword TEXT,
            foreword_author TEXT,
            preface TEXT,
            introduction TEXT,
            about_author TEXT,
            also_by_author TEXT,
            series_name TEXT,
            series_number INTEGER,
            cover_image_path TEXT,
            cover_designer TEXT,
            categories TEXT,
            keywords TEXT,
            description TEXT,
            short_description TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Editions / Publication Profiles
        CREATE TABLE IF NOT EXISTS editions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            edition_type TEXT NOT NULL DEFAULT 'ebook',
            isbn TEXT,
            isbn_13 TEXT,
            asin TEXT,
            price REAL,
            currency TEXT DEFAULT 'EUR',
            layout_preset_id TEXT,
            layout_overrides_json TEXT,
            include_about_author INTEGER DEFAULT 1,
            include_also_by INTEGER DEFAULT 1,
            include_preview INTEGER DEFAULT 0,
            preview_chapter_id TEXT,
            ebook_cover_path TEXT,
            print_cover_path TEXT,
            spine_width REAL,
            bleed REAL DEFAULT 3.0,
            distributor TEXT,
            distributor_id TEXT,
            published INTEGER DEFAULT 0,
            publish_date TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (layout_preset_id) REFERENCES layout_presets(id) ON DELETE SET NULL
        );
        ",
    )?;

    // Seed default entity types
    conn.execute_batch("
        INSERT OR IGNORE INTO entity_types (id, name, name_plural, icon, default_color, is_system, order_num) VALUES
            ('character', 'Charakter', 'Charaktere', '👤', '#667eea', 1, 1),
            ('location', 'Ort', 'Orte', '📍', '#48bb78', 1, 2),
            ('faction', 'Fraktion', 'Fraktionen', '⚔️', '#ed8936', 1, 3),
            ('item', 'Gegenstand', 'Gegenstände', '🔮', '#9f7aea', 1, 4);
    ")?;

    let project_id: String = nanoid::nanoid!();
    conn.execute(
        "INSERT INTO project (id, title, author, short_name, genre, target_pages) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![project_id, title, author, short_name, genre, target_pages],
    )?;

    // Seed with a default chapter and scene to make the editor immediately usable
    let chapter_id: String = nanoid::nanoid!();
    conn.execute(
        "INSERT INTO chapters (id, title, order_num) VALUES (?1, ?2, 1)",
        rusqlite::params![chapter_id, "Kapitel 1"],
    )?;
    let scene_id: String = nanoid::nanoid!();
    conn.execute(
        "INSERT INTO scenes (id, chapter_id, title, content, word_count, order_num) VALUES (?1, ?2, ?3, '', 0, 1)",
        rusqlite::params![scene_id, chapter_id, "Szene 1"],
    )?;

    // Seed with default main subplot
    conn.execute(
        "INSERT INTO subplots (id, name, description, color, is_main, order_num) VALUES ('main', 'Haupthandlung', 'Die zentrale Geschichte', '#667eea', 1, 0)",
        [],
    )?;

    // Seed plot structure templates
    conn.execute_batch(r#"
        INSERT OR IGNORE INTO plot_templates (id, name, description, structure_json, is_system) VALUES
            ('three-act', 'Drei-Akt-Struktur', 'Klassische dramatische Struktur',
             '{"markers":[{"id":"setup","name":"Setup","percent":0},{"id":"inciting","name":"Auslösendes Ereignis","percent":10},{"id":"plot1","name":"Plot Point 1","percent":25},{"id":"midpoint","name":"Midpoint","percent":50},{"id":"plot2","name":"Plot Point 2","percent":75},{"id":"climax","name":"Klimax","percent":90},{"id":"resolution","name":"Auflösung","percent":100}]}', 1),
            ('hero-journey', 'Heldenreise', 'Joseph Campbells Monomythos (12 Stufen)',
             '{"markers":[{"id":"ordinary","name":"Gewöhnliche Welt","percent":0},{"id":"call","name":"Ruf des Abenteuers","percent":8},{"id":"refusal","name":"Weigerung","percent":12},{"id":"mentor","name":"Mentor","percent":17},{"id":"threshold","name":"Erste Schwelle","percent":25},{"id":"tests","name":"Prüfungen","percent":40},{"id":"approach","name":"Vordringen","percent":50},{"id":"ordeal","name":"Entscheidende Prüfung","percent":60},{"id":"reward","name":"Belohnung","percent":70},{"id":"road-back","name":"Rückweg","percent":80},{"id":"resurrection","name":"Auferstehung","percent":90},{"id":"return","name":"Rückkehr","percent":100}]}', 1),
            ('save-the-cat', 'Save the Cat', 'Blake Snyders Beat Sheet (15 Beats)',
             '{"markers":[{"id":"opening","name":"Opening Image","percent":0},{"id":"theme","name":"Theme Stated","percent":5},{"id":"setup","name":"Set-Up","percent":10},{"id":"catalyst","name":"Catalyst","percent":12},{"id":"debate","name":"Debate","percent":17},{"id":"break2","name":"Break into Two","percent":25},{"id":"bstory","name":"B Story","percent":30},{"id":"fun","name":"Fun and Games","percent":40},{"id":"midpoint","name":"Midpoint","percent":50},{"id":"bad","name":"Bad Guys Close In","percent":60},{"id":"allislost","name":"All Is Lost","percent":75},{"id":"dark","name":"Dark Night","percent":80},{"id":"break3","name":"Break into Three","percent":85},{"id":"finale","name":"Finale","percent":90},{"id":"final","name":"Final Image","percent":100}]}', 1),
            ('seven-point', 'Sieben-Punkte-System', 'Dan Wells Plotstruktur',
             '{"markers":[{"id":"hook","name":"Hook","percent":0},{"id":"plot1","name":"Plot Turn 1","percent":15},{"id":"pinch1","name":"Pinch 1","percent":30},{"id":"midpoint","name":"Midpoint","percent":50},{"id":"pinch2","name":"Pinch 2","percent":70},{"id":"plot2","name":"Plot Turn 2","percent":85},{"id":"resolution","name":"Resolution","percent":100}]}', 1);
    "#)?;

    // Initialize book metadata with author info
    conn.execute(
        "INSERT INTO book_metadata (id, copyright_holder, language) VALUES ('main', ?1, 'de')",
        rusqlite::params![author],
    )?;

    // Create default editions (E-Book, Softcover, Hardcover)
    let ebook_id: String = nanoid::nanoid!();
    let softcover_id: String = nanoid::nanoid!();
    let hardcover_id: String = nanoid::nanoid!();
    
    conn.execute(
        "INSERT INTO editions (id, name, edition_type, layout_preset_id, currency) VALUES (?1, 'E-Book', 'ebook', 'ebook', 'EUR')",
        rusqlite::params![ebook_id],
    )?;
    conn.execute(
        "INSERT INTO editions (id, name, edition_type, layout_preset_id, currency, bleed) VALUES (?1, 'Taschenbuch', 'softcover', 'a5-novel', 'EUR', 3.0)",
        rusqlite::params![softcover_id],
    )?;
    conn.execute(
        "INSERT INTO editions (id, name, edition_type, layout_preset_id, currency, bleed) VALUES (?1, 'Hardcover', 'hardcover', 'b5-novel', 'EUR', 3.0)",
        rusqlite::params![hardcover_id],
    )?;

    Ok(conn)
}

pub fn open_database(path: &str) -> Result<Connection, DatabaseOperationError> {
    log::info!("Opening database at path: {}", path);
    
    let conn = Connection::open(path)?;
    log::info!("Successfully opened SQLite connection");
    
    // Use query_row for PRAGMA statements that return a value, even if we ignore it.
    conn.query_row("PRAGMA journal_mode = WAL;", [], |_| Ok(()))?;
    log::info!("Set WAL mode successfully");
    
    // Best-effort migrations: ensure all expected tables exist and add new columns if missing.
    // Creating tables with IF NOT EXISTS is safe for existing databases and fixes "no such table" errors.
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS project (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            author TEXT NOT NULL,
            short_name TEXT,
            genre TEXT,
            target_pages INTEGER
        );
        CREATE TABLE IF NOT EXISTS chapters (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            order_num INTEGER NOT NULL,
            summary TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS scenes (
            id TEXT PRIMARY KEY,
            chapter_id TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT,
            content_json TEXT,
            word_count INTEGER DEFAULT 0,
            order_num INTEGER NOT NULL,
            summary TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (chapter_id) REFERENCES chapters (id)
        );
        CREATE TABLE IF NOT EXISTS notes (
            scene_id TEXT PRIMARY KEY,
            content TEXT NOT NULL DEFAULT '',
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(scene_id) REFERENCES scenes(id)
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ai_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS entity_types (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            name_plural TEXT NOT NULL,
            icon TEXT DEFAULT '📌',
            default_color TEXT DEFAULT '#667eea',
            is_system INTEGER DEFAULT 0,
            order_num INTEGER DEFAULT 0,
            schema_json TEXT DEFAULT '[]',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS entities (
            id TEXT PRIMARY KEY,
            type_id TEXT NOT NULL,
            name TEXT NOT NULL,
            aliases TEXT DEFAULT '',
            description TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            color TEXT,
            metadata_json TEXT DEFAULT '{}',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (type_id) REFERENCES entity_types(id)
        );
        CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type_id);
        CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
        CREATE TABLE IF NOT EXISTS rag_documents (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            file_type TEXT NOT NULL,
            file_size INTEGER DEFAULT 0,
            content TEXT NOT NULL,
            added_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS rag_chunks (
            id TEXT PRIMARY KEY,
            source_id TEXT NOT NULL,
            source_type TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            total_chunks INTEGER NOT NULL,
            content TEXT NOT NULL,
            embedding BLOB,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_rag_chunks_source ON rag_chunks(source_id);
        CREATE INDEX IF NOT EXISTS idx_rag_chunks_type ON rag_chunks(source_type);
        
        -- Lektorat annotations table: stores AI proofreading suggestions per scene
        CREATE TABLE IF NOT EXISTS lektorat_annotations (
            id TEXT PRIMARY KEY,
            scene_id TEXT NOT NULL,
            line INTEGER NOT NULL,
            start_col INTEGER,
            end_col INTEGER,
            annotation_type TEXT NOT NULL,
            severity TEXT NOT NULL,
            message TEXT NOT NULL,
            suggestion TEXT,
            context TEXT,
            text_hash TEXT,
            status TEXT DEFAULT 'active',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            dismissed_at TEXT,
            FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_lektorat_scene ON lektorat_annotations(scene_id);
        CREATE INDEX IF NOT EXISTS idx_lektorat_status ON lektorat_annotations(status);
        
        -- Entity images table: stores user-uploaded images for entities (portraits, maps, etc.)
        CREATE TABLE IF NOT EXISTS entity_images (
            id TEXT PRIMARY KEY,
            entity_id TEXT NOT NULL,
            name TEXT NOT NULL,
            file_name TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            data BLOB NOT NULL,
            order_num INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_entity_images_entity ON entity_images(entity_id);
        
        -- ============================================================
        -- PLOT SYSTEM: Subplots, Plotpunkte, Szenen-Verknüpfungen
        -- ============================================================
        
        -- Subplots (Handlungsstränge): Hauptplot + beliebig viele Nebenplots
        CREATE TABLE IF NOT EXISTS subplots (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            color TEXT DEFAULT '#667eea',
            is_main INTEGER DEFAULT 0,
            order_num INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_subplots_order ON subplots(order_num);
        
        -- Plotpunkte: Einzelne Ereignisse/Beats auf der Timeline
        CREATE TABLE IF NOT EXISTS plot_points (
            id TEXT PRIMARY KEY,
            subplot_id TEXT,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            structure_position TEXT,
            position_percent REAL DEFAULT 0,
            status TEXT DEFAULT 'planned',
            order_num INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (subplot_id) REFERENCES subplots(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_plot_points_subplot ON plot_points(subplot_id);
        CREATE INDEX IF NOT EXISTS idx_plot_points_position ON plot_points(position_percent);
        
        -- Verknüpfung: Plotpunkt <-> Szene (n:m)
        CREATE TABLE IF NOT EXISTS plot_scene_links (
            id TEXT PRIMARY KEY,
            plot_point_id TEXT NOT NULL,
            scene_id TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (plot_point_id) REFERENCES plot_points(id) ON DELETE CASCADE,
            FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
            UNIQUE(plot_point_id, scene_id)
        );
        CREATE INDEX IF NOT EXISTS idx_plot_scene_plot ON plot_scene_links(plot_point_id);
        CREATE INDEX IF NOT EXISTS idx_plot_scene_scene ON plot_scene_links(scene_id);
        
        -- Plot-Struktur-Templates (Heldenreise, 3-Akt, etc.)
        CREATE TABLE IF NOT EXISTS plot_templates (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            structure_json TEXT NOT NULL,
            is_system INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        
        -- ============================================================
        -- RECHERCHE SYSTEM: Ordner, Quellen, KI-Extrakte
        -- ============================================================
        
        -- Recherche-Ordner (hierarchisch)
        CREATE TABLE IF NOT EXISTS research_folders (
            id TEXT PRIMARY KEY,
            parent_id TEXT,
            name TEXT NOT NULL,
            order_num INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (parent_id) REFERENCES research_folders(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_research_folders_parent ON research_folders(parent_id);
        
        -- Recherche-Einträge (Notizen, URLs, PDFs, Bilder)
        CREATE TABLE IF NOT EXISTS research_items (
            id TEXT PRIMARY KEY,
            folder_id TEXT,
            item_type TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT DEFAULT '',
            source_url TEXT,
            file_name TEXT,
            file_data BLOB,
            mime_type TEXT,
            extracted_facts TEXT,
            tags TEXT DEFAULT '',
            order_num INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (folder_id) REFERENCES research_folders(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_research_items_folder ON research_items(folder_id);
        CREATE INDEX IF NOT EXISTS idx_research_items_type ON research_items(item_type);
        
        -- ============================================================
        -- LAYOUT SYSTEM: Buchformat, Export-Einstellungen
        -- ============================================================
        
        -- Layout-Presets (KDP, BoD, Custom, etc.)
        CREATE TABLE IF NOT EXISTS layout_presets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            settings_json TEXT NOT NULL,
            is_system INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Aktive Layout-Einstellungen für das Projekt
        CREATE TABLE IF NOT EXISTS layout_settings (
            id TEXT PRIMARY KEY DEFAULT 'default',
            settings_json TEXT NOT NULL DEFAULT '{}',
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        ",
    )?;
    log::info!("Successfully created/ensured all tables exist");

    // Seed default entity types for legacy databases
    conn.execute_batch("
        INSERT OR IGNORE INTO entity_types (id, name, name_plural, icon, default_color, is_system, order_num) VALUES
            ('character', 'Charakter', 'Charaktere', '👤', '#667eea', 1, 1),
            ('location', 'Ort', 'Orte', '📍', '#48bb78', 1, 2),
            ('faction', 'Fraktion', 'Fraktionen', '⚔️', '#ed8936', 1, 3),
            ('item', 'Gegenstand', 'Gegenstände', '🔮', '#9f7aea', 1, 4);
    ").ok();

    // Add newly introduced columns to legacy databases where table exists but columns are missing
    let _ = conn.execute("ALTER TABLE project ADD COLUMN short_name TEXT", []);
    let _ = conn.execute("ALTER TABLE project ADD COLUMN genre TEXT", []);
    let _ = conn.execute("ALTER TABLE project ADD COLUMN target_pages INTEGER", []);
    let _ = conn.execute("ALTER TABLE scenes ADD COLUMN content_json TEXT", []);
    let _ = conn.execute("ALTER TABLE scenes ADD COLUMN summary TEXT", []);
    let _ = conn.execute("ALTER TABLE chapters ADD COLUMN summary TEXT", []);
    let _ = conn.execute("ALTER TABLE entity_types ADD COLUMN schema_json TEXT DEFAULT '[]'", []);
    
    // Migration: layout_settings von key/value zu id/settings_json
    // Prüfen ob alte Struktur existiert und konvertieren
    let needs_migration: bool = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('layout_settings') WHERE name = 'key'",
        [],
        |row| row.get::<_, i64>(0)
    ).unwrap_or(0) > 0;
    
    if needs_migration {
        log::info!("[DB Migration] Migrating layout_settings table from key/value to JSON schema");
        // Alte Tabelle umbenennen
        let _ = conn.execute("ALTER TABLE layout_settings RENAME TO layout_settings_old", []);
        // Neue Tabelle erstellen
        let _ = conn.execute("
            CREATE TABLE IF NOT EXISTS layout_settings (
                id TEXT PRIMARY KEY DEFAULT 'default',
                settings_json TEXT NOT NULL DEFAULT '{}',
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ", []);
        // Alte Tabelle löschen
        let _ = conn.execute("DROP TABLE IF EXISTS layout_settings_old", []);
        log::info!("[DB Migration] layout_settings migration complete");
    }
    
    // Sicherstellen dass die neue Struktur existiert (für neue DBs)
    let has_settings_json: bool = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('layout_settings') WHERE name = 'settings_json'",
        [],
        |row| row.get::<_, i64>(0)
    ).unwrap_or(0) > 0;
    
    if !has_settings_json {
        // Tabelle komplett neu erstellen
        let _ = conn.execute("DROP TABLE IF EXISTS layout_settings", []);
        conn.execute("
            CREATE TABLE layout_settings (
                id TEXT PRIMARY KEY DEFAULT 'default',
                settings_json TEXT NOT NULL DEFAULT '{}',
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ", []).ok();
    }
    
    Ok(conn)
}

    /// Ensure there is at least one row in `project`. If none exists, create a minimal one.
    pub fn ensure_project_exists(conn: &Connection, default_title: &str, default_author: &str) -> Result<(), DatabaseOperationError> {
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM project", [], |row| row.get(0))?;
        if count == 0 {
            let project_id: String = nanoid::nanoid!();
            conn.execute(
                "INSERT INTO project (id, title, author) VALUES (?1, ?2, ?3)",
                rusqlite::params![project_id, default_title, default_author],
            )?;
        }
        Ok(())
    }
pub fn get_project(conn: &Connection) -> Result<Project, DatabaseOperationError> {
    let mut stmt = conn.prepare("SELECT id, title, author, short_name, genre, target_pages FROM project LIMIT 1")?;
    let project = stmt.query_row([], |row| {
        Ok(Project {
            id: row.get(0)?,
            title: row.get(1)?,
            author: row.get(2)?,
            short_name: row.get(3).ok(),
            genre: row.get(4).ok(),
            target_pages: row.get(5).ok(),
            chapters: Vec::new(), // Chapters will be loaded separately
            metadata: None,       // Metadata loaded separately
            editions: None,       // Editions loaded separately
        })
    })?;
    Ok(project)
}

pub fn list_chapters(conn: &Connection) -> Result<Vec<Chapter>, DatabaseOperationError> {
    let mut stmt = conn.prepare("SELECT id, title, order_num FROM chapters ORDER BY order_num ASC")?;
    let chapters = stmt
        .query_map([], |row| {
            Ok(Chapter {
                id: row.get(0)?,
                title: row.get(1)?,
                order: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(chapters)
}

pub fn list_scenes(conn: &Connection, chapter_id: &str) -> Result<Vec<Scene>, DatabaseOperationError> {
    let mut stmt = conn.prepare("SELECT id, chapter_id, title, order_num, word_count FROM scenes WHERE chapter_id = ?1 ORDER BY order_num ASC")?;
    let scenes = stmt
        .query_map([chapter_id], |row| {
            Ok(Scene {
                id: row.get(0)?,
                chapter_id: row.get(1)?,
                title: row.get(2)?,
                order: row.get(3)?,
                word_count: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(scenes)
}

pub fn create_chapter(conn: &Connection, title: &str) -> Result<Chapter, DatabaseOperationError> {
    let order_num: i32 = conn.query_row("SELECT COALESCE(MAX(order_num), 0) + 1 FROM chapters", [], |row| row.get(0))?;
    let id = nanoid::nanoid!();
    conn.execute(
        "INSERT INTO chapters (id, title, order_num) VALUES (?1, ?2, ?3)",
        rusqlite::params![id, title, order_num],
    )?;
    Ok(Chapter {
        id,
        title: title.to_string(),
        order: order_num,
    })
}

pub fn create_scene(conn: &Connection, chapter_id: &str, title: &str) -> Result<Scene, DatabaseOperationError> {
    let order_num: i32 = conn.query_row("SELECT COALESCE(MAX(order_num), 0) + 1 FROM scenes WHERE chapter_id = ?1", [chapter_id], |row| row.get(0))?;
    let id = nanoid::nanoid!();
    conn.execute(
        "INSERT INTO scenes (id, chapter_id, title, order_num, content) VALUES (?1, ?2, ?3, ?4, '')",
        rusqlite::params![id, chapter_id, title, order_num],
    )?;
    Ok(Scene {
        id,
        chapter_id: chapter_id.to_string(),
        title: title.to_string(),
        order: order_num,
        word_count: 0,
    })
}

pub fn rename_chapter(conn: &Connection, chapter_id: &str, new_title: &str) -> Result<(), DatabaseOperationError> {
    conn.execute(
        "UPDATE chapters SET title = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        rusqlite::params![new_title, chapter_id],
    )?;
    Ok(())
}

pub fn rename_scene(conn: &Connection, scene_id: &str, new_title: &str) -> Result<(), DatabaseOperationError> {
    conn.execute(
        "UPDATE scenes SET title = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        rusqlite::params![new_title, scene_id],
    )?;
    Ok(())
}

pub fn get_scene_note(conn: &Connection, scene_id: &str) -> Result<Option<String>, DatabaseOperationError> {
    let mut stmt = conn.prepare("SELECT content FROM notes WHERE scene_id = ?1")?;
    match stmt.query_row([scene_id], |row| row.get::<_, String>(0)) {
        Ok(val) => Ok(Some(val)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(DatabaseOperationError::Sql(e))
    }
}

pub fn upsert_scene_note(conn: &Connection, scene_id: &str, content: &str) -> Result<(), DatabaseOperationError> {
    conn.execute(
        "INSERT INTO notes (scene_id, content) VALUES (?1, ?2) ON CONFLICT(scene_id) DO UPDATE SET content=excluded.content, updated_at=CURRENT_TIMESTAMP",
        rusqlite::params![scene_id, content],
    )?;
    Ok(())
}

pub fn reorder_chapters(conn: &mut Connection, ordered_ids: &[String]) -> Result<(), DatabaseOperationError> {
    let tx = conn.transaction()?;
    for (idx, id) in ordered_ids.iter().enumerate() {
        let order_num = (idx as i32) + 1;
        tx.execute("UPDATE chapters SET order_num = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
            rusqlite::params![order_num, id])?;
    }
    tx.commit()?;
    Ok(())
}

/// Reorder scenes within a chapter (or move scenes between chapters)
pub fn reorder_scenes(conn: &mut Connection, chapter_id: &str, ordered_scene_ids: &[String]) -> Result<(), DatabaseOperationError> {
    let tx = conn.transaction()?;
    for (idx, id) in ordered_scene_ids.iter().enumerate() {
        let order_num = (idx as i32) + 1;
        tx.execute(
            "UPDATE scenes SET chapter_id = ?1, order_num = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3",
            rusqlite::params![chapter_id, order_num, id]
        )?;
    }
    tx.commit()?;
    Ok(())
}

pub fn load_settings(conn: &Connection) -> Result<EditorSettings, DatabaseOperationError> {
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let settings_iter = stmt.query_map([], |row| {
        let key: String = row.get(0)?;
        let value: String = row.get(1)?;
        Ok((key, value))
    })?;

    let mut settings_map = std::collections::HashMap::new();
    for item in settings_iter {
        let (key, value) = item?;
        settings_map.insert(key, value);
    }

    Ok(EditorSettings {
        font_family: settings_map.get("font_family").cloned().unwrap_or_else(|| "Inter".to_string()),
        font_size: settings_map.get("font_size").and_then(|s| s.parse().ok()).unwrap_or(16),
        line_height: settings_map.get("line_height").and_then(|s| s.parse().ok()).unwrap_or(1.6),
        paragraph_spacing: settings_map.get("paragraph_spacing").and_then(|s| s.parse().ok()),
        page_padding: settings_map.get("page_padding").and_then(|s| s.parse().ok()),
        editor_language: settings_map.get("editor_language").cloned(),
        typewriter_mode: settings_map.get("typewriter_mode").and_then(|s| s.parse().ok()),
        typewriter_sound: settings_map.get("typewriter_sound").and_then(|s| s.parse().ok()),
        typewriter_volume: settings_map.get("typewriter_volume").and_then(|s| s.parse().ok()),
    })
}

pub fn save_settings(conn: &mut Connection, settings: &EditorSettings) -> Result<(), DatabaseOperationError> {
    let tx = conn.transaction()?;
    tx.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('font_family', ?1)", [settings.font_family.clone()])?;
    tx.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('font_size', ?1)", [settings.font_size.to_string()])?;
    tx.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('line_height', ?1)", [settings.line_height.to_string()])?;
    if let Some(v) = settings.paragraph_spacing {
        tx.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('paragraph_spacing', ?1)", [v.to_string()])?;
    }
    if let Some(v) = settings.page_padding {
        tx.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('page_padding', ?1)", [v.to_string()])?;
    }
    if let Some(ref v) = settings.editor_language {
        tx.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('editor_language', ?1)", [v.clone()])?;
    }
    if let Some(v) = settings.typewriter_mode {
        tx.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('typewriter_mode', ?1)", [v.to_string()])?;
    }
    if let Some(v) = settings.typewriter_sound {
        tx.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('typewriter_sound', ?1)", [v.to_string()])?;
    }
    if let Some(v) = settings.typewriter_volume {
        tx.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('typewriter_volume', ?1)", [v.to_string()])?;
    }
    tx.commit()?;
    Ok(())
}

pub fn load_ai_settings(conn: &Connection) -> Result<AiSettings, DatabaseOperationError> {
    let mut stmt = conn.prepare("SELECT key, value FROM ai_settings")?;
    let iter = stmt.query_map([], |row| {
        let key: String = row.get(0)?; let value:String = row.get(1)?; Ok((key,value))
    })?;
    let mut map = std::collections::HashMap::new();
    for r in iter { let (k,v)=r?; map.insert(k,v); }
    
    let defaults = AiSettings::default();
    Ok(AiSettings {
        enabled: map.get("enabled").and_then(|s| s.parse().ok()).unwrap_or(defaults.enabled),
        model_id: {
            let raw = map.get("model_id").cloned().unwrap_or(defaults.model_id.clone());
            // Migrate legacy model IDs to the new MLX default
            match raw.as_str() {
                "phi-3-mini" | "phi-3-mini-128k" | "ministral-8b" => "gemma-4-e2b-mlx-q6".to_string(),
                _ => raw,
            }
        },
        temperature: map.get("temperature").and_then(|s| s.parse().ok()).unwrap_or(defaults.temperature),
        max_tokens: map.get("max_tokens").and_then(|s| s.parse().ok()).unwrap_or(defaults.max_tokens),
        auto_load: map.get("auto_load").and_then(|s| s.parse().ok()).unwrap_or(defaults.auto_load),
    })
}

pub fn save_ai_settings(conn: &mut Connection, s: &AiSettings) -> Result<(), DatabaseOperationError> {
    let tx = conn.transaction()?;
    tx.execute("INSERT OR REPLACE INTO ai_settings (key,value) VALUES ('enabled', ?1)", [s.enabled.to_string()])?;
    tx.execute("INSERT OR REPLACE INTO ai_settings (key,value) VALUES ('model_id', ?1)", [&s.model_id])?;
    tx.execute("INSERT OR REPLACE INTO ai_settings (key,value) VALUES ('temperature', ?1)", [s.temperature.to_string()])?;
    tx.execute("INSERT OR REPLACE INTO ai_settings (key,value) VALUES ('max_tokens', ?1)", [s.max_tokens.to_string()])?;
    tx.execute("INSERT OR REPLACE INTO ai_settings (key,value) VALUES ('auto_load', ?1)", [s.auto_load.to_string()])?;
    tx.commit()?; 
    Ok(())
}

pub fn get_scene_content(conn: &Connection, id: &str) -> Result<(String, i32), DatabaseOperationError> {
    let mut stmt = conn.prepare("SELECT content, word_count FROM scenes WHERE id = ?1")?;
    stmt.query_row([id], |row| {
        Ok((row.get(0)?, row.get(1)?))
    }).map_err(|e| e.into())
}

pub fn get_scene_content_with_json(conn: &Connection, id: &str) -> Result<(Option<String>, String, i32), DatabaseOperationError> {
    let mut stmt = conn.prepare("SELECT content_json, content, word_count FROM scenes WHERE id = ?1")?;
    stmt.query_row([id], |row| {
        Ok((row.get::<_, Option<String>>(0)?, row.get(1)?, row.get(2)?))
    }).map_err(|e| e.into())
}

pub fn update_scene_content(conn: &Connection, id: &str, content: &str, word_count: i32) -> Result<(), DatabaseOperationError> {
    conn.execute(
        "UPDATE scenes SET content = ?1, word_count = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3",
        rusqlite::params![content, word_count, id],
    )?;
    Ok(())
}

pub fn update_scene_content_json(
    conn: &Connection,
    id: &str,
    content_json: &str,
    plain_text: &str,
    word_count: i32,
) -> Result<(), DatabaseOperationError> {
    conn.execute(
        "UPDATE scenes SET content_json = ?1, content = ?2, word_count = ?3, updated_at = CURRENT_TIMESTAMP WHERE id = ?4",
        rusqlite::params![content_json, plain_text, word_count, id],
    )?;
    Ok(())
}

// ============================================================================
// Summary Functions - Auto-generated scene/chapter summaries for AI context
// ============================================================================

pub fn get_scene_summary(conn: &Connection, scene_id: &str) -> Result<Option<String>, DatabaseOperationError> {
    let mut stmt = conn.prepare("SELECT summary FROM scenes WHERE id = ?1")?;
    stmt.query_row([scene_id], |row| {
        row.get::<_, Option<String>>(0)
    }).map_err(|e| e.into())
}

pub fn update_scene_summary(conn: &Connection, scene_id: &str, summary: &str) -> Result<(), DatabaseOperationError> {
    conn.execute(
        "UPDATE scenes SET summary = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        rusqlite::params![summary, scene_id],
    )?;
    Ok(())
}

pub fn get_chapter_summary(conn: &Connection, chapter_id: &str) -> Result<Option<String>, DatabaseOperationError> {
    let mut stmt = conn.prepare("SELECT summary FROM chapters WHERE id = ?1")?;
    stmt.query_row([chapter_id], |row| {
        row.get::<_, Option<String>>(0)
    }).map_err(|e| e.into())
}

pub fn update_chapter_summary(conn: &Connection, chapter_id: &str, summary: &str) -> Result<(), DatabaseOperationError> {
    conn.execute(
        "UPDATE chapters SET summary = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        rusqlite::params![summary, chapter_id],
    )?;
    Ok(())
}

/// Get all chapter summaries for building AI context
pub fn get_all_chapter_summaries(conn: &Connection) -> Result<Vec<(String, String, Option<String>)>, DatabaseOperationError> {
    let mut stmt = conn.prepare("SELECT id, title, summary FROM chapters ORDER BY order_num ASC")?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
        ))
    })?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

/// Get all scene summaries for a specific chapter
pub fn get_chapter_scene_summaries(conn: &Connection, chapter_id: &str) -> Result<Vec<(String, String, Option<String>)>, DatabaseOperationError> {
    let mut stmt = conn.prepare("SELECT id, title, summary FROM scenes WHERE chapter_id = ?1 ORDER BY order_num ASC")?;
    let rows = stmt.query_map([chapter_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
        ))
    })?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

pub fn update_project_metadata(
    conn: &Connection,
    title: &str,
    author: &str,
    short_name: Option<&str>,
    genre: Option<&str>,
    target_pages: Option<i32>,
) -> Result<(), DatabaseOperationError> {
    conn.execute(
        "UPDATE project SET title = ?1, author = ?2, short_name = ?3, genre = ?4, target_pages = ?5",
        rusqlite::params![title, author, short_name, genre, target_pages],
    )?;
    Ok(())
}

// ============================================================================
// Entity System - Generisches System für Charaktere, Orte, Fraktionen, etc.
// ============================================================================

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct EntityType {
    pub id: String,
    pub name: String,
    pub name_plural: String,
    pub icon: String,
    pub default_color: String,
    pub is_system: bool,
    pub order_num: i32,
    #[serde(default)]
    pub schema_json: String,    // JSON schema for custom fields: [{"name": "age", "type": "number", "label": "Alter"}, ...]
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct Entity {
    pub id: String,
    pub type_id: String,
    pub name: String,
    pub aliases: String,        // Comma-separated alternative names for matching
    pub description: String,
    pub notes: String,
    pub color: Option<String>,  // If None, use EntityType default_color
    pub metadata_json: String,  // Flexible JSON for type-specific fields
    pub created_at: String,
    pub updated_at: String,
}

/// Image attached to an entity (portrait, map, etc.)
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct EntityImage {
    pub id: String,
    pub entity_id: String,
    pub name: String,           // User-defined name (e.g., "Portrait", "Full Body", "Map")
    pub file_name: String,      // Original filename
    pub mime_type: String,      // e.g., "image/png", "image/jpeg"
    #[serde(skip_serializing)]  // Don't send blob in list responses
    pub data: Vec<u8>,
    pub order_num: i32,
    pub created_at: String,
}

/// Image metadata for list responses (without the blob data)
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct EntityImageMeta {
    pub id: String,
    pub entity_id: String,
    pub name: String,
    pub file_name: String,
    pub mime_type: String,
    pub order_num: i32,
    pub created_at: String,
}

/// List all entity types (system + user-created)
pub fn list_entity_types(conn: &Connection) -> Result<Vec<EntityType>, DatabaseOperationError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, name_plural, icon, default_color, is_system, order_num, COALESCE(schema_json, '[]')
         FROM entity_types ORDER BY order_num ASC"
    )?;
    let types = stmt.query_map([], |row| {
        Ok(EntityType {
            id: row.get(0)?,
            name: row.get(1)?,
            name_plural: row.get(2)?,
            icon: row.get(3)?,
            default_color: row.get(4)?,
            is_system: row.get::<_, i32>(5)? == 1,
            order_num: row.get(6)?,
            schema_json: row.get(7)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    Ok(types)
}

/// Create a custom entity type
pub fn create_entity_type(
    conn: &Connection,
    name: &str,
    name_plural: &str,
    icon: &str,
    default_color: &str,
) -> Result<EntityType, DatabaseOperationError> {
    let id = nanoid::nanoid!();
    let order_num: i32 = conn.query_row(
        "SELECT COALESCE(MAX(order_num), 0) + 1 FROM entity_types", [], |row| row.get(0)
    )?;
    conn.execute(
        "INSERT INTO entity_types (id, name, name_plural, icon, default_color, is_system, order_num, schema_json) 
         VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, '[]')",
        rusqlite::params![id, name, name_plural, icon, default_color, order_num],
    )?;
    Ok(EntityType {
        id,
        name: name.to_string(),
        name_plural: name_plural.to_string(),
        icon: icon.to_string(),
        default_color: default_color.to_string(),
        is_system: false,
        order_num,
        schema_json: "[]".to_string(),
    })
}

/// Update entity type schema (custom fields definition)
pub fn update_entity_type_schema(conn: &Connection, type_id: &str, schema_json: &str) -> Result<(), DatabaseOperationError> {
    conn.execute(
        "UPDATE entity_types SET schema_json = ?1 WHERE id = ?2",
        rusqlite::params![schema_json, type_id],
    )?;
    Ok(())
}

/// Update entity type (name, icon, color, etc.)
pub fn update_entity_type(
    conn: &Connection,
    type_id: &str,
    name: &str,
    name_plural: &str,
    icon: &str,
    default_color: &str,
    schema_json: &str,
) -> Result<(), DatabaseOperationError> {
    conn.execute(
        "UPDATE entity_types SET name = ?1, name_plural = ?2, icon = ?3, default_color = ?4, schema_json = ?5 WHERE id = ?6",
        rusqlite::params![name, name_plural, icon, default_color, schema_json, type_id],
    )?;
    Ok(())
}

/// Delete a custom entity type (only non-system types)
pub fn delete_entity_type(conn: &Connection, type_id: &str) -> Result<(), DatabaseOperationError> {
    // First delete all entities of this type
    conn.execute("DELETE FROM entities WHERE type_id = ?1", [type_id])?;
    // Then delete the type itself (only if not system)
    conn.execute("DELETE FROM entity_types WHERE id = ?1 AND is_system = 0", [type_id])?;
    Ok(())
}

/// List all entities, optionally filtered by type
pub fn list_entities(conn: &Connection, type_id: Option<&str>) -> Result<Vec<Entity>, DatabaseOperationError> {
    let sql = match type_id {
        Some(_) => "SELECT id, type_id, name, aliases, description, notes, color, metadata_json, created_at, updated_at 
                    FROM entities WHERE type_id = ?1 ORDER BY name ASC",
        None => "SELECT id, type_id, name, aliases, description, notes, color, metadata_json, created_at, updated_at 
                 FROM entities ORDER BY type_id, name ASC",
    };
    let mut stmt = conn.prepare(sql)?;
    
    let entities = if let Some(tid) = type_id {
        stmt.query_map([tid], map_entity_row)?
    } else {
        stmt.query_map([], map_entity_row)?
    }.collect::<Result<Vec<_>, _>>()?;
    
    Ok(entities)
}

fn map_entity_row(row: &rusqlite::Row) -> rusqlite::Result<Entity> {
    Ok(Entity {
        id: row.get(0)?,
        type_id: row.get(1)?,
        name: row.get(2)?,
        aliases: row.get(3)?,
        description: row.get(4)?,
        notes: row.get(5)?,
        color: row.get(6)?,
        metadata_json: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

/// Get a single entity by ID
pub fn get_entity(conn: &Connection, id: &str) -> Result<Option<Entity>, DatabaseOperationError> {
    let mut stmt = conn.prepare(
        "SELECT id, type_id, name, aliases, description, notes, color, metadata_json, created_at, updated_at 
         FROM entities WHERE id = ?1"
    )?;
    match stmt.query_row([id], map_entity_row) {
        Ok(e) => Ok(Some(e)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(DatabaseOperationError::Sql(e)),
    }
}

/// Create a new entity
pub fn create_entity(
    conn: &Connection,
    type_id: &str,
    name: &str,
    aliases: &str,
    description: &str,
    notes: &str,
    color: Option<&str>,
    metadata_json: &str,
) -> Result<Entity, DatabaseOperationError> {
    let id = nanoid::nanoid!();
    conn.execute(
        "INSERT INTO entities (id, type_id, name, aliases, description, notes, color, metadata_json) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![id, type_id, name, aliases, description, notes, color, metadata_json],
    )?;
    // Fetch and return the created entity
    get_entity(conn, &id)?.ok_or_else(|| DatabaseOperationError::Sql(rusqlite::Error::QueryReturnedNoRows))
}

/// Upsert entity - Update if exists (by name+type), create if new
/// Returns the entity and a flag indicating if it was updated (true) or created (false)
pub fn upsert_entity(
    conn: &Connection,
    type_id: &str,
    name: &str,
    aliases: &str,
    description: &str,
    notes: &str,
    color: Option<&str>,
    metadata_json: &str,
) -> Result<(Entity, bool), DatabaseOperationError> {
    // Check if entity with same name and type already exists (case-insensitive)
    let existing: Option<Entity> = {
        let mut stmt = conn.prepare(
            "SELECT id, type_id, name, aliases, description, notes, color, metadata_json, created_at, updated_at 
             FROM entities 
             WHERE LOWER(name) = LOWER(?1) AND type_id = ?2"
        )?;
        match stmt.query_row(rusqlite::params![name, type_id], |row| {
            Ok(Entity {
                id: row.get(0)?,
                type_id: row.get(1)?,
                name: row.get(2)?,
                aliases: row.get(3)?,
                description: row.get(4)?,
                notes: row.get(5)?,
                color: row.get(6)?,
                metadata_json: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        }) {
            Ok(e) => Some(e),
            Err(rusqlite::Error::QueryReturnedNoRows) => None,
            Err(e) => return Err(DatabaseOperationError::Sql(e)),
        }
    };
    
    if let Some(existing_entity) = existing {
        // Entity exists - merge new info with existing
        // Only update fields if new data is more substantial
        // Aliasse vereinigen (case-insensitive), kommagetrennt speichern
        let merged_aliases = {
            let mut set: Vec<String> = existing_entity
                .aliases
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            for a in aliases.split(',') {
                let val = a.trim();
                if val.is_empty() { continue; }
                if !set.iter().any(|e| e.eq_ignore_ascii_case(val)) {
                    set.push(val.to_string());
                }
            }
            set.join(", ")
        };
        
        let merged_description = if description.len() > existing_entity.description.len() {
            description.to_string()
        } else {
            existing_entity.description.clone()
        };
        
        let merged_notes = if notes.len() > existing_entity.notes.len() {
            notes.to_string()
        } else {
            existing_entity.notes.clone()
        };
        
        conn.execute(
            "UPDATE entities SET aliases = ?1, description = ?2, notes = ?3, updated_at = CURRENT_TIMESTAMP WHERE id = ?4",
            rusqlite::params![merged_aliases, merged_description, merged_notes, existing_entity.id],
        )?;
        
        let updated = get_entity(conn, &existing_entity.id)?
            .ok_or_else(|| DatabaseOperationError::Sql(rusqlite::Error::QueryReturnedNoRows))?;
        Ok((updated, true)) // was updated
    } else {
        // Create new entity
        let entity = create_entity(conn, type_id, name, aliases, description, notes, color, metadata_json)?;
        Ok((entity, false)) // was created
    }
}

/// Update an existing entity
pub fn update_entity(
    conn: &Connection,
    id: &str,
    name: &str,
    aliases: &str,
    description: &str,
    notes: &str,
    color: Option<&str>,
    metadata_json: &str,
) -> Result<(), DatabaseOperationError> {
    conn.execute(
        "UPDATE entities SET name = ?1, aliases = ?2, description = ?3, notes = ?4, color = ?5, 
         metadata_json = ?6, updated_at = CURRENT_TIMESTAMP WHERE id = ?7",
        rusqlite::params![name, aliases, description, notes, color, metadata_json, id],
    )?;
    Ok(())
}

/// Delete an entity
pub fn delete_entity(conn: &Connection, id: &str) -> Result<(), DatabaseOperationError> {
    conn.execute("DELETE FROM entities WHERE id = ?1", [id])?;
    Ok(())
}

// ============================================================================
// Entity Images - User-uploaded images for entities
// ============================================================================

/// List all images for an entity (metadata only, no blob data)
pub fn list_entity_images(conn: &Connection, entity_id: &str) -> Result<Vec<EntityImageMeta>, DatabaseOperationError> {
    let mut stmt = conn.prepare(
        "SELECT id, entity_id, name, file_name, mime_type, order_num, created_at 
         FROM entity_images WHERE entity_id = ?1 ORDER BY order_num ASC"
    )?;
    let images = stmt.query_map([entity_id], |row| {
        Ok(EntityImageMeta {
            id: row.get(0)?,
            entity_id: row.get(1)?,
            name: row.get(2)?,
            file_name: row.get(3)?,
            mime_type: row.get(4)?,
            order_num: row.get(5)?,
            created_at: row.get(6)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    Ok(images)
}

/// Get a single image with its data (for display)
pub fn get_entity_image(conn: &Connection, image_id: &str) -> Result<EntityImage, DatabaseOperationError> {
    let image = conn.query_row(
        "SELECT id, entity_id, name, file_name, mime_type, data, order_num, created_at 
         FROM entity_images WHERE id = ?1",
        [image_id],
        |row| Ok(EntityImage {
            id: row.get(0)?,
            entity_id: row.get(1)?,
            name: row.get(2)?,
            file_name: row.get(3)?,
            mime_type: row.get(4)?,
            data: row.get(5)?,
            order_num: row.get(6)?,
            created_at: row.get(7)?,
        })
    )?;
    Ok(image)
}

/// Add an image to an entity
pub fn add_entity_image(
    conn: &Connection, 
    entity_id: &str, 
    name: &str, 
    file_name: &str, 
    mime_type: &str, 
    data: &[u8]
) -> Result<EntityImageMeta, DatabaseOperationError> {
    let id = nanoid::nanoid!();
    let order_num: i32 = conn.query_row(
        "SELECT COALESCE(MAX(order_num), 0) + 1 FROM entity_images WHERE entity_id = ?1",
        [entity_id],
        |row| row.get(0)
    )?;
    
    conn.execute(
        "INSERT INTO entity_images (id, entity_id, name, file_name, mime_type, data, order_num) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, entity_id, name, file_name, mime_type, data, order_num],
    )?;
    
    Ok(EntityImageMeta {
        id,
        entity_id: entity_id.to_string(),
        name: name.to_string(),
        file_name: file_name.to_string(),
        mime_type: mime_type.to_string(),
        order_num,
        created_at: chrono::Utc::now().to_rfc3339(),
    })
}

/// Update an image's name
pub fn update_entity_image_name(conn: &Connection, image_id: &str, name: &str) -> Result<(), DatabaseOperationError> {
    conn.execute(
        "UPDATE entity_images SET name = ?1 WHERE id = ?2",
        rusqlite::params![name, image_id],
    )?;
    Ok(())
}

/// Delete an image
pub fn delete_entity_image(conn: &Connection, image_id: &str) -> Result<(), DatabaseOperationError> {
    conn.execute("DELETE FROM entity_images WHERE id = ?1", [image_id])?;
    Ok(())
}

/// Count images for an entity (to enforce max limit)
pub fn count_entity_images(conn: &Connection, entity_id: &str) -> Result<i32, DatabaseOperationError> {
    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM entity_images WHERE entity_id = ?1",
        [entity_id],
        |row| row.get(0)
    )?;
    Ok(count)
}

/// Get all entity names and aliases for editor highlighting
/// Returns: Vec<(entity_id, type_id, name, aliases, color)>
pub fn get_entity_names_for_highlighting(conn: &Connection) -> Result<Vec<(String, String, String, String, String)>, DatabaseOperationError> {
    let mut stmt = conn.prepare(
        "SELECT e.id, e.type_id, e.name, e.aliases, COALESCE(e.color, t.default_color) as color
         FROM entities e
         JOIN entity_types t ON e.type_id = t.id
         ORDER BY LENGTH(e.name) DESC"  // Longer names first for correct matching
    )?;
    let results = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
        ))
    })?.collect::<Result<Vec<_>, _>>()?;
    Ok(results)
}

// ===== RAG Documents =====

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct RagDocument {
    pub id: String,
    pub name: String,
    pub file_type: String,
    pub file_size: i64,
    pub added_at: String,
}

/// List all RAG documents for current project
pub fn list_rag_documents(conn: &Connection) -> Result<Vec<RagDocument>, DatabaseOperationError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, file_type, file_size, added_at FROM rag_documents ORDER BY added_at DESC"
    )?;
    let docs = stmt.query_map([], |row| {
        Ok(RagDocument {
            id: row.get(0)?,
            name: row.get(1)?,
            file_type: row.get(2)?,
            file_size: row.get(3)?,
            added_at: row.get(4)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    Ok(docs)
}

/// Add a RAG document
pub fn add_rag_document(
    conn: &Connection,
    name: &str,
    file_type: &str,
    file_size: i64,
    content: &str,
) -> Result<RagDocument, DatabaseOperationError> {
    let id = nanoid::nanoid!();
    conn.execute(
        "INSERT INTO rag_documents (id, name, file_type, file_size, content) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, name, file_type, file_size, content],
    )?;
    // Return the created document
    let doc = conn.query_row(
        "SELECT id, name, file_type, file_size, added_at FROM rag_documents WHERE id = ?1",
        [&id],
        |row| Ok(RagDocument {
            id: row.get(0)?,
            name: row.get(1)?,
            file_type: row.get(2)?,
            file_size: row.get(3)?,
            added_at: row.get(4)?,
        })
    )?;
    Ok(doc)
}

/// Remove a RAG document
pub fn remove_rag_document(conn: &Connection, id: &str) -> Result<(), DatabaseOperationError> {
    conn.execute("DELETE FROM rag_documents WHERE id = ?1", [id])?;
    Ok(())
}

/// Get all RAG document content for context building
pub fn get_all_rag_content(conn: &Connection) -> Result<Vec<(String, String)>, DatabaseOperationError> {
    let mut stmt = conn.prepare("SELECT name, content FROM rag_documents")?;
    let results = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?.collect::<Result<Vec<_>, _>>()?;
    Ok(results)
}

// ===== RAG Chunks =====

use crate::ai::chunking::TextChunk;

/// Save chunks to database
pub fn save_chunks(conn: &Connection, chunks: &[TextChunk]) -> Result<(), DatabaseOperationError> {
    let mut stmt = conn.prepare(
        "INSERT OR REPLACE INTO rag_chunks (id, source_id, source_type, chunk_index, total_chunks, content)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
    )?;
    
    for chunk in chunks {
        stmt.execute(rusqlite::params![
            chunk.id,
            chunk.source_id,
            chunk.source_type,
            chunk.chunk_index,
            chunk.total_chunks,
            chunk.content,
        ])?;
    }
    Ok(())
}

/// Delete chunks by source ID
pub fn delete_chunks_by_source(conn: &Connection, source_id: &str) -> Result<(), DatabaseOperationError> {
    conn.execute("DELETE FROM rag_chunks WHERE source_id = ?1", [source_id])?;
    Ok(())
}

/// Get all chunks for semantic search
pub fn get_all_chunks(conn: &Connection) -> Result<Vec<TextChunk>, DatabaseOperationError> {
    let mut stmt = conn.prepare(
        "SELECT id, source_id, source_type, chunk_index, total_chunks, content 
         FROM rag_chunks ORDER BY source_type, source_id, chunk_index"
    )?;
    
    let chunks = stmt.query_map([], |row| {
        Ok(TextChunk {
            id: row.get(0)?,
            source_id: row.get(1)?,
            source_type: row.get(2)?,
            chunk_index: row.get(3)?,
            total_chunks: row.get(4)?,
            content: row.get(5)?,
            start_offset: 0,
            end_offset: 0,
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    
    Ok(chunks)
}

/// Search chunks by keyword (fallback for semantic search)
pub fn search_chunks_keyword(conn: &Connection, keywords: &[String], limit: usize) -> Result<Vec<TextChunk>, DatabaseOperationError> {
    if keywords.is_empty() {
        return Ok(Vec::new());
    }
    
    // Build LIKE query for each keyword
    let conditions: Vec<String> = keywords.iter()
        .map(|_| "content LIKE ?".to_string())
        .collect();
    let where_clause = conditions.join(" OR ");
    
    let query = format!(
        "SELECT id, source_id, source_type, chunk_index, total_chunks, content 
         FROM rag_chunks 
         WHERE {} 
         LIMIT ?",
        where_clause
    );
    
    let mut stmt = conn.prepare(&query)?;
    
    // Bind keyword parameters as boxed ToSql
    let keyword_params: Vec<String> = keywords.iter()
        .map(|kw| format!("%{}%", kw))
        .collect();
    
    // Create a dynamic params vector
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = keyword_params.iter()
        .map(|s| Box::new(s.clone()) as Box<dyn rusqlite::ToSql>)
        .collect();
    params.push(Box::new(limit as i64));
    
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter()
        .map(|b| b.as_ref())
        .collect();
    
    let chunks = stmt.query_map(param_refs.as_slice(), |row| {
        Ok(TextChunk {
            id: row.get(0)?,
            source_id: row.get(1)?,
            source_type: row.get(2)?,
            chunk_index: row.get(3)?,
            total_chunks: row.get(4)?,
            content: row.get(5)?,
            start_offset: 0,
            end_offset: 0,
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    
    Ok(chunks)
}

// ─────────────────────────────────────────────────────────────────────────────
// Lektorat Annotations CRUD
// ─────────────────────────────────────────────────────────────────────────────

/// Lektorat annotation stored in DB
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LektoratAnnotation {
    pub id: String,
    pub scene_id: String,
    pub line: i32,
    pub start_col: Option<i32>,
    pub end_col: Option<i32>,
    pub annotation_type: String,
    pub severity: String,
    pub message: String,
    pub suggestion: Option<String>,
    pub context: Option<String>,
    pub text_hash: Option<String>,
    pub status: String,
    pub created_at: String,
    pub dismissed_at: Option<String>,
}

/// Save multiple lektorat annotations for a scene (bulk insert)
pub fn save_lektorat_annotations(
    conn: &Connection,
    scene_id: &str,
    annotations: &[LektoratAnnotation],
) -> Result<usize, DatabaseOperationError> {
    let mut count = 0;
    for ann in annotations {
        conn.execute(
            "INSERT OR REPLACE INTO lektorat_annotations 
             (id, scene_id, line, start_col, end_col, annotation_type, severity, message, suggestion, context, text_hash, status, created_at, dismissed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            rusqlite::params![
                ann.id,
                scene_id,
                ann.line,
                ann.start_col,
                ann.end_col,
                ann.annotation_type,
                ann.severity,
                ann.message,
                ann.suggestion,
                ann.context,
                ann.text_hash,
                ann.status,
                ann.created_at,
                ann.dismissed_at,
            ],
        )?;
        count += 1;
    }
    Ok(count)
}

/// Load all active lektorat annotations for a scene
pub fn load_lektorat_annotations(
    conn: &Connection,
    scene_id: &str,
) -> Result<Vec<LektoratAnnotation>, DatabaseOperationError> {
    let mut stmt = conn.prepare(
        "SELECT id, scene_id, line, start_col, end_col, annotation_type, severity, message, suggestion, context, text_hash, status, created_at, dismissed_at
         FROM lektorat_annotations
         WHERE scene_id = ?1 AND status = 'active'
         ORDER BY line, start_col"
    )?;
    
    let annotations = stmt.query_map([scene_id], |row| {
        Ok(LektoratAnnotation {
            id: row.get(0)?,
            scene_id: row.get(1)?,
            line: row.get(2)?,
            start_col: row.get(3)?,
            end_col: row.get(4)?,
            annotation_type: row.get(5)?,
            severity: row.get(6)?,
            message: row.get(7)?,
            suggestion: row.get(8)?,
            context: row.get(9)?,
            text_hash: row.get(10)?,
            status: row.get(11)?,
            created_at: row.get(12)?,
            dismissed_at: row.get(13)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    
    Ok(annotations)
}

/// Load ALL lektorat annotations for a scene (including dismissed)
pub fn load_all_lektorat_annotations(
    conn: &Connection,
    scene_id: &str,
) -> Result<Vec<LektoratAnnotation>, DatabaseOperationError> {
    let mut stmt = conn.prepare(
        "SELECT id, scene_id, line, start_col, end_col, annotation_type, severity, message, suggestion, context, text_hash, status, created_at, dismissed_at
         FROM lektorat_annotations
         WHERE scene_id = ?1
         ORDER BY line, start_col"
    )?;
    
    let annotations = stmt.query_map([scene_id], |row| {
        Ok(LektoratAnnotation {
            id: row.get(0)?,
            scene_id: row.get(1)?,
            line: row.get(2)?,
            start_col: row.get(3)?,
            end_col: row.get(4)?,
            annotation_type: row.get(5)?,
            severity: row.get(6)?,
            message: row.get(7)?,
            suggestion: row.get(8)?,
            context: row.get(9)?,
            text_hash: row.get(10)?,
            status: row.get(11)?,
            created_at: row.get(12)?,
            dismissed_at: row.get(13)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    
    Ok(annotations)
}

/// Dismiss (mark as done/irrelevant) a lektorat annotation
pub fn dismiss_lektorat_annotation(
    conn: &Connection,
    annotation_id: &str,
    status: &str, // "dismissed" or "resolved"
) -> Result<(), DatabaseOperationError> {
    conn.execute(
        "UPDATE lektorat_annotations 
         SET status = ?1, dismissed_at = datetime('now')
         WHERE id = ?2",
        rusqlite::params![status, annotation_id],
    )?;
    Ok(())
}

/// Delete all annotations for a scene (for re-evaluation)
pub fn clear_lektorat_annotations(
    conn: &Connection,
    scene_id: &str,
) -> Result<usize, DatabaseOperationError> {
    let count = conn.execute(
        "DELETE FROM lektorat_annotations WHERE scene_id = ?1",
        [scene_id],
    )?;
    Ok(count)
}

/// Delete only active annotations for re-analysis (keep dismissed ones)
pub fn clear_active_lektorat_annotations(
    conn: &Connection,
    scene_id: &str,
) -> Result<usize, DatabaseOperationError> {
    let count = conn.execute(
        "DELETE FROM lektorat_annotations WHERE scene_id = ?1 AND status = 'active'",
        [scene_id],
    )?;
    Ok(count)
}

// ============================================================
// Book Metadata CRUD
// ============================================================

use crate::models::{BookMetadata, Edition, EditionType, EditionLayoutOverrides};

/// Get book metadata
pub fn get_book_metadata(conn: &Connection) -> Result<BookMetadata, DatabaseOperationError> {
    let mut stmt = conn.prepare(
        "SELECT subtitle, author_bio, publisher, publish_date, edition_text, language,
                copyright_year, copyright_holder, copyright_text, all_rights_reserved,
                dedication, epigraph, epigraph_author, acknowledgments, foreword,
                foreword_author, preface, introduction, about_author, also_by_author,
                series_name, series_number, cover_image_path, cover_designer,
                categories, keywords, description, short_description
         FROM book_metadata WHERE id = 'main'"
    )?;
    
    let result = stmt.query_row([], |row| {
        Ok(BookMetadata {
            subtitle: row.get(0).ok(),
            author_bio: row.get(1).ok(),
            publisher: row.get(2).ok(),
            publish_date: row.get(3).ok(),
            edition: row.get(4).ok(),
            language: row.get(5).ok(),
            copyright_year: row.get(6).ok(),
            copyright_holder: row.get(7).ok(),
            copyright_text: row.get(8).ok(),
            all_rights_reserved: row.get::<_, i32>(9).unwrap_or(1) == 1,
            dedication: row.get(10).ok(),
            epigraph: row.get(11).ok(),
            epigraph_author: row.get(12).ok(),
            acknowledgments: row.get(13).ok(),
            foreword: row.get(14).ok(),
            foreword_author: row.get(15).ok(),
            preface: row.get(16).ok(),
            introduction: row.get(17).ok(),
            about_author: row.get(18).ok(),
            also_by_author: row.get::<_, Option<String>>(19).ok()
                .flatten()
                .map(|s| serde_json::from_str(&s).unwrap_or_default()),
            series_name: row.get(20).ok(),
            series_number: row.get(21).ok(),
            cover_image_path: row.get(22).ok(),
            cover_designer: row.get(23).ok(),
            categories: row.get::<_, Option<String>>(24).ok()
                .flatten()
                .map(|s| serde_json::from_str(&s).unwrap_or_default()),
            keywords: row.get::<_, Option<String>>(25).ok()
                .flatten()
                .map(|s| serde_json::from_str(&s).unwrap_or_default()),
            description: row.get(26).ok(),
            short_description: row.get(27).ok(),
        })
    });
    
    match result {
        Ok(metadata) => Ok(metadata),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(BookMetadata::default()),
        Err(e) => Err(e.into()),
    }
}

/// Update book metadata
pub fn update_book_metadata(conn: &Connection, metadata: &BookMetadata) -> Result<(), DatabaseOperationError> {
    let also_by = metadata.also_by_author.as_ref()
        .map(|v| serde_json::to_string(v).unwrap_or_default());
    let categories = metadata.categories.as_ref()
        .map(|v| serde_json::to_string(v).unwrap_or_default());
    let keywords = metadata.keywords.as_ref()
        .map(|v| serde_json::to_string(v).unwrap_or_default());
    
    conn.execute(
        "INSERT OR REPLACE INTO book_metadata (
            id, subtitle, author_bio, publisher, publish_date, edition_text, language,
            copyright_year, copyright_holder, copyright_text, all_rights_reserved,
            dedication, epigraph, epigraph_author, acknowledgments, foreword,
            foreword_author, preface, introduction, about_author, also_by_author,
            series_name, series_number, cover_image_path, cover_designer,
            categories, keywords, description, short_description, updated_at
        ) VALUES (
            'main', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15,
            ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, CURRENT_TIMESTAMP
        )",
        rusqlite::params![
            metadata.subtitle, metadata.author_bio, metadata.publisher, metadata.publish_date,
            metadata.edition, metadata.language, metadata.copyright_year, metadata.copyright_holder,
            metadata.copyright_text, if metadata.all_rights_reserved { 1 } else { 0 },
            metadata.dedication, metadata.epigraph, metadata.epigraph_author, metadata.acknowledgments,
            metadata.foreword, metadata.foreword_author, metadata.preface, metadata.introduction,
            metadata.about_author, also_by, metadata.series_name, metadata.series_number,
            metadata.cover_image_path, metadata.cover_designer, categories, keywords,
            metadata.description, metadata.short_description
        ],
    )?;
    Ok(())
}

// ============================================================
// Editions CRUD
// ============================================================

/// List all editions
pub fn list_editions(conn: &Connection) -> Result<Vec<Edition>, DatabaseOperationError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, edition_type, isbn, isbn_13, asin, price, currency,
                layout_preset_id, layout_overrides_json, include_about_author,
                include_also_by, include_preview, preview_chapter_id,
                ebook_cover_path, print_cover_path, spine_width, bleed,
                distributor, distributor_id, published, publish_date,
                created_at, updated_at
         FROM editions ORDER BY created_at ASC"
    )?;
    
    let rows = stmt.query_map([], |row| {
        let edition_type_str: String = row.get(2)?;
        let layout_overrides_json: Option<String> = row.get(9).ok();
        
        Ok(Edition {
            id: row.get(0)?,
            name: row.get(1)?,
            edition_type: match edition_type_str.as_str() {
                "ebook" => EditionType::Ebook,
                "ebook-kindle" => EditionType::EbookKindle,
                "ebook-epub" => EditionType::EbookEpub,
                "softcover" => EditionType::Softcover,
                "hardcover" => EditionType::Hardcover,
                "large-print" => EditionType::LargePrint,
                "audiobook" => EditionType::Audiobook,
                "pdf" => EditionType::Pdf,
                _ => EditionType::Custom,
            },
            isbn: row.get(3).ok(),
            isbn_13: row.get(4).ok(),
            asin: row.get(5).ok(),
            price: row.get(6).ok(),
            currency: row.get(7).ok(),
            layout_preset_id: row.get(8).ok(),
            layout_overrides: layout_overrides_json
                .and_then(|s| serde_json::from_str(&s).ok()),
            include_about_author: row.get::<_, i32>(10).unwrap_or(1) == 1,
            include_also_by: row.get::<_, i32>(11).unwrap_or(1) == 1,
            include_preview: row.get::<_, i32>(12).unwrap_or(0) == 1,
            preview_chapter_id: row.get(13).ok(),
            ebook_cover_path: row.get(14).ok(),
            print_cover_path: row.get(15).ok(),
            spine_width: row.get(16).ok(),
            bleed: row.get(17).ok(),
            distributor: row.get(18).ok(),
            distributor_id: row.get(19).ok(),
            published: row.get::<_, i32>(20).unwrap_or(0) == 1,
            publish_date: row.get(21).ok(),
            created_at: row.get(22).ok(),
            updated_at: row.get(23).ok(),
        })
    })?;
    
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.into())
}

/// Get a specific edition
pub fn get_edition(conn: &Connection, edition_id: &str) -> Result<Edition, DatabaseOperationError> {
    let editions = list_editions(conn)?;
    editions.into_iter()
        .find(|e| e.id == edition_id)
        .ok_or_else(|| DatabaseOperationError::NotFound(format!("Edition {} not found", edition_id)))
}

/// Create a new edition
pub fn create_edition(conn: &Connection, edition: &Edition) -> Result<(), DatabaseOperationError> {
    let edition_type_str = match edition.edition_type {
        EditionType::Ebook => "ebook",
        EditionType::EbookKindle => "ebook-kindle",
        EditionType::EbookEpub => "ebook-epub",
        EditionType::Softcover => "softcover",
        EditionType::Hardcover => "hardcover",
        EditionType::LargePrint => "large-print",
        EditionType::Audiobook => "audiobook",
        EditionType::Pdf => "pdf",
        EditionType::Custom => "custom",
    };
    
    let layout_overrides_json = edition.layout_overrides.as_ref()
        .map(|o| serde_json::to_string(o).unwrap_or_default());
    
    conn.execute(
        "INSERT INTO editions (
            id, name, edition_type, isbn, isbn_13, asin, price, currency,
            layout_preset_id, layout_overrides_json, include_about_author,
            include_also_by, include_preview, preview_chapter_id,
            ebook_cover_path, print_cover_path, spine_width, bleed,
            distributor, distributor_id, published, publish_date
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14,
            ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22
        )",
        rusqlite::params![
            edition.id, edition.name, edition_type_str, edition.isbn, edition.isbn_13,
            edition.asin, edition.price, edition.currency, edition.layout_preset_id,
            layout_overrides_json,
            if edition.include_about_author { 1 } else { 0 },
            if edition.include_also_by { 1 } else { 0 },
            if edition.include_preview { 1 } else { 0 },
            edition.preview_chapter_id, edition.ebook_cover_path, edition.print_cover_path,
            edition.spine_width, edition.bleed, edition.distributor, edition.distributor_id,
            if edition.published { 1 } else { 0 }, edition.publish_date
        ],
    )?;
    Ok(())
}

/// Update an edition
pub fn update_edition(conn: &Connection, edition: &Edition) -> Result<(), DatabaseOperationError> {
    let edition_type_str = match edition.edition_type {
        EditionType::Ebook => "ebook",
        EditionType::EbookKindle => "ebook-kindle",
        EditionType::EbookEpub => "ebook-epub",
        EditionType::Softcover => "softcover",
        EditionType::Hardcover => "hardcover",
        EditionType::LargePrint => "large-print",
        EditionType::Audiobook => "audiobook",
        EditionType::Pdf => "pdf",
        EditionType::Custom => "custom",
    };
    
    let layout_overrides_json = edition.layout_overrides.as_ref()
        .map(|o| serde_json::to_string(o).unwrap_or_default());
    
    conn.execute(
        "UPDATE editions SET
            name = ?1, edition_type = ?2, isbn = ?3, isbn_13 = ?4, asin = ?5,
            price = ?6, currency = ?7, layout_preset_id = ?8, layout_overrides_json = ?9,
            include_about_author = ?10, include_also_by = ?11, include_preview = ?12,
            preview_chapter_id = ?13, ebook_cover_path = ?14, print_cover_path = ?15,
            spine_width = ?16, bleed = ?17, distributor = ?18, distributor_id = ?19,
            published = ?20, publish_date = ?21, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?22",
        rusqlite::params![
            edition.name, edition_type_str, edition.isbn, edition.isbn_13, edition.asin,
            edition.price, edition.currency, edition.layout_preset_id, layout_overrides_json,
            if edition.include_about_author { 1 } else { 0 },
            if edition.include_also_by { 1 } else { 0 },
            if edition.include_preview { 1 } else { 0 },
            edition.preview_chapter_id, edition.ebook_cover_path, edition.print_cover_path,
            edition.spine_width, edition.bleed, edition.distributor, edition.distributor_id,
            if edition.published { 1 } else { 0 }, edition.publish_date, edition.id
        ],
    )?;
    Ok(())
}

/// Delete an edition
pub fn delete_edition(conn: &Connection, edition_id: &str) -> Result<(), DatabaseOperationError> {
    conn.execute("DELETE FROM editions WHERE id = ?1", [edition_id])?;
    Ok(())
}