//! Integration test: scene patch + undo/redo + JSON persistence
use featherworks_author::domain::{doc, patch};
use featherworks_author::services::scenes_service;
use featherworks_author::storage::database;
use tempfile::tempdir;

#[test]
fn scene_patch_undo_redo_flow() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_project.sqlite");
    let conn = database::create_database(
        db_path.to_str().unwrap(),
        "Test Projekt",
        "Autor",
        None,
        None,
        None,
    )
    .expect("create db");

    // Grab initial chapter & scene
    let chapters = database::list_chapters(&conn).expect("list chapters");
    assert!(!chapters.is_empty());
    let scenes = database::list_scenes(&conn, &chapters[0].id).expect("list scenes");
    assert_eq!(scenes.len(), 1, "Should seed one scene");
    let scene_id = &scenes[0].id;

    // Apply first patch
    let new_doc = doc::Node::plain_text("Hello World");
    let p = patch::Patch::full(new_doc.clone());
    let wc = scenes_service::apply_patch(&conn, scene_id, p).expect("apply patch");
    assert_eq!(wc, 2); // Hello World

    // Ensure JSON persisted
    let (json_opt, plain, wc2) =
        database::get_scene_content_with_json(&conn, scene_id).expect("get scene content json");
    assert!(json_opt.is_some(), "JSON should be stored after patch");
    assert_eq!(plain.trim(), "Hello World");
    assert_eq!(wc2, 2);

    // Apply second patch
    let p2_doc = doc::Node::plain_text("Hello Wonderful World");
    let p2 = patch::Patch::full(p2_doc.clone());
    let wc_after_second =
        scenes_service::apply_patch(&conn, scene_id, p2).expect("apply 2nd patch");
    assert_eq!(wc_after_second, 3);

    // Undo (should restore first version)
    let undo_wc = scenes_service::undo(&conn, scene_id)
        .expect("undo")
        .expect("expected Some");
    assert_eq!(undo_wc, 2);
    let (json_after_undo, plain_after_undo, wc_after_undo) =
        database::get_scene_content_with_json(&conn, scene_id).expect("get after undo");
    assert!(json_after_undo.is_some());
    assert_eq!(plain_after_undo.trim(), "Hello World");
    assert_eq!(wc_after_undo, 2);

    // Redo (should restore second version again)
    let redo_wc = scenes_service::redo(&conn, scene_id)
        .expect("redo")
        .expect("expected Some");
    assert_eq!(redo_wc, 3);
    let (_json_after_redo, plain_after_redo, wc_after_redo) =
        database::get_scene_content_with_json(&conn, scene_id).expect("get after redo");
    assert_eq!(plain_after_redo.trim(), "Hello Wonderful World");
    assert_eq!(wc_after_redo, 3);
}

#[test]
fn undo_without_history_returns_none() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("proj.sqlite");
    let conn =
        database::create_database(db_path.to_str().unwrap(), "P", "A", None, None, None).unwrap();
    let chapters = database::list_chapters(&conn).unwrap();
    let scenes = database::list_scenes(&conn, &chapters[0].id).unwrap();
    let scene_id = &scenes[0].id;
    // No patch yet => undo should return None
    let res = scenes_service::undo(&conn, scene_id).unwrap();
    assert!(res.is_none());
}
