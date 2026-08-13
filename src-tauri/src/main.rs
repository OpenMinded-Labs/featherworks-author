#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// Featherworks Author Backend

use ai::entity_extraction::ExtractedEntity;
use featherworks_author::ai::{self, downloader, hardware, registry, stream};
use featherworks_author::domain::{doc, patch};
use featherworks_author::languagetool;
use featherworks_author::layout;
use featherworks_author::models::{Chapter, Project, Scene};
use featherworks_author::plot;
use featherworks_author::research;
use featherworks_author::services::recovery_service;
use featherworks_author::services::scenes_service;
use featherworks_author::spellcheck;
use featherworks_author::storage::container;
use featherworks_author::storage::database::{self, AppState};
use featherworks_author::storage::export as export_mod;
use rusqlite::Connection;
use tauri::{CustomMenuItem, Manager, Menu, State, Submenu, WindowEvent};

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
struct RecentProjectEntry {
    path: String,
    title: String,
    last_opened: String,
    // Extended metadata for library
    #[serde(default)]
    author: Option<String>,
    #[serde(default)]
    genre: Option<String>,
    #[serde(default)]
    series: Option<String>,
    #[serde(default)]
    series_order: Option<i32>,
    #[serde(default)]
    word_count: Option<i32>,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    tags: Option<Vec<String>>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct CreateProjectRequest {
    title: String,
    author: String,
    short_name: Option<String>,
    genre: Option<String>,
    target_pages: Option<i32>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct CreateSceneRequest {
    chapter_id: String,
    title: String,
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct UpdateSceneContentRequest {
    id: String,
    content: String,
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct UpdateProjectMetadataRequest {
    title: String,
    author: String,
    short_name: Option<String>,
    genre: Option<String>,
    target_pages: Option<i32>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct ProjectStatusResponse {
    path: Option<String>,
    container_path: Option<String>,
    is_temp: bool,
}

// --- Tauri Commands ---

#[tauri::command]
fn get_project(state: State<AppState>) -> Result<Project, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_lock.as_ref().ok_or("Database not open")?;
    database::get_project(conn).map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(dead_code)]
fn export_project_fwa(path: String, state: State<AppState>) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_lock.as_ref().ok_or("Database not open")?;
    export_mod::export_project_to_fwa(conn, std::path::Path::new(&path)).map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(dead_code)]
fn import_project_fwa(path: String, state: State<AppState>) -> Result<(), String> {
    let mut db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_lock.as_mut().ok_or("Database not open")?;
    export_mod::import_project_from_fwa(conn, std::path::Path::new(&path))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn list_chapters(state: State<AppState>) -> Result<Vec<Chapter>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_lock.as_ref().ok_or("Database not open")?;
    database::list_chapters(conn).map_err(|e| e.to_string())
}

#[derive(serde::Deserialize)]
struct ListScenesRequest {
    #[serde(alias = "chapterId")]
    chapter_id: String,
}

#[tauri::command]
fn list_scenes(req: ListScenesRequest, state: State<AppState>) -> Result<Vec<Scene>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_lock.as_ref().ok_or("Database not open")?;
    database::list_scenes(conn, &req.chapter_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_scene_content(id: String, state: State<AppState>) -> Result<(String, i32), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_lock.as_ref().ok_or("Database not open")?;
    if let Ok((json_opt, plain, wc)) = database::get_scene_content_with_json(conn, &id) {
        if let Some(js) = json_opt {
            return Ok((js, wc));
        }
        return Ok((plain, wc));
    }
    let (content, word_count) =
        database::get_scene_content(conn, &id).map_err(|e| e.to_string())?; // fallback
    Ok((content, word_count))
}

#[tauri::command]
fn update_scene_content(
    req: UpdateSceneContentRequest,
    state: State<AppState>,
) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_lock.as_ref().ok_or("Database not open")?;
    let word_count = req.content.split_whitespace().count() as i32;
    database::update_scene_content(conn, &req.id, &req.content, word_count)
        .map_err(|e| e.to_string())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApplyScenePatchRequest {
    scene_id: String,
    #[serde(default)]
    full_text: Option<String>, // legacy / full replace path
    #[serde(default)]
    patch: Option<IncomingPatch>,
}

#[derive(serde::Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum IncomingPatch {
    InsertText { offset: usize, text: String },
    DeleteRange { start: usize, end: usize },
    FullReplace { new_text: String },
}

#[tauri::command]
fn apply_scene_patch(req: ApplyScenePatchRequest, state: State<AppState>) -> Result<i32, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_lock.as_ref().ok_or("Database not open")?;
    let p = if let Some(pv) = req.patch {
        match pv {
            IncomingPatch::InsertText { offset, text } => {
                patch::Patch(patch::PatchKind::InsertText { offset, text })
            }
            IncomingPatch::DeleteRange { start, end } => {
                patch::Patch(patch::PatchKind::DeleteRange { start, end })
            }
            IncomingPatch::FullReplace { new_text } => {
                let new_doc = doc::Node::plain_text(&new_text);
                patch::Patch::full(new_doc)
            }
        }
    } else if let Some(ft) = req.full_text {
        patch::Patch::full(doc::Node::plain_text(&ft))
    } else {
        return Err("No patch or full_text provided".into());
    };
    scenes_service::apply_patch(conn, &req.scene_id, p).map_err(|e| e.to_string())
}

#[derive(serde::Deserialize)]
struct SceneIdRequest {
    scene_id: String,
}

#[tauri::command]
fn undo_scene(req: SceneIdRequest, state: State<AppState>) -> Result<Option<i32>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_lock.as_ref().ok_or("Database not open")?;
    scenes_service::undo(conn, &req.scene_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn redo_scene(req: SceneIdRequest, state: State<AppState>) -> Result<Option<i32>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_lock.as_ref().ok_or("Database not open")?;
    scenes_service::redo(conn, &req.scene_id).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
struct RecoveryStatus {
    available: bool,
    snapshot_count: usize,
    incremental_count: usize,
    scenes: Vec<recovery_service::RecoveredSceneState>,
}

#[tauri::command]
fn check_recovery(state: State<AppState>) -> Result<RecoveryStatus, String> {
    let journal = state
        .journal_path
        .lock()
        .map_err(|e| e.to_string())?
        .clone();
    if let Some(jp) = journal {
        match recovery_service::attempt_recovery(&jp) {
            Ok(Some(report)) => Ok(RecoveryStatus {
                available: true,
                snapshot_count: report.snapshot_count,
                incremental_count: report.incremental_count,
                scenes: report.scenes,
            }),
            Ok(None) => Ok(RecoveryStatus {
                available: false,
                snapshot_count: 0,
                incremental_count: 0,
                scenes: vec![],
            }),
            Err(e) => Err(e.to_string()),
        }
    } else {
        Ok(RecoveryStatus {
            available: false,
            snapshot_count: 0,
            incremental_count: 0,
            scenes: vec![],
        })
    }
}

#[tauri::command]
fn apply_recovery(state: State<AppState>) -> Result<usize, String> {
    let journal = state
        .journal_path
        .lock()
        .map_err(|e| e.to_string())?
        .clone();
    let mut applied = 0usize;
    if let Some(jp) = journal {
        if let Ok(Some(report)) = recovery_service::attempt_recovery(&jp) {
            let patches = recovery_service::recovered_to_patches(&report);
            let db_lock = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db_lock.as_ref().ok_or("Database not open")?;
            for (scene_id, p) in patches {
                if scenes_service::apply_patch(conn, &scene_id, p).is_ok() {
                    applied += 1;
                }
            }
        }
    }
    Ok(applied)
}

#[tauri::command]
fn update_project_metadata_cmd(
    req: UpdateProjectMetadataRequest,
    state: State<AppState>,
) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_lock.as_ref().ok_or("Database not open")?;
    database::update_project_metadata(
        conn,
        &req.title,
        &req.author,
        req.short_name.as_deref(),
        req.genre.as_deref(),
        req.target_pages,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_project_status(state: State<AppState>) -> Result<ProjectStatusResponse, String> {
    let path = state.db_path.lock().map_err(|e| e.to_string())?.clone();
    let container = state
        .container_path
        .lock()
        .map_err(|e| e.to_string())?
        .clone();
    let is_temp = *state.db_is_temp.lock().map_err(|e| e.to_string())?;
    Ok(ProjectStatusResponse {
        path,
        container_path: container,
        is_temp,
    })
}

#[tauri::command]
fn create_chapter(title: String, state: State<AppState>) -> Result<Chapter, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_lock.as_ref().ok_or("Database not open")?;
    database::create_chapter(conn, &title).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_scene(req: CreateSceneRequest, state: State<AppState>) -> Result<Scene, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_lock.as_ref().ok_or("Database not open")?;
    database::create_scene(conn, &req.chapter_id, &req.title).map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_chapter(
    chapter_id: String,
    new_title: String,
    state: State<AppState>,
) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_lock.as_ref().ok_or("Database not open")?;
    database::rename_chapter(conn, &chapter_id, &new_title).map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_scene(scene_id: String, new_title: String, state: State<AppState>) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_lock.as_ref().ok_or("Database not open")?;
    database::rename_scene(conn, &scene_id, &new_title).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_scene_note_cmd(scene_id: String, state: State<AppState>) -> Result<String, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_lock.as_ref().ok_or("Database not open")?;
    let note = database::get_scene_note(conn, &scene_id).map_err(|e| e.to_string())?;
    Ok(note.unwrap_or_default())
}

#[tauri::command]
fn save_scene_note_cmd(
    scene_id: String,
    content: String,
    state: State<AppState>,
) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_lock.as_ref().ok_or("Database not open")?;
    database::upsert_scene_note(conn, &scene_id, &content).map_err(|e| e.to_string())
}

#[tauri::command]
fn reorder_chapters(ordered_ids: Vec<String>, state: State<AppState>) -> Result<(), String> {
    let mut db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_lock.as_mut().ok_or("Database not open")?;
    database::reorder_chapters(conn, &ordered_ids).map_err(|e| e.to_string())
}

#[tauri::command]
fn reorder_scenes(
    chapter_id: String,
    ordered_scene_ids: Vec<String>,
    state: State<AppState>,
) -> Result<(), String> {
    let mut db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_lock.as_mut().ok_or("Database not open")?;
    database::reorder_scenes(conn, &chapter_id, &ordered_scene_ids).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_editor_settings(state: State<AppState>) -> Result<database::EditorSettings, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_lock.as_ref().ok_or("Database not open")?;
    database::load_settings(conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_editor_settings(
    settings: database::EditorSettings,
    state: State<AppState>,
) -> Result<(), String> {
    let mut db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_lock.as_mut().ok_or("Database not open")?;
    database::save_settings(conn, &settings).map_err(|e| e.to_string())
}

#[derive(serde::Serialize, Debug)]
struct FullProjectPayload {
    project: Project,
    chapters: Vec<Chapter>,
    scenes_by_chapter: std::collections::HashMap<String, Vec<Scene>>,
}

#[tauri::command]
fn load_full_project(state: State<AppState>) -> Result<FullProjectPayload, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_lock.as_ref().ok_or("Database not open")?;
    // Ensure project row for legacy DBs
    if let Err(e) = database::ensure_project_exists(conn, "Unbenanntes Projekt", "Unbekannt") {
        return Err(e.to_string());
    }
    let mut project = database::get_project(conn).map_err(|e| e.to_string())?;
    let chapters = database::list_chapters(conn).map_err(|e| e.to_string())?;
    project.chapters = chapters.clone();
    let mut scenes_by_chapter = std::collections::HashMap::new();
    for ch in &chapters {
        match database::list_scenes(conn, &ch.id) {
            Ok(v) => {
                scenes_by_chapter.insert(ch.id.clone(), v);
            }
            Err(e) => {
                return Err(format!(
                    "Fehler beim Laden der Szenen für Kapitel {}: {}",
                    ch.id, e
                ));
            }
        }
    }
    Ok(FullProjectPayload {
        project,
        chapters,
        scenes_by_chapter,
    })
}

fn get_recents_path(app_handle: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let config_dir = app_handle
        .path_resolver()
        .app_config_dir()
        .ok_or("Could not find app config dir")?;
    Ok(config_dir.join("recents.json"))
}

fn read_recent_projects(app_handle: &tauri::AppHandle) -> Result<Vec<RecentProjectEntry>, String> {
    let path = get_recents_path(app_handle)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let recents: Vec<RecentProjectEntry> =
        serde_json::from_reader(file).map_err(|e| e.to_string())?;
    Ok(recents)
}

fn write_recent_projects(
    app_handle: &tauri::AppHandle,
    recents: &[RecentProjectEntry],
) -> Result<(), String> {
    let path = get_recents_path(app_handle)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let file = std::fs::File::create(path).map_err(|e| e.to_string())?;
    serde_json::to_writer_pretty(file, recents).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn list_recent_projects(app_handle: tauri::AppHandle) -> Result<Vec<RecentProjectEntry>, String> {
    read_recent_projects(&app_handle)
}

// Extended project info for library
#[derive(serde::Deserialize, Debug, Default)]
struct ProjectLibraryMeta {
    author: Option<String>,
    genre: Option<String>,
    series: Option<String>,
    series_order: Option<i32>,
    word_count: Option<i32>,
    tags: Option<Vec<String>>,
}

fn add_to_recents_with_meta(
    app_handle: &tauri::AppHandle,
    path: &str,
    title: &str,
    meta: Option<ProjectLibraryMeta>,
) -> Result<(), String> {
    let mut recents = read_recent_projects(app_handle).unwrap_or_else(|_| Vec::new());

    // Preserve existing metadata if updating
    let existing_meta = recents.iter().find(|p| p.path == path).cloned();
    recents.retain(|p| p.path != path);

    let meta = meta.unwrap_or_default();
    let now = chrono::Utc::now().to_rfc3339();

    recents.insert(
        0,
        RecentProjectEntry {
            path: path.to_string(),
            title: title.to_string(),
            last_opened: now.clone(),
            author: meta
                .author
                .or_else(|| existing_meta.as_ref().and_then(|e| e.author.clone())),
            genre: meta
                .genre
                .or_else(|| existing_meta.as_ref().and_then(|e| e.genre.clone())),
            series: meta
                .series
                .or_else(|| existing_meta.as_ref().and_then(|e| e.series.clone())),
            series_order: meta
                .series_order
                .or_else(|| existing_meta.as_ref().and_then(|e| e.series_order)),
            word_count: meta
                .word_count
                .or_else(|| existing_meta.as_ref().and_then(|e| e.word_count)),
            created_at: existing_meta
                .as_ref()
                .and_then(|e| e.created_at.clone())
                .or(Some(now)),
            tags: meta
                .tags
                .or_else(|| existing_meta.as_ref().and_then(|e| e.tags.clone())),
        },
    );
    recents.truncate(50); // Keep 50 projects for library
    write_recent_projects(app_handle, &recents)
}

fn add_to_recents(app_handle: &tauri::AppHandle, path: &str, title: &str) -> Result<(), String> {
    add_to_recents_with_meta(app_handle, path, title, None)
}

// Update library metadata for a project
#[tauri::command]
fn update_library_project(
    app_handle: tauri::AppHandle,
    path: String,
    title: String,
    meta: ProjectLibraryMeta,
) -> Result<(), String> {
    add_to_recents_with_meta(&app_handle, &path, &title, Some(meta))
}

// Remove project from library
#[tauri::command]
fn remove_from_library(app_handle: tauri::AppHandle, path: String) -> Result<(), String> {
    let mut recents = read_recent_projects(&app_handle).unwrap_or_else(|_| Vec::new());
    recents.retain(|p| p.path != path);
    write_recent_projects(&app_handle, &recents)
}

// Get all unique series names
#[tauri::command]
fn list_series(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    let recents = read_recent_projects(&app_handle)?;
    let mut series: Vec<String> = recents.iter().filter_map(|p| p.series.clone()).collect();
    series.sort();
    series.dedup();
    Ok(series)
}

// Get all unique genres
#[tauri::command]
fn list_genres(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    let recents = read_recent_projects(&app_handle)?;
    let mut genres: Vec<String> = recents.iter().filter_map(|p| p.genre.clone()).collect();
    genres.sort();
    genres.dedup();
    Ok(genres)
}

// Get all unique tags
#[tauri::command]
fn list_tags(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    let recents = read_recent_projects(&app_handle)?;
    let mut tags: Vec<String> = recents
        .iter()
        .filter_map(|p| p.tags.clone())
        .flatten()
        .collect();
    tags.sort();
    tags.dedup();
    Ok(tags)
}

#[tauri::command]
fn open_project(
    path: String,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<Project, String> {
    log::info!("Opening project at path: {}", path);

    // Check if file exists first
    if !std::path::Path::new(&path).exists() {
        let err = format!("Project file does not exist: {}", path);
        log::error!("{}", err);
        return Err(err);
    }

    let conn = match database::open_database(&path) {
        Ok(c) => {
            log::info!("Successfully opened database");
            c
        }
        Err(e) => {
            let err = format!("Failed to open database: {}", e);
            log::error!("{}", err);
            eprintln!("[open_project] failed to open db: {e}");
            return Err(err);
        }
    };

    // Heal legacy DBs missing the project row
    if let Err(e) = database::ensure_project_exists(&conn, "Unbenanntes Projekt", "Unbekannt") {
        let err = format!("Failed to ensure project exists: {}", e);
        log::error!("{}", err);
        return Err(err);
    }

    // Get project details before moving the connection into the state
    let mut project = match database::get_project(&conn) {
        Ok(p) => {
            log::info!("Successfully retrieved project: {}", p.title);
            p
        }
        Err(e) => {
            let err = format!("Failed to get project: {}", e);
            log::error!("{}", err);
            eprintln!("[open_project] get_project error: {e}");
            return Err(err);
        }
    };

    project.chapters = match database::list_chapters(&conn) {
        Ok(v) => {
            log::info!("Successfully retrieved {} chapters", v.len());
            v
        }
        Err(e) => {
            let err = format!("Failed to list chapters: {}", e);
            log::error!("{}", err);
            eprintln!("[open_project] list_chapters error: {e}");
            return Err(err);
        }
    };

    // Now, store the connection in the state
    {
        let mut db_lock = state.db.lock().map_err(|e| e.to_string())?;
        *db_lock = Some(conn);
    }
    {
        let mut path_lock = state.db_path.lock().map_err(|e| e.to_string())?;
        *path_lock = Some(path.clone());
    }
    // Set journal path (same dir, file name with .journal)
    if let Some(parent) = std::path::Path::new(&path).parent() {
        let journal = parent.join("project.journal");
        {
            let mut jp = state.journal_path.lock().map_err(|e| e.to_string())?;
            *jp = Some(journal.to_string_lossy().to_string());
        }
        featherworks_author::services::scenes_service::set_journal_path(Some(
            journal.to_string_lossy().to_string(),
        ));
    }
    {
        let mut temp_flag = state.db_is_temp.lock().map_err(|e| e.to_string())?;
        *temp_flag = false;
        let mut container_lock = state.container_path.lock().map_err(|e| e.to_string())?;
        *container_lock = None;
    }

    add_to_recents(&app_handle, &path, &project.title)?;

    Ok(project)
}

#[tauri::command]
fn create_project(
    path: String,
    req: CreateProjectRequest,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<Project, String> {
    log::info!(
        "Creating new project: {} by {} at path: {}",
        req.title,
        req.author,
        path
    );

    // Create DB and write project row including metadata
    let conn = match database::create_database(
        &path,
        &req.title,
        &req.author,
        req.short_name.as_deref(),
        req.genre.as_deref(),
        req.target_pages,
    ) {
        Ok(c) => {
            log::info!("Successfully created database");
            c
        }
        Err(e) => {
            let err = format!("Failed to create database: {}", e);
            log::error!("{}", err);
            return Err(err);
        }
    };

    // Read back project and chapters before moving connection into state
    let mut project = match database::get_project(&conn) {
        Ok(p) => {
            log::info!("Successfully retrieved created project: {}", p.title);
            p
        }
        Err(e) => {
            let err = format!("Failed to get created project: {}", e);
            log::error!("{}", err);
            eprintln!("[create_project] get_project error: {e}");
            return Err(err);
        }
    };

    project.chapters = match database::list_chapters(&conn) {
        Ok(v) => {
            log::info!(
                "Successfully retrieved {} chapters for new project",
                v.len()
            );
            v
        }
        Err(e) => {
            let err = format!("Failed to list chapters for new project: {}", e);
            log::error!("{}", err);
            eprintln!("[create_project] list_chapters error: {e}");
            return Err(err);
        }
    };
    if project.chapters.is_empty() {
        // If for any reason seeding failed earlier, ensure at least one chapter/scene exists
        let ch = database::create_chapter(&conn, "Kapitel 1").map_err(|e| e.to_string())?;
        let _sc = database::create_scene(&conn, &ch.id, "Szene 1").map_err(|e| e.to_string())?;
        project.chapters = database::list_chapters(&conn).map_err(|e| e.to_string())?;
    }

    // Store connection into state
    {
        let mut db_lock = state.db.lock().map_err(|e| e.to_string())?;
        *db_lock = Some(conn);
    }
    {
        let mut path_lock = state.db_path.lock().map_err(|e| e.to_string())?;
        *path_lock = Some(path.clone());
    }
    if let Some(parent) = std::path::Path::new(&path).parent() {
        let journal = parent.join("project.journal");
        {
            let mut jp = state.journal_path.lock().map_err(|e| e.to_string())?;
            *jp = Some(journal.to_string_lossy().to_string());
        }
        featherworks_author::services::scenes_service::set_journal_path(Some(
            journal.to_string_lossy().to_string(),
        ));
    }
    {
        let mut temp_flag = state.db_is_temp.lock().map_err(|e| e.to_string())?;
        *temp_flag = false;
        let mut container_lock = state.container_path.lock().map_err(|e| e.to_string())?;
        *container_lock = None;
    }

    add_to_recents(&app_handle, &path, &project.title)?;
    Ok(project)
}

#[tauri::command]
fn save_project(state: State<'_, AppState>) -> Result<(), String> {
    // For now, a checkpoint; we can later integrate encrypted container export.
    let db_path = {
        let lock = state.db_path.lock().map_err(|e| e.to_string())?;
        lock.clone().ok_or("Kein Projekt geöffnet")?
    };
    let conn_exists = {
        let lock = state.db.lock().map_err(|e| e.to_string())?;
        lock.is_some()
    };
    if !conn_exists {
        return Err("Keine aktive DB Verbindung".into());
    }
    // rusqlite write-ahead log might have uncheckpointed pages. Force checkpoint to ensure file is up to date.
    {
        let mut db_lock = state.db.lock().map_err(|e| e.to_string())?;
        if let Some(conn) = db_lock.as_mut() {
            if let Err(e) = conn.execute_batch("PRAGMA wal_checkpoint(FULL);") {
                log::warn!("wal checkpoint failed: {e}");
            }
        }
    }
    // Basic existence check
    if !std::path::Path::new(&db_path).exists() {
        return Err("Projektdatei existiert nicht mehr".into());
    }
    Ok(())
}

#[tauri::command]
fn save_project_as(new_path: String, state: State<'_, AppState>) -> Result<(), String> {
    let old_path = {
        let lock = state.db_path.lock().map_err(|e| e.to_string())?;
        lock.clone().ok_or("Kein Projekt geöffnet")?
    };
    // Ensure DB changes flushed
    {
        let mut db_lock = state.db.lock().map_err(|e| e.to_string())?;
        if let Some(conn) = db_lock.as_mut() {
            if let Err(e) = conn.execute_batch("PRAGMA wal_checkpoint(FULL);") {
                log::warn!("wal checkpoint failed: {e}");
            }
        }
    }
    std::fs::copy(&old_path, &new_path).map_err(|e| e.to_string())?;
    // Update current path to new path
    {
        let mut lock = state.db_path.lock().map_err(|e| e.to_string())?;
        *lock = Some(new_path);
    }
    {
        // After Save As from temp import, clear temp flag
        let mut temp_flag = state.db_is_temp.lock().map_err(|e| e.to_string())?;
        *temp_flag = false;
    }
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct ExportEncryptedRequest {
    password: String,
    out_path: String,
}

#[tauri::command]
fn export_project_encrypted(
    req: ExportEncryptedRequest,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Flush WAL
    {
        let mut db_lock = state.db.lock().map_err(|e| e.to_string())?;
        if let Some(conn) = db_lock.as_mut() {
            let _ = conn.execute_batch("PRAGMA wal_checkpoint(FULL);");
        }
    }
    let db_path = {
        let lock = state.db_path.lock().map_err(|e| e.to_string())?;
        lock.clone().ok_or("Kein Projekt geöffnet")?
    };
    let sqlite_path = std::path::Path::new(&db_path);
    let out_path = std::path::Path::new(&req.out_path);
    container::save_encrypted(sqlite_path, out_path, &req.password).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct ImportEncryptedRequest {
    path: String,
    password: String,
}

#[tauri::command]
fn import_encrypted_project(
    req: ImportEncryptedRequest,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<Project, String> {
    let tmp = container::load_encrypted(std::path::Path::new(&req.path), &req.password)
        .map_err(|e| e.to_string())?;
    let tmp_path = tmp.path().to_string_lossy().to_string();
    // Open DB from temp file; do NOT move file yet (user can choose Save As to persist)
    let conn = database::open_database(&tmp_path).map_err(|e| e.to_string())?;
    // Ensure project row
    database::ensure_project_exists(&conn, "Unbenanntes Projekt", "Unbekannt")
        .map_err(|e| e.to_string())?;
    let mut project = database::get_project(&conn).map_err(|e| e.to_string())?;
    project.chapters = database::list_chapters(&conn).map_err(|e| e.to_string())?;
    {
        let mut db_lock = state.db.lock().map_err(|e| e.to_string())?;
        *db_lock = Some(conn);
    }
    {
        let mut path_lock = state.db_path.lock().map_err(|e| e.to_string())?;
        *path_lock = Some(tmp_path.clone());
    }
    if let Some(parent) = std::path::Path::new(&tmp_path).parent() {
        let journal = parent.join("project.journal");
        {
            let mut jp = state.journal_path.lock().map_err(|e| e.to_string())?;
            *jp = Some(journal.to_string_lossy().to_string());
        }
        featherworks_author::services::scenes_service::set_journal_path(Some(
            journal.to_string_lossy().to_string(),
        ));
    }
    {
        let mut temp_flag = state.db_is_temp.lock().map_err(|e| e.to_string())?;
        *temp_flag = true;
        let mut container_lock = state.container_path.lock().map_err(|e| e.to_string())?;
        *container_lock = Some(req.path.clone());
    }
    // Not adding to recents with temp path; maybe later with original container path
    let _ = add_to_recents(&app_handle, &req.path, &project.title);
    Ok(project)
}

// --- Spellcheck Commands ---
#[derive(serde::Deserialize)]
struct SpellCheckRequest {
    text: String,
    #[serde(default = "default_lang")]
    lang: String,
}

fn default_lang() -> String {
    "de".to_string()
}

#[derive(serde::Serialize)]
struct SpellCheckResponse {
    errors: Vec<spellcheck::SpellError>,
}

#[tauri::command]
fn spell_check(
    req: SpellCheckRequest,
    app: tauri::AppHandle,
) -> Result<SpellCheckResponse, String> {
    let lang = spellcheck::Language::from_code(&req.lang)
        .ok_or_else(|| format!("Unsupported language: {}", req.lang))?;

    // Try bundled resource dir first, then fall back to local development path
    let dict_dir = app
        .path_resolver()
        .resource_dir()
        .map(|p| p.join("dictionaries"))
        .filter(|p| p.exists())
        .or_else(|| {
            // Development fallback: resources/dictionaries relative to src-tauri
            let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("resources")
                .join("dictionaries");
            if dev_path.exists() {
                Some(dev_path)
            } else {
                None
            }
        })
        .ok_or("Could not find dictionaries directory")?;

    log::info!("[spell_check] Using dictionary dir: {:?}", dict_dir);

    let errors = spellcheck::check_text(&req.text, lang, &dict_dir).map_err(|e| e.to_string())?;

    Ok(SpellCheckResponse { errors })
}

#[derive(serde::Deserialize)]
struct SuggestRequest {
    word: String,
    #[serde(default = "default_lang")]
    lang: String,
}

#[tauri::command]
fn spell_suggest(req: SuggestRequest, app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let lang = spellcheck::Language::from_code(&req.lang)
        .ok_or_else(|| format!("Unsupported language: {}", req.lang))?;

    let dict_dir = app
        .path_resolver()
        .resource_dir()
        .map(|p| p.join("dictionaries"))
        .filter(|p| p.exists())
        .or_else(|| {
            let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("resources")
                .join("dictionaries");
            if dev_path.exists() {
                Some(dev_path)
            } else {
                None
            }
        })
        .ok_or("Could not find dictionaries directory")?;

    spellcheck::suggest(&req.word, lang, &dict_dir).map_err(|e| e.to_string())
}

#[derive(serde::Deserialize)]
struct AddWordRequest {
    word: String,
}

#[tauri::command]
fn spell_add_word(req: AddWordRequest) -> Result<(), String> {
    spellcheck::add_to_user_dictionary(&req.word).map_err(|e| e.to_string())
}

// --- LanguageTool Commands ---

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct LtCheckRequest {
    text: String,
    language: String,
    api_key: Option<String>,
    username: Option<String>,
    disabled_rules: Option<Vec<String>>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LtCheckResponse {
    issues: Vec<languagetool::LtIssue>,
}

/// Prüft Text mit LanguageTool API
#[tauri::command]
async fn languagetool_check(req: LtCheckRequest) -> Result<LtCheckResponse, String> {
    let config = languagetool::LtConfig {
        enabled: true,
        api_key: req.api_key,
        username: req.username,
        language: req.language,
        disabled_rules: req.disabled_rules.unwrap_or_default(),
        enabled_categories: Vec::new(),
    };

    let issues = languagetool::check_text(&req.text, &config)
        .await
        .map_err(|e| e.to_string())?;

    Ok(LtCheckResponse { issues })
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct LtTestRequest {
    language: String,
    api_key: Option<String>,
    username: Option<String>,
}

/// Testet die LanguageTool Verbindung
#[tauri::command]
async fn languagetool_test(req: LtTestRequest) -> Result<bool, String> {
    let config = languagetool::LtConfig {
        enabled: true,
        api_key: req.api_key,
        username: req.username,
        language: req.language,
        disabled_rules: Vec::new(),
        enabled_categories: Vec::new(),
    };

    languagetool::test_connection(&config)
        .await
        .map_err(|e| e.to_string())
}

// --- Update Commands ---
// Updater ist derzeit deaktiviert (tauri.conf.json: updater.active = false)

#[derive(serde::Serialize)]
struct UpdateInfo {
    available: bool,
    version: Option<String>,
    body: Option<String>, // Changelog/Release notes
    date: Option<String>,
}

/// Check for available updates (non-blocking)
/// Derzeit deaktiviert - gibt immer "kein Update" zurück
#[tauri::command]
async fn check_for_update(_app: tauri::AppHandle) -> Result<UpdateInfo, String> {
    // Updater ist deaktiviert - immer "kein Update verfügbar" zurückgeben
    Ok(UpdateInfo {
        available: false,
        version: None,
        body: None,
        date: None,
    })
}

/// Download and install the update (will restart the app)
/// Derzeit deaktiviert
#[tauri::command]
async fn install_update(_app: tauri::AppHandle) -> Result<(), String> {
    // Updater ist deaktiviert
    Err("Updater ist derzeit deaktiviert".to_string())
}

/// Get the current app version
#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

// --- AI Entity Extraction & Lektorat ---

/// Request für Entity-Extraktion
#[derive(serde::Deserialize)]
struct ExtractEntitiesRequest {
    text: String,
    #[serde(rename = "entityTypes")]
    entity_types: Vec<String>,
    /// Sprache: "de" oder "en" - bestimmt Prompts und Output
    #[serde(default = "default_lang")]
    lang: String,
}

/// Extrahiere Entities aus Text mit KI (2-Pass System)
/// Pass 1: Discovery - Schnelles Scannen nach Namen pro Kategorie
/// Pass 2: Details - Validierung und JSON-Anreicherung
#[tauri::command]
async fn extract_entities_ai(
    req: ExtractEntitiesRequest,
    app: tauri::AppHandle,
) -> Result<String, String> {
    use ai::entity_extraction::{
        build_detail_prompt, build_discovery_prompt, extract_nicknames_from_text, merge_entities,
        parse_discovery_response, parse_extraction_response, split_into_chunks,
        validate_entities_against_text, DiscoveredEntity, ExtractedEntity, ScanPhase,
    };
    use ai::generate_tokens_for_prompt;
    use serde_json::json;
    use uuid::Uuid;

    // Teile Text in überlappende Chunks
    let chunks = split_into_chunks(&req.text);
    // Originaltext für Halluzinations-Check
    let original_text = req.text.clone();
    // Sprache für Prompts
    let lang = req.lang.clone();

    // Job-ID für Progress-Events
    let job_id = Uuid::new_v4().to_string();
    let job_id_for_task = job_id.clone();
    let app_handle = app.clone();

    // Verarbeitung asynchron im Hintergrund
    tokio::spawn(async move {
        let original_text_ref = original_text.clone();
        let lang_ref = lang.clone();

        // Catch panics um App-Absturz zu verhindern
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            // ================================================================
            // PASS 1: Discovery - Scanne nach jeder Kategorie
            // ================================================================
            let phases = [
                ScanPhase::Characters,
                ScanPhase::Locations,
                ScanPhase::Items,
                ScanPhase::Factions,
            ];

            let mut all_discovered: Vec<DiscoveredEntity> = Vec::new();
            let total_phases = phases.len() + 1; // +1 für Detail-Phase

            // Wording je nach Sprache
            let section_word = if lang_ref == "en" {
                "section"
            } else {
                "Abschnitt"
            };

            for (phase_idx, phase) in phases.iter().enumerate() {
                // Progress-Event mit Phase-Info
                let _ = app_handle.emit_all("world_scan_progress", json!({
                    "job_id": job_id_for_task,
                    "phase": phase.display_name_localized(&lang_ref),
                    "phase_num": phase_idx + 1,
                    "total_phases": total_phases,
                    "progress_percent": ((phase_idx as f32) / (total_phases as f32) * 100.0) as u32
                }));

                // Legacy progress event für Kompatibilität
                let _ = app_handle.emit_all(
                    "entity_extraction_progress",
                    json!({
                        "job_id": job_id_for_task,
                        "current_chunk": phase_idx + 1,
                        "total_chunks": total_phases,
                        "section_word": section_word
                    }),
                );

                let entity_type = phase.entity_type().unwrap_or("character");

                // Scanne jeden Chunk für diese Kategorie
                for chunk in &chunks {
                    let prompt = build_discovery_prompt(chunk, *phase, &lang_ref);
                    if prompt.is_empty() {
                        continue;
                    }

                    // Discovery braucht weniger Tokens (nur Namen-Liste)
                    let tokens = generate_tokens_for_prompt(&prompt, 500);
                    let response = tokens.join("");

                    let discovered = parse_discovery_response(&response, entity_type);
                    log::info!(
                        "[entity_discovery] Phase {:?}: found {} entities in {}",
                        phase,
                        discovered.len(),
                        section_word
                    );
                    for d in &discovered {
                        log::debug!("[entity_discovery]   - {}", d.name);
                    }
                    all_discovered.extend(discovered);
                }
            }

            // Dedupliziere nach Namen (case-insensitive)
            let mut seen = std::collections::HashSet::new();
            all_discovered.retain(|e| {
                let key = e.name.to_lowercase();
                if seen.contains(&key) {
                    false
                } else {
                    seen.insert(key);
                    true
                }
            });

            log::info!(
                "[entity_discovery] Total unique discovered: {}",
                all_discovered.len()
            );

            // ================================================================
            // PASS 2: Details + Validation
            // ================================================================
            let _ = app_handle.emit_all(
                "world_scan_progress",
                json!({
                    "job_id": job_id_for_task,
                    "phase": ScanPhase::Details.display_name(),
                    "phase_num": total_phases,
                    "total_phases": total_phases,
                    "progress_percent": 90
                }),
            );

            let _ = app_handle.emit_all(
                "entity_extraction_progress",
                json!({
                    "job_id": job_id_for_task,
                    "current_chunk": total_phases,
                    "total_chunks": total_phases,
                    "section_word": section_word
                }),
            );

            let mut final_entities: Vec<ExtractedEntity> = Vec::new();

            if !all_discovered.is_empty() {
                // Kleinere Batches für stabileres JSON-Parsing
                const BATCH_SIZE: usize = 4;
                for batch in all_discovered.chunks(BATCH_SIZE) {
                    // Verwende ersten Chunk als Kontext (oder alle zusammen für kurze Texte)
                    let context_text = if chunks.len() == 1 {
                        chunks[0].clone()
                    } else {
                        chunks
                            .iter()
                            .take(2)
                            .cloned()
                            .collect::<Vec<_>>()
                            .join("\n\n")
                    };

                    let prompt = build_detail_prompt(&context_text, batch, &lang_ref);
                    // Mehr Tokens für vollständiges JSON (4 Entities × ~150 Tokens = ~600, plus Buffer)
                    let tokens = generate_tokens_for_prompt(&prompt, 800);
                    let response = tokens.join("");

                    match parse_extraction_response(&response) {
                        Ok(entities) => {
                            log::info!(
                                "[entity_details] Batch: got {} detailed glossary entries",
                                entities.len()
                            );
                            final_entities.extend(entities);
                        }
                        Err(e) => {
                            log::error!("[entity_details] Parse error: {}", e);
                            // Fallback: Erstelle einfache Entities aus Discovery-Daten
                            for d in batch {
                                final_entities.push(ExtractedEntity {
                                    entity_type: d.entity_type.clone(),
                                    name: d.name.clone(),
                                    aliases: Vec::new(),
                                    description: String::new(),
                                    notes: String::new(),
                                    confidence: 0.5,
                                    occurrences: Vec::new(),
                                });
                            }
                        }
                    }
                }
            }

            // Merge & Dedupe
            let merged = merge_entities(vec![final_entities]);
            log::info!(
                "[entity_extraction] Total merged entities: {}",
                merged.len()
            );

            // === HALLUZINATIONS-FILTER ===
            let validated = validate_entities_against_text(merged, &original_text_ref);
            log::info!(
                "[entity_extraction] After text validation: {} entities",
                validated.len()
            );

            // === SPITZNAMEN-EXTRAKTION ===
            // Extrahiere Spitznamen wie "Caitlin 'Caite' Keane" → Caite als Alias
            let with_nicknames = extract_nicknames_from_text(validated, &original_text_ref);

            for e in &with_nicknames {
                log::info!(
                    "[entity_extraction]   FINAL: {} ({}) aliases: {:?} | desc: '{}'",
                    e.name,
                    e.entity_type,
                    e.aliases,
                    e.description
                );
            }

            // Fertig-Events
            let _ = app_handle.emit_all(
                "world_scan_progress",
                json!({
                    "job_id": job_id_for_task,
                    "phase": ScanPhase::Done.display_name(),
                    "phase_num": total_phases + 1,
                    "total_phases": total_phases,
                    "progress_percent": 100,
                    "entities_found": with_nicknames.len()
                }),
            );

            let _ = app_handle.emit_all(
                "entity_extraction_done",
                json!({
                    "job_id": job_id_for_task,
                    "entities": with_nicknames
                }),
            );
        }));

        if let Err(e) = result {
            log::error!("[entity_extraction] Task panicked: {:?}", e);
            let _ = app_handle.emit_all(
                "entity_extraction_error",
                json!({
                    "job_id": job_id_for_task,
                    "error": format!("Internal error: {:?}", e)
                }),
            );
        }
    });

    // Sofort Job-ID zurückgeben
    Ok(job_id)
}

#[derive(serde::Deserialize)]
struct ExtractEntitiesUpsertRequest {
    text: String,
    #[serde(rename = "entityTypes")]
    entity_types: Vec<String>,
    #[serde(rename = "sceneId")]
    scene_id: Option<String>,
}

fn resolve_type_map(
    conn: &Connection,
    names: &[String],
) -> Result<std::collections::HashMap<String, String>, String> {
    let mut map = std::collections::HashMap::new();
    let types = database::list_entity_types(conn).map_err(|e| e.to_string())?;
    for t in types {
        map.insert(t.name.to_lowercase(), t.id.clone());
        map.insert(t.name_plural.to_lowercase(), t.id.clone());
    }
    // Only keep requested
    map.retain(|k, _| names.iter().any(|n| n.to_lowercase() == *k));
    Ok(map)
}

fn upsert_extracted_entities(
    conn: &Connection,
    entities: &[ExtractedEntity],
    type_map: &std::collections::HashMap<String, String>,
) -> (usize, usize) {
    let mut new_count = 0;
    let mut updated_count = 0;

    for e in entities {
        if let Some(type_id) = type_map.get(&e.entity_type.to_lowercase()) {
            let aliases_str = e.aliases.join(", ");
            if let Ok((_ent, was_updated)) = database::upsert_entity(
                conn,
                type_id,
                &e.name,
                &aliases_str,
                &e.description,
                &e.notes,
                None,
                "{}",
            ) {
                if was_updated {
                    updated_count += 1;
                } else {
                    new_count += 1;
                }
            }
        }
    }

    (new_count, updated_count)
}

/// Chunked Szene-Entity-Scan mit Upsert in DB
#[tauri::command]
async fn extract_entities_scene_upsert(
    req: ExtractEntitiesUpsertRequest,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    use ai::entity_extraction::{
        build_extraction_prompt, merge_entities, parse_extraction_response, split_into_chunks,
    };
    use ai::generate_tokens_for_prompt;
    use serde_json::json;
    use uuid::Uuid;

    let db_path = {
        let guard = state.db_path.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("No database path")?
    };

    let chunks = split_into_chunks(&req.text);
    let type_names = req.entity_types.clone();
    let job_id = Uuid::new_v4().to_string();
    let job_id_clone = job_id.clone();
    let app_handle = app.clone();

    tokio::task::spawn_blocking(move || {
        let conn = database::open_database(&db_path).map_err(|e| e.to_string())?;
        let type_map = resolve_type_map(&conn, &type_names)?;
        let mut all_entities: Vec<Vec<ExtractedEntity>> = Vec::new();
        let total = chunks.len();
        let mut error_chunks = 0;

        for (idx, chunk) in chunks.into_iter().enumerate() {
            let _ = app_handle.emit_all(
                "entity_upsert_progress",
                json!({
                    "job_id": job_id_clone,
                    "current_chunk": idx + 1,
                    "total_chunks": total
                }),
            );

            let prompt = build_extraction_prompt(
                &chunk,
                &type_names.iter().map(|s| s.as_str()).collect::<Vec<&str>>(),
            );
            let tokens = generate_tokens_for_prompt(&prompt, 2200);
            let response = tokens.join(" ");

            match parse_extraction_response(&response) {
                Ok(ents) => all_entities.push(ents),
                Err(e) => {
                    error_chunks += 1;
                    let _ = app_handle.emit_all(
                        "entity_upsert_error",
                        json!({
                            "job_id": job_id_clone,
                            "error": e,
                            "chunk": idx + 1
                        }),
                    );
                }
            }
        }

        let merged = merge_entities(all_entities);
        let (new_count, updated_count) = upsert_extracted_entities(&conn, &merged, &type_map);

        let _ = app_handle.emit_all(
            "entity_upsert_done",
            json!({
                "job_id": job_id_clone,
                "new": new_count,
                "updated": updated_count,
                "errors": error_chunks,
                "entities": merged
            }),
        );

        Ok::<(), String>(())
    });

    Ok(job_id)
}

/// Globaler Manuskript-Scan: alle Szenen chunked extrahieren und upserten
#[tauri::command]
async fn extract_entities_manuscript_upsert(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    use ai::entity_extraction::{
        build_extraction_prompt, merge_entities, parse_extraction_response, split_into_chunks,
    };
    use ai::generate_tokens_for_prompt;
    use serde_json::json;
    use uuid::Uuid;

    let (db_path, scenes, entity_types): (String, Vec<(String, String)>, Vec<String>) = {
        let db_lock = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db_lock.as_ref().ok_or("Database not open")?;

        let path = state
            .db_path
            .lock()
            .map_err(|e| e.to_string())?
            .clone()
            .ok_or("No database path")?;

        // scenes: (title, content)
        let mut stmt = conn.prepare(
            "SELECT s.title, s.content FROM scenes s \n             JOIN chapters c ON s.chapter_id = c.id \n             ORDER BY c.order_num, s.order_num"
        ).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                ))
            })
            .map_err(|e| e.to_string())?;
        let scenes: Vec<(String, String)> = rows.filter_map(|r| r.ok()).collect();

        // entity types names
        let types = database::list_entity_types(conn).map_err(|e| e.to_string())?;
        let names = types.iter().map(|t| t.name.clone()).collect();

        (path, scenes, names)
    };

    let job_id = Uuid::new_v4().to_string();
    let job_id_clone = job_id.clone();
    let app_handle = app.clone();

    tokio::task::spawn_blocking(move || {
        let conn = database::open_database(&db_path).map_err(|e| e.to_string())?;
        let type_map = resolve_type_map(&conn, &entity_types)?;
        let total_scenes = scenes.len();
        let mut new_count = 0;
        let mut updated_count = 0;
        let mut error_chunks = 0;

        for (scene_idx, (_title, content)) in scenes.into_iter().enumerate() {
            if content.trim().len() < 50 {
                continue;
            }

            let chunks = split_into_chunks(&content);
            let total_chunks = chunks.len();
            for (cidx, chunk) in chunks.into_iter().enumerate() {
                let _ = app_handle.emit_all(
                    "entity_upsert_progress",
                    json!({
                        "job_id": job_id_clone,
                        "scene": scene_idx + 1,
                        "total_scenes": total_scenes,
                        "current_chunk": cidx + 1,
                        "total_chunks": total_chunks
                    }),
                );

                let prompt = build_extraction_prompt(
                    &chunk,
                    &entity_types
                        .iter()
                        .map(|s| s.as_str())
                        .collect::<Vec<&str>>(),
                );
                let tokens = generate_tokens_for_prompt(&prompt, 2200);
                let response = tokens.join(" ");

                match parse_extraction_response(&response) {
                    Ok(ents) => {
                        // Direkt upserten pro Chunk, kleinere Menge
                        let merged = merge_entities(vec![ents]);
                        let (n, u) = upsert_extracted_entities(&conn, &merged, &type_map);
                        new_count += n;
                        updated_count += u;
                    }
                    Err(e) => {
                        error_chunks += 1;
                        let _ = app_handle.emit_all(
                            "entity_upsert_error",
                            json!({
                                "job_id": job_id_clone,
                                "error": e,
                                "scene": scene_idx + 1,
                                "chunk": cidx + 1
                            }),
                        );
                    }
                }
            }
        }

        let _ = app_handle.emit_all(
            "entity_upsert_done",
            json!({
                "job_id": job_id_clone,
                "new": new_count,
                "updated": updated_count,
                "errors": error_chunks
            }),
        );

        Ok::<(), String>(())
    });

    Ok(job_id)
}

/// Request für Lektorat-Analyse
#[derive(serde::Deserialize)]
struct AnalyzeLektoratRequest {
    text: String,
    #[serde(rename = "sceneId")]
    #[allow(dead_code)]
    scene_id: Option<String>,
    /// Sprache: "de" oder "en" - bestimmt Prompts und Output
    #[serde(default = "default_lang")]
    lang: String,
    /// Grammatik-Prüfung mit einschließen
    #[serde(rename = "includeGrammar", default)]
    include_grammar: bool,
}

/// Lektorat-Analyse mit KI
#[tauri::command]
async fn analyze_lektorat_ai(
    req: AnalyzeLektoratRequest,
    app: tauri::AppHandle,
) -> Result<String, String> {
    use ai::entity_extraction::build_lektorat_prompt;

    let prompt = build_lektorat_prompt(&req.text, &req.lang, req.include_grammar);

    // Starte AI Session - Ergebnisse kommen via Events
    stream::start_session(&app, prompt)
}

/// Chunked Lektorat (für sehr lange Szenen) mit Fortschritts-Events
#[tauri::command]
async fn analyze_lektorat_chunked(
    req: AnalyzeLektoratRequest,
    app: tauri::AppHandle,
) -> Result<String, String> {
    use ai::entity_extraction::{
        build_lektorat_prompt, parse_lektorat_response, split_into_chunks, LektoratNote,
    };
    use ai::generate_tokens_for_prompt;
    use serde_json::json;
    use uuid::Uuid;

    let chunks = split_into_chunks(&req.text);
    let total = chunks.len();
    let job_id = Uuid::new_v4().to_string();
    let job_id_for_task = job_id.clone();
    let app_handle = app.clone();
    let lang = req.lang.clone();
    let include_grammar = req.include_grammar;

    // Wording je nach Sprache
    let section_word = if lang == "en" { "section" } else { "Abschnitt" };

    tokio::spawn(async move {
        let mut all_notes: Vec<LektoratNote> = Vec::new();

        for (idx, chunk) in chunks.into_iter().enumerate() {
            let _ = app_handle.emit_all(
                "lektorat_progress",
                json!({
                    "job_id": job_id_for_task,
                    "current_chunk": idx + 1,
                    "total_chunks": total,
                    "section_word": section_word
                }),
            );

            let prompt = build_lektorat_prompt(&chunk, &lang, include_grammar);
            // Lektorat braucht mehr Tokens als Entity-Extraktion:
            // - Mehr Findings pro Chunk (Stilprobleme sind häufiger)
            // - suggestion-Feld kann längere Texte enthalten
            let tokens = generate_tokens_for_prompt(&prompt, 1000);
            let response = tokens.join("");

            match parse_lektorat_response(&response) {
                Ok(mut notes) => {
                    all_notes.append(&mut notes);
                }
                Err(e) => {
                    let _ = app_handle.emit_all(
                        "lektorat_error",
                        json!({
                            "job_id": job_id_for_task,
                            "error": e,
                            "section": idx + 1
                        }),
                    );
                }
            }
        }

        // Dedupe: gleiche line + message + type zusammenführen
        all_notes.sort_by(|a, b| a.line.cmp(&b.line));
        let mut deduped: Vec<LektoratNote> = Vec::new();
        for note in all_notes.into_iter() {
            if let Some(last) = deduped.last() {
                if last.line == note.line
                    && last.note_type == note.note_type
                    && last.message == note.message
                {
                    continue;
                }
            }
            deduped.push(note);
        }

        let _ = app_handle.emit_all(
            "lektorat_done",
            json!({
                "job_id": job_id_for_task,
                "notes": deduped
            }),
        );
    });

    Ok(job_id)
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-Summarization - Background AI task (no chat output)
// ─────────────────────────────────────────────────────────────────────────────

/// Request für Auto-Summarize
#[derive(serde::Deserialize)]
struct AutoSummarizeSceneRequest {
    #[serde(rename = "sceneId")]
    scene_id: String,
}

/// Auto-summarize a scene in the background (no streaming, direct DB write)
#[tauri::command]
async fn auto_summarize_scene(
    req: AutoSummarizeSceneRequest,
    state: State<'_, AppState>,
) -> Result<String, String> {
    use ai::entity_extraction::{build_scene_summary_prompt, parse_summary_response};

    // Get scene content from DB
    let (scene_title, scene_content) = {
        let db_lock = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db_lock.as_ref().ok_or("Database not open")?;

        // Get scene title and content
        let mut stmt = conn
            .prepare("SELECT title, content FROM scenes WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        let result: (String, String) = stmt
            .query_row([&req.scene_id], |row| {
                Ok((
                    row.get(0)?,
                    row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                ))
            })
            .map_err(|e| format!("Scene not found: {}", e))?;
        result
    };

    // Skip if content is empty or too short
    if scene_content.trim().len() < 50 {
        return Ok("Szene zu kurz für Zusammenfassung".to_string());
    }

    // Build prompt
    let prompt = build_scene_summary_prompt(&scene_title, &scene_content);

    // Generate summary synchronously (no streaming)
    let tokens = ai::generate_tokens_for_prompt(&prompt, 200);
    let response = tokens.join(" ");
    let summary = parse_summary_response(&response);

    // Write summary to DB
    {
        let db_lock = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db_lock.as_ref().ok_or("Database not open")?;
        database::update_scene_summary(conn, &req.scene_id, &summary).map_err(|e| e.to_string())?;
    }

    log::info!(
        "[auto-summarize] Scene {} summarized: {}",
        req.scene_id,
        summary
    );
    Ok(summary)
}

/// Request für Kapitel-Zusammenfassung
#[derive(serde::Deserialize)]
struct AutoSummarizeChapterRequest {
    #[serde(rename = "chapterId")]
    chapter_id: String,
}

/// Auto-summarize a chapter based on its scene summaries
#[tauri::command]
async fn auto_summarize_chapter(
    req: AutoSummarizeChapterRequest,
    state: State<'_, AppState>,
) -> Result<String, String> {
    use ai::entity_extraction::{build_chapter_summary_prompt, parse_summary_response};

    // Get chapter title and scene summaries
    let (chapter_title, scene_data) = {
        let db_lock = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db_lock.as_ref().ok_or("Database not open")?;

        // Get chapter title
        let title: String = conn
            .query_row(
                "SELECT title FROM chapters WHERE id = ?1",
                [&req.chapter_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Chapter not found: {}", e))?;

        // Get scene summaries
        let summaries = database::get_chapter_scene_summaries(conn, &req.chapter_id)
            .map_err(|e| e.to_string())?;

        let data: Vec<(String, Option<String>)> = summaries
            .into_iter()
            .map(|(_, title, summary)| (title, summary))
            .collect();

        (title, data)
    };

    // Skip if no scenes
    if scene_data.is_empty() {
        return Ok("Keine Szenen im Kapitel".to_string());
    }

    // Build prompt
    let prompt = build_chapter_summary_prompt(&chapter_title, &scene_data);

    // Generate summary
    let tokens = ai::generate_tokens_for_prompt(&prompt, 250);
    let response = tokens.join(" ");
    let summary = parse_summary_response(&response);

    // Write to DB
    {
        let db_lock = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db_lock.as_ref().ok_or("Database not open")?;
        database::update_chapter_summary(conn, &req.chapter_id, &summary)
            .map_err(|e| e.to_string())?;
    }

    log::info!(
        "[auto-summarize] Chapter {} summarized: {}",
        req.chapter_id,
        summary
    );
    Ok(summary)
}

/// Get scene summary
#[tauri::command]
fn get_scene_summary(scene_id: String, state: State<AppState>) -> Result<Option<String>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_lock.as_ref().ok_or("Database not open")?;
    database::get_scene_summary(conn, &scene_id).map_err(|e| e.to_string())
}

/// Get chapter summary
#[tauri::command]
fn get_chapter_summary(
    chapter_id: String,
    state: State<AppState>,
) -> Result<Option<String>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_lock.as_ref().ok_or("Database not open")?;
    database::get_chapter_summary(conn, &chapter_id).map_err(|e| e.to_string())
}

/// Get all chapter summaries for AI context
#[tauri::command]
fn get_all_chapter_summaries(
    state: State<AppState>,
) -> Result<Vec<(String, String, Option<String>)>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_lock.as_ref().ok_or("Database not open")?;
    database::get_all_chapter_summaries(conn).map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Queue & Background Jobs
// ─────────────────────────────────────────────────────────────────────────────

/// Get queue statistics
#[tauri::command]
fn get_ai_queue_stats() -> ai::queue::QueueStats {
    ai::queue::get_queue_stats()
}

/// Get all active background jobs
#[tauri::command]
fn list_background_jobs() -> Vec<ai::background::BackgroundJobStatus> {
    ai::background::list_background_jobs()
}

/// Get status of a specific background job
#[tauri::command]
fn get_background_job_status(job_id: String) -> Option<ai::background::BackgroundJobStatus> {
    ai::background::get_background_job_status(&job_id)
}

/// Cancel a background job
#[tauri::command]
fn cancel_background_job(job_id: String) -> bool {
    ai::background::cancel_background_job(&job_id)
}

/// Scene data for background processing
#[derive(Clone)]
struct SceneData {
    id: String,
    title: String,
    content: String,
}

/// Start entity scan across all scenes
#[tauri::command]
async fn start_entity_scan(
    entity_types: Vec<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    use ai::entity_extraction::build_extraction_prompt;
    use ai::queue::{enqueue, Priority};
    use uuid::Uuid;

    // Fetch all scenes synchronously first
    let scenes: Vec<SceneData> = {
        let db_lock = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db_lock.as_ref().ok_or("Database not open")?;

        let mut stmt = conn
            .prepare(
                "SELECT s.id, s.title, s.content FROM scenes s 
             JOIN chapters c ON s.chapter_id = c.id 
             ORDER BY c.order_num, s.order_num",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok(SceneData {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    content: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                })
            })
            .map_err(|e| e.to_string())?;

        rows.filter_map(|r| r.ok()).collect()
    };

    let total = scenes.len();
    if total == 0 {
        return Ok("no_scenes".to_string());
    }

    let job_id = Uuid::new_v4().to_string();
    let entity_types_clone = entity_types.clone();

    // Spawn background task
    tokio::spawn(async move {
        log::info!("[bg-job] EntityScan gestartet: {} Szenen", total);

        for (idx, scene) in scenes.iter().enumerate() {
            // Skip short scenes
            if scene.content.trim().len() < 50 {
                continue;
            }

            log::debug!(
                "[bg-job] Processing scene {}/{}: {}",
                idx + 1,
                total,
                scene.title
            );

            // Build prompt
            let type_refs: Vec<&str> = entity_types_clone.iter().map(|s| s.as_str()).collect();
            let prompt = build_extraction_prompt(&scene.content, &type_refs);

            // Enqueue request
            let (_req_id, rx) = enqueue(prompt, 512, Priority::Background, "entity_scan");

            // Wait for result
            match tokio::time::timeout(tokio::time::Duration::from_secs(120), rx).await {
                Ok(Ok(Ok(response))) => {
                    log::debug!(
                        "[bg-job] Szene {} verarbeitet: {} chars",
                        scene.title,
                        response.len()
                    );
                    // Entity-Parsing erfolgt interaktiv via EntitiesPanel im Frontend
                }
                Ok(Ok(Err(e))) => {
                    log::warn!("[bg-job] Fehler bei {}: {}", scene.title, e);
                }
                Ok(Err(_)) => {
                    log::warn!("[bg-job] Channel closed für {}", scene.title);
                }
                Err(_) => {
                    log::warn!("[bg-job] Timeout für {}", scene.title);
                }
            }
        }

        log::info!("[bg-job] EntityScan abgeschlossen");
    });

    Ok(job_id)
}

/// Start summarization of all scenes without summaries
#[tauri::command]
async fn start_summarize_all_scenes(state: State<'_, AppState>) -> Result<String, String> {
    use ai::entity_extraction::{build_scene_summary_prompt, parse_summary_response};
    use ai::queue::{enqueue, Priority};
    use uuid::Uuid;

    // Get DB path for later reconnection
    let db_path = {
        let path_lock = state.db_path.lock().map_err(|e| e.to_string())?;
        path_lock.clone().ok_or("No database path")?
    };

    // Fetch scenes without summaries
    let scenes: Vec<SceneData> = {
        let db_lock = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db_lock.as_ref().ok_or("Database not open")?;

        let mut stmt = conn
            .prepare(
                "SELECT s.id, s.title, s.content FROM scenes s 
             JOIN chapters c ON s.chapter_id = c.id 
             WHERE s.summary IS NULL OR s.summary = ''
             ORDER BY c.order_num, s.order_num",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok(SceneData {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    content: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                })
            })
            .map_err(|e| e.to_string())?;

        rows.filter_map(|r| r.ok()).collect()
    };

    let total = scenes.len();
    if total == 0 {
        return Ok("no_scenes_to_summarize".to_string());
    }

    let job_id = Uuid::new_v4().to_string();

    // Spawn background task
    tokio::spawn(async move {
        log::info!("[bg-job] SummarizeScenes gestartet: {} Szenen", total);

        // Open new DB connection for writes
        let write_conn = match rusqlite::Connection::open(&db_path) {
            Ok(c) => c,
            Err(e) => {
                log::error!("[bg-job] Kann DB nicht öffnen: {}", e);
                return;
            }
        };

        for (idx, scene) in scenes.iter().enumerate() {
            if scene.content.trim().len() < 50 {
                continue;
            }

            log::debug!(
                "[bg-job] Summarizing {}/{}: {}",
                idx + 1,
                total,
                scene.title
            );

            let prompt = build_scene_summary_prompt(&scene.title, &scene.content);
            let (_req_id, rx) = enqueue(prompt, 200, Priority::Background, "summarize_scene");

            match tokio::time::timeout(tokio::time::Duration::from_secs(60), rx).await {
                Ok(Ok(Ok(response))) => {
                    let summary = parse_summary_response(&response);

                    if let Err(e) = write_conn.execute(
                        "UPDATE scenes SET summary = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
                        rusqlite::params![summary, scene.id]
                    ) {
                        log::warn!("[bg-job] DB-Fehler für {}: {}", scene.title, e);
                    } else {
                        log::debug!("[bg-job] {} zusammengefasst", scene.title);
                    }
                }
                Ok(Ok(Err(e))) => log::warn!("[bg-job] Fehler bei {}: {}", scene.title, e),
                Ok(Err(_)) => log::warn!("[bg-job] Channel closed für {}", scene.title),
                Err(_) => log::warn!("[bg-job] Timeout für {}", scene.title),
            }
        }

        log::info!("[bg-job] SummarizeScenes abgeschlossen: {} Szenen", total);
    });

    Ok(job_id)
}

// ─────────────────────────────────────────────────────────────────────────────
// Support & Bug Reports
// ─────────────────────────────────────────────────────────────────────────────

use featherworks_author::support::{self, AppStateSnapshot, ReportCategory, SystemInfo};

/// Request für Bug Report
#[derive(serde::Deserialize)]
struct SubmitBugReportRequest {
    category: String,
    subject: String,
    description: String,
    email: Option<String>,
    #[serde(rename = "includeLogs")]
    include_logs: bool,
}

/// Sende einen Bug Report
#[tauri::command]
async fn submit_bug_report(
    req: SubmitBugReportRequest,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let category = match req.category.as_str() {
        "bug" => ReportCategory::Bug,
        "crash" => ReportCategory::Crash,
        "feature" => ReportCategory::FeatureRequest,
        "performance" => ReportCategory::Performance,
        "ui" => ReportCategory::Ui,
        "ai" => ReportCategory::Ai,
        _ => ReportCategory::Other,
    };

    // Sammle App-State
    let app_state_snapshot = {
        let db_lock = state.db.lock().ok();
        let path_lock = state.db_path.lock().ok();

        let project_open = db_lock.as_ref().and_then(|d| d.as_ref()).is_some();
        let project_path_hash = path_lock
            .as_ref()
            .and_then(|p| p.as_ref())
            .map(|p| support::hash_path(p));

        // Zähle Kapitel/Szenen falls Projekt offen
        let (chapter_count, scene_count) =
            if let Some(Some(conn)) = db_lock.as_ref().map(|d| d.as_ref()) {
                let chapters: i64 = conn
                    .query_row("SELECT COUNT(*) FROM chapters", [], |r| r.get(0))
                    .unwrap_or(0);
                let scenes: i64 = conn
                    .query_row("SELECT COUNT(*) FROM scenes", [], |r| r.get(0))
                    .unwrap_or(0);
                (Some(chapters as usize), Some(scenes as usize))
            } else {
                (None, None)
            };

        AppStateSnapshot {
            project_open,
            project_path_hash,
            chapter_count,
            scene_count,
            ai_model_loaded: ai::get_current_model().is_some(),
            ai_provider: Some(ai::stream::get_active_provider().provider_type),
            last_error: None,
        }
    };

    // Log-Verzeichnis
    let log_dir = app.path_resolver().app_log_dir();

    // App-Version
    let app_version = app.package_info().version.to_string();

    // Erstelle Report
    let report = support::create_report(
        category,
        req.subject,
        req.description,
        req.email,
        req.include_logs,
        log_dir.clone(),
        Some(app_state_snapshot),
        &app_version,
    );

    let report_id = report.id.clone();

    // Webhook-URL aus Umgebungsvariable (FEATHERWORKS_WEBHOOK_URL)
    let webhook_url = std::env::var("FEATHERWORKS_WEBHOOK_URL").ok();

    if let Some(url) = webhook_url {
        match support::send_report_webhook(&report, &url).await {
            Ok(()) => {
                log::info!("[support] Report {} per Webhook gesendet", report_id);
                return Ok(report_id);
            }
            Err(e) => {
                log::warn!("[support] Webhook fehlgeschlagen: {}, speichere lokal", e);
            }
        }
    }

    // Fallback: Lokal speichern
    if let Some(app_data_dir) = app.path_resolver().app_data_dir() {
        match support::save_report_locally(&report, app_data_dir) {
            Ok(path) => {
                log::info!("[support] Report gespeichert: {:?}", path);
                Ok(report_id)
            }
            Err(e) => Err(format!("Konnte Report nicht speichern: {}", e)),
        }
    } else {
        Err("Kein App-Verzeichnis verfügbar".to_string())
    }
}

/// Hole System-Informationen für Debug-Zwecke
#[tauri::command]
fn get_system_info() -> SystemInfo {
    SystemInfo::collect()
}

/// Öffne Support-Seite im Browser
#[tauri::command]
fn open_support_page() -> Result<(), String> {
    open::that("https://github.com/simonvandeloo/featherworks-author/issues")
        .map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// Lektorat Annotations Persistence Commands
// ─────────────────────────────────────────────────────────────────────────────

/// Speichere Lektorat-Annotationen für eine Szene
#[derive(serde::Deserialize)]
struct SaveLektoratAnnotationsRequest {
    #[serde(rename = "sceneId")]
    scene_id: String,
    annotations: Vec<LektoratAnnotationInput>,
}

#[derive(serde::Deserialize)]
struct LektoratAnnotationInput {
    id: String,
    line: i32,
    #[serde(rename = "startCol")]
    start_col: Option<i32>,
    #[serde(rename = "endCol")]
    end_col: Option<i32>,
    #[serde(rename = "type")]
    annotation_type: String,
    severity: String,
    message: String,
    suggestion: Option<String>,
    context: Option<String>,
    #[serde(rename = "textHash")]
    text_hash: Option<String>,
}

#[tauri::command]
fn save_lektorat_annotations(
    req: SaveLektoratAnnotationsRequest,
    state: State<AppState>,
) -> Result<usize, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;

    // Convert input to DB format
    let annotations: Vec<database::LektoratAnnotation> = req
        .annotations
        .iter()
        .map(|a| database::LektoratAnnotation {
            id: a.id.clone(),
            scene_id: req.scene_id.clone(),
            line: a.line,
            start_col: a.start_col,
            end_col: a.end_col,
            annotation_type: a.annotation_type.clone(),
            severity: a.severity.clone(),
            message: a.message.clone(),
            suggestion: a.suggestion.clone(),
            context: a.context.clone(),
            text_hash: a.text_hash.clone(),
            status: "active".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            dismissed_at: None,
        })
        .collect();

    database::save_lektorat_annotations(conn, &req.scene_id, &annotations)
        .map_err(|e| e.to_string())
}

/// Lade Lektorat-Annotationen für eine Szene
#[tauri::command]
fn load_lektorat_annotations(
    scene_id: String,
    state: State<AppState>,
) -> Result<Vec<database::LektoratAnnotation>, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;

    database::load_lektorat_annotations(conn, &scene_id).map_err(|e| e.to_string())
}

/// Dismissiere (erledigt/irrelevant) eine Annotation
#[derive(serde::Deserialize)]
struct DismissLektoratAnnotationRequest {
    #[serde(rename = "annotationId")]
    annotation_id: String,
    status: String, // "dismissed" or "resolved"
}

#[tauri::command]
fn dismiss_lektorat_annotation(
    req: DismissLektoratAnnotationRequest,
    state: State<AppState>,
) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;

    database::dismiss_lektorat_annotation(conn, &req.annotation_id, &req.status)
        .map_err(|e| e.to_string())
}

/// Lösche alle aktiven Annotationen für Re-Evaluation
#[tauri::command]
fn clear_scene_lektorat(scene_id: String, state: State<AppState>) -> Result<usize, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;

