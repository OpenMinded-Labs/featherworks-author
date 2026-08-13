//! Patch & diff skeleton (FEAT-005). For now a naive full replace; later structural diff.
use crate::domain::doc::Node;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PatchKind {
    FullReplace { new_doc: Node },
    InsertText { offset: usize, text: String },
    DeleteRange { start: usize, end: usize },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Patch(pub PatchKind);

impl Patch {
    pub fn full(new_doc: Node) -> Self {
        Patch(PatchKind::FullReplace { new_doc })
    }

    pub fn apply(&self, old: &Node) -> Node {
        match &self.0 {
            PatchKind::FullReplace { new_doc } => new_doc.clone(),
            PatchKind::InsertText { offset, text } => {
                let mut plain = crate::domain::doc::to_plain_text(old);
                if *offset <= plain.len() {
                    plain.insert_str(*offset, text);
                }
                Node::plain_text(&plain)
            }
            PatchKind::DeleteRange { start, end } => {
                let mut plain = crate::domain::doc::to_plain_text(old);
                if *start <= *end && *end <= plain.len() {
                    plain.replace_range(*start..*end, "");
                }
                Node::plain_text(&plain)
            }
        }
    }
}

/// Compute a minimal patch between two plain-text based docs using prefix/suffix trim.
pub fn diff_plain(old: &Node, new: &Node) -> Patch {
    let old_txt = crate::domain::doc::to_plain_text(old);
    let new_txt = crate::domain::doc::to_plain_text(new);
    if old_txt == new_txt {
        return Patch::full(new.clone());
    }
    // Find common prefix
    let mut prefix = 0usize;
    let min_len = old_txt.len().min(new_txt.len());
    while prefix < min_len && old_txt.as_bytes()[prefix] == new_txt.as_bytes()[prefix] {
        prefix += 1;
    }
    // Find common suffix
    let mut suffix = 0usize;
    while suffix < (min_len - prefix)
        && old_txt.as_bytes()[old_txt.len() - 1 - suffix]
            == new_txt.as_bytes()[new_txt.len() - 1 - suffix]
    {
        suffix += 1;
    }
    let old_mid_end = old_txt.len() - suffix;
    let new_mid_end = new_txt.len() - suffix;
    let old_mid = &old_txt[prefix..old_mid_end];
    let new_mid = &new_txt[prefix..new_mid_end];
    match (old_mid.is_empty(), new_mid.is_empty()) {
        (true, false) => Patch(PatchKind::InsertText {
            offset: prefix,
            text: new_mid.to_string(),
        }),
        (false, true) => Patch(PatchKind::DeleteRange {
            start: prefix,
            end: old_mid_end,
        }),
        _ => {
            // Replacement: treat as delete+insert -> fallback to FullReplace for simplicity now
            Patch::full(new.clone())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::doc::Node;

    #[test]
    fn full_replace_apply() {
        let old = Node::plain_text("A");
        let new = Node::plain_text("B");
        let patch = Patch::full(new.clone());
        let applied = patch.apply(&old);
        assert_eq!(applied, new);
    }

    #[test]
    fn insert_text_patch() {
        let old = Node::plain_text("Hello World");
        let patch = Patch(PatchKind::InsertText {
            offset: 6,
            text: "Brave ".into(),
        });
        let applied = patch.apply(&old);
        assert_eq!(
            crate::domain::doc::to_plain_text(&applied),
            "Hello Brave World"
        );
    }

    #[test]
    fn delete_range_patch() {
        let old = Node::plain_text("Hello Brave World");
        let patch = Patch(PatchKind::DeleteRange { start: 6, end: 12 }); // remove 'Brave '
        let applied = patch.apply(&old);
        assert_eq!(crate::domain::doc::to_plain_text(&applied), "Hello World");
    }

    #[test]
    fn diff_insert() {
        let old = Node::plain_text("Hello World");
        let new = Node::plain_text("Hello Brave World");
        let p = diff_plain(&old, &new);
        let applied = p.apply(&old);
        assert_eq!(
            crate::domain::doc::to_plain_text(&applied),
            "Hello Brave World"
        );
    }

    #[test]
    fn diff_delete() {
        let old = Node::plain_text("Hello Brave World");
        let new = Node::plain_text("Hello World");
        let p = diff_plain(&old, &new);
        let applied = p.apply(&old);
        assert_eq!(crate::domain::doc::to_plain_text(&applied), "Hello World");
    }
}
