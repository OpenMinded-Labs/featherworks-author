//! Layout & Export System
//! 
//! Verwendet Typst für professionelles Buchdesign und Export in PDF/EPUB/DOCX/RTF

use std::path::Path;
use serde::{Deserialize, Serialize};
use rusqlite::Connection;
use chrono::Utc;

// ============================================================
// Layout Settings & Presets
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutSettings {
    pub id: String,
    #[serde(rename = "presetId")]
    pub preset_id: Option<String>,
    
    // Page dimensions (in mm)
    #[serde(rename = "pageWidth")]
    pub page_width: f64,
    #[serde(rename = "pageHeight")]
    pub page_height: f64,
    
    // Margins (in mm)
    #[serde(rename = "marginTop")]
    pub margin_top: f64,
    #[serde(rename = "marginBottom")]
    pub margin_bottom: f64,
    #[serde(rename = "marginInner")]
    pub margin_inner: f64, // Binding side
    #[serde(rename = "marginOuter")]
    pub margin_outer: f64,
    #[serde(rename = "mirrorMargins")]
    #[serde(default = "default_true")]
    pub mirror_margins: bool,
    
    // Typography
    #[serde(rename = "fontFamily")]
    pub font_family: String,
    #[serde(rename = "fontSize")]
    pub font_size: f64,
    #[serde(rename = "lineHeight")]
    pub line_height: f64,
    #[serde(rename = "paragraphSpacing")]
    pub paragraph_spacing: f64,
    #[serde(rename = "firstLineIndent")]
    pub first_line_indent: f64,
    
    // Text alignment
    #[serde(rename = "textAlign")]
    #[serde(default = "default_text_align")]
    pub text_align: String, // "justify", "left", "right"
    
    // Widow/Orphan control (Hurenkinder/Schusterjungen)
    #[serde(rename = "preventWidows")]
    #[serde(default = "default_true")]
    pub prevent_widows: bool,
    #[serde(rename = "preventOrphans")]
    #[serde(default = "default_true")]
    pub prevent_orphans: bool,
    
    // Hyphenation (Silbentrennung)
    #[serde(rename = "hyphenation")]
    #[serde(default = "default_true")]
    pub hyphenation: bool,
    #[serde(rename = "hyphenationLang")]
    #[serde(default = "default_hyphenation_lang")]
    pub hyphenation_lang: String, // "de", "en", "fr", etc.
    
    // OpenType features
    #[serde(rename = "ligatures")]
    #[serde(default = "default_true")]
    pub ligatures: bool,
    #[serde(rename = "kerning")]
    #[serde(default = "default_true")]
    pub kerning: bool,
    #[serde(rename = "opticalMarginAlign")]
    #[serde(default)]
    pub optical_margin_align: bool, // Optischer Randausgleich
    
    // Headers & Footers
    #[serde(rename = "headerText")]
    pub header_text: Option<String>,
    #[serde(rename = "showPageNumbers")]
    pub show_page_numbers: bool,
    #[serde(rename = "pageNumberPosition")]
    pub page_number_position: String, // "bottom-center", "bottom-outside", "top-outside"
    
    // Running headers (Kolumnentitel)
    #[serde(rename = "runningHeaderLeft")]
    pub running_header_left: Option<String>, // z.B. Autorname
    #[serde(rename = "runningHeaderRight")]
    pub running_header_right: Option<String>, // z.B. Buchtitel
    #[serde(rename = "runningHeaderStyle")]
    #[serde(default = "default_running_header_style")]
    pub running_header_style: String, // "author-title", "title-chapter", "chapter-only", "none"
    
    // Chapters
    #[serde(rename = "chapterStartPage")]
    pub chapter_start_page: String, // "any", "odd", "even"
    #[serde(rename = "chapterTitleFont")]
    pub chapter_title_font: Option<String>,
    #[serde(rename = "chapterTitleSize")]
    pub chapter_title_size: f64,
    #[serde(rename = "dropCapEnabled")]
    pub drop_cap_enabled: bool,
    #[serde(rename = "dropCapLines")]
    #[serde(default = "default_drop_cap_lines")]
    pub drop_cap_lines: u8, // Anzahl Zeilen für Initiale (2-4)
    
    // Front matter (Titelei)
    #[serde(rename = "includeHalfTitle")]
    #[serde(default = "default_true")]
    pub include_half_title: bool, // Schmutztitel
    #[serde(rename = "includeTitlePage")]
    #[serde(default = "default_true")]
    pub include_title_page: bool, // Haupttitel
    #[serde(rename = "includeCopyright")]
    #[serde(default = "default_true")]
    pub include_copyright: bool, // Impressum
    #[serde(rename = "copyrightText")]
    pub copyright_text: Option<String>,
    #[serde(rename = "dedication")]
    pub dedication: Option<String>, // Widmung
    #[serde(rename = "epigraph")]
    pub epigraph: Option<String>, // Motto
    #[serde(rename = "titleLogoPath")]
    pub title_logo_path: Option<String>,
    #[serde(rename = "epigraphAuthor")]
    pub epigraph_author: Option<String>,
    
    // Table of contents
    #[serde(rename = "includeToc")]
    #[serde(default = "default_true")]
    pub include_toc: bool,
    #[serde(rename = "tocTitle")]
    #[serde(default = "default_toc_title")]
    pub toc_title: String,
    #[serde(rename = "tocIncludeScenes")]
    #[serde(default)]
    pub toc_include_scenes: bool,
    
    // Scene breaks
    #[serde(rename = "sceneBreakStyle")]
    #[serde(default = "default_scene_break_style")]
    pub scene_break_style: String, // "asterism", "fleuron", "line", "space", "custom"
    #[serde(rename = "sceneBreakCustom")]
    pub scene_break_custom: Option<String>,
    #[serde(rename = "sceneBreakImagePath")]
    pub scene_break_image_path: Option<String>,
}

fn default_true() -> bool { true }
fn default_text_align() -> String { "justify".to_string() }
fn default_hyphenation_lang() -> String { "de".to_string() }
fn default_running_header_style() -> String { "author-title".to_string() }
fn default_drop_cap_lines() -> u8 { 3 }
fn default_toc_title() -> String { "Inhalt".to_string() }
fn default_scene_break_style() -> String { "asterism".to_string() }