    database::clear_active_lektorat_annotations(conn, &scene_id).map_err(|e| e.to_string())
}

/// Speichere extrahierte Entity in die Datenbank
#[derive(serde::Deserialize)]
struct SaveExtractedEntityRequest {
    #[serde(rename = "typeId")]
    type_id: String,
    name: String,
    aliases: Vec<String>,
    description: String,
    notes: String,
}

#[derive(serde::Serialize)]
struct SaveExtractedEntityResponse {
    entity: database::Entity,
    was_updated: bool,
}

#[tauri::command]
fn save_extracted_entity(
    req: SaveExtractedEntityRequest,
    state: State<AppState>,
) -> Result<SaveExtractedEntityResponse, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;

    let aliases_str = req.aliases.join(", ");

    // Use upsert to avoid duplicates - updates existing entities if found
    let (entity, was_updated) = database::upsert_entity(
        conn,
        &req.type_id,
        &req.name,
        &aliases_str,
        &req.description,
        &req.notes,
        None, // color
        "{}", // metadata_json
    )
    .map_err(|e| e.to_string())?;

    Ok(SaveExtractedEntityResponse {
        entity,
        was_updated,
    })
}

// --- AI Commands ---
#[derive(serde::Deserialize)]
struct StartAiChatRequest {
    prompt: String,
}

