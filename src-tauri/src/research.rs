//! Research System - Recherche-Ordner, Quellen, KI-Extraktion
//!
//! Ermöglicht das Sammeln und Organisieren von Recherchematerial

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

// ============================================================
// Data Models
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResearchFolder {
    pub id: String,
    #[serde(rename = "parentId")]
    pub parent_id: Option<String>,
    pub name: String,
    #[serde(rename = "orderNum")]
    pub order_num: i32,
    /// Anzahl der Items in diesem Ordner
    #[serde(rename = "itemCount", default)]
    pub item_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResearchItem {
    pub id: String,
    #[serde(rename = "folderId")]
    pub folder_id: Option<String>,
    #[serde(rename = "itemType")]
    pub item_type: ResearchItemType,
    pub title: String,
    pub content: String,
    #[serde(rename = "sourceUrl")]
    pub source_url: Option<String>,
    #[serde(rename = "fileName")]
    pub file_name: Option<String>,
    #[serde(rename = "mimeType")]
    pub mime_type: Option<String>,
    /// KI-extrahierte Fakten (JSON)
    #[serde(rename = "extractedFacts")]
    pub extracted_facts: Option<String>,
    pub tags: Vec<String>,
    #[serde(rename = "orderNum")]
    pub order_num: i32,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ResearchItemType {
    Note,
    Url,
    Pdf,
    Image,
}

impl std::fmt::Display for ResearchItemType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ResearchItemType::Note => write!(f, "note"),
            ResearchItemType::Url => write!(f, "url"),
            ResearchItemType::Pdf => write!(f, "pdf"),
            ResearchItemType::Image => write!(f, "image"),
        }
    }
}

impl std::str::FromStr for ResearchItemType {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "note" => Ok(ResearchItemType::Note),
            "url" => Ok(ResearchItemType::Url),
            "pdf" => Ok(ResearchItemType::Pdf),
            "image" => Ok(ResearchItemType::Image),
            _ => Err(format!("Unknown research item type: {}", s)),
        }
    }
}

// ============================================================
// Folder CRUD
// ============================================================

