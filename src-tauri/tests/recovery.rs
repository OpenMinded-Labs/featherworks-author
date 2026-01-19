use featherworks_author::storage::database;
use featherworks_author::services::{scenes_service, recovery_service};
use featherworks_author::domain::patch;
use tempfile::tempdir;

#[test]
fn recovery_reconstructs_scene() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("r.sqlite");
    let journal_path = dir.path().join("project.journal");
    let conn = database::create_database(db_path.to_str().unwrap(), "P", "A", None, None, None).unwrap();
    scenes_service::set_journal_path(Some(journal_path.to_string_lossy().to_string()));

    let chapters = database::list_chapters(&conn).unwrap();
    let scenes = database::list_scenes(&conn, &chapters[0].id).unwrap();
    let scene_id = &scenes[0].id;

    // Build up text via incremental patches to force snapshot eventually
    for i in 0..30u32 {
        let txt = format!("{i} ");
        let p = patch::Patch(patch::PatchKind::InsertText { offset: 0, text: txt });
        scenes_service::apply_patch(&conn, scene_id, p).unwrap();
    }

    // Simulate DB loss by not reading DB state, just use journal
    let report_opt = recovery_service::attempt_recovery(journal_path.to_str().unwrap()).unwrap();
    assert!(report_opt.is_some());
    let report = report_opt.unwrap();
    assert!(report.snapshot_count >= 1);
    let rec_scene = report.scenes.iter().find(|s| s.scene_id == *scene_id).expect("scene recovered");
    let plain = featherworks_author::domain::doc::to_plain_text(&rec_scene.doc);
    assert!(plain.len() > 10, "Recovered plain text too short: {plain}");
}