#[tauri::command]
async fn start_ai_chat(req: StartAiChatRequest, app: tauri::AppHandle) -> Result<String, String> {
    stream::start_session(&app, req.prompt)
}

// --- Auto-Paragraph Command (ALWAYS uses local LLM, never API) ---
#[derive(serde::Deserialize)]
struct AutoParagraphRequest {
    #[serde(rename = "sceneContent")]
    scene_content: String,
    #[serde(rename = "useHeuristic")]
    use_heuristic: Option<bool>, // Force heuristic mode (no AI)
}

#[derive(serde::Serialize)]
struct AutoParagraphResult {
    #[serde(rename = "originalText")]
    original_text: String,
    #[serde(rename = "suggestedText")]
    suggested_text: String,
    #[serde(rename = "changeCount")]
    change_count: usize,
    success: bool,
    error: Option<String>,
    #[serde(rename = "usedHeuristic")]
    used_heuristic: bool, // Whether heuristic was used instead of AI
}

/// Check if the local AI model is available and ready
#[tauri::command]
fn check_ai_available() -> bool {
    ai::is_local_llm_ready()
}

#[tauri::command]
fn auto_paragraph_scene(req: AutoParagraphRequest) -> Result<AutoParagraphResult, String> {
    let original = req.scene_content.clone();
    let force_heuristic = req.use_heuristic.unwrap_or(false);

    // Check if local LLM is ready (unless heuristic is forced)
    let ai_available = if force_heuristic {
        false
    } else {
        // Use the new function that checks the actual loader state
        ai::is_local_llm_ready()
    };

    log::info!(
        "[auto-paragraph] force_heuristic={}, ai_available={}",
        force_heuristic,
        ai_available
    );

    // Use heuristic if AI not available or forced
    if !ai_available {
        log::info!("[auto-paragraph] Using heuristic mode (AI not available or forced)");
        return Ok(auto_paragraph_heuristic(&original));
    }

    // AI-based analysis
    log::info!("[auto-paragraph] Using AI mode");
    auto_paragraph_with_ai(&original)
}