pub fn list_research_folders(conn: &Connection) -> Result<Vec<ResearchFolder>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT f.id, f.parent_id, f.name, f.order_num,
                    (SELECT COUNT(*) FROM research_items WHERE folder_id = f.id) as item_count
             FROM research_folders f
             ORDER BY f.order_num",
        )
        .map_err(|e| e.to_string())?;

    let folders = stmt
        .query_map([], |row| {
            Ok(ResearchFolder {
                id: row.get(0)?,
                parent_id: row.get(1)?,
                name: row.get(2)?,
                order_num: row.get(3)?,
                item_count: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(folders)
}

pub fn create_research_folder(
    conn: &Connection,
    name: &str,
    parent_id: Option<&str>,
) -> Result<ResearchFolder, String> {
    let id = nanoid::nanoid!();
    let order_num: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(order_num), 0) + 1 FROM research_folders WHERE parent_id IS ?1",
            [parent_id],
            |r| r.get(0),
        )
        .unwrap_or(1);

    conn.execute(
        "INSERT INTO research_folders (id, parent_id, name, order_num) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, parent_id, name, order_num],
    )
    .map_err(|e| e.to_string())?;

    Ok(ResearchFolder {
        id,
        parent_id: parent_id.map(|s| s.to_string()),
        name: name.to_string(),
        order_num,
        item_count: 0,
    })
}

pub fn update_research_folder(conn: &Connection, id: &str, name: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE research_folders SET name = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        rusqlite::params![name, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn move_research_folder(
    conn: &Connection,
    id: &str,
    new_parent_id: Option<&str>,
) -> Result<(), String> {
    // Prevent moving folder into itself or its children
    if let Some(parent) = new_parent_id {
        if parent == id {
            return Err("Ordner kann nicht in sich selbst verschoben werden".to_string());
        }
        // Check if new_parent is a child of this folder
        let mut current = Some(parent.to_string());
        while let Some(ref pid) = current {
            let parent_of_parent: Option<String> = conn
                .query_row(
                    "SELECT parent_id FROM research_folders WHERE id = ?1",
                    [pid],
                    |r| r.get(0),
                )
                .ok();
            if parent_of_parent.as_ref() == Some(&id.to_string()) {
                return Err("Ordner kann nicht in einen Unterordner verschoben werden".to_string());
            }
            current = parent_of_parent;
        }
    }

    conn.execute(
        "UPDATE research_folders SET parent_id = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        rusqlite::params![new_parent_id, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_research_folder(conn: &Connection, id: &str) -> Result<(), String> {
    // Items in folder will have folder_id set to NULL (ON DELETE SET NULL)
    conn.execute("DELETE FROM research_folders WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================
// Item CRUD
// ============================================================

pub fn list_research_items(
    conn: &Connection,
    folder_id: Option<&str>,
) -> Result<Vec<ResearchItem>, String> {
    let query = if folder_id.is_some() {
        "SELECT id, folder_id, item_type, title, content, source_url, file_name, mime_type, 
                extracted_facts, tags, order_num, created_at
         FROM research_items WHERE folder_id = ?1 ORDER BY order_num"
    } else {
        "SELECT id, folder_id, item_type, title, content, source_url, file_name, mime_type,
                extracted_facts, tags, order_num, created_at
         FROM research_items ORDER BY order_num"
    };

    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;

    let items: Result<Vec<ResearchItem>, _> = if let Some(fid) = folder_id {
        stmt.query_map([fid], map_research_item)
    } else {
        stmt.query_map([], map_research_item)
    }
    .map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect::<Vec<_>>()
    .into_iter()
    .map(Ok)
    .collect();

    items
}

fn map_research_item(row: &rusqlite::Row) -> rusqlite::Result<ResearchItem> {
    let item_type_str: String = row.get(2)?;
    let tags_str: String = row.get::<_, Option<String>>(9)?.unwrap_or_default();

    Ok(ResearchItem {
        id: row.get(0)?,
        folder_id: row.get(1)?,
        item_type: item_type_str.parse().unwrap_or(ResearchItemType::Note),
        title: row.get(3)?,
        content: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
        source_url: row.get(5)?,
        file_name: row.get(6)?,
        mime_type: row.get(7)?,
        extracted_facts: row.get(8)?,
        tags: tags_str
            .split(',')
            .filter(|s| !s.is_empty())
            .map(|s| s.trim().to_string())
            .collect(),
        order_num: row.get(10)?,
        created_at: row.get::<_, Option<String>>(11)?.unwrap_or_default(),
    })
}

pub fn create_research_item(
    conn: &Connection,
    folder_id: Option<&str>,
    item_type: ResearchItemType,
    title: &str,
    content: &str,
    source_url: Option<&str>,
) -> Result<ResearchItem, String> {
    let id = nanoid::nanoid!();
    let order_num: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(order_num), 0) + 1 FROM research_items WHERE folder_id IS ?1",
            [folder_id],
            |r| r.get(0),
        )
        .unwrap_or(1);

    conn.execute(
        "INSERT INTO research_items (id, folder_id, item_type, title, content, source_url, order_num) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, folder_id, item_type.to_string(), title, content, source_url, order_num],
    ).map_err(|e| e.to_string())?;

    Ok(ResearchItem {
        id,
        folder_id: folder_id.map(|s| s.to_string()),
        item_type,
        title: title.to_string(),
        content: content.to_string(),
        source_url: source_url.map(|s| s.to_string()),
        file_name: None,
        mime_type: None,
        extracted_facts: None,
        tags: Vec::new(),
        order_num,
        created_at: chrono::Utc::now().to_rfc3339(),
    })
}

pub fn update_research_item(
    conn: &Connection,
    id: &str,
    title: &str,
    content: &str,
    source_url: Option<&str>,
    tags: &[String],
) -> Result<(), String> {
    let tags_str = tags.join(",");
    conn.execute(
        "UPDATE research_items SET title = ?1, content = ?2, source_url = ?3, tags = ?4, 
         updated_at = CURRENT_TIMESTAMP WHERE id = ?5",
        rusqlite::params![title, content, source_url, tags_str, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn move_research_item(
    conn: &Connection,
    id: &str,
    new_folder_id: Option<&str>,
) -> Result<(), String> {
    conn.execute(
        "UPDATE research_items SET folder_id = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        rusqlite::params![new_folder_id, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_research_item(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM research_items WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn save_extracted_facts(conn: &Connection, id: &str, facts_json: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE research_items SET extracted_facts = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        rusqlite::params![facts_json, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================
// File Upload (PDF, Image)
// ============================================================

pub fn create_research_file(
    conn: &Connection,
    folder_id: Option<&str>,
    item_type: ResearchItemType,
    title: &str,
    file_name: &str,
    mime_type: &str,
    file_data: &[u8],
    extracted_text: Option<&str>,
) -> Result<ResearchItem, String> {
    let id = nanoid::nanoid!();
    let order_num: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(order_num), 0) + 1 FROM research_items WHERE folder_id IS ?1",
            [folder_id],
            |r| r.get(0),
        )
        .unwrap_or(1);

    conn.execute(
        "INSERT INTO research_items (id, folder_id, item_type, title, content, file_name, mime_type, file_data, order_num) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![id, folder_id, item_type.to_string(), title, extracted_text.unwrap_or(""), file_name, mime_type, file_data, order_num],
    ).map_err(|e| e.to_string())?;

    Ok(ResearchItem {
        id,
        folder_id: folder_id.map(|s| s.to_string()),
        item_type,
        title: title.to_string(),
        content: extracted_text.unwrap_or("").to_string(),
        source_url: None,
        file_name: Some(file_name.to_string()),
        mime_type: Some(mime_type.to_string()),
        extracted_facts: None,
        tags: Vec::new(),
        order_num,
        created_at: chrono::Utc::now().to_rfc3339(),
    })
}

pub fn get_research_file_data(
    conn: &Connection,
    id: &str,
) -> Result<(String, String, Vec<u8>), String> {
    conn.query_row(
        "SELECT file_name, mime_type, file_data FROM research_items WHERE id = ?1",
        [id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Vec<u8>>(2)?,
            ))
        },
    )
    .map_err(|e| format!("Datei nicht gefunden: {}", e))
}

// ============================================================
// Search
// ============================================================

pub fn search_research(conn: &Connection, query: &str) -> Result<Vec<ResearchItem>, String> {
    let search_pattern = format!("%{}%", query);

    let mut stmt = conn
        .prepare(
            "SELECT id, folder_id, item_type, title, content, source_url, file_name, mime_type,
                    extracted_facts, tags, order_num, created_at
             FROM research_items 
             WHERE title LIKE ?1 OR content LIKE ?1 OR extracted_facts LIKE ?1 OR tags LIKE ?1
             ORDER BY 
                CASE WHEN title LIKE ?1 THEN 0 ELSE 1 END,
                order_num
             LIMIT 50",
        )
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map([&search_pattern], map_research_item)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(items)
}
