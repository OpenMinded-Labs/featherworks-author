use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Project {
    pub id: String,
    pub title: String,
    pub author: String,
    pub short_name: Option<String>,
    pub genre: Option<String>,
    pub target_pages: Option<i32>,
    pub chapters: Vec<Chapter>,
    #[serde(default)]
    pub metadata: Option<BookMetadata>,
    #[serde(default)]
    pub editions: Option<Vec<Edition>>,
}

// ============================================================
// Edition / Publication Profile
// ============================================================

/// A specific edition/format of the book (E-Book, Softcover, Hardcover, etc.)
/// Each edition can have its own ISBN, layout settings, and format-specific metadata
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Edition {
    pub id: String,
    pub name: String, // z.B. "E-Book (Kindle)", "Taschenbuch", "Hardcover"

    #[serde(rename = "editionType")]
    pub edition_type: EditionType,

    // Format-specific ISBN
    #[serde(default)]
    pub isbn: Option<String>,
    #[serde(rename = "isbn13")]
    #[serde(default)]
    pub isbn_13: Option<String>,

    // ASIN for Kindle
    #[serde(default)]
    pub asin: Option<String>,

    // Pricing
    #[serde(default)]
    pub price: Option<f64>,
    #[serde(default)]
    pub currency: Option<String>,

    // Layout preset for this edition
    #[serde(rename = "layoutPresetId")]
    #[serde(default)]
    pub layout_preset_id: Option<String>,

    // Edition-specific layout overrides (optional)
    #[serde(rename = "layoutOverrides")]
    #[serde(default)]
    pub layout_overrides: Option<EditionLayoutOverrides>,

    // Edition-specific content differences
    #[serde(rename = "includeAboutAuthor")]
    #[serde(default = "default_true")]
    pub include_about_author: bool,
    #[serde(rename = "includeAlsoBy")]
    #[serde(default = "default_true")]
    pub include_also_by: bool,
    #[serde(rename = "includePreview")]
    #[serde(default)]
    pub include_preview: bool, // Preview of next book (common in e-books)
    #[serde(rename = "previewChapterId")]
    #[serde(default)]
    pub preview_chapter_id: Option<String>,

    // E-Book specific
    #[serde(rename = "ebookCoverPath")]
    #[serde(default)]
    pub ebook_cover_path: Option<String>, // Different resolution for e-books

    // Print specific
    #[serde(rename = "printCoverPath")]
    #[serde(default)]
    pub print_cover_path: Option<String>, // Full wrap cover with spine
    #[serde(rename = "spineWidth")]
    #[serde(default)]
    pub spine_width: Option<f64>, // in mm, calculated from page count
    #[serde(rename = "bleed")]
    #[serde(default)]
    pub bleed: Option<f64>, // in mm, typically 3mm for print

    // Distribution
    #[serde(default)]
    pub distributor: Option<String>, // KDP, IngramSpark, BoD, etc.
    #[serde(rename = "distributorId")]
    #[serde(default)]
    pub distributor_id: Option<String>,

    // Status
    #[serde(default = "default_false")]
    pub published: bool,
    #[serde(rename = "publishDate")]
    #[serde(default)]
    pub publish_date: Option<String>,

    #[serde(rename = "createdAt")]
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(rename = "updatedAt")]
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum EditionType {
    Ebook,
    EbookKindle,
    EbookEpub,
    Softcover,
    Hardcover,
    LargePrint,
    Audiobook,
    Pdf,
    Custom,
}

impl Default for EditionType {
    fn default() -> Self {
        EditionType::Ebook
    }
}

