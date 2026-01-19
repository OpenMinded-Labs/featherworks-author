//! Scenes service – abstraction over raw DB + patch application.
//! FEAT-005 skeleton: apply naive full replace.

use rusqlite::Connection;
use crate::domain::{doc::Node, patch::{Patch, PatchKind}};
use crate::storage::database;
use std::fs::{OpenOptions};
use std::io::Write;
use std::collections::{HashMap, VecDeque};
use std::sync::{Mutex, OnceLock};

#[derive(Debug, thiserror::Error)]
pub enum SceneServiceError {
    #[error("DB error: {0}")] Db(#[from] database::DatabaseOperationError),
    #[error("Scene not found: {0}")] NotFound(String),
    #[error("Serialization error: {0}")] Ser(#[from] serde_json::Error),
}

/// Load scene doc (currently stored as plain text; wraps into doc model)
pub fn load_scene_doc(conn: &Connection, scene_id: &str) -> Result<Node, SceneServiceError> {
    let (json_opt, plain, _wc) = database::get_scene_content_with_json(conn, scene_id)?;
    if let Some(js) = json_opt {
        match serde_json::from_str::<Node>(&js) {
            Ok(n) => return Ok(n),
            Err(e) => {
                log::warn!("Failed to parse content_json for scene {scene_id}: {e}; fallback to plain text");
            }
        }
    }
    Ok(Node::plain_text(&plain))
}

/// Apply patch and persist; returns new word count.
static UNDO_STACKS: OnceLock<Mutex<HashMap<String, VecDeque<Patch>>>> = OnceLock::new();
static REDO_STACKS: OnceLock<Mutex<HashMap<String, VecDeque<Patch>>>> = OnceLock::new();
static APPLY_COUNTERS: OnceLock<Mutex<HashMap<String, usize>>> = OnceLock::new();

fn undo_map() -> &'static Mutex<HashMap<String, VecDeque<Patch>>> { UNDO_STACKS.get_or_init(|| Mutex::new(HashMap::new())) }
fn redo_map() -> &'static Mutex<HashMap<String, VecDeque<Patch>>> { REDO_STACKS.get_or_init(|| Mutex::new(HashMap::new())) }
fn counter_map() -> &'static Mutex<HashMap<String, usize>> { APPLY_COUNTERS.get_or_init(|| Mutex::new(HashMap::new())) }

const UNDO_LIMIT: usize = 200; // configurable later via settings
const SNAPSHOT_INTERVAL: usize = 25; // every N incremental patches we force a full snapshot

pub fn apply_patch(conn: &Connection, scene_id: &str, patch: Patch) -> Result<i32, SceneServiceError> {
    let old_doc = load_scene_doc(conn, scene_id)?;
    // Store inverse patch (current full doc) – we could optimize later
    {
        let mut undo = undo_map().lock().unwrap();
        let entry = undo.entry(scene_id.to_string()).or_default();
        if entry.len() >= UNDO_LIMIT { entry.pop_front(); }
        entry.push_back(Patch::full(old_doc.clone()));
    }
    // Clearing redo on new edit
    {
        let mut redo = redo_map().lock().unwrap();
        redo.remove(scene_id);
    }
    // Determine if we will coerce to snapshot
    let mut is_snapshot = matches!(patch.0, PatchKind::FullReplace{..});
    if !is_snapshot {
        // Increment counter
        {
            let mut counters = counter_map().lock().unwrap();
            let c = counters.entry(scene_id.to_string()).or_insert(0);
            *c += 1;
            if *c % SNAPSHOT_INTERVAL == 0 { is_snapshot = true; }
        }
    }
    let effective_patch = if is_snapshot && !matches!(patch.0, PatchKind::FullReplace{..}) {
        // Build a full replacement patch from the result of applying incremental patch
        let intermediate = patch.apply(&old_doc);
        Patch::full(intermediate)
    } else { patch };
    let new_doc = effective_patch.apply(&old_doc);
    let plain = crate::domain::doc::to_plain_text(&new_doc);
    let word_count = plain.split_whitespace().count() as i32;
    let json = serde_json::to_string(&new_doc)?;
    database::update_scene_content_json(conn, scene_id, &json, &plain, word_count)?;
    // Append to journal if available (best-effort)
    if let Some(journal_path) = current_journal_path() {
        let patch_kind_str = match &effective_patch.0 { PatchKind::FullReplace {..} => "fullReplace", PatchKind::InsertText {..} => "insertText", PatchKind::DeleteRange {..} => "deleteRange" };
        let mut obj = serde_json::json!({
            "ts": chrono::Utc::now().to_rfc3339(),
            "scene_id": scene_id,
            "word_count": word_count,
            "patch_kind": patch_kind_str,
            "snapshot": is_snapshot
        });
        if is_snapshot {
            if let serde_json::Value::Object(ref mut map) = obj { map.insert("content_json".into(), serde_json::to_value(&new_doc).unwrap_or(serde_json::Value::Null)); }
        } else {
            if let serde_json::Value::Object(ref mut map) = obj {
                match &effective_patch.0 {
                    PatchKind::InsertText { offset, text } => { map.insert("offset".into(), (*offset).into()); map.insert("text".into(), text.clone().into()); },
                    PatchKind::DeleteRange { start, end } => { map.insert("start".into(), (*start).into()); map.insert("end".into(), (*end).into()); },
                    _ => {}
                }
            }
        }
        let _ = append_journal_line(&journal_path, &obj.to_string());
    }
    Ok(word_count)
}