/// Heuristic-based paragraph detection (no AI required)
fn auto_paragraph_heuristic(text: &str) -> AutoParagraphResult {
    // First, normalize existing paragraphs - preserve them but don't duplicate
    // Split by existing paragraph breaks (double newlines)
    let existing_paragraphs: Vec<&str> = text
        .split("\n\n")
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .collect();

    // If there are already multiple paragraphs, analyze each one separately
    // to avoid creating double breaks
    let mut result_paragraphs: Vec<String> = Vec::new();
    let mut total_new_breaks = 0;

    for para_text in &existing_paragraphs {
        let (processed, new_breaks) = process_paragraph_heuristic(para_text);
        result_paragraphs.push(processed);
        total_new_breaks += new_breaks;
    }

    let suggested = result_paragraphs.join("\n\n");

    log::info!(
        "[auto-paragraph/heuristic] Suggesting {} new paragraphs (existing: {})",
        total_new_breaks,
        existing_paragraphs.len().saturating_sub(1)
    );

    AutoParagraphResult {
        original_text: text.to_string(),
        suggested_text: suggested,
        change_count: total_new_breaks,
        success: true,
        error: None,
        used_heuristic: true,
    }
}

/// Process a single paragraph and return (processed text, number of new breaks)
fn process_paragraph_heuristic(text: &str) -> (String, usize) {
    let mut paragraph_positions: Vec<usize> = Vec::new();

    // Split into sentences
    let sentences: Vec<&str> = text
        .split_inclusive(|c| c == '.' || c == '!' || c == '?' || c == '"' || c == '»')
        .filter(|s| !s.trim().is_empty())
        .collect();

    if sentences.is_empty() || sentences.len() < 2 {
        return (text.to_string(), 0);
    }

    let mut chars_since_paragraph = 0;
    let mut last_was_dialogue = false;

    for (i, sentence) in sentences.iter().enumerate() {
        let trimmed = sentence.trim();
        chars_since_paragraph += trimmed.len();

        // Rule 1: Dialogue detection - new speaker likely means new paragraph
        let is_dialogue_start = trimmed.starts_with('"')
            || trimmed.starts_with('„')
            || trimmed.starts_with('»')
            || trimmed.starts_with("\"");
        let is_dialogue_end =
            trimmed.ends_with('"') || trimmed.ends_with('"') || trimmed.ends_with('«');

        // Rule 2: Speaker change in dialogue
        if is_dialogue_start && last_was_dialogue && i > 0 {
            paragraph_positions.push(i);
            chars_since_paragraph = trimmed.len();
        }

        // Rule 3: Time/place markers at sentence start
        let time_place_markers = [
            "später",
            "danach",
            "dann",
            "plötzlich",
            "währenddessen",
            "am nächsten",
            "einige zeit",
            "stunden später",
            "tage später",
            "draußen",
            "drinnen",
            "im",
            "in der",
            "in dem",
            "auf dem",
            "zurück",
            "meanwhile",
            "later",
            "suddenly",
            "outside",
            "inside",
            "the next",
            "hours later",
            "days later",
        ];
        let lower = trimmed.to_lowercase();
        for marker in &time_place_markers {
            if lower.starts_with(marker) && i > 0 && !paragraph_positions.contains(&i) {
                paragraph_positions.push(i);
                chars_since_paragraph = trimmed.len();
                break;
            }
        }

        // Rule 4: Long passage without paragraph (>500 chars) - break at next sentence end
        if chars_since_paragraph > 500 && i > 0 && !paragraph_positions.contains(&i) {
            if !is_dialogue_start && !last_was_dialogue {
                paragraph_positions.push(i);
                chars_since_paragraph = trimmed.len();
            }
        }

        // Rule 5: Scene break indicators
        let scene_break_markers = ["* * *", "***", "---", "—", "· · ·"];
        for marker in &scene_break_markers {
            if trimmed.contains(marker) && i > 0 && !paragraph_positions.contains(&i) {
                paragraph_positions.push(i);
                chars_since_paragraph = trimmed.len();
                break;
            }
        }

        last_was_dialogue = is_dialogue_end || (is_dialogue_start && !is_dialogue_end);
    }

    // Remove duplicates and sort
    paragraph_positions.sort();
    paragraph_positions.dedup();

    if paragraph_positions.is_empty() {
        return (text.to_string(), 0);
    }

    // Build new text with paragraphs inserted
    let mut result_parts: Vec<String> = Vec::new();
    for (i, sentence) in sentences.iter().enumerate() {
        if paragraph_positions.contains(&i) && i > 0 {
            result_parts.push("\n\n".to_string());
        }
        result_parts.push(sentence.to_string());
    }

    (
        result_parts.join("").trim().to_string(),
        paragraph_positions.len(),
    )
}

