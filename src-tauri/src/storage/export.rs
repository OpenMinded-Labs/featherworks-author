use crate::models::{Chapter, Project, Scene};
use crate::storage::database::{get_project, list_chapters, list_scenes, load_ai_settings};
use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use serde_json::{from_str, to_string_pretty};
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use zip::write::FileOptions;

pub fn export_project_to_fwa(conn: &Connection, out_path: &Path) -> Result<()> {
    // Gather data
    let project = get_project(conn).context("failed to read project")?;
    let chapters = list_chapters(conn).context("failed to list chapters")?;

    // Create zip
    let f = File::create(out_path).context("failed to create output file")?;
    let mut zip = zip::ZipWriter::new(f);
    let opts = FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    // manifest
    let manifest = serde_json::json!({
        "format": "featherworks-project",
        "version": "1.0.0",
        "project_id": project.id,
        "created": chrono::Utc::now().to_rfc3339(),
        "features": { "ai": true }
    });
    zip.start_file("manifest.json", opts)?;
    zip.write_all(to_string_pretty(&manifest)?.as_bytes())?;

    // project.json
    zip.start_file("project.json", opts)?;
    zip.write_all(to_string_pretty(&project)?.as_bytes())?;

    // chapters.json
    zip.start_file("chapters.json", opts)?;
    zip.write_all(to_string_pretty(&chapters)?.as_bytes())?;

    // scenes/ per chapter
    for ch in &chapters {
        if let Ok(scenes) = list_scenes(conn, &ch.id) {
            for sc in scenes {
                let path = format!("scenes/{}.json", sc.id);
                zip.start_file(path, opts)?;
                zip.write_all(to_string_pretty(&sc)?.as_bytes())?;
            }
        }
    }

    // ai settings if available
    if let Ok(ai) = load_ai_settings(conn) {
        zip.start_file("ai/settings.json", opts)?;
        zip.write_all(to_string_pretty(&ai)?.as_bytes())?;
    }

    zip.finish()?;
    Ok(())
}

pub fn import_project_from_fwa(conn: &mut Connection, path: &Path) -> Result<()> {
    // Open archive and validate manifest
    let file = File::open(path).context("failed to open archive")?;
    let mut archive = zip::ZipArchive::new(file).context("invalid zip archive")?;

    // Read and validate manifest
    let mut manifest_exists = false;
    if let Ok(mut f) = archive.by_name("manifest.json") {
        let mut s = String::new();
        f.read_to_string(&mut s)?;
        let v: serde_json::Value = serde_json::from_str(&s).context("invalid manifest.json")?;
        if v.get("format").and_then(|x| x.as_str()) != Some("featherworks-project") {
            anyhow::bail!("unsupported archive format");
        }
        manifest_exists = true;
    }
    if !manifest_exists {
        anyhow::bail!("manifest.json missing");
    }

    // Read project.json
    let project: Project = {
        let mut f = archive
            .by_name("project.json")
            .context("project.json missing in archive")?;
        let mut s = String::new();
        f.read_to_string(&mut s)?;
        from_str(&s).context("failed to parse project.json")?
    };

    // Read chapters.json
    let chapters: Vec<Chapter> = {
        let mut f = archive
            .by_name("chapters.json")
            .context("chapters.json missing in archive")?;
        let mut s = String::new();
        f.read_to_string(&mut s)?;
        from_str(&s).context("failed to parse chapters.json")?
    };

    // Collect scenes: archive contains scenes/<id>.json for each
    let mut scenes: Vec<Scene> = Vec::new();
    for i in 0..archive.len() {
        if let Ok(mut file) = archive.by_index(i) {
            let name = file.name().to_string();
            if name.starts_with("scenes/") && name.ends_with(".json") {
                let mut s = String::new();
                file.read_to_string(&mut s)?;
                let sc: Scene =
                    from_str(&s).context(format!("failed to parse scene file: {}", name))?;
                scenes.push(sc);
            }
        }
    }

    // Optional: ai/settings.json
    let ai_settings_json = if let Ok(mut f) = archive.by_name("ai/settings.json") {
        let mut s = String::new();
        f.read_to_string(&mut s)?;
        Some(s)
    } else {
        None
    };

    // Now write into DB transactionally. Strategy: replace chapters/scenes with archive content and
    // update project metadata. This is a straightforward import that overwrites current chapter/scene data.
    let tx = conn.transaction().context("failed to start transaction")?;

    // Clear existing scenes, chapters and notes to match archive state
    tx.execute("DELETE FROM notes", []).ok();
    tx.execute("DELETE FROM scenes", [])
        .context("failed to clear scenes")?;
    tx.execute("DELETE FROM chapters", [])
        .context("failed to clear chapters")?;

    // Update project metadata (single-row table)
    tx.execute(
        "UPDATE project SET title = ?1, author = ?2, short_name = ?3, genre = ?4, target_pages = ?5",
        params![project.title, project.author, project.short_name, project.genre, project.target_pages],
    )?;

    // Insert chapters
    for ch in &chapters {
        tx.execute(
            "INSERT INTO chapters (id, title, order_num) VALUES (?1, ?2, ?3)",
            params![ch.id, ch.title, ch.order],
        )?;
    }

    // Insert scenes
    for sc in &scenes {
        tx.execute(
            "INSERT INTO scenes (id, chapter_id, title, order_num, word_count, content) VALUES (?1, ?2, ?3, ?4, ?5, '')",
            params![sc.id, sc.chapter_id, sc.title, sc.order, sc.word_count],
        )?;
    }

    // Import ai settings if present
    if let Some(s) = ai_settings_json {
        // Parse as generic map and upsert into ai_settings table
        if let Ok(map) =
            serde_json::from_str::<std::collections::HashMap<String, serde_json::Value>>(&s)
        {
            for (k, v) in map {
                let vstr = match v {
                    serde_json::Value::String(s) => s,
                    other => other.to_string(),
                };
                tx.execute(
                    "INSERT OR REPLACE INTO ai_settings (key, value) VALUES (?1, ?2)",
                    params![k, vstr],
                )?;
            }
        }
    }

    tx.commit()?;
    Ok(())
}
