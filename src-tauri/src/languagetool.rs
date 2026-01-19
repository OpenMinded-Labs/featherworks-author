//! LanguageTool API Integration
//! 
//! Unterstützt die kostenlose API und Premium-Accounts.
//! Bietet Grammatik-, Rechtschreib- und Stilprüfung.

use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// LanguageTool API Endpoints
const LT_API_FREE: &str = "https://api.languagetool.org/v2/check";
const LT_API_PREMIUM: &str = "https://api.languagetoolplus.com/v2/check";

/// Fehlertypen die LanguageTool zurückgibt
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IssueType {
    /// Rechtschreibfehler
    Misspelling,
    /// Grammatikfehler
    Grammar,
    /// Typografische Fehler (Leerzeichen, Anführungszeichen)
    Typographical,
    /// Stilistische Vorschläge
    Style,
    /// Zeichensetzung
    Punctuation,
    /// Andere/Unbekannt
    #[serde(other)]
    Other,
}

impl IssueType {
    /// CSS-Farbe für die Unterstreichung
    pub fn color(&self) -> &'static str {
        match self {
            IssueType::Misspelling => "#e53e3e",      // Rot
            IssueType::Grammar => "#3182ce",          // Blau
            IssueType::Punctuation => "#3182ce",      // Blau
            IssueType::Style => "#d69e2e",            // Gelb/Orange
            IssueType::Typographical => "#805ad5",    // Lila
            IssueType::Other => "#718096",            // Grau
        }
    }
    
    /// Label für die UI
    pub fn label(&self) -> &'static str {
        match self {
            IssueType::Misspelling => "Rechtschreibung",
            IssueType::Grammar => "Grammatik",
            IssueType::Punctuation => "Zeichensetzung",
            IssueType::Style => "Stil",
            IssueType::Typographical => "Typografie",
            IssueType::Other => "Sonstiges",
        }
    }
}

/// Ein einzelnes Problem, das LanguageTool gefunden hat
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LtIssue {
    /// Fehlermeldung
    pub message: String,
    /// Kurze Fehlermeldung
    pub short_message: Option<String>,
    /// Offset im Text (Zeichen)
    pub offset: usize,
    /// Länge des fehlerhaften Bereichs
    pub length: usize,
    /// Der fehlerhafte Text
    pub context_text: String,
    /// Korrekturvorschläge
    pub replacements: Vec<String>,
    /// Regel-ID (für Ignorieren)
    pub rule_id: String,
    /// Kategorie des Fehlers
    pub issue_type: IssueType,
    /// Kategorie-Name von LT
    pub category: String,
}

/// Antwort von LanguageTool
#[derive(Debug, Deserialize)]
struct LtApiResponse {
    matches: Vec<LtMatch>,
    #[allow(dead_code)]
    language: LtLanguage,
}

#[derive(Debug, Deserialize)]
struct LtMatch {
    message: String,
    #[serde(rename = "shortMessage")]
    short_message: Option<String>,
    offset: usize,
    length: usize,
    context: LtContext,
    replacements: Vec<LtReplacement>,
    rule: LtRule,
}

#[derive(Debug, Deserialize)]
struct LtContext {
    text: String,
    #[allow(dead_code)]
    offset: usize,
    #[allow(dead_code)]
    length: usize,
}

#[derive(Debug, Deserialize)]
struct LtReplacement {
    value: String,
}

#[derive(Debug, Deserialize)]
struct LtRule {
    id: String,
    category: LtCategory,
    #[serde(rename = "issueType")]
    issue_type: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LtCategory {
    id: String,
    name: String,
}

#[derive(Debug, Deserialize)]
struct LtLanguage {
    #[allow(dead_code)]
    name: String,
    #[allow(dead_code)]
    code: String,
}

/// Konfiguration für LanguageTool
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LtConfig {
    /// Ob LT aktiviert ist
    pub enabled: bool,
    /// API-Key für Premium (optional)
    pub api_key: Option<String>,
    /// Benutzername für Premium (optional)
    pub username: Option<String>,
    /// Sprache (z.B. "de-DE", "en-US")
    pub language: String,
    /// Zu ignorierende Regel-IDs
    pub disabled_rules: Vec<String>,
    /// Nur bestimmte Kategorien prüfen (leer = alle)
    pub enabled_categories: Vec<String>,
}

impl Default for LtConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            api_key: None,
            username: None,
            language: "de-DE".to_string(),
            disabled_rules: Vec::new(),
            enabled_categories: Vec::new(),
        }
    }
}

