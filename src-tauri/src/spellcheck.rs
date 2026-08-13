//! Rechtschreibprüfung mit echten Wörterbüchern

use anyhow::{anyhow, Result};
use once_cell::sync::Lazy;
use std::collections::HashSet;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Language {
    German,
    English,
}

impl Language {
    pub fn code(&self) -> &'static str {
        match self {
            Language::German => "de_DE",
            Language::English => "en_US",
        }
    }

    pub fn from_code(code: &str) -> Option<Self> {
        match code.to_lowercase().as_str() {
            "de" | "de_de" | "de-de" | "german" => Some(Language::German),
            "en" | "en_us" | "en-us" | "en_gb" | "en-gb" | "english" => Some(Language::English),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SpellError {
    pub word: String,
    pub offset: usize,
    pub length: usize,
    pub suggestions: Vec<String>,
}

struct Dictionary {
    words: HashSet<String>,
    loaded: bool,
}

impl Dictionary {
    fn new() -> Self {
        Self {
            words: HashSet::new(),
            loaded: false,
        }
    }

    fn load_from_dic_file(&mut self, path: &PathBuf) -> Result<usize> {
        let file = File::open(path)?;
        let reader = BufReader::new(file);
        let mut count = 0;

        for line in reader.lines() {
            let line = line?;
            if count == 0 && line.chars().all(|c| c.is_numeric()) {
                count += 1;
                continue;
            }
            let word = line.split('/').next().unwrap_or(&line).trim();
            if !word.is_empty() && !word.starts_with('#') {
                self.words.insert(word.to_lowercase());
                count += 1;
            }
        }
        self.loaded = true;
        log::info!("[spellcheck] Loaded {} words from {:?}", count, path);
        Ok(count)
    }

    fn contains(&self, word: &str) -> bool {
        self.words.contains(&word.to_lowercase())
    }
}

struct SpellcheckerState {
    german: Dictionary,
    english: Dictionary,
    user_words: HashSet<String>,
}

impl SpellcheckerState {
    fn new() -> Self {
        Self {
            german: Dictionary::new(),
            english: Dictionary::new(),
            user_words: HashSet::new(),
        }
    }

    fn ensure_loaded(&mut self, lang: Language, dict_dir: &PathBuf) {
        let dict = match lang {
            Language::German => &mut self.german,
            Language::English => &mut self.english,
        };

        if dict.loaded {
            return;
        }

        let dic_path = dict_dir.join(format!("{}.dic", lang.code()));
        if dic_path.exists() {
            if let Err(e) = dict.load_from_dic_file(&dic_path) {
                log::warn!("[spellcheck] Failed to load {:?}: {}", dic_path, e);
                self.load_fallback(lang);
            }
        } else {
            log::warn!("[spellcheck] Dictionary not found: {:?}", dic_path);
            self.load_fallback(lang);
        }
    }

    fn load_fallback(&mut self, lang: Language) {
        let dict = match lang {
            Language::German => &mut self.german,
            Language::English => &mut self.english,
        };

        let words: Vec<&str> = match lang {
            Language::German => vec![
                "der", "die", "das", "den", "dem", "des", "ein", "eine", "einer", "ich", "du",
                "er", "sie", "es", "wir", "ihr", "und", "oder", "aber", "ist", "sind", "war",
                "hat", "haben", "wird", "wurde", "nicht", "auch", "auto", "bauer", "landwirt",
                "haus", "mutter", "vater", "kind", "frau", "in", "an", "auf", "fuer", "mit", "bei",
                "nach", "von", "zu", "aus",
            ],
            Language::English => vec![
                "the", "a", "an", "is", "are", "was", "were", "be", "have", "has", "i", "you",
                "he", "she", "it", "we", "they", "and", "or", "but", "not", "no", "yes", "car",
                "house", "mother", "father", "child", "in", "on", "at", "for", "with", "by",
                "from", "to", "of", "about",
            ],
        };

        for w in words {
            dict.words.insert(w.to_string());
        }
        dict.loaded = true;
    }

    fn check_word(&self, word: &str, lang: Language) -> bool {
        if word.is_empty() || word.chars().all(|c| c.is_numeric()) {
            return true;
        }
        if self.user_words.contains(&word.to_lowercase()) {
            return true;
        }

        match lang {
            Language::German => self.german.contains(word),
            Language::English => self.english.contains(word),
        }
    }
}

static SPELLCHECKER: Lazy<Mutex<SpellcheckerState>> =
    Lazy::new(|| Mutex::new(SpellcheckerState::new()));

pub fn check_text(text: &str, lang: Language, dict_dir: &PathBuf) -> Result<Vec<SpellError>> {
    let mut state = SPELLCHECKER
        .lock()
        .map_err(|e| anyhow!("Lock failed: {}", e))?;
    state.ensure_loaded(lang, dict_dir);

    let mut errors = Vec::new();

    // UTF-8 safe word extraction using char_indices
    let mut current_word_start: Option<usize> = None;
    let mut current_word = String::new();

    for (byte_idx, c) in text.char_indices() {
        if c.is_alphabetic() || c == '-' {
            // Start or continue a word
            if current_word_start.is_none() {
                current_word_start = Some(byte_idx);
            }
            current_word.push(c);
        } else {
            // End of word - check it
            if let Some(start) = current_word_start {
                if current_word.chars().count() >= 2 && !state.check_word(&current_word, lang) {
                    errors.push(SpellError {
                        word: current_word.clone(),
                        offset: start,
                        length: current_word.len(), // byte length for frontend compatibility
                        suggestions: Vec::new(),
                    });
                }
            }
            current_word.clear();
            current_word_start = None;
        }
    }

    // Check last word if text doesn't end with separator
    if let Some(start) = current_word_start {
        if current_word.chars().count() >= 2 && !state.check_word(&current_word, lang) {
            errors.push(SpellError {
                word: current_word.clone(),
                offset: start,
                length: current_word.len(),
                suggestions: Vec::new(),
            });
        }
    }

    Ok(errors)
}

pub fn check_word(word: &str, lang: Language, dict_dir: &PathBuf) -> Result<bool> {
    let mut state = SPELLCHECKER
        .lock()
        .map_err(|e| anyhow!("Lock failed: {}", e))?;
    state.ensure_loaded(lang, dict_dir);
    Ok(state.check_word(word, lang))
}

pub fn add_to_user_dictionary(word: &str) -> Result<()> {
    let mut state = SPELLCHECKER
        .lock()
        .map_err(|e| anyhow!("Lock failed: {}", e))?;
    state.user_words.insert(word.to_lowercase());
    log::info!("[spellcheck] Added '{}' to user dictionary", word);
    Ok(())
}

pub fn suggest(_word: &str, _lang: Language, _dict_dir: &PathBuf) -> Result<Vec<String>> {
    Ok(Vec::new())
}
