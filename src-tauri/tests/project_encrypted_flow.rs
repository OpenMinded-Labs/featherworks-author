use tempfile::tempdir;

#[test]
fn project_encrypted_export_import_flow() {
    // Create temp sqlite
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("proj.sqlite");
    // Use real create_database API
    let conn = featherworks_author::storage::database::create_database(
        db_path.to_str().unwrap(),
        "Test Projekt",
        "Autor",
        None,
        None,
        None,
    )
    .expect("create db");
    // Touch scene content
    // Fetch first chapter & scene IDs
    let chapters = featherworks_author::storage::database::list_chapters(&conn).unwrap();
    assert!(!chapters.is_empty());
    // Insert second scene
    let scene =
        featherworks_author::storage::database::create_scene(&conn, &chapters[0].id, "Szene X")
            .unwrap();
    featherworks_author::storage::database::update_scene_content(&conn, &scene.id, "Hallo Welt", 2)
        .unwrap();
    conn.execute_batch("PRAGMA wal_checkpoint(FULL);").unwrap();

    // Export encrypted
    let enc_path = dir.path().join("proj.enc");
    featherworks_author::storage::container::save_encrypted(
        db_path.as_path(),
        enc_path.as_path(),
        "pw",
    )
    .expect("encrypt");
    assert!(enc_path.exists());

    // Import (decrypt) to temp
    let tmp = featherworks_author::storage::container::load_encrypted(enc_path.as_path(), "pw")
        .expect("decrypt");
    let imported_conn =
        featherworks_author::storage::database::open_database(tmp.path().to_str().unwrap())
            .expect("open imported");
    // Ensure project row exists
    featherworks_author::storage::database::ensure_project_exists(
        &imported_conn,
        "Fallback",
        "Autor",
    )
    .unwrap();

    // Verify scene list
    let chapters2 = featherworks_author::storage::database::list_chapters(&imported_conn).unwrap();
    assert!(!chapters2.is_empty());
    let scenes =
        featherworks_author::storage::database::list_scenes(&imported_conn, &chapters2[0].id)
            .unwrap();
    assert!(scenes.iter().any(|s| s.title == "Szene X"));
}
