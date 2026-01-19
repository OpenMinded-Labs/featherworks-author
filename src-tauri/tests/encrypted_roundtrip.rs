use std::io::Write;

#[test]
fn encrypted_roundtrip_memory() {
    // Lightweight smoke test for container JSON header compatibility
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("proj.sqlite");
    // create a minimal sqlite file
    {
        let mut f = std::fs::File::create(&db_path).unwrap();
        f.write_all(b"SQLite format 3\0").unwrap(); // signature (not a real db, but enough bytes for our compression/encryption path)
    }
    let enc_path = dir.path().join("proj.fwauthor");
    featherworks_author::storage::container::save_encrypted(&db_path, &enc_path, "pw").unwrap();
    let _tmp = featherworks_author::storage::container::load_encrypted(&enc_path, "pw").unwrap();
}
