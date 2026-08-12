//! LLM Provider Abstraction Layer
//! 
//! Unified interface for different LLM backends:
//! - Local (MLX on Apple Silicon, llama.cpp on Windows/Linux)
//! - Claude (Anthropic API)
//! - OpenAI (GPT-4, etc.)

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

pub mod claude;
pub mod openai;

/// Provider types available
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ProviderType {
    #[default]
    Local,
    Claude,
    OpenAI,
}

impl ProviderType {
    pub fn display_name(&self) -> &'static str {
        match self {
            ProviderType::Local => "Lokal (Gemma)",
            ProviderType::Claude => "Claude (Anthropic)",
            ProviderType::OpenAI => "OpenAI (GPT)",
        }
    }
    
    pub fn requires_api_key(&self) -> bool {
        match self {
            ProviderType::Local => false,
            ProviderType::Claude | ProviderType::OpenAI => true,
        }
    }
}

/// Error types for LLM operations
#[derive(Debug, Clone, Serialize)]
pub enum LlmError {
    NoApiKey,
    InvalidApiKey,
    RateLimited,
    NetworkError(String),
    ModelNotAvailable(String),
    GenerationError(String),
    ProviderError(String),
}

impl std::fmt::Display for LlmError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LlmError::NoApiKey => write!(f, "Kein API-Key konfiguriert"),
            LlmError::InvalidApiKey => write!(f, "Ungültiger API-Key"),
            LlmError::RateLimited => write!(f, "Rate-Limit erreicht"),
            LlmError::NetworkError(e) => write!(f, "Netzwerkfehler: {}", e),
            LlmError::ModelNotAvailable(m) => write!(f, "Modell nicht verfügbar: {}", m),
            LlmError::GenerationError(e) => write!(f, "Generierungsfehler: {}", e),
            LlmError::ProviderError(e) => write!(f, "Provider-Fehler: {}", e),
        }
    }
}

/// Configuration for a specific provider
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProviderConfig {
    pub provider: ProviderType,
    pub api_key: Option<String>,
    pub model: Option<String>,
    pub base_url: Option<String>, // For custom endpoints
}

/// Token callback for streaming
pub type TokenCallback = Box<dyn Fn(String) + Send + Sync>;

/// Unified LLM Provider trait
#[async_trait]
pub trait LlmProvider: Send + Sync {
    /// Get provider display name
    fn name(&self) -> &str;
    
    /// Get provider type
    fn provider_type(&self) -> ProviderType;
    
    /// Check if provider is ready (API key set, model loaded, etc.)
    fn is_ready(&self) -> bool;
    
    /// List available models for this provider
    fn available_models(&self) -> Vec<String>;
    
    /// Get the currently selected model
    fn current_model(&self) -> Option<String>;
    
    /// Generate completion (non-streaming)
    async fn generate(&self, prompt: &str, max_tokens: u32) -> Result<String, LlmError>;
    
    /// Generate completion with streaming callback
    async fn generate_stream(
        &self,
        prompt: &str,
        max_tokens: u32,
        on_token: impl Fn(String) + Send + Sync + 'static,
    ) -> Result<(), LlmError>;
}

/// Provider registry - manages active provider and switching
pub struct ProviderRegistry {
    active: ProviderType,
    config: std::collections::HashMap<ProviderType, ProviderConfig>,
}

impl Default for ProviderRegistry {
    fn default() -> Self {
        Self {
            active: ProviderType::Local,
            config: std::collections::HashMap::new(),
        }
    }
}

impl ProviderRegistry {
    pub fn new() -> Self {
        Self::default()
    }
    
    pub fn active_provider(&self) -> ProviderType {
        self.active
    }
    
    pub fn set_active_provider(&mut self, provider: ProviderType) {
        self.active = provider;
    }
    
    pub fn get_config(&self, provider: ProviderType) -> Option<&ProviderConfig> {
        self.config.get(&provider)
    }
    
    pub fn set_config(&mut self, provider: ProviderType, config: ProviderConfig) {
        self.config.insert(provider, config);
    }
    
    pub fn has_api_key(&self, provider: ProviderType) -> bool {
        self.config.get(&provider)
            .and_then(|c| c.api_key.as_ref())
            .map(|k| !k.is_empty())
            .unwrap_or(false)
    }
}