/// Layout overrides specific to an edition
/// These override the base layout preset for this specific edition
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct EditionLayoutOverrides {
    // Page size (for print editions)
    #[serde(rename = "pageWidth")]
    #[serde(default)]
    pub page_width: Option<f64>,
    #[serde(rename = "pageHeight")]
    #[serde(default)]
    pub page_height: Option<f64>,

    // Margins
    #[serde(rename = "marginTop")]
    #[serde(default)]
    pub margin_top: Option<f64>,
    #[serde(rename = "marginBottom")]
    #[serde(default)]
    pub margin_bottom: Option<f64>,
    #[serde(rename = "marginInner")]
    #[serde(default)]
    pub margin_inner: Option<f64>,
    #[serde(rename = "marginOuter")]
    #[serde(default)]
    pub margin_outer: Option<f64>,

    // Typography
    #[serde(rename = "fontFamily")]
    #[serde(default)]
    pub font_family: Option<String>,
    #[serde(rename = "fontSize")]
    #[serde(default)]
    pub font_size: Option<f64>,
    #[serde(rename = "lineHeight")]
    #[serde(default)]
    pub line_height: Option<f64>,

    // Large print specific
    #[serde(rename = "largePrintFontSize")]
    #[serde(default)]
    pub large_print_font_size: Option<f64>, // typically 16-18pt
}

// ============================================================
// Book Metadata (shared across editions)
// ============================================================

/// Book metadata for publishing - editable by author
/// This is the "master" metadata, editions can override specific fields
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct BookMetadata {
    // Basic info
    #[serde(default)]
    pub subtitle: Option<String>,
    #[serde(rename = "authorBio")]
    #[serde(default)]
    pub author_bio: Option<String>,

    // Publishing info (default, can be overridden per edition)
    #[serde(default)]
    pub publisher: Option<String>,
    #[serde(rename = "publishDate")]
    #[serde(default)]
    pub publish_date: Option<String>,
    #[serde(default)]
    pub edition: Option<String>, // "1. Auflage", etc.
    #[serde(default)]
    pub language: Option<String>,

    // Copyright
    #[serde(rename = "copyrightYear")]
    #[serde(default)]
    pub copyright_year: Option<i32>,
    #[serde(rename = "copyrightHolder")]
    #[serde(default)]
    pub copyright_holder: Option<String>,
    #[serde(rename = "copyrightText")]
    #[serde(default)]
    pub copyright_text: Option<String>,
    #[serde(rename = "allRightsReserved")]
    #[serde(default = "default_true")]
    pub all_rights_reserved: bool,

    // Front matter content
    #[serde(default)]
    pub dedication: Option<String>,
    #[serde(default)]
    pub epigraph: Option<String>,
    #[serde(rename = "epigraphAuthor")]
    #[serde(default)]
    pub epigraph_author: Option<String>,
    #[serde(default)]
    pub acknowledgments: Option<String>,
    #[serde(default)]
    pub foreword: Option<String>,
    #[serde(rename = "forewordAuthor")]
    #[serde(default)]
    pub foreword_author: Option<String>,
    #[serde(default)]
    pub preface: Option<String>,
    #[serde(default)]
    pub introduction: Option<String>,

    // Back matter content
    #[serde(rename = "aboutAuthor")]
    #[serde(default)]
    pub about_author: Option<String>,
    #[serde(rename = "alsoByAuthor")]
    #[serde(default)]
    pub also_by_author: Option<Vec<String>>,

    // Series info
    #[serde(rename = "seriesName")]
    #[serde(default)]
    pub series_name: Option<String>,
    #[serde(rename = "seriesNumber")]
    #[serde(default)]
    pub series_number: Option<i32>,

    // Cover (master/source files)
    #[serde(rename = "coverImagePath")]
    #[serde(default)]
    pub cover_image_path: Option<String>,
    #[serde(rename = "coverDesigner")]
    #[serde(default)]
    pub cover_designer: Option<String>,

    // Categories / Keywords for distribution
    #[serde(default)]
    pub categories: Option<Vec<String>>, // BISAC codes
    #[serde(default)]
    pub keywords: Option<Vec<String>>, // For Amazon, etc.
    #[serde(default)]
    pub description: Option<String>, // Book blurb
    #[serde(rename = "shortDescription")]
    #[serde(default)]
    pub short_description: Option<String>, // 150 chars for some platforms
}

fn default_true() -> bool {
    true
}
fn default_false() -> bool {
    false
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Chapter {
    pub id: String,
    pub title: String,
    pub order: i32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Scene {
    pub id: String,
    pub chapter_id: String,
    pub title: String,
    pub order: i32,
    pub word_count: i32,
}