/// AI-based paragraph detection using local LLM
fn auto_paragraph_with_ai(text: &str) -> Result<AutoParagraphResult, String> {
    // Prepare numbered sentences for the prompt
    let sentences: Vec<&str> = text
        .split_inclusive(|c| c == '.' || c == '!' || c == '?' || c == '"' || c == '»')
        .filter(|s| !s.trim().is_empty())
        .collect();

    if sentences.is_empty() {
        return Ok(AutoParagraphResult {
            original_text: text.to_string(),
            suggested_text: text.to_string(),
            change_count: 0,
            success: true,
            error: None,
            used_heuristic: false,
        });
    }

    // Build numbered text for LLM
    let numbered_text: String = sentences
        .iter()
        .enumerate()
        .map(|(i, s)| format!("[{}] {}", i + 1, s.trim()))
        .collect::<Vec<_>>()
        .join("\n");

    let prompt = format!(
        r#"Du bist ein Lektor. Analysiere den folgenden Text und bestimme, wo Absätze gesetzt werden sollten.

Regeln für neue Absätze:
- Bei Sprecherwechsel im Dialog
- Bei Themenwechsel oder neuer Idee
- Bei Zeitsprüngen
- Bei Ortswechsel
- Bei Perspektivwechsel
- Nach längeren Beschreibungen vor neuer Handlung

Antworte NUR mit einer JSON-Liste der Satznummern, NACH denen ein Absatz kommen soll.
Beispiel: [3, 7, 12]
Wenn keine Absätze nötig sind, antworte: []

Text:
{}

Absätze nach Sätzen:"#,
        numbered_text
    );

    // FORCE local LLM - use generate_tokens_for_prompt directly
    log::info!(
        "[auto-paragraph/ai] Starting analysis with {} sentences",
        sentences.len()
    );
    let tokens = ai::generate_tokens_for_prompt(&prompt, 256);

    // Join tokens to get response
    let response: String = tokens.join("");
    log::info!("[auto-paragraph/ai] LLM response: {}", response);

    // Check for LLM errors - fall back to heuristic
    if response.starts_with("[LLM_ERROR:") {
        log::warn!("[auto-paragraph/ai] LLM error, falling back to heuristic");
        return Ok(auto_paragraph_heuristic(text));
    }

    // Parse JSON array from response
    let paragraph_positions: Vec<usize> = parse_paragraph_positions(&response);

    if paragraph_positions.is_empty() {
        return Ok(AutoParagraphResult {
            original_text: text.to_string(),
            suggested_text: text.to_string(),
            change_count: 0,
            success: true,
            error: None,
            used_heuristic: false,
        });
    }

    // Build new text with paragraphs inserted
    let mut result_parts: Vec<String> = Vec::new();
    for (i, sentence) in sentences.iter().enumerate() {
        result_parts.push(sentence.to_string());
        if paragraph_positions.contains(&(i + 1)) {
            result_parts.push("\n\n".to_string());
        }
    }

    let suggested = result_parts.join("").trim().to_string();
    let change_count = paragraph_positions.len();

    log::info!(
        "[auto-paragraph/ai] Suggesting {} new paragraphs",
        change_count
    );

    Ok(AutoParagraphResult {
        original_text: text.to_string(),
        suggested_text: suggested,
        change_count,
        success: true,
        error: None,
        used_heuristic: false,
    })
}

/// Parse paragraph positions from LLM response (expects JSON array like [3, 7, 12])
fn parse_paragraph_positions(response: &str) -> Vec<usize> {
    // Try to find JSON array in response
    let trimmed = response.trim();

    // Look for array pattern
    if let Some(start) = trimmed.find('[') {
        if let Some(end) = trimmed.rfind(']') {
            let array_str = &trimmed[start..=end];
            // Parse as JSON
            if let Ok(positions) = serde_json::from_str::<Vec<usize>>(array_str) {
                return positions;
            }
            // Try parsing with possible extra content
            let clean: String = array_str
                .chars()
                .filter(|c| c.is_numeric() || *c == ',' || *c == '[' || *c == ']')
                .collect();
            if let Ok(positions) = serde_json::from_str::<Vec<usize>>(&clean) {
                return positions;
            }
        }
    }

    Vec::new()
}

/// Set the active AI provider for streaming
#[derive(serde::Deserialize)]
struct SetActiveProviderRequest {
    provider: String,
    #[serde(rename = "claudeApiKey")]
    claude_api_key: Option<String>,
    #[serde(rename = "openaiApiKey")]
    openai_api_key: Option<String>,
    #[serde(rename = "claudeModel")]
    claude_model: Option<String>,
    #[serde(rename = "openaiModel")]
    openai_model: Option<String>,
}

#[tauri::command]
fn set_active_ai_provider(req: SetActiveProviderRequest) -> Result<(), String> {
    stream::set_active_provider(stream::ActiveProvider {
        provider_type: req.provider,
        claude_api_key: req.claude_api_key,
        openai_api_key: req.openai_api_key,
        claude_model: req.claude_model,
        openai_model: req.openai_model,
    });
    Ok(())
}

/// Build RAG context for Fontaine based on query and current scene
#[derive(serde::Deserialize)]
struct BuildContextRequest {
    query: String,
    #[serde(rename = "sceneId")]
    scene_id: Option<String>,
}

#[derive(serde::Serialize)]
struct ContextResponse {
    context: String,
    #[serde(rename = "entityCount")]
    entity_count: usize,
    #[serde(rename = "relevantSceneCount")]
    relevant_scene_count: usize,
    #[serde(rename = "totalChars")]
    total_chars: usize,
}

#[tauri::command]
fn build_fontaine_context(
    req: BuildContextRequest,
    state: tauri::State<AppState>,
) -> Result<ContextResponse, String> {
    let guard = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let conn = guard.as_ref().ok_or("No database open")?;

    let ctx = ai::context::build_context(conn, &req.query, req.scene_id.as_deref())?;

    Ok(ContextResponse {
        context: ctx.to_prompt_context(Some(&req.query)),
        entity_count: ctx.entities.len(),
        relevant_scene_count: ctx.relevant_scenes.len(),
        total_chars: ctx.total_chars,
    })
}

#[derive(serde::Deserialize)]
struct CancelAiChatRequest {
    id: String,
}

#[tauri::command]
fn cancel_ai_chat(req: CancelAiChatRequest) -> Result<bool, String> {
    Ok(stream::cancel_session(&req.id))
}

#[tauri::command]
fn set_ai_model(name: String) -> Result<(), String> {
    ai::set_current_model(&name);
    Ok(())
}

#[tauri::command]
fn get_ai_model() -> Result<Option<String>, String> {
    Ok(ai::get_current_model())
}

#[tauri::command]
fn list_ai_models(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let resource_dir = app.path_resolver().resource_dir();
    Ok(ai::list_local_models(resource_dir))
}

#[tauri::command]
fn load_ai_model(name: String, app: tauri::AppHandle) -> Result<bool, String> {
    let resource_dir = app.path_resolver().resource_dir();
    Ok(ai::begin_load(&name, resource_dir))
}

#[derive(serde::Serialize)]
struct AiModelState {
    state: String,
}

#[tauri::command]
fn get_ai_model_state() -> Result<AiModelState, String> {
    use ai::LoadState::*;
    let st = ai::current_load_state();
    let label = match &st {
        NotLoaded => "notLoaded",
        Loading => "loading",
        Ready => "ready",
        Error(e) => {
            return Ok(AiModelState {
                state: format!("error:{e}"),
            });
        }
    };
    Ok(AiModelState {
        state: label.to_string(),
    })
}

#[derive(serde::Serialize)]
struct AiModelProgress {
    progress: f32,
}

#[tauri::command]
fn get_ai_model_progress() -> Result<AiModelProgress, String> {
    Ok(AiModelProgress {
        progress: ai::current_progress().unwrap_or(0.0),
    })
}

#[derive(serde::Serialize)]
struct AiServerStatus {
    running: bool,
}

/// Whether the resident MLX server is up. When false, inference still works
/// via a per-request subprocess, just slower.
#[tauri::command]
fn get_ai_server_status() -> Result<AiServerStatus, String> {
    Ok(AiServerStatus {
        running: ai::server::is_running(),
    })
}

/// Stops the resident server, freeing several GB of memory. The next request
/// falls back to the subprocess path; reloading the model starts it again.
#[tauri::command]
fn stop_ai_server() -> Result<(), String> {
    ai::server::stop();
    Ok(())
}

// --- AI Provider Settings ---

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct AiProviderSettings {
    provider: String, // "local", "claude", "openai"
    claude_api_key: Option<String>,
    openai_api_key: Option<String>,
    claude_model: Option<String>,
    openai_model: Option<String>,
    #[serde(default = "default_ai_enabled")]
    enabled: bool,
}

fn default_ai_enabled() -> bool {
    true
}

impl Default for AiProviderSettings {
    fn default() -> Self {
        Self {
            provider: "local".to_string(),
            claude_api_key: None,
            openai_api_key: None,
            claude_model: Some("claude-3-5-sonnet-20241022".to_string()),
            openai_model: Some("gpt-4o".to_string()),
            enabled: true,
        }
    }
}

fn get_provider_settings_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    let config_dir = app
        .path_resolver()
        .app_config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    config_dir.join("ai_provider_settings.json")
}

#[tauri::command]
fn get_ai_provider_settings(app: tauri::AppHandle) -> Result<AiProviderSettings, String> {
    let path = get_provider_settings_path(&app);
    if path.exists() {
        let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(AiProviderSettings::default())
    }
}

#[tauri::command]
fn save_ai_provider_settings(
    settings: AiProviderSettings,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let path = get_provider_settings_path(&app);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn test_ai_provider_connection(provider: String, api_key: String) -> Result<bool, String> {
    match provider.as_str() {
        "claude" => {
            let client = reqwest::Client::new();
            let resp = client
                .get("https://api.anthropic.com/v1/models")
                .header("x-api-key", &api_key)
                .header("anthropic-version", "2023-06-01")
                .send()
                .await
                .map_err(|e| e.to_string())?;
            Ok(resp.status().is_success())
        }
        "openai" => {
            let client = reqwest::Client::new();
            let resp = client
                .get("https://api.openai.com/v1/models")
                .header("Authorization", format!("Bearer {}", api_key))
                .send()
                .await
                .map_err(|e| e.to_string())?;
            Ok(resp.status().is_success())
        }
        _ => Err("Unknown provider".to_string()),
    }
}

// --- Hardware Detection & Model Registry ---

/// Hardware capabilities response for frontend
#[derive(serde::Serialize)]
struct HardwareInfoResponse {
    total_ram_gb: f32,
    available_ram_gb: f32,
    has_metal: bool,
    has_cuda: bool,
    cpu_cores: usize,
    cpu_brand: String,
    recommended_model: String,
    can_run_large_model: bool,
}

/// Detect system hardware capabilities for model selection
#[tauri::command]
fn detect_hardware() -> Result<HardwareInfoResponse, String> {
    let caps = hardware::HardwareInfo::detect();
    Ok(HardwareInfoResponse {
        total_ram_gb: caps.total_ram_mb as f32 / 1024.0,
        available_ram_gb: caps.available_ram_mb as f32 / 1024.0,
        has_metal: caps.has_metal,
        has_cuda: caps.has_cuda,
        cpu_cores: caps.cpu_cores,
        cpu_brand: caps.cpu_brand,
        recommended_model: caps.recommended_model,
        can_run_large_model: caps.can_run_large_model,
    })
}

/// Model info for frontend
#[derive(serde::Serialize)]
struct ModelRegistryEntry {
    id: String,
    name: String,
    quantization: String,
    size_bytes: u64,
    ram_required_mb: u32,
    is_bundled: bool,
    download_url: Option<String>,
}

/// List all available models from registry
#[tauri::command]
fn list_model_registry() -> Result<Vec<ModelRegistryEntry>, String> {
    Ok(registry::REGISTRY
        .iter()
        .map(|m| ModelRegistryEntry {
            id: m.id.to_string(),
            name: m.name.to_string(),
            quantization: m.quantization.to_string(),
            size_bytes: m.size_bytes,
            ram_required_mb: m.ram_required_mb,
            is_bundled: m.is_bundled,
            download_url: m.download_url.map(|s| s.to_string()),
        })
        .collect())
}

/// Check if a specific model file exists locally
#[tauri::command]
fn check_model_exists(model_id: String, app: tauri::AppHandle) -> Result<bool, String> {
    let Some(info) = registry::find(&model_id) else {
        return Err(format!("Unknown model: {}", model_id));
    };
    let resource_dir = app.path_resolver().resource_dir();
    if let Some(dir) = resource_dir {
        let path = dir.join(info.file);
        return Ok(path.exists());
    }
    Ok(false)
}

// --- Model Download Commands ---

/// Download progress response
#[derive(serde::Serialize)]
struct DownloadProgressResponse {
    model_id: String,
    status: String,
    bytes_downloaded: u64,
    bytes_total: u64,
    percent: f32,
    speed_mbps: f32,
    eta_seconds: u64,
}

/// Start downloading a model
#[tauri::command]
async fn start_model_download(model_id: String) -> Result<(), String> {
    // Check hardware requirements first
    let hw = hardware::HardwareInfo::detect();
    let info = registry::find(&model_id).ok_or_else(|| format!("Unknown model: {}", model_id))?;

    // Check if model requires more RAM than available
    if info.ram_required_mb as u64 > hw.total_ram_mb {
        return Err(format!(
            "Insufficient RAM: {} requires {}MB, but only {}MB available",
            info.name, info.ram_required_mb, hw.total_ram_mb
        ));
    }

    // Start async download
    tokio::spawn(async move {
        match downloader::start_download(&model_id).await {
            Ok(path) => log::info!("[download] Model saved to: {:?}", path),
            Err(e) => log::error!("[download] Failed: {}", e),
        }
    });

    Ok(())
}

/// Get current download progress
#[tauri::command]
fn get_download_progress() -> Result<Option<DownloadProgressResponse>, String> {
    Ok(
        downloader::get_progress().map(|p| DownloadProgressResponse {
            model_id: p.model_id,
            status: match p.status {
                downloader::DownloadStatus::Idle => "idle".to_string(),
                downloader::DownloadStatus::Downloading => "downloading".to_string(),
                downloader::DownloadStatus::Verifying => "verifying".to_string(),
                downloader::DownloadStatus::Complete => "complete".to_string(),
                downloader::DownloadStatus::Failed(msg) => format!("error:{}", msg),
                downloader::DownloadStatus::Cancelled => "cancelled".to_string(),
            },
            bytes_downloaded: p.bytes_downloaded,
            bytes_total: p.bytes_total,
            percent: p.percent,
            speed_mbps: p.speed_bps as f32 / 1_000_000.0,
            eta_seconds: p.eta_seconds,
        }),
    )
}

/// Cancel current download
#[tauri::command]
fn cancel_model_download() -> Result<bool, String> {
    Ok(downloader::cancel_download())
}

/// Check if a model is available (bundled or downloaded)
#[tauri::command]
fn is_model_available(model_id: String, app: tauri::AppHandle) -> Result<bool, String> {
    let resource_dir = app.path_resolver().resource_dir();
    Ok(downloader::get_model_path(&model_id, resource_dir).is_some())
}

/// Detailed model info with download status
#[derive(serde::Serialize)]
struct ModelDetailedInfo {
    id: String,
    name: String,
    size_bytes: u64,
    size_display: String,
    ram_required_mb: u32,
    quantization: String,
    is_downloaded: bool,
    is_downloading: bool,
    download_url: Option<String>,
}

/// Get all models with detailed status
#[tauri::command]
fn get_models_with_status(app: tauri::AppHandle) -> Vec<ModelDetailedInfo> {
    let resource_dir = app.path_resolver().resource_dir();

    registry::REGISTRY
        .iter()
        .map(|m| {
            let is_downloaded = downloader::get_model_path(m.id, resource_dir.clone()).is_some();
            let is_downloading = downloader::get_progress()
                .map(|p| {
                    p.model_id == m.id
                        && matches!(p.status, downloader::DownloadStatus::Downloading)
                })
                .unwrap_or(false);

            // Format size nicely
            let size_display = if m.size_bytes >= 1_000_000_000 {
                format!("{:.1} GB", m.size_bytes as f64 / 1_000_000_000.0)
            } else {
                format!("{:.0} MB", m.size_bytes as f64 / 1_000_000.0)
            };

            ModelDetailedInfo {
                id: m.id.to_string(),
                name: m.name.to_string(),
                size_bytes: m.size_bytes,
                size_display,
                ram_required_mb: m.ram_required_mb,
                quantization: m.quantization.to_string(),
                is_downloaded,
                is_downloading,
                download_url: m.download_url.map(|s| s.to_string()),
            }
        })
        .collect()
}

/// Delete a downloaded model
#[tauri::command]
fn delete_downloaded_model(model_id: String) -> Result<(), String> {
    let models_dir = downloader::get_models_dir().map_err(|e| e.to_string())?;

    // Try both possible filenames
    let paths = vec![
        models_dir.join(format!("{}.gguf", model_id)),
        models_dir.join(format!("{}.gguf.partial", model_id)),
    ];

    for path in paths {
        if path.exists() {
            std::fs::remove_file(&path).map_err(|e| e.to_string())?;
            log::info!("[delete_model] Deleted: {:?}", path);
        }
    }

    Ok(())
}

#[tauri::command]
fn get_ai_settings(
    state: State<AppState>,
) -> Result<featherworks_author::storage::database::AiSettings, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_lock.as_ref().ok_or("Database not open")?;
    featherworks_author::storage::database::load_ai_settings(conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_ai_settings_cmd(
    settings: featherworks_author::storage::database::AiSettings,
    state: State<AppState>,
) -> Result<(), String> {
    let mut db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_lock.as_mut().ok_or("Database not open")?;
    featherworks_author::storage::database::save_ai_settings(conn, &settings)
        .map_err(|e| e.to_string())
}

/// Restart the app to apply language changes (rebuilds native menu)
#[tauri::command]
fn restart_app(app: tauri::AppHandle) -> Result<(), String> {
    println!("[restart_app] Restarting application for language change...");
    tauri::api::process::restart(&app.env());
    #[allow(unreachable_code)]
    Ok(())
}

/// Get language preference from config file
#[tauri::command]
fn get_app_language() -> String {
    if let Some(config_dir) = dirs::config_dir() {
        let lang_file = config_dir.join("featherworks-author").join("language.txt");
        if let Ok(content) = std::fs::read_to_string(&lang_file) {
            let lang = content.trim().to_string();
            println!("[get_app_language] Loaded language: {}", lang);
            return lang;
        }
    }
    println!("[get_app_language] No language file found, defaulting to 'en'");
    "en".to_string()
}

/// Save language preference to config file (read by build_menu on next start)
#[tauri::command]
fn set_app_language(lang: String) -> Result<(), String> {
    println!("[set_app_language] Setting language to: {}", lang);
    if let Some(config_dir) = dirs::config_dir() {
        let app_config_dir = config_dir.join("featherworks-author");
        std::fs::create_dir_all(&app_config_dir).map_err(|e| e.to_string())?;
        let lang_file = app_config_dir.join("language.txt");
        std::fs::write(&lang_file, &lang).map_err(|e| e.to_string())?;
        println!("[set_app_language] Saved to: {:?}", lang_file);
    }
    Ok(())
}

// --- User Profile ---

/// User profile stored in config
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, Default)]
pub struct UserProfile {
    pub name: Option<String>,
    pub onboarding_completed: bool,
}

