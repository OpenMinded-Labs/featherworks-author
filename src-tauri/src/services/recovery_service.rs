//! Recovery service: rebuild latest scene states from journal lines.
use crate::domain::{
    doc::Node,
    patch::{Patch, PatchKind},
};
use std::{
    collections::HashMap,
    fs::File,
    io::{BufRead, BufReader},
};

#[derive(Debug, serde::Serialize)]
pub struct RecoveredSceneState {
    pub scene_id: String,
    pub word_count: i32,
    pub doc: Node,
    pub from_snapshot: bool,
}

#[derive(Debug, serde::Serialize)]
pub struct RecoveryReport {
    pub scenes: Vec<RecoveredSceneState>,
    pub snapshot_count: usize,
    pub incremental_count: usize,
}

pub fn attempt_recovery(journal_path: &str) -> std::io::Result<Option<RecoveryReport>> {
    if !std::path::Path::new(journal_path).exists() {
        return Ok(None);
    }
    let f = File::open(journal_path)?;
    let rdr = BufReader::new(f);
    let mut scenes: HashMap<String, RecoveredSceneState> = HashMap::new();
    let mut snap_ct = 0usize;
    let mut inc_ct = 0usize;

    for line in rdr.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };
        if line.trim().is_empty() {
            continue;
        }
        let v: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let scene_id = v
            .get("scene_id")
            .and_then(|s| s.as_str())
            .unwrap_or("")
            .to_string();
        if scene_id.is_empty() {
            continue;
        }
        let word_count = v.get("word_count").and_then(|w| w.as_i64()).unwrap_or(0) as i32;
        let snapshot = v.get("snapshot").and_then(|b| b.as_bool()).unwrap_or(false);
        if snapshot {
            snap_ct += 1;
            // Use snapshot doc
            if let Some(cj) = v.get("content_json") {
                if let Ok(doc) = serde_json::from_value::<Node>(cj.clone()) {
                    scenes.insert(
                        scene_id.clone(),
                        RecoveredSceneState {
                            scene_id,
                            word_count,
                            doc,
                            from_snapshot: true,
                        },
                    );
                }
            }
        } else {
            inc_ct += 1;
            let entry = scenes
                .entry(scene_id.clone())
                .or_insert_with(|| RecoveredSceneState {
                    scene_id: scene_id.clone(),
                    word_count: 0,
                    doc: Node::empty_doc(),
                    from_snapshot: false,
                });
            // Reconstruct plain text, apply patch on plain text doc variant
            let mut current_plain = crate::domain::doc::to_plain_text(&entry.doc);
            let pk = v.get("patch_kind").and_then(|k| k.as_str()).unwrap_or("");
            match pk {
                "insertText" => {
                    if let (Some(offset), Some(text)) = (
                        v.get("offset").and_then(|x| x.as_u64()).map(|o| o as usize),
                        v.get("text").and_then(|t| t.as_str()),
                    ) {
                        if offset <= current_plain.len() {
                            current_plain.insert_str(offset, text);
                        }
                    }
                }
                "deleteRange" => {
                    if let (Some(start), Some(end)) = (
                        v.get("start").and_then(|x| x.as_u64()).map(|o| o as usize),
                        v.get("end").and_then(|x| x.as_u64()).map(|o| o as usize),
                    ) {
                        if start <= end && end <= current_plain.len() {
                            current_plain.replace_range(start..end, "");
                        }
                    }
                }
                _ => { /* ignore unknown */ }
            }
            entry.doc = Node::plain_text(&current_plain);
            entry.word_count = word_count;
        }
    }

    if scenes.is_empty() {
        return Ok(None);
    }
    Ok(Some(RecoveryReport {
        scenes: scenes.into_values().collect(),
        snapshot_count: snap_ct,
        incremental_count: inc_ct,
    }))
}

/// Convert recovered scene(s) back into patches (full replace) for applying into DB after user confirmation.
pub fn recovered_to_patches(report: &RecoveryReport) -> Vec<(String, Patch)> {
    report
        .scenes
        .iter()
        .map(|s| {
            (
                s.scene_id.clone(),
                Patch(PatchKind::FullReplace {
                    new_doc: s.doc.clone(),
                }),
            )
        })
        .collect()
}
