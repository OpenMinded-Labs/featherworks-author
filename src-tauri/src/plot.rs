//! Plot System - Subplots, Plotpunkte, Szenen-Verknüpfungen
//!
//! Ermöglicht visuelles Plotting mit Timeline und Struktur-Templates

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

// ============================================================
// Data Models
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subplot {
    pub id: String,
    pub name: String,
    pub description: String,
    pub color: String,
    #[serde(rename = "isMain")]
    pub is_main: bool,
    #[serde(rename = "orderNum")]
    pub order_num: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlotPoint {
    pub id: String,
    #[serde(rename = "subplotId")]
    pub subplot_id: Option<String>,
    pub title: String,
    pub description: String,
    #[serde(rename = "structurePosition")]
    pub structure_position: Option<String>,
    #[serde(rename = "positionPercent")]
    pub position_percent: f64,
    pub status: String,
    #[serde(rename = "orderNum")]
    pub order_num: i32,
    /// Verknüpfte Szenen-IDs
    #[serde(rename = "linkedSceneIds", default)]
    pub linked_scene_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlotSceneLink {
    pub id: String,
    #[serde(rename = "plotPointId")]
    pub plot_point_id: String,
    #[serde(rename = "sceneId")]
    pub scene_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StructureMarker {
    pub id: String,
    pub name: String,
    pub percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlotTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub markers: Vec<StructureMarker>,
    #[serde(rename = "isSystem")]
    pub is_system: bool,
}

// ============================================================
// Subplot CRUD
// ============================================================

pub fn list_subplots(conn: &Connection) -> Result<Vec<Subplot>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, description, color, is_main, order_num FROM subplots ORDER BY order_num")
        .map_err(|e| e.to_string())?;

    let subplots = stmt
        .query_map([], |row| {
            Ok(Subplot {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                color: row
                    .get::<_, Option<String>>(3)?
                    .unwrap_or("#667eea".to_string()),
                is_main: row.get::<_, i32>(4)? == 1,
                order_num: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(subplots)
}

pub fn create_subplot(conn: &Connection, name: &str, color: &str) -> Result<Subplot, String> {
    let id = nanoid::nanoid!();
    let order_num: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(order_num), 0) + 1 FROM subplots",
            [],
            |r| r.get(0),
        )
        .unwrap_or(1);

    conn.execute(
        "INSERT INTO subplots (id, name, color, order_num) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, name, color, order_num],
    )
    .map_err(|e| e.to_string())?;

    Ok(Subplot {
        id,
        name: name.to_string(),
        description: String::new(),
        color: color.to_string(),
        is_main: false,
        order_num,
    })
}

pub fn update_subplot(
    conn: &Connection,
    id: &str,
    name: &str,
    description: &str,
    color: &str,
) -> Result<(), String> {
    conn.execute(
        "UPDATE subplots SET name = ?1, description = ?2, color = ?3, updated_at = CURRENT_TIMESTAMP WHERE id = ?4",
        rusqlite::params![name, description, color, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_subplot(conn: &Connection, id: &str) -> Result<(), String> {
    // Can't delete main subplot
    let is_main: i32 = conn
        .query_row("SELECT is_main FROM subplots WHERE id = ?1", [id], |r| {
            r.get(0)
        })
        .unwrap_or(0);

    if is_main == 1 {
        return Err("Haupthandlung kann nicht gelöscht werden".to_string());
    }

    conn.execute("DELETE FROM subplots WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn reorder_subplots(conn: &Connection, ids: &[String]) -> Result<(), String> {
    for (idx, id) in ids.iter().enumerate() {
        conn.execute(
            "UPDATE subplots SET order_num = ?1 WHERE id = ?2",
            rusqlite::params![idx as i32, id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ============================================================
// PlotPoint CRUD
// ============================================================

pub fn list_plot_points(conn: &Connection) -> Result<Vec<PlotPoint>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, subplot_id, title, description, structure_position, position_percent, status, order_num 
             FROM plot_points 
             ORDER BY position_percent, order_num"
        )
        .map_err(|e| e.to_string())?;

    let points: Vec<PlotPoint> = stmt
        .query_map([], |row| {
            Ok(PlotPoint {
                id: row.get(0)?,
                subplot_id: row.get(1)?,
                title: row.get(2)?,
                description: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                structure_position: row.get(4)?,
                position_percent: row.get(5)?,
                status: row
                    .get::<_, Option<String>>(6)?
                    .unwrap_or("planned".to_string()),
                order_num: row.get(7)?,
                linked_scene_ids: Vec::new(), // Will be populated below
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Load linked scenes for each plot point
    let mut result = Vec::new();
    for mut point in points {
        let scene_ids: Vec<String> = conn
            .prepare("SELECT scene_id FROM plot_scene_links WHERE plot_point_id = ?1")
            .map_err(|e| e.to_string())?
            .query_map([&point.id], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        point.linked_scene_ids = scene_ids;
        result.push(point);
    }

    Ok(result)
}

pub fn create_plot_point(
    conn: &Connection,
    subplot_id: Option<&str>,
    title: &str,
    position_percent: f64,
) -> Result<PlotPoint, String> {
    let id = nanoid::nanoid!();
    let order_num: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(order_num), 0) + 1 FROM plot_points",
            [],
            |r| r.get(0),
        )
        .unwrap_or(1);

    conn.execute(
        "INSERT INTO plot_points (id, subplot_id, title, position_percent, order_num) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, subplot_id, title, position_percent, order_num],
    ).map_err(|e| e.to_string())?;

    Ok(PlotPoint {
        id,
        subplot_id: subplot_id.map(|s| s.to_string()),
        title: title.to_string(),
        description: String::new(),
        structure_position: None,
        position_percent,
        status: "planned".to_string(),
        order_num,
        linked_scene_ids: Vec::new(),
    })
}

pub fn update_plot_point(
    conn: &Connection,
    id: &str,
    title: &str,
    description: &str,
    subplot_id: Option<&str>,
    position_percent: f64,
    structure_position: Option<&str>,
    status: &str,
) -> Result<(), String> {
    conn.execute(
        "UPDATE plot_points SET title = ?1, description = ?2, subplot_id = ?3, position_percent = ?4, 
         structure_position = ?5, status = ?6, updated_at = CURRENT_TIMESTAMP WHERE id = ?7",
        rusqlite::params![title, description, subplot_id, position_percent, structure_position, status, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_plot_point(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM plot_points WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn move_plot_point(
    conn: &Connection,
    id: &str,
    new_position_percent: f64,
) -> Result<(), String> {
    conn.execute(
        "UPDATE plot_points SET position_percent = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        rusqlite::params![new_position_percent, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// Reorder plot points by their IDs - sets order_num based on array position
pub fn reorder_plot_points(conn: &Connection, ids: &[String]) -> Result<(), String> {
    for (idx, id) in ids.iter().enumerate() {
        conn.execute(
            "UPDATE plot_points SET order_num = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
            rusqlite::params![idx as i32, id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ============================================================
// Plot-Scene Links
// ============================================================

pub fn link_scene_to_plot(
    conn: &Connection,
    plot_point_id: &str,
    scene_id: &str,
) -> Result<(), String> {
    let id = nanoid::nanoid!();
    conn.execute(
        "INSERT OR IGNORE INTO plot_scene_links (id, plot_point_id, scene_id) VALUES (?1, ?2, ?3)",
        rusqlite::params![id, plot_point_id, scene_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn unlink_scene_from_plot(
    conn: &Connection,
    plot_point_id: &str,
    scene_id: &str,
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM plot_scene_links WHERE plot_point_id = ?1 AND scene_id = ?2",
        rusqlite::params![plot_point_id, scene_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_scenes_for_plot_point(
    conn: &Connection,
    plot_point_id: &str,
) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT scene_id FROM plot_scene_links WHERE plot_point_id = ?1")
        .map_err(|e| e.to_string())?;

    let ids = stmt
        .query_map([plot_point_id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(ids)
}

pub fn get_plot_points_for_scene(conn: &Connection, scene_id: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT plot_point_id FROM plot_scene_links WHERE scene_id = ?1")
        .map_err(|e| e.to_string())?;

    let ids = stmt
        .query_map([scene_id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(ids)
}

// ============================================================
// Plot Templates
// ============================================================

pub fn list_plot_templates(conn: &Connection) -> Result<Vec<PlotTemplate>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, description, structure_json, is_system FROM plot_templates ORDER BY is_system DESC, name")
        .map_err(|e| e.to_string())?;

    let templates = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let name: String = row.get(1)?;
            let description: String = row.get::<_, Option<String>>(2)?.unwrap_or_default();
            let structure_json: String = row.get(3)?;
            let is_system: i32 = row.get(4)?;

            // Parse markers from JSON
            let markers: Vec<StructureMarker> =
                serde_json::from_str::<serde_json::Value>(&structure_json)
                    .ok()
                    .and_then(|v| v.get("markers").cloned())
                    .and_then(|m| serde_json::from_value(m).ok())
                    .unwrap_or_default();

            Ok(PlotTemplate {
                id,
                name,
                description,
                markers,
                is_system: is_system == 1,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(templates)
}

pub fn apply_template_markers(
    conn: &Connection,
    template_id: &str,
    subplot_id: &str,
) -> Result<Vec<PlotPoint>, String> {
    // Get template
    let structure_json: String = conn
        .query_row(
            "SELECT structure_json FROM plot_templates WHERE id = ?1",
            [template_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Template nicht gefunden: {}", e))?;

    let markers: Vec<StructureMarker> = serde_json::from_str::<serde_json::Value>(&structure_json)
        .ok()
        .and_then(|v| v.get("markers").cloned())
        .and_then(|m| serde_json::from_value(m).ok())
        .unwrap_or_default();

    // Create plot points from markers
    let mut created = Vec::new();
    for marker in markers {
        let point = create_plot_point(conn, Some(subplot_id), &marker.name, marker.percent)?;
        // Update structure_position
        conn.execute(
            "UPDATE plot_points SET structure_position = ?1 WHERE id = ?2",
            rusqlite::params![marker.id, point.id],
        )
        .ok();
        created.push(PlotPoint {
            structure_position: Some(marker.id),
            ..point
        });
    }

    Ok(created)
}