/// Prüft Text mit LanguageTool API
pub async fn check_text(text: &str, config: &LtConfig) -> Result<Vec<LtIssue>> {
    if !config.enabled {
        return Ok(Vec::new());
    }
    
    // Leeren Text nicht prüfen
    if text.trim().is_empty() {
        return Ok(Vec::new());
    }
    
    // Text-Limit: 40.000 Zeichen für kostenlose API, mehr für Premium
    let max_len = if config.api_key.is_some() { 100_000 } else { 40_000 };
    let check_text = if text.len() > max_len {
        &text[..max_len]
    } else {
        text
    };
    
    // API Endpoint wählen
    let endpoint = if config.api_key.is_some() {
        LT_API_PREMIUM
    } else {
        LT_API_FREE
    };
    
    // Request bauen
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()?;
    
    let mut params = vec![
        ("text", check_text.to_string()),
        ("language", config.language.clone()),
    ];
    
    // Premium-Auth hinzufügen
    if let (Some(key), Some(user)) = (&config.api_key, &config.username) {
        params.push(("apiKey", key.clone()));
        params.push(("username", user.clone()));
    } else if let Some(key) = &config.api_key {
        // Nur API-Key ohne Username (manche setups)
        params.push(("apiKey", key.clone()));
    }
    
    // Deaktivierte Regeln
    if !config.disabled_rules.is_empty() {
        params.push(("disabledRules", config.disabled_rules.join(",")));
    }
    
    // Aktivierte Kategorien
    if !config.enabled_categories.is_empty() {
        params.push(("enabledCategories", config.enabled_categories.join(",")));
        params.push(("enabledOnly", "true".to_string()));
    }
    
    log::info!("[LanguageTool] Checking {} chars with {}", check_text.len(), endpoint);
    
    let response = client
        .post(endpoint)
        .form(&params)
        .send()
        .await?;
    
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(anyhow!("LanguageTool API error {}: {}", status, body));
    }
    
    let api_response: LtApiResponse = response.json().await?;
    
    // Matches in unsere Struktur konvertieren
    let issues: Vec<LtIssue> = api_response.matches.into_iter().map(|m| {
        let issue_type = match m.rule.issue_type.as_deref() {
            Some("misspelling") => IssueType::Misspelling,
            Some("grammar") => IssueType::Grammar,
            Some("typographical") => IssueType::Typographical,
            Some("style") => IssueType::Style,
            Some("punctuation") => IssueType::Punctuation,
            _ => {
                // Fallback basierend auf Kategorie
                match m.rule.category.id.as_str() {
                    "TYPOS" | "SPELLING" => IssueType::Misspelling,
                    "GRAMMAR" | "MISC" => IssueType::Grammar,
                    "PUNCTUATION" => IssueType::Punctuation,
                    "STYLE" | "REDUNDANCY" => IssueType::Style,
                    "TYPOGRAPHY" => IssueType::Typographical,
                    _ => IssueType::Other,
                }
            }
        };
        
        LtIssue {
            message: m.message,
            short_message: m.short_message,
            offset: m.offset,
            length: m.length,
            context_text: m.context.text,
            replacements: m.replacements.into_iter().map(|r| r.value).take(5).collect(),
            rule_id: m.rule.id,
            issue_type,
            category: m.rule.category.name,
        }
    }).collect();
    
    log::info!("[LanguageTool] Found {} issues", issues.len());
    
    Ok(issues)
}

/// Testet die API-Verbindung und Authentifizierung
pub async fn test_connection(config: &LtConfig) -> Result<bool> {
    let test_text = match config.language.as_str() {
        lang if lang.starts_with("de") => "Das ist ein Testsatz mit einem Felher.",
        _ => "This is a test sentence with an eror.",
    };
    
    let mut test_config = config.clone();
    test_config.enabled = true;
    
    match check_text(test_text, &test_config).await {
        Ok(issues) => {
            // Sollte mindestens einen Fehler finden (Felher/eror)
            log::info!("[LanguageTool] Connection test: {} issues found", issues.len());
            Ok(!issues.is_empty())
        }
        Err(e) => {
            log::error!("[LanguageTool] Connection test failed: {}", e);
            Err(e)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_issue_type_colors() {
        assert_eq!(IssueType::Misspelling.color(), "#e53e3e");
        assert_eq!(IssueType::Grammar.color(), "#3182ce");
        assert_eq!(IssueType::Style.color(), "#d69e2e");
    }
    
    #[test]
    fn test_default_config() {
        let config = LtConfig::default();
        assert!(!config.enabled);
        assert!(config.api_key.is_none());
        assert_eq!(config.language, "de-DE");
    }
}
