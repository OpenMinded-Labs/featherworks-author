use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub title: String,
    pub author: String,
    pub short_name: Option<String>,
    pub genre: Option<String>,
    pub target_page_count: Option<u32>,
    pub created_at: String,
    pub modified_at: String,
    pub word_count: u32,
    pub chapters: Vec<Chapter>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chapter {
    pub project_id: String,
    pub id: String,
    pub title: String,
    pub content: String,
    pub order: u32,
    pub word_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Character {
    pub id: String,
    pub name: String,
    pub role: String,
    pub description: String,
    pub notes: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WritingStats {
    pub total_words: u32,
    pub chapters: u32,
    pub characters: u32,
    pub writing_time: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Scene {
    pub id: String,
    pub chapter_id: String,
    pub title: String,
    pub content: String,
    pub order: u32,
    pub status: Option<String>,
    pub notes: Option<String>,
    pub word_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditorSettings {
    pub font_family: String,
    pub font_size: u32,
    pub line_height: f32,
    pub page_width: u32,
    pub theme: String,
    pub show_line_numbers: bool,
    pub synonyms_enabled: bool,
    pub focus_mode_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct AppSettings {
    pub autosave_interval_ms: u32,
    pub language: String,
    pub default_project_location: String,
}