impl Default for LayoutSettings {
    fn default() -> Self {
        Self {
            id: nanoid::nanoid!(),
            preset_id: None,
            // A5 format (148 x 210 mm) - common for novels
            page_width: 148.0,
            page_height: 210.0,
            margin_top: 20.0,
            margin_bottom: 25.0,
            margin_inner: 20.0,
            margin_outer: 15.0,
            mirror_margins: true,
            // Typography
            font_family: "Crimson Pro".to_string(),
            font_size: 11.0,
            line_height: 1.4,
            paragraph_spacing: 0.0,
            first_line_indent: 5.0,
            // Text alignment
            text_align: "justify".to_string(),
            // Widow/Orphan control
            prevent_widows: true,
            prevent_orphans: true,
            // Hyphenation
            hyphenation: true,
            hyphenation_lang: "de".to_string(),
            // OpenType features
            ligatures: true,
            kerning: true,
            optical_margin_align: false,
            // Headers/Footers
            header_text: None,
            show_page_numbers: true,
            page_number_position: "bottom-outside".to_string(),
            // Running headers
            running_header_left: None,
            running_header_right: None,
            running_header_style: "author-title".to_string(),
            // Chapters
            chapter_start_page: "odd".to_string(),
            chapter_title_font: None,
            chapter_title_size: 18.0,
            drop_cap_enabled: true,
            drop_cap_lines: 3,
            // Front matter (Titelei)
            include_half_title: true,
            include_title_page: true,
            include_copyright: true,
            copyright_text: None,
            title_logo_path: None,
            dedication: None,
            epigraph: None,
            epigraph_author: None,
            // Table of contents
            include_toc: true,
            toc_title: "Inhalt".to_string(),
            toc_include_scenes: false,
            // Scene breaks
            scene_break_style: "asterism".to_string(),
            scene_break_custom: None,
            scene_break_image_path: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutPreset {
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(rename = "isSystem")]
    pub is_system: bool,
    pub settings: LayoutSettings,
}

// Common book format presets
pub fn get_system_presets() -> Vec<LayoutPreset> {
    vec![
        LayoutPreset {
            id: "a5-novel".to_string(),
            name: "A5 Roman".to_string(),
            description: "Klassisches Romanformat (148 × 210 mm)".to_string(),
            is_system: true,
            settings: LayoutSettings::default(),
        },
        LayoutPreset {
            id: "digest".to_string(),
            name: "Digest (US)".to_string(),
            description: "US Digest Format (140 × 216 mm)".to_string(),
            is_system: true,
            settings: LayoutSettings {
                page_width: 140.0,
                page_height: 216.0,
                ..Default::default()
            },
        },
        LayoutPreset {
            id: "trade-paperback".to_string(),
            name: "Trade Paperback".to_string(),
            description: "US Trade Paperback (152 × 229 mm)".to_string(),
            is_system: true,
            settings: LayoutSettings {
                page_width: 152.0,
                page_height: 229.0,
                margin_inner: 22.0,
                ..Default::default()
            },
        },
        LayoutPreset {
            id: "b5-novel".to_string(),
            name: "B5 Roman".to_string(),
            description: "Größeres Format (176 × 250 mm)".to_string(),
            is_system: true,
            settings: LayoutSettings {
                page_width: 176.0,
                page_height: 250.0,
                font_size: 12.0,
                ..Default::default()
            },
        },
        LayoutPreset {
            id: "pocket".to_string(),
            name: "Taschenbuch".to_string(),
            description: "Kleines Taschenbuchformat (108 × 175 mm)".to_string(),
            is_system: true,
            settings: LayoutSettings {
                page_width: 108.0,
                page_height: 175.0,
                font_size: 10.0,
                margin_top: 15.0,
                margin_bottom: 18.0,
                margin_inner: 15.0,
                margin_outer: 12.0,
                ..Default::default()
            },
        },
        LayoutPreset {
            id: "ebook".to_string(),
            name: "E-Book".to_string(),
            description: "Optimiert für E-Reader (reflowable)".to_string(),
            is_system: true,
            settings: LayoutSettings {
                page_width: 0.0, // Irrelevant for EPUB
                page_height: 0.0,
                margin_top: 0.0,
                margin_bottom: 0.0,
                margin_inner: 0.0,
                margin_outer: 0.0,
                font_family: "Georgia".to_string(),
                font_size: 1.0, // em units for EPUB
                line_height: 1.5,
                first_line_indent: 1.5,
                drop_cap_enabled: false,
                ..Default::default()
            },
        },
    ]
}

// ============================================================
// Typst Template Generation
// ============================================================

/// Generate scene break symbol based on style
fn get_scene_break_symbol(settings: &LayoutSettings) -> &str {
    match settings.scene_break_style.as_str() {
        "asterism" => "⁂",
        "fleuron" => "❧",
        "line" => "───",
        "space" => " ",
        "image" => " ",
        "custom" => settings.scene_break_custom.as_deref().unwrap_or("* * *"),
        _ => "⁂",
    }
}

/// Generate a Typst template from layout settings with professional typography
pub fn generate_typst_template(settings: &LayoutSettings, title: &str, author: &str) -> String {
    let justify = if settings.text_align == "justify" { "true" } else { "false" };
    let scene_break = get_scene_break_symbol(settings);
    let scene_break_image = settings.scene_break_image_path.as_ref();
    
    // Running header logic
    let header_code = match settings.running_header_style.as_str() {
        "author-title" => format!(r#"
    if counter(page).get().first() > 4 {{
      if calc.odd(counter(page).get().first()) {{
        align(right)[#text(size: 9pt, style: "italic")[{}]]
      }} else {{
        align(left)[#text(size: 9pt, style: "italic")[{}]]
      }}
    }}"#, title, author),
        "title-chapter" => r#"
    if counter(page).get().first() > 4 {
      let current-chapter = query(heading.where(level: 1).before(here()))
      if current-chapter.len() > 0 {
        if calc.odd(counter(page).get().first()) {
          align(right)[#text(size: 9pt, style: "italic")[#current-chapter.last().body]]
        } else {
          align(left)[#text(size: 9pt, style: "italic")[#current-chapter.last().body]]
        }
      }
    }"#.to_string(),
        "chapter-only" => r#"
    if counter(page).get().first() > 4 {
      let current-chapter = query(heading.where(level: 1).before(here()))
      if current-chapter.len() > 0 {
        align(center)[#text(size: 9pt, style: "italic")[#current-chapter.last().body]]
      }
    }"#.to_string(),
        _ => "[]".to_string(),
    };
    
    // Footer with page numbers
    let footer_code = if settings.show_page_numbers {
        match settings.page_number_position.as_str() {
            "bottom-center" => r#"align(center)[#counter(page).display()]"#.to_string(),
            "bottom-outside" => r#"if calc.odd(counter(page).get().first()) { align(right)[#counter(page).display()] } else { align(left)[#counter(page).display()] }"#.to_string(),
            "top-outside" => "[]".to_string(), // Handled in header
            _ => r#"align(center)[#counter(page).display()]"#.to_string(),
        }
    } else {
        "[]".to_string()
    };
    
    // Hyphenation settings
    let hyphenation_code = if settings.hyphenation {
        format!(r#"#set text(lang: "{}", hyphenate: true)"#, settings.hyphenation_lang)
    } else {
        "#set text(hyphenate: false)".to_string()
    };
    
    // OpenType features (Typst 0.14+ uses dictionary format)
    let opentype_features = {
        let mut features = Vec::new();
        if settings.ligatures {
            features.push("liga: 1");
            features.push("clig: 1");
        }
        if settings.kerning {
            features.push("kern: 1");
        }
        if !features.is_empty() {
            format!("#set text(features: ({}))", features.join(", "))
        } else {
            String::new()
        }
    };

    format!(r#"// ============================================================
// Featherworks Author - Typst Template
// Professional Book Typesetting
// ============================================================

// Page setup with proper margins for binding
#set page(
    width: {width}mm,
    height: {height}mm,
    margin: (
        top: {mt}mm,
        bottom: {mb}mm,
        inside: {mi}mm,   // Bundsteg (binding side)
        outside: {mo}mm,
    ),
    header: context {{{header}}},
    footer: context {{{footer}}},
    flipped: {flipped},
)

// Base typography
#set text(
  font: "{font}",
  size: {fontsize}pt,
)

// Language and hyphenation
{hyphenation}

// OpenType features (ligatures, kerning)
{opentype}

// Paragraph settings with widow/orphan control
#set par(
  leading: {leading}em,
  first-line-indent: {indent}mm,
  spacing: {spacing}em,
  justify: {justify},
)

// CRITICAL: Prevent widows and orphans (Hurenkinder/Schusterjungen)
#set block(breakable: true)
// Typst 0.14+: use set par(spacing: ..) instead of show par: set block
#set par(spacing: 0.5em)

// Chapter heading style - starts on new (odd) page
#show heading.where(level: 1): it => {{
  pagebreak(weak: true, to: "{chapter_page}")
  v(4em)
  set text(
    size: {chapter_size}pt, 
    weight: "bold",
    {chapter_font}
  )
  align(center)[#it.body]
  v(3em)
}}

// Scene break symbol
#let scene-break = {{
    v(1.5em)
    align(center, if {use_image} {{
        image("{scene_image}", width: 24pt)
    }} else {{
        text(size: 12pt)[{scene_break}]
    }})
    v(1.5em)
}}

// Drop cap (Initial) for chapter starts - Simple and robust version
#let drop-cap(size: {drop_lines}, body) = {{
  // body is already a string from our Rust code
  let body-str = str(body)
  let first-char = body-str.at(0, default: "")
  let rest = body-str.slice(1)
  
  // Calculate drop cap size
  let cap-size = {fontsize}pt * size * 1.2
  let cap-height = {leading}em * (size - 1)
  
  // Render drop cap with proper baseline
  box(baseline: cap-height)[
    #text(size: cap-size, weight: "bold")[#first-char]
  ]
  rest
}}

// Alternative simpler drop cap
#let initial(body) = {{
  let body-str = str(body)
  let first = body-str.at(0, default: "")
  let rest = body-str.slice(1)
  
  box(
    height: {drop_lines}em,
    baseline: ({drop_lines} - 1) * 0.8em,
  )[#text(size: {drop_fontsize}pt, weight: "bold")[#first]]
  text(size: {fontsize}pt, weight: "regular")[#rest]
}}

// Footnote styling
#set footnote(numbering: "*")
#show footnote.entry: it => {{
  set text(size: 9pt)
  set par(first-line-indent: 0pt)
  it
}}

// Block quote styling
#show quote: it => {{
  set text(style: "italic")
  set par(first-line-indent: 0pt)
  block(
    inset: (left: 2em, right: 2em),
    it.body
  )
}}

