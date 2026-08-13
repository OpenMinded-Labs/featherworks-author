use featherworks_author::entities::{configure_entities, scan};

#[test]
fn test_entities_basic() {
    configure_entities(&[
        ("id1".into(), "Anna".into()),
        ("id2".into(), "Berlin".into()),
    ]);
    let text = "Anna reiste nach Berlin. ANNA schrieb dort.";
    let hits = scan(text);
    assert!(hits.iter().any(|h| h.text.eq_ignore_ascii_case("Anna")));
    assert!(hits.iter().any(|h| h.text.eq_ignore_ascii_case("Berlin")));
    // multiple matches for Anna
    let anna_count = hits
        .iter()
        .filter(|h| h.text.eq_ignore_ascii_case("Anna"))
        .count();
    assert!(anna_count >= 2);
}
