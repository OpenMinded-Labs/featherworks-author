use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct FontainRequest {
    pub prompt: String,
    pub model: Option<String>,
    #[serde(default)]
    pub max_tokens: Option<u32>,
}

#[derive(Serialize, Deserialize)]
pub struct FontainResponse {
    pub model: String,
    pub text: String,
    pub tokens: u32,
}