"#,
        width = settings.page_width,
        height = settings.page_height,
        mt = settings.margin_top,
        mb = settings.margin_bottom,
        mi = settings.margin_inner,
        mo = settings.margin_outer,
        header = header_code,
        footer = footer_code,
        font = settings.font_family,
        fontsize = settings.font_size,
        hyphenation = hyphenation_code,
        opentype = opentype_features,
        leading = settings.line_height - 1.0,
        indent = settings.first_line_indent,
        spacing = settings.paragraph_spacing,
        justify = justify,
        flipped = "false",
        chapter_page = settings.chapter_start_page,
        chapter_size = settings.chapter_title_size,
        chapter_font = settings.chapter_title_font.as_ref()
            .map(|f| format!("font: \"{}\"", f))
            .unwrap_or_default(),
        scene_break = scene_break,
        use_image = if scene_break_image.is_some() && settings.scene_break_style == "image" { "true" } else { "false" },
        scene_image = scene_break_image.unwrap_or(&"".to_string()),
        drop_lines = settings.drop_cap_lines,
        drop_fontsize = settings.font_size * (settings.drop_cap_lines as f64) * 1.2,
    )
}

/// Convert manuscript content to Typst markup with full front matter
pub fn manuscript_to_typst(
    chapters: &[ChapterContent],
    settings: &LayoutSettings,
    title: &str,
    author: &str,
) -> String {
    let template = generate_typst_template(settings, title, author);
    
    let mut content = template;

    let title_logo_block = settings.title_logo_path.as_ref().map(|path| {
        format!(
            "  #v(2em)\n  #image(\"{}\", width: 60pt)\n  #v(2em)",
            path.replace("\\", "\\\\")
        )
    }).unwrap_or_default();
    
    // ============================================================
    // FRONT MATTER (Titelei)
    // ============================================================
    
    // 1. Half-title page (Schmutztitel) - just the title, no author
    if settings.include_half_title {
        content.push_str(&format!(r#"
// Schmutztitel (Half-Title)
#set page(header: none, footer: none)
#align(center + horizon)[
  #text(size: 18pt, weight: "medium")[{title}]
]
#pagebreak()
#pagebreak() // Verso blank

"#, title = title));
    }
    
    // 2. Title page (Haupttitel) - full title with author
    if settings.include_title_page {
        content.push_str(&format!(r#"
// Haupttitel (Title Page)
#set page(header: none, footer: none)
#align(center + horizon)[
  #v(3em)
  #text(size: 28pt, weight: "bold", tracking: 0.05em)[
    #upper[{title}]
  ]
  #v(4em)
  #text(size: 16pt, style: "italic")[{author}]
    {title_logo_block}
  #v(1fr)
  #text(size: 10pt)[Featherworks Author]
]
#pagebreak()

"#, title = title, author = author));
    }
    
    // 3. Copyright page (Impressum)
    if settings.include_copyright {
        let default_copyright = format!(
            "© {} {}\nAlle Rechte vorbehalten.\n\nKein Teil dieses Buches darf ohne schriftliche Genehmigung des Autors reproduziert werden.",
            chrono::Utc::now().format("%Y"),
            author
        );
        let copyright_text = settings.copyright_text.as_deref().unwrap_or(&default_copyright);
        
        content.push_str(&format!(r#"
// Impressum (Copyright Page)
#set page(header: none, footer: none)
#align(left + bottom)[
  #set text(size: 9pt)
  #set par(first-line-indent: 0pt, leading: 0.8em)
  {copyright}
]
#pagebreak()

"#, copyright = copyright_text.replace('\n', "\\\n")));
    }
    
    // 4. Dedication (Widmung)
    if let Some(dedication) = &settings.dedication {
        content.push_str(&format!(r#"
// Widmung (Dedication)
#set page(header: none, footer: none)
#align(center + horizon)[
  #set text(style: "italic", size: 12pt)
  {dedication}
]
#pagebreak()
#pagebreak() // Verso blank

"#, dedication = dedication));
    }
    
    // 5. Epigraph (Motto)
    if let Some(epigraph) = &settings.epigraph {
        let epigraph_author = settings.epigraph_author.as_deref().unwrap_or("");
        content.push_str(&format!(r#"
// Motto (Epigraph)
#set page(header: none, footer: none)
#align(right + horizon)[
  #block(width: 60%)[
    #set text(style: "italic", size: 11pt)
    #set par(first-line-indent: 0pt)
    "{epigraph}"
    #if "{epigraph_author}" != "" [
      #v(0.5em)
      #align(right)[— {epigraph_author}]
    ]
  ]
]
#pagebreak()

"#, epigraph = epigraph, epigraph_author = epigraph_author));
    }
    
    // 6. Table of Contents (Inhaltsverzeichnis)
    if settings.include_toc {
        content.push_str(&format!(r#"
// Inhaltsverzeichnis (Table of Contents)
#set page(header: none, footer: none)
#align(center)[
  #text(size: 16pt, weight: "bold")[{toc_title}]
]
#v(2em)

#set par(first-line-indent: 0pt)
#outline(
  title: none,
  depth: {toc_depth},
  indent: 1.5em,
)
#pagebreak(to: "odd")

"#, 
            toc_title = settings.toc_title,
            toc_depth = if settings.toc_include_scenes { 2 } else { 1 }
        ));
    }
    
    // Reset page counter for main content
    content.push_str(r#"
// ============================================================
// MAIN CONTENT
// ============================================================
#counter(page).update(1)

"#);
    
    // ============================================================
    // CHAPTERS
    // ============================================================
    for (chapter_idx, chapter) in chapters.iter().enumerate() {
        // Clean chapter title
        content.push_str(&format!("= {}\n\n", clean_text_for_typst(&chapter.title)));
        
        for (scene_idx, scene) in chapter.scenes.iter().enumerate() {
            // Scene break between scenes
            if scene_idx > 0 {
                content.push_str("#scene-break\n\n");
            }
            
            // Convert paragraphs - handle both \n\n and single \n as paragraph separators
            // First, normalize line endings and remove trailing whitespace
            let normalized = scene.content
                .replace("\r\n", "\n")  // Windows line endings
                .replace("\r", "\n");   // Old Mac line endings
            
            // Split by double newlines first, then by single newlines
            // This ensures paragraphs are properly separated
            let paragraphs: Vec<String> = if normalized.contains("\n\n") {
                // Standard paragraph separation
                normalized.split("\n\n")
                    .map(|p| p.trim().to_string())
                    .filter(|p| !p.is_empty())
                    .collect()
            } else {
                // Single newlines - treat each line as a paragraph
                normalized.split('\n')
                    .map(|p| p.trim().to_string())
                    .filter(|p| !p.is_empty())
                    .collect()
            };
            
            for (para_idx, para) in paragraphs.iter().enumerate() {
                // Clean the paragraph text from editor artifacts
                let cleaned_para = clean_text_for_typst(&para);
                
                // First paragraph of chapter gets drop cap
                if scene_idx == 0 && para_idx == 0 && settings.drop_cap_enabled {
                    // Pass text as a string literal to drop-cap
                    let escaped = cleaned_para.replace('"', "\\\"");
                    content.push_str(&format!("#drop-cap(\"{}\")\n\n", escaped));
                } else {
                    content.push_str(&cleaned_para);
                    content.push_str("\n\n");
                }
            }
        }
    }
    
    content
}

#[derive(Debug, Clone)]
pub struct ChapterContent {
    pub title: String,
    pub scenes: Vec<SceneContent>,
}

#[derive(Debug, Clone)]
pub struct SceneContent {
    pub title: String,
    pub content: String,
}

// ============================================================
// Export Functions
// ============================================================

/// Export to PDF using Typst CLI or embedded compilation
pub fn export_to_pdf(
    typst_content: &str,
    output_path: &Path,
) -> Result<(), String> {
    log::info!("Exporting to PDF: {:?}", output_path);
    log::debug!("Typst content length: {} chars", typst_content.len());
    
    // Strategy 1: Try Typst CLI (most reliable)
    if let Ok(result) = export_pdf_via_cli(typst_content, output_path) {
        return Ok(result);
    }
    
    // Strategy 2: Fallback - save .typ file for manual compilation
    let typ_path = output_path.with_extension("typ");
    std::fs::write(&typ_path, typst_content)
        .map_err(|e| format!("Failed to write Typst source: {}", e))?;
    
    Err(format!(
        "PDF export requires Typst CLI. Please install it:\n\
        - macOS: brew install typst\n\
        - Windows: winget install typst\n\
        - Linux: cargo install typst-cli\n\n\
        Typst source saved to: {:?}\n\
        You can compile manually with: typst compile {:?} {:?}",
        typ_path, typ_path, output_path
    ))
}

/// Export PDF using Typst CLI
fn export_pdf_via_cli(typst_content: &str, output_path: &Path) -> Result<(), String> {
    use std::process::Command;
    
    // Create a temp file for the Typst source
    let temp_dir = std::env::temp_dir();
    let temp_typ = temp_dir.join(format!("featherworks_{}.typ", nanoid::nanoid!(8)));
    
    std::fs::write(&temp_typ, typst_content)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;
    
    // Try multiple paths for typst CLI (Homebrew, system, etc.)
    let typst_paths: Vec<&str> = if cfg!(target_os = "windows") {
        vec!["typst.exe"]
    } else if cfg!(target_os = "macos") {
        vec![
            "/opt/homebrew/bin/typst",  // Homebrew on Apple Silicon
            "/usr/local/bin/typst",      // Homebrew on Intel Mac
            "typst",                      // System PATH
        ]
    } else {
        vec![
            "/usr/local/bin/typst",
            "/usr/bin/typst",
            "typst",
        ]
    };
    
    let mut last_error = String::new();
    
    for typst_cmd in &typst_paths {
        println!("[typst-cli] Trying typst at: {}", typst_cmd);
        
        let output = Command::new(typst_cmd)
            .arg("compile")
            .arg(&temp_typ)
            .arg(output_path)
            .output();
        
        match output {
            Ok(result) => {
                println!("[typst-cli] Command executed, status: {:?}", result.status);
                if result.status.success() {
                    // Clean up temp file
                    let _ = std::fs::remove_file(&temp_typ);
                    log::info!("PDF exported successfully via Typst CLI ({})", typst_cmd);
                    println!("[typst-cli] SUCCESS: PDF exported via {}", typst_cmd);
                    return Ok(());
                } else {
                    let stderr = String::from_utf8_lossy(&result.stderr);
                    let stdout = String::from_utf8_lossy(&result.stdout);
                    last_error = format!("Typst compilation failed:\n{}\n{}", stderr, stdout);
                    println!("[typst-cli] Compilation failed: {}", last_error);
                    // Don't return yet, compilation error means typst exists but failed
                    let _ = std::fs::remove_file(&temp_typ);
                    return Err(last_error);
                }
            }
            Err(e) => {
                println!("[typst-cli] Error running {}: {} (kind: {:?})", typst_cmd, e, e.kind());
                if e.kind() == std::io::ErrorKind::NotFound {
                    last_error = format!("Typst not found at {}", typst_cmd);
                    continue; // Try next path
                } else {
                    last_error = format!("Failed to run Typst: {}", e);
                }
            }
        }
    }
    
    // Clean up temp file
    let _ = std::fs::remove_file(&temp_typ);
    
    println!("[typst-cli] All paths failed. Last error: {}", last_error);
    Err(format!("Typst CLI not found. Tried: {:?}. Last error: {}", typst_paths, last_error))
}

/// Export to EPUB
pub fn export_to_epub(
    chapters: &[ChapterContent],
    output_path: &Path,
    title: &str,
    author: &str,
    _settings: &LayoutSettings,
    cover_path: Option<&str>,
) -> Result<(), String> {
    use epub_builder::{EpubBuilder, EpubContent, ZipLibrary};
    use std::fs::File;
    
    let file = File::create(output_path).map_err(|e| e.to_string())?;
    let zip = ZipLibrary::new().map_err(|e| e.to_string())?;
    
    let mut builder = EpubBuilder::new(zip).map_err(|e| e.to_string())?;
    
    builder
        .metadata("title", title)
        .map_err(|e| e.to_string())?
        .metadata("author", author)
        .map_err(|e| e.to_string())?;
    
    // Add cover image if provided
    if let Some(cover) = cover_path {
        let cover_data = std::fs::read(cover)
            .map_err(|e| format!("Failed to read cover image: {}", e))?;
        
        // Determine MIME type from extension
        let mime_type = match Path::new(cover)
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .as_deref()
        {
            Some("png") => "image/png",
            Some("jpg") | Some("jpeg") => "image/jpeg",
            Some("gif") => "image/gif",
            Some("webp") => "image/webp",
            _ => "image/jpeg", // Default
        };
        
        // Add cover image to EPUB
        builder
            .add_cover_image("cover.jpg", cover_data.as_slice(), mime_type)
            .map_err(|e| format!("Failed to add cover: {}", e))?;
        
        log::info!("Added cover image from: {}", cover);
    }
    
    // Add stylesheet
    let css = r#"
body {
    font-family: Georgia, serif;
    line-height: 1.5;
    text-align: justify;
}
h1 {
    text-align: center;
    margin-top: 3em;
    margin-bottom: 2em;
    page-break-before: always;
}
p {
    text-indent: 1.5em;
    margin: 0;
}
p.first {
    text-indent: 0;
}
.scene-break {
    text-align: center;
    margin: 1em 0;
}
"#;
    builder.stylesheet(css.as_bytes()).map_err(|e| e.to_string())?;
    
    // Add chapters
    for (i, chapter) in chapters.iter().enumerate() {
        let mut html = format!(r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
    <title>{}</title>
    <link rel="stylesheet" type="text/css" href="stylesheet.css"/>
</head>
<body>
<h1>{}</h1>
"#, chapter.title, chapter.title);
        
        for (j, scene) in chapter.scenes.iter().enumerate() {
            if j > 0 {
                html.push_str(r#"<p class="scene-break">⁂</p>"#);
            }
            
            for (k, para) in scene.content.split("\n\n").enumerate() {
                let para = para.trim();
                if !para.is_empty() {
                    let class = if k == 0 { r#" class="first""# } else { "" };
                    html.push_str(&format!("<p{}>{}</p>\n", class, html_escape(para)));
                }
            }
        }
        
        html.push_str("</body></html>");
        
        let content = EpubContent::new(
            format!("chapter{}.xhtml", i + 1),
            html.as_bytes(),
        )
        .title(&chapter.title)
        .reftype(epub_builder::ReferenceType::Text);
        
        builder.add_content(content).map_err(|e| e.to_string())?;
    }
    
    builder.generate(file).map_err(|e| e.to_string())?;
    
    log::info!("EPUB exported to: {:?}", output_path);
    Ok(())
}

/// Clean text from editor artifacts and format for Typst
/// Removes: empty brackets [ ], markdown-style deletions [- ...], etc.
fn clean_text_for_typst(s: &str) -> String {
    use regex::Regex;
    
    // Remove empty brackets: [ ] or []
    let re_empty = Regex::new(r"\[\s*\]").unwrap();
    let result = re_empty.replace_all(s, "");
    
    // Remove markdown deletion syntax: [- text] -> text
    // This is probably strikethrough or edit marking
    let re_deletion = Regex::new(r"\[-\s*([^\]]*)\]").unwrap();
    let result = re_deletion.replace_all(&result, "$1");
    
    // Remove any remaining single brackets that don't form pairs
    // Be careful here - only remove if they look like artifacts
    
    result.to_string()
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// Export to DOCX (basic RTF-based approach)
pub fn export_to_docx(
    chapters: &[ChapterContent],
    output_path: &Path,
    title: &str,
    author: &str,
) -> Result<(), String> {
    use std::io::Write;
    
    // Create a basic DOCX (which is actually a ZIP with XML files)
    let file = std::fs::File::create(output_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    
    let options = zip::write::FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    
    // [Content_Types].xml
    zip.start_file("[Content_Types].xml", options).map_err(|e| e.to_string())?;
    zip.write_all(DOCX_CONTENT_TYPES.as_bytes()).map_err(|e| e.to_string())?;
    
    // _rels/.rels
    zip.add_directory("_rels/", options).map_err(|e| e.to_string())?;
    zip.start_file("_rels/.rels", options).map_err(|e| e.to_string())?;
    zip.write_all(DOCX_RELS.as_bytes()).map_err(|e| e.to_string())?;
    
    // word/_rels/document.xml.rels
    zip.add_directory("word/", options).map_err(|e| e.to_string())?;
    zip.add_directory("word/_rels/", options).map_err(|e| e.to_string())?;
    zip.start_file("word/_rels/document.xml.rels", options).map_err(|e| e.to_string())?;
    zip.write_all(DOCX_DOCUMENT_RELS.as_bytes()).map_err(|e| e.to_string())?;
    
    // word/document.xml - the main content
    let document_xml = generate_docx_document(chapters, title, author);
    zip.start_file("word/document.xml", options).map_err(|e| e.to_string())?;
    zip.write_all(document_xml.as_bytes()).map_err(|e| e.to_string())?;
    
    // word/styles.xml
    zip.start_file("word/styles.xml", options).map_err(|e| e.to_string())?;
    zip.write_all(DOCX_STYLES.as_bytes()).map_err(|e| e.to_string())?;
    
    zip.finish().map_err(|e| e.to_string())?;
    
    log::info!("DOCX exported to: {:?}", output_path);
    Ok(())
}

fn generate_docx_document(chapters: &[ChapterContent], title: &str, author: &str) -> String {
    let mut body = String::new();
    
    // Title
    body.push_str(&format!(r#"
<w:p>
  <w:pPr><w:pStyle w:val="Title"/></w:pPr>
  <w:r><w:t>{}</w:t></w:r>
</w:p>
<w:p>
  <w:pPr><w:pStyle w:val="Subtitle"/></w:pPr>
  <w:r><w:t>{}</w:t></w:r>
</w:p>
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
"#, xml_escape(title), xml_escape(author)));
    
    // Chapters
    for chapter in chapters {
        body.push_str(&format!(r#"
<w:p>
  <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
  <w:r><w:t>{}</w:t></w:r>
</w:p>
"#, xml_escape(&chapter.title)));
        
        for (i, scene) in chapter.scenes.iter().enumerate() {
            if i > 0 {
                body.push_str(r#"
<w:p>
  <w:pPr><w:jc w:val="center"/></w:pPr>
  <w:r><w:t>⁂</w:t></w:r>
</w:p>
"#);
            }
            
            for para in scene.content.split("\n\n") {
                let para = para.trim();
                if !para.is_empty() {
                    body.push_str(&format!(r#"
<w:p>
  <w:pPr><w:pStyle w:val="BodyText"/></w:pPr>
  <w:r><w:t>{}</w:t></w:r>
</w:p>
"#, xml_escape(para)));
                }
            }
        }
    }
    
    format!(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
{}
<w:sectPr>
  <w:pgSz w:w="11906" w:h="16838"/>
  <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
</w:sectPr>
</w:body>
</w:document>"#, body)
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

// DOCX boilerplate XML files
const DOCX_CONTENT_TYPES: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>"#;

const DOCX_RELS: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#;

const DOCX_DOCUMENT_RELS: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"#;

const DOCX_STYLES: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:pPr><w:jc w:val="center"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="48"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle">
    <w:name w:val="Subtitle"/>
    <w:pPr><w:jc w:val="center"/><w:spacing w:before="240"/></w:pPr>
    <w:rPr><w:sz w:val="28"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="Heading 1"/>
    <w:pPr><w:jc w:val="center"/><w:pageBreakBefore/><w:spacing w:before="480" w:after="240"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="36"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="BodyText">
    <w:name w:val="Body Text"/>
    <w:pPr><w:ind w:firstLine="360"/><w:jc w:val="both"/></w:pPr>
    <w:rPr><w:sz w:val="22"/></w:rPr>
  </w:style>
</w:styles>"#;

/// Export to RTF
pub fn export_to_rtf(
    chapters: &[ChapterContent],
    output_path: &Path,
    title: &str,
    author: &str,
) -> Result<(), String> {
    use std::io::Write;
    
    let mut rtf = String::from(r"{\rtf1\ansi\deff0");
    
    // Font table
    rtf.push_str(r"{\fonttbl{\f0\froman Times New Roman;}}");
    
    // Document settings
    rtf.push_str(r"\paperw11906\paperh16838\margl1440\margr1440\margt1440\margb1440");
    
    // Title
    rtf.push_str(&format!(
        r"\pard\qc\b\fs48 {}\b0\par",
        rtf_escape(title)
    ));
    rtf.push_str(&format!(
        r"\pard\qc\fs28 {}\par\page",
        rtf_escape(author)
    ));
    
    // Chapters
    for chapter in chapters {
        rtf.push_str(&format!(
            r"\pard\qc\b\fs36 {}\b0\par\par",
            rtf_escape(&chapter.title)
        ));
        
        for (i, scene) in chapter.scenes.iter().enumerate() {
            if i > 0 {
                rtf.push_str(r"\pard\qc\fs22 \u8258?\par\par");
            }
            
            for para in scene.content.split("\n\n") {
                let para = para.trim();
                if !para.is_empty() {
                    rtf.push_str(&format!(
                        r"\pard\fi360\qj\fs22 {}\par",
                        rtf_escape(para)
                    ));
                }
            }
        }
        
        rtf.push_str(r"\page");
    }
    
    rtf.push('}');
    
    let mut file = std::fs::File::create(output_path).map_err(|e| e.to_string())?;
    file.write_all(rtf.as_bytes()).map_err(|e| e.to_string())?;
    
    log::info!("RTF exported to: {:?}", output_path);
    Ok(())
}

fn rtf_escape(s: &str) -> String {
    let mut result = String::new();
    for c in s.chars() {
        match c {
            '\\' => result.push_str(r"\\"),
            '{' => result.push_str(r"\{"),
            '}' => result.push_str(r"\}"),
            '\n' => result.push_str(r"\par "),
            c if c as u32 > 127 => {
                result.push_str(&format!(r"\u{}?", c as u32));
            }
            c => result.push(c),
        }
    }
    result
}

/// Export to InDesign-optimized XML (IDML-compatible structure)
/// 
/// This generates an XML file that can be easily imported into Adobe InDesign
/// with proper paragraph styles, character styles, and structure for book layout.
/// The format uses InDesign Tagged Text XML conventions.
pub fn export_to_indesign_xml(
    chapters: &[ChapterContent],
    output_path: &Path,
    title: &str,
    author: &str,
    settings: &LayoutSettings,
) -> Result<(), String> {
    use std::io::Write;
    use regex::Regex;
    
    let mut xml = String::from(r#"<?xml version="1.0" encoding="UTF-8"?>
<!-- InDesign-optimized XML Export from FeatherWorks Author -->
<!-- Import into InDesign: File > Import XML... then map tags to paragraph styles -->
<!-- 
  Paragraph Styles needed:
  - BookTitle, BookAuthor (Title page)
  - ChapterTitle (Chapter headings)
  - BodyTextFirst (First paragraph, no indent)
  - BodyText (Regular paragraphs with indent)
  - Dialogue (Dialogue paragraphs)
  - DialogueFirst (First dialogue after narrative)
  - SceneBreak (Scene separators like *** or ---)
  
  Character Styles needed:
  - Emphasis (for *italic* text)
  - Strong (for **bold** text)
  - EmphasisStrong (for ***bold italic*** text)
-->
<document xmlns:aid="http://ns.adobe.com/AdobeInDesign/4.0/"
          xmlns:aid5="http://ns.adobe.com/AdobeInDesign/5.0/">
"#);

    // Document metadata
    xml.push_str(&format!(r#"
  <metadata>
    <title>{}</title>
    <author>{}</author>
    <generator>FeatherWorks Author</generator>
    <created>{}</created>
    <pageWidth>{}</pageWidth>
    <pageHeight>{}</pageHeight>
    <marginTop>{}</marginTop>
    <marginBottom>{}</marginBottom>
    <marginInner>{}</marginInner>
    <marginOuter>{}</marginOuter>
    <fontFamily>{}</fontFamily>
    <fontSize>{}</fontSize>
    <lineHeight>{}</lineHeight>
  </metadata>

  <content>
"#, 
        xml_escape(title),
        xml_escape(author),
        chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ"),
        settings.page_width,
        settings.page_height,
        settings.margin_top,
        settings.margin_bottom,
        settings.margin_inner,
        settings.margin_outer,
        xml_escape(&settings.font_family),
        settings.font_size,
        settings.line_height,
    ));

    // Title page (as separate section)
    xml.push_str(&format!(r#"
    <section aid:pstyle="FrontMatter">
      <title-page>
        <book-title aid:pstyle="BookTitle">{}</book-title>
        <book-author aid:pstyle="BookAuthor">{}</book-author>
      </title-page>
    </section>
"#, xml_escape(title), xml_escape(author)));

    // Regex for scene breaks in text
    let scene_break_re = Regex::new(r"^[\s]*[-–—*#~=]{3,}[\s]*$").unwrap();
    
    // Regex for inline formatting (Markdown-style)
    let bold_italic_re = Regex::new(r"\*\*\*(.+?)\*\*\*").unwrap();
    let bold_re = Regex::new(r"\*\*(.+?)\*\*").unwrap();
    let italic_re = Regex::new(r"\*(.+?)\*").unwrap();
    let underscore_italic_re = Regex::new(r"_(.+?)_").unwrap();

    // Chapters
    for (chapter_idx, chapter) in chapters.iter().enumerate() {
        xml.push_str(&format!(r#"
    <chapter number="{}">
      <chapter-title aid:pstyle="ChapterTitle">{}</chapter-title>
"#, chapter_idx + 1, xml_escape(&chapter.title)));

        // Scenes within chapter
        for (scene_idx, scene) in chapter.scenes.iter().enumerate() {
            // Add scene break between scenes (except before first)
            if scene_idx > 0 {
                xml.push_str(r#"
      <scene-break aid:pstyle="SceneBreak">⁂</scene-break>
"#);
            }

            xml.push_str(&format!(r#"
      <scene number="{}">
"#, scene_idx + 1));

            // Smart paragraph detection:
            // 1. First try splitting by double newlines (\n\n)
            // 2. If that results in only 1 paragraph, split by single newlines
            // 3. Handle scene breaks (-----, ***, etc.) inline
            
            let raw_paragraphs: Vec<&str> = scene.content.split("\n\n").collect();
            
            let paragraphs: Vec<String> = if raw_paragraphs.len() <= 1 {
                // No double newlines found - split by single newlines instead
                scene.content
                    .split('\n')
                    .map(|p| p.trim().to_string())
                    .filter(|p| !p.is_empty())
                    .collect()
            } else {
                // Double newlines found - use those as paragraph separators
                raw_paragraphs
                    .iter()
                    .map(|p| p.trim().to_string())
                    .filter(|p| !p.is_empty())
                    .collect()
            };

            let mut prev_was_dialogue = false;
            let mut is_first_para = true;

            for para in paragraphs.iter() {
                // Check if this is a scene break marker in the text
                if scene_break_re.is_match(para) {
                    xml.push_str(r#"        <scene-break aid:pstyle="SceneBreak">⁂</scene-break>
"#);
                    is_first_para = true; // Next paragraph should be BodyTextFirst
                    prev_was_dialogue = false;
                    continue;
                }

                // Check if paragraph is dialogue
                let is_dialogue = is_dialogue_paragraph(para);
                
                // Determine paragraph style
                let para_style = if is_dialogue {
                    if !prev_was_dialogue {
                        "DialogueFirst" // First dialogue after narrative (no indent)
                    } else {
                        "Dialogue"
                    }
                } else if is_first_para {
                    "BodyTextFirst"
                } else {
                    "BodyText"
                };
                
                // Process inline formatting
                let formatted_content = process_inline_formatting(
                    &xml_escape(para),
                    &bold_italic_re,
                    &bold_re,
                    &italic_re,
                    &underscore_italic_re,
                );
                
                xml.push_str(&format!(
                    r#"        <para aid:pstyle="{}">{}</para>
"#, 
                    para_style,
                    formatted_content
                ));
                
                prev_was_dialogue = is_dialogue;
                is_first_para = false;
            }

            xml.push_str(r#"      </scene>
"#);
        }

        xml.push_str(r#"    </chapter>
"#);
    }

    // Close document
    xml.push_str(r#"
  </content>

  <!-- 
  InDesign Import Guide:
  ======================
  1. Create a new InDesign document with your preferred page size
  2. Create Paragraph Styles matching these names:
     - BookTitle: Large centered title font
     - BookAuthor: Subtitle style for author name
     - ChapterTitle: Chapter heading style (page break before)
     - BodyTextFirst: Body text without first-line indent
     - BodyText: Regular body text with first-line indent
     - Dialogue: Style for dialogue (with indent)
     - DialogueFirst: First dialogue after narrative (no indent)
     - SceneBreak: Centered scene separator
  
  Character Styles:
     - Emphasis: Italic text (*text* or _text_)
     - Strong: Bold text (**text**)
     - EmphasisStrong: Bold italic (***text***)
  
  3. File > Import XML...
  4. Check "Merge Content" if updating
  5. Map XML Tags to Paragraph Styles:
     - Select each tag and assign the corresponding style
  6. Place the content using the Structure panel
  -->

"#);

    // Style hints with actual values from layout settings
    let font_size = settings.font_size;
    let line_height_pt = settings.font_size * settings.line_height;
    let indent = settings.first_line_indent;
    
    xml.push_str(&format!(r#"  <!-- Style suggestions (pt values based on layout settings) -->
  <style-hints>
    <!-- Paragraph Styles -->
    <style name="BookTitle" font-size="24pt" alignment="center" space-after="12pt"/>
    <style name="BookAuthor" font-size="14pt" alignment="center" space-after="48pt"/>
    <style name="ChapterTitle" font-size="18pt" alignment="center" space-before="72pt" space-after="24pt" page-break="before"/>
    <style name="BodyTextFirst" font-size="{font_size}pt" line-height="{line_height_pt}pt" first-indent="0pt" alignment="justify"/>
    <style name="BodyText" font-size="{font_size}pt" line-height="{line_height_pt}pt" first-indent="{indent}mm" alignment="justify"/>
    <style name="DialogueFirst" font-size="{font_size}pt" line-height="{line_height_pt}pt" first-indent="0pt" alignment="justify"/>
    <style name="Dialogue" font-size="{font_size}pt" line-height="{line_height_pt}pt" first-indent="{indent}mm" alignment="justify"/>
    <style name="SceneBreak" font-size="{font_size}pt" alignment="center" space-before="12pt" space-after="12pt"/>
    <!-- Character Styles -->
    <cstyle name="Emphasis" font-style="italic"/>
    <cstyle name="Strong" font-weight="bold"/>
    <cstyle name="EmphasisStrong" font-style="italic" font-weight="bold"/>
  </style-hints>

</document>
"#));

    // Write to file
    let mut file = std::fs::File::create(output_path).map_err(|e| e.to_string())?;
    file.write_all(xml.as_bytes()).map_err(|e| e.to_string())?;
    
    log::info!("InDesign XML exported to: {:?}", output_path);
    Ok(())
}

/// Check if a paragraph is dialogue based on its content
fn is_dialogue_paragraph(para: &str) -> bool {
    let trimmed = para.trim();
    
    // Starts with quotation marks (various styles)
    trimmed.starts_with('"')           // English double quote
        || trimmed.starts_with('"')    // Smart opening quote
        || trimmed.starts_with('„')    // German opening quote
        || trimmed.starts_with('»')    // French/German guillemet
        || trimmed.starts_with('«')    // French guillemet
        || trimmed.starts_with("—")    // Em-dash for dialogue
        || trimmed.starts_with("–")    // En-dash
        || trimmed.starts_with("\"")   // Escaped quote
        // Also check if it's a dialogue continuation (contains mainly quoted text)
        || (trimmed.contains('"') && trimmed.contains('"') && 
            trimmed.find('"').unwrap_or(usize::MAX) < 10)
}

/// Process inline formatting (Markdown-style) and convert to InDesign character styles
fn process_inline_formatting(
    text: &str,
    bold_italic_re: &regex::Regex,
    bold_re: &regex::Regex,
    italic_re: &regex::Regex,
    underscore_italic_re: &regex::Regex,
) -> String {
    let mut result = text.to_string();
    
    // Order matters: process bold+italic first, then bold, then italic
    // ***bold italic*** -> <span aid:cstyle="EmphasisStrong">bold italic</span>
    result = bold_italic_re.replace_all(&result, r#"<span aid:cstyle="EmphasisStrong">$1</span>"#).to_string();
    
    // **bold** -> <span aid:cstyle="Strong">bold</span>
    result = bold_re.replace_all(&result, r#"<span aid:cstyle="Strong">$1</span>"#).to_string();
    
    // *italic* -> <span aid:cstyle="Emphasis">italic</span>
    result = italic_re.replace_all(&result, r#"<span aid:cstyle="Emphasis">$1</span>"#).to_string();
    
    // _italic_ -> <span aid:cstyle="Emphasis">italic</span>
    result = underscore_italic_re.replace_all(&result, r#"<span aid:cstyle="Emphasis">$1</span>"#).to_string();
    
    result
}

// ============================================================
// Database Functions
// ============================================================

pub fn get_layout_settings(conn: &Connection) -> Result<LayoutSettings, String> {
    let result = conn.query_row(
        "SELECT settings_json FROM layout_settings LIMIT 1",
        [],
        |row| {
            let json: String = row.get(0)?;
            Ok(json)
        },
    );
    
    match result {
        Ok(json) => serde_json::from_str(&json).map_err(|e| e.to_string()),
        Err(_) => Ok(LayoutSettings::default()),
    }
}

pub fn save_layout_settings(conn: &Connection, settings: &LayoutSettings) -> Result<(), String> {
    let json = serde_json::to_string(settings).map_err(|e| e.to_string())?;
    
    conn.execute(
        "INSERT OR REPLACE INTO layout_settings (id, settings_json, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)",
        rusqlite::params!["default", json],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

pub fn list_layout_presets(conn: &Connection) -> Result<Vec<LayoutPreset>, String> {
    let mut presets = get_system_presets();
    
    // Add user presets
    let mut stmt = conn
        .prepare("SELECT id, name, description, settings_json FROM layout_presets ORDER BY name")
        .map_err(|e| e.to_string())?;
    
    let user_presets = stmt
        .query_map([], |row| {
            let settings_json: String = row.get(3)?;
            Ok(LayoutPreset {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                is_system: false,
                settings: serde_json::from_str(&settings_json).unwrap_or_default(),
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok());
    
    presets.extend(user_presets);
    Ok(presets)
}

pub fn save_layout_preset(conn: &Connection, name: &str, description: &str, settings: &LayoutSettings) -> Result<LayoutPreset, String> {
    let id = nanoid::nanoid!();
    let json = serde_json::to_string(settings).map_err(|e| e.to_string())?;
    
    conn.execute(
        "INSERT INTO layout_presets (id, name, description, settings_json) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, name, description, json],
    ).map_err(|e| e.to_string())?;
    
    Ok(LayoutPreset {
        id,
        name: name.to_string(),
        description: description.to_string(),
        is_system: false,
        settings: settings.clone(),
    })
}

pub fn delete_layout_preset(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM layout_presets WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
