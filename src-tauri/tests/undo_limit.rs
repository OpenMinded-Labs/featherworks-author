use featherworks_author::storage::database;
use featherworks_author::services::scenes_service;
use featherworks_author::domain::{doc, patch};
use tempfile::tempdir;

#[test]
fn undo_ring_buffer_trims() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("proj.sqlite");
    let conn = database::create_database(db_path.to_str().unwrap(), "P", "A", None, None, None).unwrap();
    let chapters = database::list_chapters(&conn).unwrap();
    let scenes = database::list_scenes(&conn, &chapters[0].id).unwrap();
    let scene_id = &scenes[0].id;

    // Push more than UNDO_LIMIT (200) patches
    for i in 0..210u32 {
        let ndoc = doc::Node::plain_text(&format!("Text {i}"));
        let p = patch::Patch::full(ndoc);
        scenes_service::apply_patch(&conn, scene_id, p).unwrap();
    }

    // Undo 200 times should not panic
    let mut undo_count = 0;
    while let Some(_wc) = scenes_service::undo(&conn, scene_id).unwrap() { undo_count += 1; if undo_count > 250 { break; } }
    // We expect at most 200 undo operations available
    assert!(undo_count <= 200, "undo_count was {undo_count}");
}
