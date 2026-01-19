//! Document model (FEAT-001) – minimal AST + serialization.
//! Expanded incrementally (W1). Marks: bold, italic, underline, strike.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum Node {
    #[serde(rename = "doc")] Doc { content: Vec<Node> },
    #[serde(rename = "paragraph")] Paragraph { content: Vec<Node> },
    #[serde(rename = "heading")] Heading { level: u8, content: Vec<Node> },
    #[serde(rename = "text")] Text { text: String, #[serde(default)] marks: Vec<Mark> },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum Mark {
    #[serde(rename = "bold")] Bold,
    #[serde(rename = "italic")] Italic,
    #[serde(rename = "underline")] Underline,
    #[serde(rename = "strike")] Strike,
}

impl Node {
    pub fn empty_doc() -> Self { Node::Doc { content: vec![Node::Paragraph { content: vec![] }] } }
    pub fn plain_text(s: &str) -> Self { Node::Doc { content: vec![Node::Paragraph { content: vec![Node::Text { text: s.to_string(), marks: vec![] }] }] } }

    pub fn collect_plain_text(&self, out: &mut String) {
        match self {
            Node::Doc { content } | Node::Paragraph { content } | Node::Heading { content, .. } => {
                for c in content { c.collect_plain_text(out); }
                if matches!(self, Node::Paragraph {..}) { out.push('\n'); }
            }
            Node::Text { text, .. } => out.push_str(text),
        }
    }
}

pub fn to_plain_text(root: &Node) -> String {
    let mut s = String::new();
    root.collect_plain_text(&mut s);
    s.trim_end().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_text_simple() {
        let doc = Node::plain_text("Hello World");
        let pt = to_plain_text(&doc);
        assert_eq!(pt, "Hello World");
    }
}
