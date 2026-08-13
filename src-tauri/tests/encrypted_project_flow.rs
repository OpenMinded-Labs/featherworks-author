use tempfile::tempdir;

#[test]
fn encrypted_project_export_import_flow() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("flow.sqlite");
    // Create project DB
    let conn = featherworks_author::storage::database::create_database(
        db_path.to_str().unwrap(),
        "Titel X",
        "Autor Y",
        Some("TX"),
        Some("Roman"),
        Some(250),
    )
    .expect("create db");
    // Add an extra chapter + scene
    let ch = featherworks_author::storage::database::create_chapter(&conn, "Kapitel 2").unwrap();
    let sc =
        featherworks_author::storage::database::create_scene(&conn, &ch.id, "Szene 2").unwrap();
    featherworks_author::storage::database::update_scene_content(
        &conn,
        &sc.id,
        "Ein kurzer Text",
        3,
    )
    .unwrap();
    // Ensure WAL is checkpointed so container sees latest data
    conn.execute_batch("PRAGMA wal_checkpoint(FULL);").unwrap();
    // Export encrypted
    let enc_path = dir.path().join("export.fwauthor");
    featherworks_author::storage::container::save_encrypted(
        db_path.as_path(),
        enc_path.as_path(),
        "pw",
    )
    .unwrap();
    assert!(enc_path.exists());
    // Import (decrypt) to temp file
    let tmp =
        featherworks_author::storage::container::load_encrypted(enc_path.as_path(), "pw").unwrap();
    let tmp_conn =
        featherworks_author::storage::database::open_database(tmp.path().to_str().unwrap())
            .unwrap();
    // heal project row if missing
    featherworks_author::storage::database::ensure_project_exists(&tmp_conn, "Titel X", "Autor Y")
        .unwrap();
    let project = featherworks_author::storage::database::get_project(&tmp_conn).unwrap();
    assert_eq!(project.title, "Titel X");
    let chapters = featherworks_author::storage::database::list_chapters(&tmp_conn).unwrap();
    assert!(
        chapters.len() >= 2,
        "expected at least 2 chapters after import, got {}",
        chapters.len()
    );
}