/// Get user profile from config file
#[tauri::command]
fn get_user_profile() -> UserProfile {
    if let Some(config_dir) = dirs::config_dir() {
        let profile_file = config_dir.join("featherworks-author").join("profile.json");
        if let Ok(content) = std::fs::read_to_string(&profile_file) {
            if let Ok(profile) = serde_json::from_str::<UserProfile>(&content) {
                return profile;
            }
        }
    }
    UserProfile::default()
}

/// Save user profile to config file
#[tauri::command]
fn save_user_profile(profile: UserProfile) -> Result<(), String> {
    if let Some(config_dir) = dirs::config_dir() {
        let app_config_dir = config_dir.join("featherworks-author");
        std::fs::create_dir_all(&app_config_dir).map_err(|e| e.to_string())?;
        let profile_file = app_config_dir.join("profile.json");
        let json = serde_json::to_string_pretty(&profile).map_err(|e| e.to_string())?;
        std::fs::write(&profile_file, json).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Pacing Settings for Smart Pacing Widget
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct PacingSettings {
    pub chapter_goal: u32,
    pub daily_goal: u32,
    pub daily_goal_unit: String, // "words", "characters", "minutes"
    pub ring_target: String,     // "scene" or "chapter"
    pub show_total_always: bool,
    pub genre: String,
}

impl Default for PacingSettings {
    fn default() -> Self {
        Self {
            chapter_goal: 2500,
            daily_goal: 500,
            daily_goal_unit: "words".to_string(),
            ring_target: "scene".to_string(),
            show_total_always: false,
            genre: "literary".to_string(),
        }
    }
}

/// Get pacing settings from config file
#[tauri::command]
fn get_pacing_settings() -> PacingSettings {
    if let Some(config_dir) = dirs::config_dir() {
        let pacing_file = config_dir.join("featherworks-author").join("pacing.json");
        if let Ok(content) = std::fs::read_to_string(&pacing_file) {
            if let Ok(settings) = serde_json::from_str::<PacingSettings>(&content) {
                println!("[get_pacing_settings] Loaded settings");
                return settings;
            }
        }
    }
    println!("[get_pacing_settings] Using defaults");
    PacingSettings::default()
}

/// Save pacing settings to config file
#[tauri::command]
fn save_pacing_settings(settings: PacingSettings) -> Result<(), String> {
    println!("[save_pacing_settings] Saving: {:?}", settings);
    if let Some(config_dir) = dirs::config_dir() {
        let app_config_dir = config_dir.join("featherworks-author");
        std::fs::create_dir_all(&app_config_dir).map_err(|e| e.to_string())?;
        let pacing_file = app_config_dir.join("pacing.json");
        let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
        std::fs::write(&pacing_file, json).map_err(|e| e.to_string())?;
        println!("[save_pacing_settings] Saved to: {:?}", pacing_file);
    }
    Ok(())
}

// ============================================================================
// Entity System Commands
// ============================================================================

#[tauri::command]
fn list_entity_types(state: State<AppState>) -> Result<Vec<database::EntityType>, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    database::list_entity_types(conn).map_err(|e| e.to_string())
}

#[derive(serde::Deserialize)]
struct CreateEntityTypeRequest {
    name: String,
    name_plural: String,
    icon: String,
    default_color: String,
}

#[tauri::command]
fn create_entity_type(
    req: CreateEntityTypeRequest,
    state: State<AppState>,
) -> Result<database::EntityType, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    database::create_entity_type(
        conn,
        &req.name,
        &req.name_plural,
        &req.icon,
        &req.default_color,
    )
    .map_err(|e| e.to_string())
}

#[derive(serde::Deserialize)]
struct UpdateEntityTypeRequest {
    type_id: String,
    name: String,
    name_plural: String,
    icon: String,
    default_color: String,
    #[serde(default)]
    schema_json: String,
}

#[tauri::command]
fn update_entity_type(req: UpdateEntityTypeRequest, state: State<AppState>) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    let schema = if req.schema_json.is_empty() {
        "[]"
    } else {
        &req.schema_json
    };
    database::update_entity_type(
        conn,
        &req.type_id,
        &req.name,
        &req.name_plural,
        &req.icon,
        &req.default_color,
        schema,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn update_entity_type_schema(
    type_id: String,
    schema_json: String,
    state: State<AppState>,
) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    database::update_entity_type_schema(conn, &type_id, &schema_json).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_entity_type(type_id: String, state: State<AppState>) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    database::delete_entity_type(conn, &type_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_entities(
    type_id: Option<String>,
    state: State<AppState>,
) -> Result<Vec<database::Entity>, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    database::list_entities(conn, type_id.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_entity(id: String, state: State<AppState>) -> Result<Option<database::Entity>, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    database::get_entity(conn, &id).map_err(|e| e.to_string())
}

#[derive(serde::Deserialize)]
struct CreateEntityRequest {
    type_id: String,
    name: String,
    #[serde(default)]
    aliases: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    notes: String,
    color: Option<String>,
    #[serde(default = "default_metadata")]
    metadata_json: String,
}

fn default_metadata() -> String {
    "{}".to_string()
}

#[tauri::command]
fn create_entity(
    req: CreateEntityRequest,
    state: State<AppState>,
) -> Result<database::Entity, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    database::create_entity(
        conn,
        &req.type_id,
        &req.name,
        &req.aliases,
        &req.description,
        &req.notes,
        req.color.as_deref(),
        &req.metadata_json,
    )
    .map_err(|e| e.to_string())
}

#[derive(serde::Deserialize)]
struct UpdateEntityRequest {
    id: String,
    name: String,
    #[serde(default)]
    aliases: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    notes: String,
    color: Option<String>,
    #[serde(default = "default_metadata")]
    metadata_json: String,
}

#[tauri::command]
fn update_entity(req: UpdateEntityRequest, state: State<AppState>) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    database::update_entity(
        conn,
        &req.id,
        &req.name,
        &req.aliases,
        &req.description,
        &req.notes,
        req.color.as_deref(),
        &req.metadata_json,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_entity(id: String, state: State<AppState>) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    database::delete_entity(conn, &id).map_err(|e| e.to_string())
}

// ===== Entity Images =====

/// List images for an entity (metadata only)
#[tauri::command]
fn list_entity_images(
    entity_id: String,
    state: State<AppState>,
) -> Result<Vec<database::EntityImageMeta>, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    database::list_entity_images(conn, &entity_id).map_err(|e| e.to_string())
}

/// Get a single image with data as base64
#[tauri::command]
fn get_entity_image(image_id: String, state: State<AppState>) -> Result<EntityImageData, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    let image = database::get_entity_image(conn, &image_id).map_err(|e| e.to_string())?;

    use base64::{engine::general_purpose::STANDARD, Engine as _};
    let base64_data = STANDARD.encode(&image.data);

    Ok(EntityImageData {
        id: image.id,
        entity_id: image.entity_id,
        name: image.name,
        file_name: image.file_name,
        mime_type: image.mime_type.clone(),
        data_url: format!("data:{};base64,{}", image.mime_type, base64_data),
        order_num: image.order_num,
        created_at: image.created_at,
    })
}

#[derive(serde::Serialize)]
struct EntityImageData {
    id: String,
    entity_id: String,
    name: String,
    file_name: String,
    mime_type: String,
    data_url: String, // data:image/png;base64,... for direct use in <img src>
    order_num: i32,
    created_at: String,
}

#[derive(serde::Deserialize)]
struct AddEntityImageRequest {
    entity_id: String,
    name: String,
    file_name: String,
    mime_type: String,
    base64_data: String, // Base64-encoded image data
}

/// Add an image to an entity (max 3 per entity)
#[tauri::command]
fn add_entity_image(
    req: AddEntityImageRequest,
    state: State<AppState>,
) -> Result<database::EntityImageMeta, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;

    // Check max images limit (3)
    let count = database::count_entity_images(conn, &req.entity_id).map_err(|e| e.to_string())?;
    if count >= 3 {
        return Err("Maximum 3 images per entity allowed".to_string());
    }

    // Decode base64 data
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    let data = STANDARD
        .decode(&req.base64_data)
        .map_err(|e| format!("Invalid base64 data: {}", e))?;

    // Limit file size (5MB)
    if data.len() > 5 * 1024 * 1024 {
        return Err("Image too large (max 5MB)".to_string());
    }

    database::add_entity_image(
        conn,
        &req.entity_id,
        &req.name,
        &req.file_name,
        &req.mime_type,
        &data,
    )
    .map_err(|e| e.to_string())
}

/// Update an image's name
#[tauri::command]
fn update_entity_image_name(
    image_id: String,
    name: String,
    state: State<AppState>,
) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    database::update_entity_image_name(conn, &image_id, &name).map_err(|e| e.to_string())
}

/// Delete an image
#[tauri::command]
fn delete_entity_image(image_id: String, state: State<AppState>) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    database::delete_entity_image(conn, &image_id).map_err(|e| e.to_string())
}

/// Get all entity names for editor highlighting
/// Returns: Vec<{id, type_id, name, aliases, color}>
#[tauri::command]
fn get_entity_highlights(state: State<AppState>) -> Result<Vec<EntityHighlight>, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    let raw = database::get_entity_names_for_highlighting(conn).map_err(|e| e.to_string())?;
    Ok(raw
        .into_iter()
        .map(|(id, type_id, name, aliases, color)| EntityHighlight {
            id,
            type_id,
            name,
            aliases,
            color,
        })
        .collect())
}

#[derive(serde::Serialize)]
struct EntityHighlight {
    id: String,
    type_id: String,
    name: String,
    aliases: String,
    color: String,
}

// ===== RAG Documents =====

#[tauri::command]
fn list_rag_documents(state: State<AppState>) -> Result<Vec<database::RagDocument>, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    database::list_rag_documents(conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn import_rag_document(
    path: String,
    state: State<AppState>,
) -> Result<database::RagDocument, String> {
    use ai::chunking::chunk_rag_document;
    use ai::extraction::extract_text;

    // Extract text from document
    let extracted = extract_text(&path)?;

    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;

    // Save the document
    let doc = database::add_rag_document(
        conn,
        &extracted.file_name,
        &extracted.file_type,
        extracted.file_size as i64,
        &extracted.content,
    )
    .map_err(|e| e.to_string())?;

    // Create chunks for RAG
    let chunks = chunk_rag_document(&doc.id, &extracted.file_name, &extracted.content);

    // Save chunks to database
    database::save_chunks(conn, &chunks).map_err(|e| e.to_string())?;

    log::info!(
        "Imported RAG document '{}' with {} chunks",
        extracted.file_name,
        chunks.len()
    );

    Ok(doc)
}

#[tauri::command]
fn remove_rag_document(id: String, state: State<AppState>) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;

    // Delete chunks first
    database::delete_chunks_by_source(conn, &id).map_err(|e| e.to_string())?;

    // Then delete the document
    database::remove_rag_document(conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_all_rag_data(state: State<AppState>) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;

    // Delete all chunks
    conn.execute("DELETE FROM rag_chunks", [])
        .map_err(|e| e.to_string())?;

    // Delete all documents
    conn.execute("DELETE FROM rag_documents", [])
        .map_err(|e| e.to_string())?;

    log::info!("Cleared all RAG data");
    Ok(())
}

// ============================================================================
// Plot System Commands
// ============================================================================

#[tauri::command]
fn list_subplots(state: State<AppState>) -> Result<Vec<plot::Subplot>, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    plot::list_subplots(conn)
}

#[tauri::command]
fn create_subplot(
    name: String,
    color: String,
    state: State<AppState>,
) -> Result<plot::Subplot, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    plot::create_subplot(conn, &name, &color)
}

#[tauri::command]
fn update_subplot(
    id: String,
    name: String,
    description: String,
    color: String,
    state: State<AppState>,
) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    plot::update_subplot(conn, &id, &name, &description, &color)
}

#[tauri::command]
fn delete_subplot(id: String, state: State<AppState>) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    plot::delete_subplot(conn, &id)
}

#[tauri::command]
fn reorder_subplots(ids: Vec<String>, state: State<AppState>) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    plot::reorder_subplots(conn, &ids)
}

#[tauri::command]
fn list_plot_points(state: State<AppState>) -> Result<Vec<plot::PlotPoint>, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    plot::list_plot_points(conn)
}

#[tauri::command]
fn create_plot_point(
    subplot_id: Option<String>,
    title: String,
    position_percent: f64,
    state: State<AppState>,
) -> Result<plot::PlotPoint, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    plot::create_plot_point(conn, subplot_id.as_deref(), &title, position_percent)
}

#[tauri::command]
fn update_plot_point(
    id: String,
    title: String,
    description: String,
    subplot_id: Option<String>,
    position_percent: f64,
    structure_position: Option<String>,
    status: String,
    state: State<AppState>,
) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    plot::update_plot_point(
        conn,
        &id,
        &title,
        &description,
        subplot_id.as_deref(),
        position_percent,
        structure_position.as_deref(),
        &status,
    )
}

#[tauri::command]
fn delete_plot_point(id: String, state: State<AppState>) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    plot::delete_plot_point(conn, &id)
}

#[tauri::command]
fn move_plot_point(
    id: String,
    new_position_percent: f64,
    state: State<AppState>,
) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    plot::move_plot_point(conn, &id, new_position_percent)
}

#[tauri::command]
fn reorder_plot_points(ids: Vec<String>, state: State<AppState>) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    plot::reorder_plot_points(conn, &ids)
}

#[tauri::command]
fn link_scene_to_plot(
    plot_point_id: String,
    scene_id: String,
    state: State<AppState>,
) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    plot::link_scene_to_plot(conn, &plot_point_id, &scene_id)
}

#[tauri::command]
fn unlink_scene_from_plot(
    plot_point_id: String,
    scene_id: String,
    state: State<AppState>,
) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    plot::unlink_scene_from_plot(conn, &plot_point_id, &scene_id)
}

#[tauri::command]
fn get_scenes_for_plot_point(
    plot_point_id: String,
    state: State<AppState>,
) -> Result<Vec<String>, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    plot::get_scenes_for_plot_point(conn, &plot_point_id)
}

#[tauri::command]
fn get_plot_points_for_scene(
    scene_id: String,
    state: State<AppState>,
) -> Result<Vec<String>, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    plot::get_plot_points_for_scene(conn, &scene_id)
}

// ============================================================================
// Research System Commands
// ============================================================================

#[tauri::command]
fn list_research_folders(state: State<AppState>) -> Result<Vec<research::ResearchFolder>, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    research::list_research_folders(conn)
}

#[tauri::command]
fn create_research_folder(
    name: String,
    parent_id: Option<String>,
    state: State<AppState>,
) -> Result<research::ResearchFolder, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    research::create_research_folder(conn, &name, parent_id.as_deref())
}

#[tauri::command]
fn update_research_folder(id: String, name: String, state: State<AppState>) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    research::update_research_folder(conn, &id, &name)
}

#[tauri::command]
fn move_research_folder(
    id: String,
    new_parent_id: Option<String>,
    state: State<AppState>,
) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    research::move_research_folder(conn, &id, new_parent_id.as_deref())
}

#[tauri::command]
fn delete_research_folder(id: String, state: State<AppState>) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    research::delete_research_folder(conn, &id)
}

#[tauri::command]
fn list_research_items(
    folder_id: Option<String>,
    state: State<AppState>,
) -> Result<Vec<research::ResearchItem>, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    research::list_research_items(conn, folder_id.as_deref())
}

#[tauri::command]
fn create_research_item(
    folder_id: Option<String>,
    item_type: String,
    title: String,
    content: String,
    source_url: Option<String>,
    state: State<AppState>,
) -> Result<research::ResearchItem, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    let item_type_enum: research::ResearchItemType = item_type.parse().map_err(|e: String| e)?;
    research::create_research_item(
        conn,
        folder_id.as_deref(),
        item_type_enum,
        &title,
        &content,
        source_url.as_deref(),
    )
}

#[tauri::command]
fn create_research_file(
    folder_id: Option<String>,
    item_type: String,
    title: String,
    file_name: String,
    mime_type: String,
    file_data: String, // Base64 encoded
    state: State<AppState>,
) -> Result<research::ResearchItem, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    let item_type_enum: research::ResearchItemType = item_type.parse().map_err(|e: String| e)?;

    // Decode base64
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    let bytes = STANDARD
        .decode(&file_data)
        .map_err(|e| format!("Failed to decode file data: {}", e))?;

    research::create_research_file(
        conn,
        folder_id.as_deref(),
        item_type_enum,
        &title,
        &file_name,
        &mime_type,
        &bytes,
        None, // extracted_text
    )
}

#[tauri::command]
fn get_research_file_data(id: String, state: State<AppState>) -> Result<String, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;

    let (_file_name, _mime_type, bytes) = research::get_research_file_data(conn, &id)?;

    // Encode to base64 for transport
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    Ok(STANDARD.encode(&bytes))
}

