//! Text Chunking Module for RAG
//!
//! Splits text into overlapping chunks for better context retrieval.
//! Uses ~400-500 token chunks with 25% overlap.

/// Approximate tokens per character (for rough estimation)
/// German text averages ~4 chars per token
const CHARS_PER_TOKEN: usize = 4;

/// Target chunk size in tokens
const TARGET_TOKENS: usize = 450;
/// Target chunk size in characters
const TARGET_CHARS: usize = TARGET_TOKENS * CHARS_PER_TOKEN; // ~1800 chars

/// Overlap percentage (25%)
const OVERLAP_PERCENT: f32 = 0.25;
/// Overlap in characters
const OVERLAP_CHARS: usize = (TARGET_CHARS as f32 * OVERLAP_PERCENT) as usize; // ~450 chars

/// A text chunk with metadata
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TextChunk {
    /// Unique chunk ID
    pub id: String,
    /// Source document ID
    pub source_id: String,
    /// Source type: "scene", "entity", "rag_document"
    pub source_type: String,
    /// Chunk index within the source
    pub chunk_index: usize,
    /// Total chunks from this source
    pub total_chunks: usize,
    /// The actual text content
    pub content: String,
    /// Character offset in original document
    pub start_offset: usize,
    /// Character end offset
    pub end_offset: usize,
}

/// Split text into overlapping chunks
///
/// Uses sentence boundaries when possible to avoid cutting mid-sentence.
pub fn chunk_text(text: &str, source_id: &str, source_type: &str) -> Vec<TextChunk> {
    let text = text.trim();
    if text.is_empty() {
        return Vec::new();
    }

    // If text is small enough, return as single chunk
    if text.len() <= TARGET_CHARS {
        return vec![TextChunk {
            id: nanoid::nanoid!(),
            source_id: source_id.to_string(),
            source_type: source_type.to_string(),
            chunk_index: 0,
            total_chunks: 1,
            content: text.to_string(),
            start_offset: 0,
            end_offset: text.len(),
        }];
    }

    let mut chunks = Vec::new();
    let mut start = 0;
    let step = TARGET_CHARS - OVERLAP_CHARS; // ~1350 chars step

    while start < text.len() {
        // Calculate end position
        let mut end = (start + TARGET_CHARS).min(text.len());

        // Try to find a sentence boundary near the end
        if end < text.len() {
            end = find_sentence_boundary(text, end);
        }

        // Extract chunk content
        let content = text[start..end].trim().to_string();

        if !content.is_empty() {
            chunks.push(TextChunk {
                id: nanoid::nanoid!(),
                source_id: source_id.to_string(),
                source_type: source_type.to_string(),
                chunk_index: chunks.len(),
                total_chunks: 0, // Will be set later
                content,
                start_offset: start,
                end_offset: end,
            });
        }

        // Move start position with overlap
        start += step;

        // Ensure we don't get stuck
        if start >= end {
            start = end;
        }
    }

    // Update total_chunks count
    let total = chunks.len();
    for chunk in &mut chunks {
        chunk.total_chunks = total;
    }

    chunks
}

/// Find a sentence boundary near the target position
/// Looks for '. ', '! ', '? ', or paragraph breaks
fn find_sentence_boundary(text: &str, target: usize) -> usize {
    // Look within ±200 chars of target
    let search_start = target.saturating_sub(200);
    let search_end = (target + 200).min(text.len());

    let search_text = &text[search_start..search_end];

    // Find sentence endings
    let mut best_pos = target;
    let mut best_distance = usize::MAX;

    for (i, c) in search_text.char_indices() {
        let abs_pos = search_start + i;

        // Check for sentence endings
        let is_boundary = matches!(c, '.' | '!' | '?' | '\n')
            && search_text
                .get(i + 1..i + 2)
                .map(|s| s.starts_with(' ') || s.starts_with('\n'))
                .unwrap_or(true);

        if is_boundary {
            let distance = if abs_pos > target {
                abs_pos - target
            } else {
                target - abs_pos
            };

            if distance < best_distance {
                best_distance = distance;
                best_pos = abs_pos + 1; // Include the punctuation
            }
        }
    }

    // If we found a good boundary within range, use it
    if best_distance < 200 {
        best_pos
    } else {
        // Fallback: find next space after target
        text[target..]
            .find(' ')
            .map(|i| target + i)
            .unwrap_or(target)
    }
}

/// Chunk scenes from the database for RAG indexing
pub fn chunk_scene(scene_id: &str, scene_title: &str, content: &str) -> Vec<TextChunk> {
    // Add scene title as prefix for context
    let prefixed = format!("[Szene: {}]\n\n{}", scene_title, content);
    chunk_text(&prefixed, scene_id, "scene")
}

/// Chunk an entity description
pub fn chunk_entity(
    entity_id: &str,
    entity_name: &str,
    entity_type: &str,
    description: &str,
) -> Vec<TextChunk> {
    // Entities are usually short, but chunk if needed
    let prefixed = format!("[{}: {}]\n\n{}", entity_type, entity_name, description);
    chunk_text(&prefixed, entity_id, "entity")
}

/// Chunk a RAG document
pub fn chunk_rag_document(doc_id: &str, doc_name: &str, content: &str) -> Vec<TextChunk> {
    let prefixed = format!("[Dokument: {}]\n\n{}", doc_name, content);
    chunk_text(&prefixed, doc_id, "rag_document")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_small_text_single_chunk() {
        let text = "Dies ist ein kurzer Text.";
        let chunks = chunk_text(text, "test", "test");
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].content, text);
    }

    #[test]
    fn test_long_text_multiple_chunks() {
        // Create a text longer than TARGET_CHARS
        let text = "Lorem ipsum dolor sit amet. ".repeat(200);
        let chunks = chunk_text(&text, "test", "test");
        assert!(chunks.len() > 1);

        // Check overlap exists
        if chunks.len() >= 2 {
            let end_of_first = &chunks[0].content[chunks[0].content.len().saturating_sub(100)..];
            let start_of_second = &chunks[1].content[..100.min(chunks[1].content.len())];
            // There should be some overlap
            assert!(
                chunks[0].end_offset > chunks[1].start_offset
                    || end_of_first.contains(&start_of_second[..20.min(start_of_second.len())])
            );
        }
    }

    #[test]
    fn test_sentence_boundary() {
        let text = "Erster Satz hier. Zweiter Satz dort. Dritter Satz folgt. Ende.";
        let boundary = find_sentence_boundary(text, 20);
        // Should snap to a sentence boundary
        assert!(text[..boundary].ends_with('.') || text[..boundary].ends_with(". "));
    }
}
