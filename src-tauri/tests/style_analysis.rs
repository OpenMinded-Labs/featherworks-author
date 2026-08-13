use featherworks_author::analysis::style::analyze_text_style;

#[test]
fn test_style_repetitions() {
    let sample = "Er war müde. Er war traurig. Er war verloren. Er war still.";
    let res = analyze_text_style(sample);
    assert!(res.vampire_verbs.iter().any(|v| v == "war"));
    assert!(res.sentence_complexity > 1.0);
}