#[tauri::command]
fn update_research_item(
    id: String,
    title: String,
    content: String,
    source_url: Option<String>,
    tags: Vec<String>,
    state: State<AppState>,
) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    research::update_research_item(conn, &id, &title, &content, source_url.as_deref(), &tags)
}

#[tauri::command]
fn move_research_item(
    id: String,
    new_folder_id: Option<String>,
    state: State<AppState>,
) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    research::move_research_item(conn, &id, new_folder_id.as_deref())
}

#[tauri::command]
fn delete_research_item(id: String, state: State<AppState>) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    research::delete_research_item(conn, &id)
}

#[tauri::command]
fn save_research_extracted_facts(
    id: String,
    facts_json: String,
    state: State<AppState>,
) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    research::save_extracted_facts(conn, &id, &facts_json)
}

#[tauri::command]
fn search_research(
    query: String,
    state: State<AppState>,
) -> Result<Vec<research::ResearchItem>, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    research::search_research(conn, &query)
}

// ============================================================================
// Layout & Export Commands
// ============================================================================

#[tauri::command]
fn get_layout_settings(state: State<AppState>) -> Result<layout::LayoutSettings, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    layout::get_layout_settings(conn)
}

#[tauri::command]
fn save_layout_settings(
    settings: layout::LayoutSettings,
    state: State<AppState>,
) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    layout::save_layout_settings(conn, &settings)
}

#[tauri::command]
fn list_layout_presets(state: State<AppState>) -> Result<Vec<layout::LayoutPreset>, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    layout::list_layout_presets(conn)
}

#[tauri::command]
fn save_layout_preset(
    name: String,
    description: String,
    settings: layout::LayoutSettings,
    state: State<AppState>,
) -> Result<layout::LayoutPreset, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    layout::save_layout_preset(conn, &name, &description, &settings)
}

#[tauri::command]
fn delete_layout_preset(id: String, state: State<AppState>) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    layout::delete_layout_preset(conn, &id)
}

#[derive(serde::Deserialize)]
struct ExportChapter {
    title: String,
    scenes: Vec<ExportScene>,
}

#[derive(serde::Deserialize)]
struct ExportScene {
    title: String,
    content: String,
}

#[tauri::command]
fn export_manuscript_epub(
    chapters: Vec<ExportChapter>,
    output_path: String,
    title: String,
    author: String,
    state: State<AppState>,
) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    let settings = layout::get_layout_settings(conn)?;

    let chapters: Vec<layout::ChapterContent> = chapters
        .into_iter()
        .map(|c| layout::ChapterContent {
            title: c.title,
            scenes: c
                .scenes
                .into_iter()
                .map(|s| layout::SceneContent {
                    title: s.title,
                    content: s.content,
                })
                .collect(),
        })
        .collect();

    layout::export_to_epub(
        &chapters,
        std::path::Path::new(&output_path),
        &title,
        &author,
        &settings,
        None,
    )
}

/// Render the manuscript to a temp PDF for the preview window and return the path
#[tauri::command]
fn render_preview_pdf(
    chapters: Vec<ExportChapter>,
    title: String,
    author: String,
    state: State<AppState>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    let settings = layout::get_layout_settings(conn)?;

    let chapters: Vec<layout::ChapterContent> = chapters
        .into_iter()
        .map(|c| layout::ChapterContent {
            title: c.title,
            scenes: c
                .scenes
                .into_iter()
                .map(|s| layout::SceneContent {
                    title: s.title,
                    content: s.content,
                })
                .collect(),
        })
        .collect();

    let typst_content = layout::manuscript_to_typst(&chapters, &settings, &title, &author);

    // Write to a temp directory inside app cache
    let cache_dir = app_handle
        .path_resolver()
        .app_cache_dir()
        .ok_or("Could not resolve app cache dir")?;
    let preview_dir = cache_dir.join("preview");
    std::fs::create_dir_all(&preview_dir).map_err(|e| format!("mkdir failed: {e}"))?;
    let pdf_path = preview_dir.join("preview.pdf");

    layout::export_to_pdf(&typst_content, &pdf_path)?;

    Ok(pdf_path.to_string_lossy().to_string())
}

/// Open or focus the preview window and render PDF preview
#[tauri::command]
fn open_preview_window(app_handle: tauri::AppHandle, state: State<AppState>) -> Result<(), String> {
    use tauri::Manager;
    println!("[preview] open_preview_window called");

    // First, render the preview PDF
    let pdf_path = {
        let guard = state.db.lock().unwrap();
        let conn = guard.as_ref().ok_or("No project open")?;

        // Get project metadata
        let project = database::get_project(conn).map_err(|e| e.to_string())?;
        let title = project.title.clone();
        let author = project.author.clone();

        // Get all chapters and scenes
        let chapters = database::list_chapters(conn).map_err(|e| e.to_string())?;
        let mut chapter_contents: Vec<layout::ChapterContent> = Vec::new();

        for chapter in chapters {
            let scenes = database::list_scenes(conn, &chapter.id).map_err(|e| e.to_string())?;
            let mut scene_contents: Vec<layout::SceneContent> = Vec::new();

            for scene in scenes {
                // Get scene content separately
                let (content, _word_count) =
                    database::get_scene_content(conn, &scene.id).map_err(|e| e.to_string())?;
                scene_contents.push(layout::SceneContent {
                    title: scene.title,
                    content,
                });
            }

            chapter_contents.push(layout::ChapterContent {
                title: chapter.title,
                scenes: scene_contents,
            });
        }

        // Get layout settings
        let settings = layout::get_layout_settings(conn)?;

        println!(
            "[preview] Layout settings: page_width={}mm, page_height={}mm",
            settings.page_width, settings.page_height
        );

        // Generate Typst content
        let typst_content =
            layout::manuscript_to_typst(&chapter_contents, &settings, &title, &author);

        // Write to cache directory
        let cache_dir = app_handle
            .path_resolver()
            .app_cache_dir()
            .ok_or("Could not resolve app cache dir")?;
        let preview_dir = cache_dir.join("preview");
        std::fs::create_dir_all(&preview_dir).map_err(|e| format!("mkdir failed: {e}"))?;
        let pdf_path = preview_dir.join("preview.pdf");

        println!("[preview] Exporting to PDF: {:?}", pdf_path);
        match layout::export_to_pdf(&typst_content, &pdf_path) {
            Ok(_) => println!("[preview] PDF exported successfully"),
            Err(e) => {
                println!("[preview] PDF export FAILED: {}", e);
                return Err(e);
            }
        }

        pdf_path.to_string_lossy().to_string()
    };

    println!("[preview] PDF path: {}", pdf_path);

    // Open or focus the preview window
    let win = if let Some(win) = app_handle.get_window("preview") {
        println!("[preview] Found existing preview window, showing...");
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
        win
    } else {
        println!("[preview] Creating new preview window...");
        #[cfg(debug_assertions)]
        let url = tauri::WindowUrl::External("http://localhost:5173#/preview".parse().unwrap());
        #[cfg(not(debug_assertions))]
        let url = tauri::WindowUrl::App("index.html#/preview".into());

        let win = tauri::WindowBuilder::new(&app_handle, "preview", url)
            .title("Layout-Vorschau")
            .inner_size(1100.0, 850.0)
            .resizable(true)
            .build()
            .map_err(|e| {
                println!("[preview] Window creation error: {}", e);
                e.to_string()
            })?;
        println!("[preview] Preview window created successfully");
        win
    };

    // Send the PDF path to the preview window after a short delay to ensure it's loaded
    let pdf_path_clone = pdf_path.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(500));
        println!(
            "[preview] Sending preview_refresh event with path: {}",
            pdf_path_clone
        );
        let _ = win.emit("preview_refresh", pdf_path_clone);
    });

    Ok(())
}

/// Open PDF preview window (exact Typst-rendered PDF)
#[tauri::command]
fn open_pdf_preview_window(
    app_handle: tauri::AppHandle,
    state: State<AppState>,
) -> Result<(), String> {
    use tauri::Manager;
    println!("[pdf-preview] open_pdf_preview_window called");

    // First, render the preview PDF
    let pdf_path = {
        let guard = state.db.lock().unwrap();
        let conn = guard.as_ref().ok_or("No project open")?;

        // Get project metadata
        let project = database::get_project(conn).map_err(|e| e.to_string())?;
        let title = project.title.clone();
        let author = project.author.clone();

        // Get all chapters and scenes
        let chapters = database::list_chapters(conn).map_err(|e| e.to_string())?;
        let mut chapter_contents: Vec<layout::ChapterContent> = Vec::new();

        for chapter in chapters {
            let scenes = database::list_scenes(conn, &chapter.id).map_err(|e| e.to_string())?;
            let mut scene_contents: Vec<layout::SceneContent> = Vec::new();

            for scene in scenes {
                let (content, _word_count) =
                    database::get_scene_content(conn, &scene.id).map_err(|e| e.to_string())?;
                scene_contents.push(layout::SceneContent {
                    title: scene.title,
                    content,
                });
            }

            chapter_contents.push(layout::ChapterContent {
                title: chapter.title,
                scenes: scene_contents,
            });
        }

        // Get layout settings
        let settings = layout::get_layout_settings(conn)?;

        println!(
            "[pdf-preview] Layout settings: page_width={}mm, page_height={}mm",
            settings.page_width, settings.page_height
        );

        // Generate Typst content
        let typst_content =
            layout::manuscript_to_typst(&chapter_contents, &settings, &title, &author);

        // Write to cache directory
        let cache_dir = app_handle
            .path_resolver()
            .app_cache_dir()
            .ok_or("Could not resolve app cache dir")?;
        let preview_dir = cache_dir.join("preview");
        std::fs::create_dir_all(&preview_dir).map_err(|e| format!("mkdir failed: {e}"))?;
        let pdf_path = preview_dir.join("preview.pdf");

        println!("[pdf-preview] Exporting to PDF: {:?}", pdf_path);
        match layout::export_to_pdf(&typst_content, &pdf_path) {
            Ok(_) => println!("[pdf-preview] PDF exported successfully"),
            Err(e) => {
                println!("[pdf-preview] PDF export FAILED: {}", e);
                return Err(e);
            }
        }

        pdf_path.to_string_lossy().to_string()
    };

    println!("[pdf-preview] PDF path: {}", pdf_path);

    // Open or focus the PDF preview window (separate from CSS preview)
    let win = if let Some(win) = app_handle.get_window("pdf-preview") {
        println!("[pdf-preview] Found existing PDF preview window, showing...");
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
        win
    } else {
        println!("[pdf-preview] Creating new PDF preview window...");
        #[cfg(debug_assertions)]
        let url = tauri::WindowUrl::External("http://localhost:5173#/preview-pdf".parse().unwrap());
        #[cfg(not(debug_assertions))]
        let url = tauri::WindowUrl::App("index.html#/preview-pdf".into());

        let win = tauri::WindowBuilder::new(&app_handle, "pdf-preview", url)
            .title("PDF-Vorschau (exakt)")
            .inner_size(1100.0, 850.0)
            .resizable(true)
            .build()
            .map_err(|e| {
                println!("[pdf-preview] Window creation error: {}", e);
                e.to_string()
            })?;
        println!("[pdf-preview] PDF preview window created successfully");
        win
    };

    // Send the PDF path to the preview window after a short delay
    let pdf_path_clone = pdf_path.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(500));
        println!(
            "[pdf-preview] Sending preview_refresh event with path: {}",
            pdf_path_clone
        );
        let _ = win.emit("preview_refresh", pdf_path_clone);
    });

    Ok(())
}

#[tauri::command]
fn export_manuscript_pdf(
    chapters: Vec<ExportChapter>,
    output_path: String,
    title: String,
    author: String,
    state: State<AppState>,
) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    let settings = layout::get_layout_settings(conn)?;

    let chapters: Vec<layout::ChapterContent> = chapters
        .into_iter()
        .map(|c| layout::ChapterContent {
            title: c.title,
            scenes: c
                .scenes
                .into_iter()
                .map(|s| layout::SceneContent {
                    title: s.title,
                    content: s.content,
                })
                .collect(),
        })
        .collect();

    // Generate Typst content
    let typst_content = layout::manuscript_to_typst(&chapters, &settings, &title, &author);

    // Export to PDF
    layout::export_to_pdf(&typst_content, std::path::Path::new(&output_path))
}

#[tauri::command]
fn export_manuscript_docx(
    chapters: Vec<ExportChapter>,
    output_path: String,
    title: String,
    author: String,
) -> Result<(), String> {
    let chapters: Vec<layout::ChapterContent> = chapters
        .into_iter()
        .map(|c| layout::ChapterContent {
            title: c.title,
            scenes: c
                .scenes
                .into_iter()
                .map(|s| layout::SceneContent {
                    title: s.title,
                    content: s.content,
                })
                .collect(),
        })
        .collect();

    layout::export_to_docx(
        &chapters,
        std::path::Path::new(&output_path),
        &title,
        &author,
    )
}

/// Export current project to PDF (loads data from DB)
#[tauri::command]
fn export_project_pdf(output_path: String, state: State<AppState>) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;

    // Load project metadata
    let project = database::get_project(conn).map_err(|e| e.to_string())?;
    let settings = layout::get_layout_settings(conn)?;

    // Load all chapters and scenes
    let db_chapters = database::list_chapters(conn).map_err(|e| e.to_string())?;
    let chapters: Vec<layout::ChapterContent> = db_chapters
        .iter()
        .map(|ch| {
            let scenes = database::list_scenes(conn, &ch.id).unwrap_or_default();
            layout::ChapterContent {
                title: ch.title.clone(),
                scenes: scenes
                    .into_iter()
                    .map(|s| {
                        let (content, _wc) =
                            database::get_scene_content(conn, &s.id).unwrap_or_default();
                        layout::SceneContent {
                            title: s.title,
                            content,
                        }
                    })
                    .collect(),
            }
        })
        .collect();

    // Generate Typst content and export
    let typst_content =
        layout::manuscript_to_typst(&chapters, &settings, &project.title, &project.author);
    layout::export_to_pdf(&typst_content, std::path::Path::new(&output_path))
}

/// Export current project to EPUB (loads data from DB)
#[tauri::command]
fn export_project_epub(
    output_path: String,
    cover_path: Option<String>,
    state: State<AppState>,
) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;

    // Load project metadata
    let project = database::get_project(conn).map_err(|e| e.to_string())?;
    let settings = layout::get_layout_settings(conn)?;

    // Load all chapters and scenes
    let db_chapters = database::list_chapters(conn).map_err(|e| e.to_string())?;
    let chapters: Vec<layout::ChapterContent> = db_chapters
        .iter()
        .map(|ch| {
            let scenes = database::list_scenes(conn, &ch.id).unwrap_or_default();
            layout::ChapterContent {
                title: ch.title.clone(),
                scenes: scenes
                    .into_iter()
                    .map(|s| {
                        let (content, _wc) =
                            database::get_scene_content(conn, &s.id).unwrap_or_default();
                        layout::SceneContent {
                            title: s.title,
                            content,
                        }
                    })
                    .collect(),
            }
        })
        .collect();

    layout::export_to_epub(
        &chapters,
        std::path::Path::new(&output_path),
        &project.title,
        &project.author,
        &settings,
        cover_path.as_deref(),
    )
}

/// Export current project to DOCX (loads data from DB)
#[tauri::command]
fn export_project_docx(output_path: String, state: State<AppState>) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;

    // Load project metadata
    let project = database::get_project(conn).map_err(|e| e.to_string())?;

    // Load all chapters and scenes
    let db_chapters = database::list_chapters(conn).map_err(|e| e.to_string())?;
    let chapters: Vec<layout::ChapterContent> = db_chapters
        .iter()
        .map(|ch| {
            let scenes = database::list_scenes(conn, &ch.id).unwrap_or_default();
            layout::ChapterContent {
                title: ch.title.clone(),
                scenes: scenes
                    .into_iter()
                    .map(|s| {
                        // Try to get content from content_json first (preserves paragraphs)
                        let content = match database::get_scene_content_with_json(conn, &s.id) {
                            Ok((Some(json), _, _)) => {
                                // Parse JSON and extract plain text with newlines
                                if let Ok(doc) = serde_json::from_str::<
                                    featherworks_author::domain::doc::Node,
                                >(&json)
                                {
                                    featherworks_author::domain::doc::to_plain_text(&doc)
                                } else {
                                    database::get_scene_content(conn, &s.id)
                                        .map(|(c, _)| c)
                                        .unwrap_or_default()
                                }
                            }
                            _ => database::get_scene_content(conn, &s.id)
                                .map(|(c, _)| c)
                                .unwrap_or_default(),
                        };
                        layout::SceneContent {
                            title: s.title,
                            content,
                        }
                    })
                    .collect(),
            }
        })
        .collect();

    layout::export_to_docx(
        &chapters,
        std::path::Path::new(&output_path),
        &project.title,
        &project.author,
    )
}

/// Export current project to InDesign-optimized XML (loads data from DB)
#[tauri::command]
fn export_project_indesign_xml(output_path: String, state: State<AppState>) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;

    // Load project metadata
    let project = database::get_project(conn).map_err(|e| e.to_string())?;
    let settings = layout::get_layout_settings(conn)?;

    // Load all chapters and scenes
    let db_chapters = database::list_chapters(conn).map_err(|e| e.to_string())?;
    let chapters: Vec<layout::ChapterContent> = db_chapters
        .iter()
        .map(|ch| {
            let scenes = database::list_scenes(conn, &ch.id).unwrap_or_default();
            layout::ChapterContent {
                title: ch.title.clone(),
                scenes: scenes
                    .into_iter()
                    .map(|s| {
                        // Try to get content from content_json first (preserves paragraphs)
                        let content = match database::get_scene_content_with_json(conn, &s.id) {
                            Ok((Some(json), _, _)) => {
                                // Parse JSON and extract plain text with newlines
                                if let Ok(doc) = serde_json::from_str::<
                                    featherworks_author::domain::doc::Node,
                                >(&json)
                                {
                                    featherworks_author::domain::doc::to_plain_text(&doc)
                                } else {
                                    database::get_scene_content(conn, &s.id)
                                        .map(|(c, _)| c)
                                        .unwrap_or_default()
                                }
                            }
                            _ => database::get_scene_content(conn, &s.id)
                                .map(|(c, _)| c)
                                .unwrap_or_default(),
                        };
                        layout::SceneContent {
                            title: s.title,
                            content,
                        }
                    })
                    .collect(),
            }
        })
        .collect();

    layout::export_to_indesign_xml(
        &chapters,
        std::path::Path::new(&output_path),
        &project.title,
        &project.author,
        &settings,
    )
}

