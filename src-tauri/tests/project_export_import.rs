use tempfile::tempdir;

#[test]
fn test_project_export_import_roundtrip() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("proj.sqlite");
    // Create a real database via API
    let conn = featherworks_author::storage::database::create_database(
        db_path.to_str().unwrap(),
        "Titel", "Autor", None, None, None
    ).expect("create db");
    // Add extra chapter + scene
    let ch = featherworks_author::storage::database::create_chapter(&conn, "Kapitel X").unwrap();
    let sc = featherworks_author::storage::database::create_scene(&conn, &ch.id, "Szene X").unwrap();
    featherworks_author::storage::database::update_scene_content(&conn, &sc.id, "Ein kurzer Text mit Worten", 5).unwrap();
    conn.execute_batch("PRAGMA wal_checkpoint(FULL);").unwrap();
    // Export encrypted
    let enc_path = dir.path().join("proj.fwauthor");
    featherworks_author::storage::container::save_encrypted(db_path.as_path(), enc_path.as_path(), "pw").unwrap();
    assert!(enc_path.exists());
    // Import (decrypt) and open
    let tmp = featherworks_author::storage::container::load_encrypted(enc_path.as_path(), "pw").unwrap();
    let opened = featherworks_author::storage::database::open_database(tmp.path().to_str().unwrap()).unwrap();
    // Basic assertions
    featherworks_author::storage::database::ensure_project_exists(&opened, "Titel", "Autor").unwrap();
    let project = featherworks_author::storage::database::get_project(&opened).unwrap();
    assert_eq!(project.title, "Titel");
    let chapters = featherworks_author::storage::database::list_chapters(&opened).unwrap();
    assert!(chapters.len() >= 2);
}
