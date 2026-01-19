use featherworks_author::storage::database;
use featherworks_author::services::scenes_service;
use featherworks_author::domain::patch;
use tempfile::tempdir;
use std::fs;

#[test]
fn snapshot_every_interval() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("snap.sqlite");
    let journal_path = dir.path().join("project.journal");
    let conn = database::create_database(db_path.to_str().unwrap(), "P", "A", None, None, None).unwrap();
    scenes_service::set_journal_path(Some(journal_path.to_string_lossy().to_string()));

    let chapters = database::list_chapters(&conn).unwrap();
    let scenes = database::list_scenes(&conn, &chapters[0].id).unwrap();
    let scene_id = &scenes[0].id;

    // Apply 26 incremental patches (InsertText) to trigger at least one snapshot (interval 25)
    for i in 0..26u32 {
        let text = format!("+{i} ");
        let p = patch::Patch(patch::PatchKind::InsertText { offset: 0, text });
        let _ = scenes_service::apply_patch(&conn, scene_id, p).unwrap();
    }

    let data = fs::read_to_string(&journal_path).expect("journal file present");
    let snapshot_lines: Vec<&str> = data.lines().filter(|l| l.contains("\"snapshot\":true")).collect();
    assert!(snapshot_lines.len() >= 1, "Expected at least one snapshot line after interval");
}
