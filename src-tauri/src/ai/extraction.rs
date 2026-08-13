//! Document Text Extraction Module
//!
//! Extracts text from various document formats:
//! - PDF (via pdf-extract)
//! - DOCX (via docx-rs)
//! - TXT, MD (plain text)

use std::fs;
use std::path::Path;

/// Result of document extraction
#[derive(Debug)]
pub struct ExtractedDocument {
    /// Extracted plain text content
    pub content: String,
    /// Original file name
    pub file_name: String,
    /// File type (extension)
    pub file_type: String,
    /// File size in bytes
    pub file_size: u64,
    /// Number of pages (if applicable)
    pub page_count: Option<usize>,
}

/// Extract text from a document file
pub fn extract_text(path: &str) -> Result<ExtractedDocument, String> {
    let file_path = Path::new(path);

    let file_name = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown")
        .to_string();

    let extension = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let file_size = fs::metadata(path).map(|m| m.len()).unwrap_or(0);

    let (content, page_count) = match extension.as_str() {
        "txt" | "md" => {
            let text =
                fs::read_to_string(path).map_err(|e| format!("Failed to read text file: {}", e))?;
            (text, None)
        }
        "pdf" => extract_pdf(path)?,
        "docx" => extract_docx(path)?,
        _ => return Err(format!("Unsupported file type: {}", extension)),
    };

    Ok(ExtractedDocument {
        content,
        file_name,
        file_type: extension,
        file_size,
        page_count,
    })
}

/// Extract text from PDF using pdf-extract
fn extract_pdf(path: &str) -> Result<(String, Option<usize>), String> {
    // Try to extract text using pdf-extract
    match pdf_extract::extract_text_from_mem(&fs::read(path).map_err(|e| e.to_string())?) {
        Ok(text) => {
            // Clean up extracted text
            let cleaned = clean_extracted_text(&text);
            // Estimate page count (rough: ~3000 chars per page)
            let page_count = Some((cleaned.len() / 3000).max(1));
            Ok((cleaned, page_count))
        }
        Err(e) => {
            // Fallback: return error message as content
            log::warn!("PDF extraction failed: {}", e);
            Err(format!(
                "PDF-Extraktion fehlgeschlagen: {}. Bitte als TXT exportieren.",
                e
            ))
        }
    }
}

/// Extract text from DOCX using zip extraction
fn extract_docx(path: &str) -> Result<(String, Option<usize>), String> {
    use std::io::Read;
    use zip::ZipArchive;

    let file = std::fs::File::open(path).map_err(|e| format!("Failed to open DOCX: {}", e))?;

    let mut archive =
        ZipArchive::new(file).map_err(|e| format!("Failed to read DOCX archive: {}", e))?;

    // Read document.xml from the archive
    let mut document_xml = String::new();
    if let Ok(mut file) = archive.by_name("word/document.xml") {
        file.read_to_string(&mut document_xml)
            .map_err(|e| format!("Failed to read document.xml: {}", e))?;
    } else {
        return Err("DOCX does not contain word/document.xml".to_string());
    }

    // Simple XML text extraction - find all text content between <w:t> tags
    let text = extract_text_from_xml(&document_xml);
    let cleaned = clean_extracted_text(&text);

    // Estimate page count
    let page_count = Some((cleaned.len() / 3000).max(1));

    Ok((cleaned, page_count))
}

/// Extract text content from DOCX XML
fn extract_text_from_xml(xml: &str) -> String {
    let mut result = String::new();
    let mut in_text_tag = false;
    let mut current_text = String::new();
    let mut chars = xml.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '<' {
            // Start of tag
            let mut tag = String::new();
            while let Some(&next) = chars.peek() {
                if next == '>' {
                    chars.next();
                    break;
                }
                tag.push(chars.next().unwrap());
            }

            // Check tag type
            if tag.starts_with("w:p") && !tag.starts_with("w:pPr") {
                // Paragraph start - add newline
                if !result.is_empty() && !result.ends_with('\n') {
                    result.push('\n');
                }
            } else if tag.starts_with("w:t") {
                // Text tag start
                in_text_tag = true;
                current_text.clear();
            } else if tag == "/w:t" {
                // Text tag end
                if in_text_tag {
                    result.push_str(&current_text);
                }
                in_text_tag = false;
            } else if tag == "w:tab" || tag == "w:tab/" {
                // Tab character
                result.push(' ');
            } else if tag == "w:br" || tag == "w:br/" {
                // Line break
                result.push('\n');
            }
        } else if in_text_tag {
            current_text.push(c);
        }
    }

    result
}

/// Clean up extracted text
fn clean_extracted_text(text: &str) -> String {
    // Remove excessive whitespace
    let mut result = String::with_capacity(text.len());
    let mut prev_was_newline = false;
    let mut prev_was_space = false;

    for c in text.chars() {
        match c {
            '\n' | '\r' => {
                if !prev_was_newline {
                    result.push('\n');
                    prev_was_newline = true;
                }
                prev_was_space = false;
            }
            ' ' | '\t' => {
                if !prev_was_space && !prev_was_newline {
                    result.push(' ');
                    prev_was_space = true;
                }
            }
            _ => {
                result.push(c);
                prev_was_newline = false;
                prev_was_space = false;
            }
        }
    }

    result.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_text() {
        let dirty = "Hello   \n\n\n  World  \t\t  Test";
        let clean = clean_extracted_text(dirty);
        assert!(!clean.contains("   "));
        assert!(!clean.contains("\n\n\n"));
    }
}