pub fn undo(conn: &Connection, scene_id: &str) -> Result<Option<i32>, SceneServiceError> {
    let mut undo = undo_map().lock().unwrap();
    let stack = undo.entry(scene_id.to_string()).or_default();
    if let Some(patch) = stack.pop_back() {
        let current = load_scene_doc(conn, scene_id)?;
        // push current into redo (inverse)
        {
            let mut redo = redo_map().lock().unwrap();
            let rstack = redo.entry(scene_id.to_string()).or_default();
            if rstack.len() >= UNDO_LIMIT { rstack.pop_front(); }
            rstack.push_back(Patch::full(current.clone()));
        }
    let restored = patch.apply(&current); // inverse is a full replacement patch
        let plain = crate::domain::doc::to_plain_text(&restored);
        let wc = plain.split_whitespace().count() as i32;
        let json = serde_json::to_string(&restored)?;
        database::update_scene_content_json(conn, scene_id, &json, &plain, wc)?;
        Ok(Some(wc))
    } else { Ok(None) }
}

pub fn redo(conn: &Connection, scene_id: &str) -> Result<Option<i32>, SceneServiceError> {
    let mut redo = redo_map().lock().unwrap();
    let stack = redo.entry(scene_id.to_string()).or_default();
    if let Some(patch) = stack.pop_back() {
        let current = load_scene_doc(conn, scene_id)?;
        // push current into undo
        {
            let mut undo = undo_map().lock().unwrap();
            let ustack = undo.entry(scene_id.to_string()).or_default();
            if ustack.len() >= UNDO_LIMIT { ustack.pop_front(); }
            ustack.push_back(Patch::full(current.clone()));
        }
        let restored = patch.apply(&current);
        let plain = crate::domain::doc::to_plain_text(&restored);
        let wc = plain.split_whitespace().count() as i32;
        let json = serde_json::to_string(&restored)?;
        database::update_scene_content_json(conn, scene_id, &json, &plain, wc)?;
        Ok(Some(wc))
    } else { Ok(None) }
}

fn current_journal_path() -> Option<String> {
    // Access the global AppState via tauri::async_runtime not available here; expose setter externally.
    // For now we keep a static OnceLock updated from main when project changes (simplifies layering without full DI refactor).
    JOURNAL_PATH.get().cloned()
}

static JOURNAL_PATH: OnceLock<String> = OnceLock::new();

pub fn set_journal_path(p: Option<String>) {
    if let Some(path) = p {
        let _ = JOURNAL_PATH.set(path); // ignore if already set for this session
    }
}

fn append_journal_line(path: &str, line: &str) -> std::io::Result<()> {
    let mut f = OpenOptions::new().create(true).append(true).open(path)?;
    f.write_all(line.as_bytes())?;
    f.write_all(b"\n")?;
    Ok(())
}

/// For future: compute diff between two docs (now full replace)
pub fn diff_docs(_old: &Node, new_doc: &Node) -> Patch {
    Patch(PatchKind::FullReplace { new_doc: new_doc.clone() })
}
