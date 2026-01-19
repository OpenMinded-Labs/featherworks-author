use std::collections::HashMap;
use serde::{Serialize,Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StyleAnalysis {
    pub vampire_verbs: Vec<String>,
    pub word_repetitions: Vec<String>,
    pub sentence_complexity: f32,
    pub readability_score: f32,
    pub total_words: usize,
    pub dialog_ratio: f32,
    pub avg_sentence_length: f32,
    pub sentence_length_variance: f32,
}

static VAMPIRE_VERBS: &[&str] = &["war","waren","hatte","hatten","wurde","wurden","gewesen","geworden","sein","ist","sind"];

pub fn analyze_text_style(text: &str) -> StyleAnalysis {
    let sentences: Vec<&str> = text.split(&['.','!','?'][..]).filter(|s| s.trim().len()>0).collect();
    let words: Vec<&str> = text.split_whitespace().collect();
    let mut found_vampires = Vec::new();
    for w in &words { let lw = w.trim_matches(|c:char| !c.is_alphabetic()).to_lowercase(); if VAMPIRE_VERBS.contains(&lw.as_str()) { found_vampires.push(lw); } }
    let mut counts: HashMap<String,u32> = HashMap::new();
    for w in &words { let key = w.to_lowercase(); *counts.entry(key).or_insert(0) += 1; }
    let repetitions = counts.iter().filter(|(w,c)| w.len()>4 && **c>3).map(|(w,_)| w.clone()).collect();
    let sentence_lengths: Vec<usize> = sentences.iter().map(|s| s.split_whitespace().count()).collect();
    let avg_sentence_length = if sentence_lengths.is_empty(){0.0}else{(sentence_lengths.iter().sum::<usize>() as f32)/(sentence_lengths.len() as f32)};
    let variance = if sentence_lengths.len()>1 { let mean=avg_sentence_length; sentence_lengths.iter().map(|l| { let d=(*l as f32)-mean; d*d }).sum::<f32>() /(sentence_lengths.len() as f32)} else {0.0};
    let dialog_tokens = text.matches('"').count();
    let dialog_ratio = if words.is_empty(){0.0}else{ (dialog_tokens as f32 / words.len() as f32).min(1.0)};
    let complexity = sentence_complexity(text);
    let readability_score = readability(text);
    StyleAnalysis { vampire_verbs: found_vampires, word_repetitions: repetitions, sentence_complexity: complexity, readability_score, total_words: words.len(), dialog_ratio, avg_sentence_length, sentence_length_variance: variance }
}
fn sentence_complexity(text:&str)->f32{ let s = text.split(&['.','!','?'][..]).filter(|p| p.trim().len()>0).count() as f32; let w = text.split_whitespace().count() as f32; if s>0.0 { w/s } else {0.0}}
fn readability(text:&str)->f32{ 85.0 - (sentence_complexity(text)*0.5) }