#[tauri::command]
fn export_manuscript_rtf(
    chapters: Vec<ExportChapter>,
    output_path: String,
    title: String,
    author: String,
) -> Result<(), String> {
    let chapters: Vec<layout::ChapterContent> = chapters
        .into_iter()
        .map(|c| layout::ChapterContent {
            title: c.title,
            scenes: c
                .scenes
                .into_iter()
                .map(|s| layout::SceneContent {
                    title: s.title,
                    content: s.content,
                })
                .collect(),
        })
        .collect();

    layout::export_to_rtf(
        &chapters,
        std::path::Path::new(&output_path),
        &title,
        &author,
    )
}

// ============================================================================
// Book Metadata & Editions Commands
// ============================================================================

#[tauri::command]
fn get_book_metadata(
    state: State<AppState>,
) -> Result<featherworks_author::models::BookMetadata, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    database::get_book_metadata(conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_book_metadata(
    metadata: featherworks_author::models::BookMetadata,
    state: State<AppState>,
) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    database::update_book_metadata(conn, &metadata).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_editions(
    state: State<AppState>,
) -> Result<Vec<featherworks_author::models::Edition>, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    database::list_editions(conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_edition(
    edition_id: String,
    state: State<AppState>,
) -> Result<featherworks_author::models::Edition, String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    database::get_edition(conn, &edition_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_edition(
    edition: featherworks_author::models::Edition,
    state: State<AppState>,
) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    database::create_edition(conn, &edition).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_edition(
    edition: featherworks_author::models::Edition,
    state: State<AppState>,
) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    database::update_edition(conn, &edition).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_edition(edition_id: String, state: State<AppState>) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().ok_or("No project open")?;
    database::delete_edition(conn, &edition_id).map_err(|e| e.to_string())
}

fn build_menu() -> Menu {
    // Read language preference from localStorage-synced file or default to English
    let lang = std::env::var("FW_LANG").unwrap_or_else(|_| {
        if let Some(config_dir) = dirs::config_dir() {
            let lang_file = config_dir.join("featherworks-author").join("language.txt");
            if let Ok(content) = std::fs::read_to_string(&lang_file) {
                return content.trim().to_string();
            }
        }
        "en".to_string()
    });
    let is_german = lang == "de";

    // Language menu
    let mut lang_de = CustomMenuItem::new("set_lang_de", "Deutsch");
    let mut lang_en = CustomMenuItem::new("set_lang_en", "English");
    if is_german {
        lang_de = lang_de.disabled();
    } else {
        lang_en = lang_en.disabled();
    }
    let language_menu = Submenu::new(
        if is_german { "Sprache" } else { "Language" },
        Menu::new().add_item(lang_de).add_item(lang_en),
    );

    // File menu items
    let new_project = CustomMenuItem::new(
        "new_project",
        if is_german {
            "Neues Projekt"
        } else {
            "New Project"
        },
    )
    .accelerator("CmdOrCtrl+N");
    let open_project =
        CustomMenuItem::new("open_project", if is_german { "Öffnen…" } else { "Open…" })
            .accelerator("CmdOrCtrl+O");
    let save_project = CustomMenuItem::new("save", if is_german { "Speichern" } else { "Save" })
        .accelerator("CmdOrCtrl+S");
    let save_as = CustomMenuItem::new(
        "save_as",
        if is_german {
            "Speichern unter…"
        } else {
            "Save As…"
        },
    )
    .accelerator("Shift+CmdOrCtrl+S");
    let export_enc = CustomMenuItem::new(
        "export_encrypted",
        if is_german {
            "Verschlüsselt exportieren…"
        } else {
            "Export Encrypted…"
        },
    );
    let import_enc = CustomMenuItem::new(
        "import_encrypted",
        if is_german {
            "Verschlüsselt importieren…"
        } else {
            "Import Encrypted…"
        },
    );
    let close_project = CustomMenuItem::new("close", if is_german { "Schließen" } else { "Close" })
        .accelerator("CmdOrCtrl+W");

    let file_menu = Submenu::new(
        if is_german { "Datei" } else { "File" },
        Menu::new()
            .add_item(new_project)
            .add_item(open_project)
            .add_native_item(tauri::MenuItem::Separator)
            .add_item(save_project)
            .add_item(save_as)
            .add_native_item(tauri::MenuItem::Separator)
            .add_item(export_enc)
            .add_item(import_enc)
            .add_item(close_project)
            .add_native_item(tauri::MenuItem::Separator)
            .add_native_item(tauri::MenuItem::Quit),
    );

    // Edit menu items
    let undo_item = CustomMenuItem::new("undo", if is_german { "Rückgängig" } else { "Undo" })
        .accelerator("CmdOrCtrl+Z");
    let redo_item = CustomMenuItem::new("redo", if is_german { "Wiederholen" } else { "Redo" })
        .accelerator("Shift+CmdOrCtrl+Z");

    let edit_menu = Submenu::new(
        if is_german { "Bearbeiten" } else { "Edit" },
        Menu::new()
            .add_item(undo_item)
            .add_item(redo_item)
            .add_native_item(tauri::MenuItem::Separator)
            .add_native_item(tauri::MenuItem::Cut)
            .add_native_item(tauri::MenuItem::Copy)
            .add_native_item(tauri::MenuItem::Paste)
            .add_native_item(tauri::MenuItem::SelectAll),
    );

    // View menu items - Search & Replace
    let find = CustomMenuItem::new(
        "find",
        if is_german {
            "In Szene suchen"
        } else {
            "Find in Scene"
        },
    )
    .accelerator("CmdOrCtrl+F");
    let replace = CustomMenuItem::new(
        "replace",
        if is_german {
            "In Szene ersetzen"
        } else {
            "Replace in Scene"
        },
    )
    .accelerator("Alt+CmdOrCtrl+F");
    let find_manuscript = CustomMenuItem::new(
        "find_manuscript",
        if is_german {
            "Im Manuskript suchen"
        } else {
            "Find in Manuscript"
        },
    )
    .accelerator("Shift+CmdOrCtrl+F");
    let replace_manuscript = CustomMenuItem::new(
        "replace_manuscript",
        if is_german {
            "Im Manuskript ersetzen"
        } else {
            "Replace in Manuscript"
        },
    )
    .accelerator("Shift+Alt+CmdOrCtrl+F");
    let toggle_fullscreen = CustomMenuItem::new(
        "toggle_fullscreen",
        if is_german {
            "Vollbild umschalten"
        } else {
            "Toggle Fullscreen"
        },
    )
    .accelerator("F11");

    let view_menu = Submenu::new(
        if is_german { "Ansicht" } else { "View" },
        Menu::new()
            .add_item(find)
            .add_item(replace)
            .add_native_item(tauri::MenuItem::Separator)
            .add_item(find_manuscript)
            .add_item(replace_manuscript)
            .add_native_item(tauri::MenuItem::Separator)
            .add_item(toggle_fullscreen),
    );

    // AI menu items (Fontaine)
    let ai_settings = CustomMenuItem::new(
        "ai_settings",
        if is_german {
            "KI-Einstellungen…"
        } else {
            "AI Settings…"
        },
    );
    let ai_connect_api = CustomMenuItem::new(
        "ai_connect_api",
        if is_german {
            "Eigene API verbinden…"
        } else {
            "Connect Custom API…"
        },
    );
    let ai_local_model = CustomMenuItem::new(
        "ai_local_model",
        if is_german {
            "Lokales Modell verwalten…"
        } else {
            "Manage Local Model…"
        },
    );

    let ai_menu = Submenu::new(
        if is_german { "KI" } else { "AI" },
        Menu::new()
            .add_item(ai_settings)
            .add_native_item(tauri::MenuItem::Separator)
            .add_item(ai_connect_api)
            .add_item(ai_local_model),
    );

    // Help menu items
    let report_bug = CustomMenuItem::new(
        "report_bug",
        if is_german {
            "Fehler melden…"
        } else {
            "Report Bug…"
        },
    );
    let send_feedback = CustomMenuItem::new(
        "send_feedback",
        if is_german {
            "Feedback senden…"
        } else {
            "Send Feedback…"
        },
    );
    let visit_website = CustomMenuItem::new(
        "visit_website",
        if is_german {
            "Webseite besuchen"
        } else {
            "Visit Website"
        },
    );
    let view_logs = CustomMenuItem::new(
        "view_logs",
        if is_german {
            "Log-Dateien öffnen"
        } else {
            "Open Log Files"
        },
    );
    let about_app = CustomMenuItem::new(
        "about_app",
        if is_german {
            "Über FeatherWorks Author"
        } else {
            "About FeatherWorks Author"
        },
    );

    let help_menu = Submenu::new(
        if is_german { "Hilfe" } else { "Help" },
        Menu::new()
            .add_item(report_bug)
            .add_item(send_feedback)
            .add_native_item(tauri::MenuItem::Separator)
            .add_item(visit_website)
            .add_item(view_logs)
            .add_native_item(tauri::MenuItem::Separator)
            .add_item(about_app),
    );

    Menu::new()
        .add_submenu(file_menu)
        .add_submenu(edit_menu)
        .add_submenu(view_menu)
        .add_submenu(ai_menu)
        .add_submenu(language_menu)
        .add_submenu(help_menu)
}

fn setup_logging(app_handle: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let log_dir = app_handle
        .path_resolver()
        .app_log_dir()
        .expect("failed to find log dir");
    std::fs::create_dir_all(&log_dir).expect("failed to create log dir");
    let log_path = log_dir.join("app.log");

    // Create base dispatch with formatting
    let mut dispatch = fern::Dispatch::new()
        .format(|out, message, record| {
            out.finish(format_args!(
                "[{}][{}] {}",
                record.level(),
                record.target(),
                message
            ))
        })
        .level(log::LevelFilter::Info);

    // Only chain stdout in debug builds (when running from terminal)
    // In release builds, stdout may not be available and can cause panics
    #[cfg(debug_assertions)]
    {
        dispatch = dispatch.chain(std::io::stdout());
    }

    // Always chain the log file
    let log_file = fern::log_file(&log_path).expect("failed to open log file");
    dispatch = dispatch.chain(log_file);

    let logger = dispatch.apply();

    if let Err(e) = logger {
        // We can't use the logger here because it failed, so we print to stderr
        eprintln!("Failed to initialize logger: {:?}", e);
    }

    Ok(())
}

fn main() {
    // This function is now just a placeholder for the old setup logic.
    // The main logic is in the `run` function for Tauri.
    // We could potentially remove this `main` function if it's not used elsewhere,
    // but we'll keep it for now to avoid breaking any assumptions by the build process.
    println!("Starting Featherworks Author...");
    run();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            db: Default::default(),
            db_path: Default::default(),
            container_path: Default::default(),
            db_is_temp: Default::default(),
            journal_path: Default::default(),
        })
        .menu(build_menu())
        .on_window_event(|event| {
            // Log a concise line for each significant window event to help diagnose unexpected closes/blank screen
            match event.event() {
                WindowEvent::CloseRequested { .. } => {
                    println!("[window-event] CloseRequested received - allowing normal close");
                }
                WindowEvent::Destroyed => println!("[window-event] Window destroyed"),
                WindowEvent::Focused(f) => println!("[window-event] Focused={}", f),
                WindowEvent::ScaleFactorChanged { scale_factor, .. } => {
                    println!("[window-event] ScaleFactorChanged {scale_factor}")
                }
                WindowEvent::ThemeChanged(t) => println!("[window-event] ThemeChanged {:?}", t),
                WindowEvent::Resized(size) => {
                    println!("[window-event] Resized {}x{}", size.width, size.height)
                }
                WindowEvent::Moved(pos) => println!("[window-event] Moved {}x{}", pos.x, pos.y),
                WindowEvent::FileDrop(ev) => println!("[window-event] FileDrop event: {:?}", ev),
                _ => { /* ignore noisy events */ }
            }
        })
        .on_menu_event(|event| {
            let window = event.window();
            let menu_id = event.menu_item_id();
            println!("[menu-event] Menu clicked: {}", menu_id);
            match menu_id {
                "new_project" => {
                    println!("[menu-event] Emitting menu_new_project");
                    window.emit("menu_new_project", ()).unwrap();
                }
                "open_project" => {
                    println!("[menu-event] Emitting menu_open_project");
                    window.emit("menu_open_project", ()).unwrap();
                }
                "save" => window.emit("menu_save", ()).unwrap(),
                "save_as" => window.emit("menu_save_as", ()).unwrap(),
                "close" => window.emit("menu_close", ()).unwrap(),
                "export_encrypted" => window.emit("menu_export_encrypted", ()).unwrap(),
                "import_encrypted" => window.emit("menu_import_encrypted", ()).unwrap(),
                "undo" => window.emit("menu_undo", ()).unwrap(),
                "redo" => window.emit("menu_redo", ()).unwrap(),
                "find" => window.emit("menu_find", ()).unwrap(),
                "replace" => window.emit("menu_replace", ()).unwrap(),
                "find_manuscript" => window.emit("menu_find_manuscript", ()).unwrap(),
                "replace_manuscript" => window.emit("menu_replace_manuscript", ()).unwrap(),
                "toggle_fullscreen" => window.emit("menu_toggle_fullscreen", ()).unwrap(),
                // AI menu events
                "ai_settings" => window.emit("menu_ai_settings", ()).unwrap(),
                "ai_connect_api" => window.emit("menu_ai_connect_api", ()).unwrap(),
                "ai_local_model" => window.emit("menu_ai_local_model", ()).unwrap(),
                // Help menu events
                "report_bug" => window.emit("menu_report_bug", ()).unwrap(),
                "send_feedback" => window.emit("menu_send_feedback", ()).unwrap(),
                "visit_website" => {
                    let _ = open::that("https://featherworks.app");
                }
                "view_logs" => {
                    if let Some(log_dir) = window.app_handle().path_resolver().app_log_dir() {
                        let _ = open::that(log_dir);
                    }
                }
                "about_app" => window.emit("menu_about", ()).unwrap(),
                // Language
                "set_lang_de" => window.emit("request-language-change", "de").unwrap(),
                "set_lang_en" => window.emit("request-language-change", "en").unwrap(),
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_project,
            list_chapters,
            list_scenes,
            get_scene_content,
            update_scene_content,
            create_chapter,
            create_scene,
            rename_chapter,
            rename_scene,
            get_scene_note_cmd,
            save_scene_note_cmd,
            reorder_chapters,
            reorder_scenes,
            get_editor_settings,
            save_editor_settings,
            open_project,
            create_project,
            save_project,
            save_project_as,
            load_full_project,
            update_project_metadata_cmd,
            get_project_status,
            export_project_encrypted,
            import_encrypted_project,
            list_recent_projects,
            apply_scene_patch,
            undo_scene,
            redo_scene,
            check_recovery,
            apply_recovery,
            start_ai_chat,
            cancel_ai_chat,
            build_fontaine_context,
            set_active_ai_provider,
            auto_paragraph_scene,
            check_ai_available,
            set_ai_model,
            get_ai_model,
            list_ai_models,
            get_ai_model_progress,
            get_ai_server_status,
            stop_ai_server,
            load_ai_model,
            get_ai_model_state,
            get_ai_settings,
            save_ai_settings_cmd, // Hardware detection & model registry
            detect_hardware,
            list_model_registry,
            check_model_exists, // Model download
            start_model_download,
            get_download_progress,
            cancel_model_download,
            is_model_available,
            get_models_with_status,
            delete_downloaded_model,
            spell_check,
            spell_suggest,
            spell_add_word,
            languagetool_check,
            languagetool_test,
            check_for_update,
            install_update,
            get_app_version,
            restart_app,
            get_app_language,
            set_app_language, // User Profile
            get_user_profile,
            save_user_profile,
            get_pacing_settings,
            save_pacing_settings,
            update_library_project,
            remove_from_library,
            list_series,
            list_genres,
            list_tags, // Entity System
            list_entity_types,
            create_entity_type,
            update_entity_type,
            update_entity_type_schema,
            delete_entity_type,
            list_entities,
            get_entity,
            create_entity,
            update_entity,
            delete_entity,
            get_entity_highlights, // Entity Images
            list_entity_images,
            get_entity_image,
            add_entity_image,
            update_entity_image_name,
            delete_entity_image, // AI Provider Settings
            get_ai_provider_settings,
            save_ai_provider_settings,
            test_ai_provider_connection, // RAG Documents
            list_rag_documents,
            import_rag_document,
            remove_rag_document,
            clear_all_rag_data, // Plot System
            list_subplots,
            create_subplot,
            update_subplot,
            delete_subplot,
            reorder_subplots,
            list_plot_points,
            create_plot_point,
            update_plot_point,
            delete_plot_point,
            move_plot_point,
            reorder_plot_points,
            link_scene_to_plot,
            unlink_scene_from_plot,
            get_scenes_for_plot_point,
            get_plot_points_for_scene, // Research System
            list_research_folders,
            create_research_folder,
            update_research_folder,
            move_research_folder,
            delete_research_folder,
            list_research_items,
            create_research_item,
            create_research_file,
            get_research_file_data,
            update_research_item,
            move_research_item,
            delete_research_item,
            save_research_extracted_facts,
            search_research, // Layout & Export
            get_layout_settings,
            save_layout_settings,
            list_layout_presets,
            save_layout_preset,
            delete_layout_preset,
            export_manuscript_pdf,
            export_manuscript_epub,
            export_manuscript_docx,
            export_manuscript_rtf,
            export_project_pdf,
            export_project_epub,
            export_project_docx,
            export_project_indesign_xml,
            render_preview_pdf,
            open_preview_window,
            open_pdf_preview_window, // Book Metadata & Editions
            get_book_metadata,
            save_book_metadata,
            list_editions,
            get_edition,
            create_edition,
            update_edition,
            delete_edition, // AI Entity Extraction & Lektorat
            extract_entities_ai,
            extract_entities_scene_upsert,
            extract_entities_manuscript_upsert,
            analyze_lektorat_ai,
            analyze_lektorat_chunked,
            save_extracted_entity, // Auto-Summarization
            auto_summarize_scene,
            auto_summarize_chapter,
            get_scene_summary,
            get_chapter_summary,
            get_all_chapter_summaries, // AI Queue & Background Jobs
            get_ai_queue_stats,
            list_background_jobs,
            get_background_job_status,
            cancel_background_job,
            start_entity_scan,
            start_summarize_all_scenes, // Lektorat Annotations Persistence
            save_lektorat_annotations,
            load_lektorat_annotations,
            dismiss_lektorat_annotation,
            clear_scene_lektorat, // Support & Bug Reports
            submit_bug_report,
            get_system_info,
            open_support_page
        ])
        .setup(|app| {
            let handle = app.handle();
            setup_logging(&handle)?;

            // Initialize AI Queue Worker
            ai::queue::init_queue_worker();
            log::info!("[setup] AI Queue Worker initialized");

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            // The MLX server holds several GB of wired memory. Without an
            // explicit kill it survives the app and strands that memory.
            if let tauri::RunEvent::ExitRequested { .. } = event {
                ai::server::stop();
            }
        });
}
