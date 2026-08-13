//! OpenAI API Provider
//!
//! Supports GPT-4, GPT-4o, GPT-3.5-turbo, etc.

use super::{LlmError, LlmProvider, ProviderType};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

/// OpenAI API client
pub struct OpenAIProvider {
    api_key: Option<String>,
    model: String,
    base_url: String,
}

impl Default for OpenAIProvider {
    fn default() -> Self {
        Self {
            api_key: None,
            model: "gpt-4o".to_string(),
            base_url: "https://api.openai.com".to_string(),
        }
    }
}

impl OpenAIProvider {
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

    /// For OpenAI-compatible APIs (like local LM Studio, Ollama, etc.)
    pub fn with_base_url(mut self, url: impl Into<String>) -> Self {
        self.base_url = url.into();
        self
    }
}

/// OpenAI API request format
#[derive(Serialize)]
struct OpenAIRequest {
    model: String,
    max_tokens: u32,
    messages: Vec<OpenAIMessage>,
    stream: bool,
}

#[derive(Serialize)]
struct OpenAIMessage {
    role: String,
    content: String,
}

/// OpenAI API response format
#[derive(Deserialize)]
struct OpenAIResponse {
    choices: Vec<OpenAIChoice>,
}

#[derive(Deserialize)]
struct OpenAIChoice {
    message: OpenAIResponseMessage,
}

#[derive(Deserialize)]
struct OpenAIResponseMessage {
    content: String,
}

/// OpenAI streaming chunk
#[derive(Deserialize)]
struct OpenAIStreamChunk {
    choices: Vec<OpenAIStreamChoice>,
}

#[derive(Deserialize)]
struct OpenAIStreamChoice {
    delta: OpenAIDelta,
}

#[derive(Deserialize)]
struct OpenAIDelta {
    content: Option<String>,
}

#[async_trait]
impl LlmProvider for OpenAIProvider {
    fn name(&self) -> &str {
        "OpenAI (GPT)"
    }

    fn provider_type(&self) -> ProviderType {
        ProviderType::OpenAI
    }

    fn is_ready(&self) -> bool {
        self.api_key
            .as_ref()
            .map(|k| !k.is_empty())
            .unwrap_or(false)
    }

    fn available_models(&self) -> Vec<String> {
        vec![
            "gpt-4o".to_string(),
            "gpt-4o-mini".to_string(),
            "gpt-4-turbo".to_string(),
            "gpt-4".to_string(),
            "gpt-3.5-turbo".to_string(),
        ]
    }

    fn current_model(&self) -> Option<String> {
        Some(self.model.clone())
    }

    async fn generate(&self, prompt: &str, max_tokens: u32) -> Result<String, LlmError> {
        let api_key = self.api_key.as_ref().ok_or(LlmError::NoApiKey)?;

        let request = OpenAIRequest {
            model: self.model.clone(),
            max_tokens,
            messages: vec![OpenAIMessage {
                role: "user".to_string(),
                content: prompt.to_string(),
            }],
            stream: false,
        };

        let client = reqwest::Client::new();
        let response = client
            .post(format!("{}/v1/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
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

        let openai_response: OpenAIResponse = response
            .json()
            .await
            .map_err(|e| LlmError::GenerationError(e.to_string()))?;

        let text = openai_response
            .choices
            .first()
            .map(|c| c.message.content.clone())
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

        let request = OpenAIRequest {
            model: self.model.clone(),
            max_tokens,
            messages: vec![OpenAIMessage {
                role: "user".to_string(),
                content: prompt.to_string(),
            }],
            stream: true,
        };

        let client = reqwest::Client::new();
        let mut response = client
            .post(format!("{}/v1/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
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
                    if let Ok(chunk) = serde_json::from_str::<OpenAIStreamChunk>(json_str) {
                        if let Some(choice) = chunk.choices.first() {
                            if let Some(content) = &choice.delta.content {
                                on_token(content.clone());
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }
}
