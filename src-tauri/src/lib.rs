pub mod ai; // expose ai (model manager & streaming)
pub mod analysis;
pub mod editor;
pub mod entities;
pub mod error;
pub mod languagetool; // LanguageTool API Integration
pub mod layout;
pub mod models;
pub mod plot; // Plot-System (Subplots, Plotpunkte, Timeline)
pub mod research; // Recherche-System (Ordner, Quellen, KI-Extraktion)
pub mod spellcheck; // Rechtschreibprüfung mit Hunspell
pub mod storage;
pub mod support; // Bug Reports & Feedback // Layout & Export (PDF, EPUB, DOCX, RTF via Typst)
pub mod domain {
    pub mod doc;
    pub mod patch;
}
pub mod services;

// Re-export commonly used items for tests
pub use storage::container;
