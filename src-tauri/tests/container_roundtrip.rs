use tempfile::tempdir;

#[test]
fn test_container_roundtrip() {
    let dir = tempdir().unwrap();
    let sqlite_path = dir.path().join("test.sqlite");
    std::fs::write(&sqlite_path, b"SQLITEDATA").unwrap();
    let enc_path = dir.path().join("test.fwauthor");
    featherworks_author::storage::container::save_encrypted(&sqlite_path, &enc_path, "pass").unwrap();
    let _tmp = featherworks_author::storage::container::load_encrypted(&enc_path, "pass").unwrap();
}
