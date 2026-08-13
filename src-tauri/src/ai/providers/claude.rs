//! Claude (Anthropic) API Provider
//!
//! Supports Claude 3.5 Sonnet, Claude 3 Opus, etc.

use super::{LlmError, LlmProvider, ProviderType};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

/// Claude API client
pub struct ClaudeProvider {
    api_key: Option<String>,
    model: String,
    base_url: String,
}

impl Default for ClaudeProvider {
    fn default() -> Self {
        Self {
            api_key: None,
            model: "claude-3-5-sonnet-latest".to_string(),
            base_url: "https://api.anthropic.com".to_string(),
        }
    }
}

impl ClaudeProvider {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_api_key(mut self, key: impl Into<String>) -> Self {
        self.api_key = Some(key.into());
        self
    }

    pub fn with_model(mut self, model: impl Into<String>) -> Self {
        self.model = model.into();
        self
    }
}

/// Claude API request format
#[derive(Serialize)]
struct ClaudeRequest {
    model: String,
    max_tokens: u32,
    messages: Vec<ClaudeMessage>,
    stream: bool,
}

#[derive(Serialize)]
struct ClaudeMessage {
    role: String,
    content: String,
}

/// Claude API response format
#[derive(Deserialize)]
struct ClaudeResponse {
    content: Vec<ClaudeContent>,
}

#[derive(Deserialize)]
struct ClaudeContent {
    text: String,
}

/// Claude streaming event
#[derive(Deserialize)]
struct ClaudeStreamEvent {
    #[serde(rename = "type")]
    event_type: String,
    delta: Option<ClaudeDelta>,
}

#[derive(Deserialize)]
struct ClaudeDelta {
    text: Option<String>,
}

#[async_trait]
impl LlmProvider for ClaudeProvider {
    fn name(&self) -> &str {
        "Claude (Anthropic)"
    }

    fn provider_type(&self) -> ProviderType {
        ProviderType::Claude
    }

    fn is_ready(&self) -> bool {
        self.api_key
            .as_ref()
            .map(|k| !k.is_empty())
            .unwrap_or(false)
    }

    fn available_models(&self) -> Vec<String> {
        vec![
            "claude-3-5-sonnet-latest".to_string(),
            "claude-3-5-haiku-latest".to_string(),
            "claude-3-opus-latest".to_string(),
        ]
    }

    fn current_model(&self) -> Option<String> {
        Some(self.model.clone())
    }

    async fn generate(&self, prompt: &str, max_tokens: u32) -> Result<String, LlmError> {
        let api_key = self.api_key.as_ref().ok_or(LlmError::NoApiKey)?;

        let request = ClaudeRequest {
            model: self.model.clone(),
            max_tokens,
            messages: vec![ClaudeMessage {
                role: "user".to_string(),
                content: prompt.to_string(),
            }],
            stream: false,
        };

        let client = reqwest::Client::new();
        let response = client
            .post(format!("{}/v1/messages", self.base_url))
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| LlmError::NetworkError(e.to_string()))?;

        if response.status() == 401 {
            return Err(LlmError::InvalidApiKey);
        }
        if response.status() == 429 {
            return Err(LlmError::RateLimited);
        }
        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(LlmError::ProviderError(error_text));
        }

        let claude_response: ClaudeResponse = response
            .json()
            .await
            .map_err(|e| LlmError::GenerationError(e.to_string()))?;

        let text = claude_response
            .content
            .first()
            .map(|c| c.text.clone())
            .unwrap_or_default();

        Ok(text)
    }

    async fn generate_stream(
        &self,
        prompt: &str,
        max_tokens: u32,
        on_token: impl Fn(String) + Send + Sync + 'static,
    ) -> Result<(), LlmError> {
        let api_key = self.api_key.as_ref().ok_or(LlmError::NoApiKey)?;

        let request = ClaudeRequest {
            model: self.model.clone(),
            max_tokens,
            messages: vec![ClaudeMessage {
                role: "user".to_string(),
                content: prompt.to_string(),
            }],
            stream: true,
        };

        let client = reqwest::Client::new();
        let mut response = client
            .post(format!("{}/v1/messages", self.base_url))
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| LlmError::NetworkError(e.to_string()))?;

        if response.status() == 401 {
            return Err(LlmError::InvalidApiKey);
        }
        if response.status() == 429 {
            return Err(LlmError::RateLimited);
        }
        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(LlmError::ProviderError(error_text));
        }

        // Process SSE stream
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|e| LlmError::NetworkError(e.to_string()))?
        {
            let text = String::from_utf8_lossy(&chunk);
            for line in text.lines() {
                if line.starts_with("data: ") {
                    let json_str = &line[6..];
                    if json_str == "[DONE]" {
                        break;
                    }
                    if let Ok(event) = serde_json::from_str::<ClaudeStreamEvent>(json_str) {
                        if event.event_type == "content_block_delta" {
                            if let Some(delta) = event.delta {
                                if let Some(text) = delta.text {
                                    on_token(text);
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }
}
