use featherworks_author::domain::{doc, patch};
use featherworks_author::services::scenes_service;
use featherworks_author::storage::database;
use std::fs;
use tempfile::tempdir;

#[test]
fn journal_writes_lines() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("p.sqlite");
    let journal_path = dir.path().join("project.journal");
    let conn =
        database::create_database(db_path.to_str().unwrap(), "P", "A", None, None, None).unwrap();
    // Manuell Journal setzen (normal macht main das)
    scenes_service::set_journal_path(Some(journal_path.to_string_lossy().to_string()));

    let chapters = database::list_chapters(&conn).unwrap();
    let scenes = database::list_scenes(&conn, &chapters[0].id).unwrap();
    let scene_id = &scenes[0].id;

    for i in 0..3u32 {
        let ndoc = doc::Node::plain_text(&format!("Text {i}"));
        let p = patch::Patch::full(ndoc);
        let _ = scenes_service::apply_patch(&conn, scene_id, p).unwrap();
    }

    let data = fs::read_to_string(&journal_path).expect("journal exists");
    let lines: Vec<&str> = data.lines().collect();
    assert_eq!(lines.len(), 3, "Expected 3 journal entries");
    assert!(lines[0].contains("patch_kind"));
}
