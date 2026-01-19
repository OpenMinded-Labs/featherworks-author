use criterion::{criterion_group, criterion_main, Criterion, black_box};
use featherworks_author::storage::database;
use featherworks_author::services::scenes_service;
use featherworks_author::domain::{doc, patch};
use tempfile::tempdir;

fn bench_full_replace(c: &mut Criterion) {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("bench.sqlite");
    let conn = database::create_database(db_path.to_str().unwrap(), "Bench", "Tester", None, None, None).unwrap();
    let chapters = database::list_chapters(&conn).unwrap();
    let scenes = database::list_scenes(&conn, &chapters[0].id).unwrap();
    let scene_id = scenes[0].id.clone();

    let large_text = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(400); // ~28k chars
    c.bench_function("apply_full_replace_large", |b| {
        b.iter(|| {
            let ndoc = doc::Node::plain_text(&large_text);
            let p = patch::Patch::full(ndoc);
            let wc = scenes_service::apply_patch(&conn, &scene_id, p).unwrap();
            black_box(wc);
        })
    });
}

criterion_group!(benches, bench_full_replace);
criterion_main!(benches);
