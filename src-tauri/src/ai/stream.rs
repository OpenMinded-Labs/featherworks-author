use serde::{Serialize, Deserialize};
use std::{sync::{Mutex, OnceLock}, time::Duration};
use super::generate_tokens;
use super::providers::{LlmProvider, claude::ClaudeProvider, openai::OpenAIProvider};
use uuid::Uuid;
use tauri::{AppHandle, Manager};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartChatRequest { pub prompt: String }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatTokenEvent { pub id: String, pub token: String, pub done: bool }

/// Active provider configuration
#[derive(Debug, Clone, Default)]
pub struct ActiveProvider {
    pub provider_type: String, // "local", "claude", "openai"
    pub claude_api_key: Option<String>,
    pub openai_api_key: Option<String>,
    pub claude_model: Option<String>,
    pub openai_model: Option<String>,
}

static ACTIVE_PROVIDER: OnceLock<Mutex<ActiveProvider>> = OnceLock::new();

fn active_provider() -> &'static Mutex<ActiveProvider> {
    ACTIVE_PROVIDER.get_or_init(|| Mutex::new(ActiveProvider::default()))
}

/// Set the active AI provider
pub fn set_active_provider(config: ActiveProvider) {
    if let Ok(mut provider) = active_provider().lock() {
        *provider = config;
        log::info!("[fontaine] Active provider set to: {}", provider.provider_type);
    }
}

/// Get the current active provider configuration
pub fn get_active_provider() -> ActiveProvider {
    active_provider().lock()
        .map(|p| p.clone())
        .unwrap_or_default()
}

struct Session {
    #[allow(dead_code)]
    id: String,
    cancel: Option<mpsc::Sender<()>>,
    #[allow(dead_code)]
    handle: JoinHandle<()>,
}

static SESSIONS: OnceLock<Mutex<Vec<Session>>> = OnceLock::new();
fn sessions() -> &'static Mutex<Vec<Session>> { SESSIONS.get_or_init(|| Mutex::new(Vec::new())) }

pub fn cancel_session(id: &str) -> bool {
    if let Ok(mut list) = sessions().lock() {
        if let Some(pos) = list.iter().position(|s| s.id == id) {
            if let Some(tx) = list[pos].cancel.take() { let _ = tx.try_send(()); }
            true
        } else { false }
    } else { false }
}

/// UTF-8-safe truncation to limit prompt length for local LLM
fn truncate_prompt_safe(text: &str, max_chars: usize) -> String {
    if text.len() <= max_chars {
        return text.to_string();
    }
    // Find valid UTF-8 boundary
    let mut end = max_chars;
    while !text.is_char_boundary(end) && end > 0 {
        end -= 1;
    }
    let truncated = &text[..end];
    log::warn!("[fontaine] Prompt truncated from {} to {} chars (safety limit)", text.len(), end);
    truncated.to_string()
}

pub fn start_session(app: &AppHandle, prompt: String) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    let provider_config = get_active_provider();
    
    // Safety truncation for local LLM - Gemma 4 has a very large context window.
    // 100000 chars (~25000 tokens) comfortably covers whole chapters plus context.
    let prompt = if provider_config.provider_type.is_empty() || provider_config.provider_type == "local" {
        truncate_prompt_safe(&prompt, 100_000)
    } else {
        prompt
    };
    
    println!("[fontaine] Starte Sitzung {} mit Provider '{}', Prompt-Länge {}", 
             id, provider_config.provider_type, prompt.len());
    
    let (tx_cancel, mut rx_cancel) = mpsc::channel::<()>(1);
    let handle_app = app.clone();
    let id_clone = id.clone();
    
    // Choose the right generation method based on provider
    match provider_config.provider_type.as_str() {
        "claude" => {
            let api_key = provider_config.claude_api_key.clone()
                .ok_or("Claude API key not configured")?;
            let model = provider_config.claude_model.clone()
                .unwrap_or_else(|| "claude-3-5-sonnet-latest".to_string());
            
            let handle = tokio::spawn(async move {
                let provider = ClaudeProvider::new()
                    .with_api_key(api_key)
                    .with_model(model);
                
                let id_for_callback = id_clone.clone();
                let app_for_callback = handle_app.clone();
                
                let result = tokio::select! {
                    _ = rx_cancel.recv() => {
                        let _ = handle_app.emit_all("ai_token", ChatTokenEvent {
                            id: id_clone.clone(),
                            token: "[CANCEL]".into(),
                            done: true
                        });
                        return;
                    }
                    res = provider.generate_stream(&prompt, 2048, move |token| {
                        let _ = app_for_callback.emit_all("ai_token", ChatTokenEvent {
                            id: id_for_callback.clone(),
                            token,
                            done: false
                        });
                    }) => res
                };
                
                match result {
                    Ok(()) => {
                        let _ = handle_app.emit_all("ai_token", ChatTokenEvent {
                            id: id_clone,
                            token: String::new(),
                            done: true
                        });
                    }
                    Err(e) => {
                        let _ = handle_app.emit_all("ai_token", ChatTokenEvent {
                            id: id_clone,
                            token: format!("[ERROR: {}]", e),
                            done: true
                        });
                    }
                }
            });
            
            if let Ok(mut list) = sessions().lock() {
                list.push(Session { id: id.clone(), cancel: Some(tx_cancel), handle });
            }
        }
        "openai" => {
            let api_key = provider_config.openai_api_key.clone()
                .ok_or("OpenAI API key not configured")?;
            let model = provider_config.openai_model.clone()
                .unwrap_or_else(|| "gpt-4o".to_string());
            
            let handle = tokio::spawn(async move {
                let provider = OpenAIProvider::new()
                    .with_api_key(api_key)
                    .with_model(model);
                
                let id_for_callback = id_clone.clone();
                let app_for_callback = handle_app.clone();
                
                let result = tokio::select! {
                    _ = rx_cancel.recv() => {
                        let _ = handle_app.emit_all("ai_token", ChatTokenEvent {
                            id: id_clone.clone(),
                            token: "[CANCEL]".into(),
                            done: true
                        });
                        return;
                    }
                    res = provider.generate_stream(&prompt, 2048, move |token| {
                        let _ = app_for_callback.emit_all("ai_token", ChatTokenEvent {
                            id: id_for_callback.clone(),
                            token,
                            done: false
                        });
                    }) => res
                };
                
                match result {
                    Ok(()) => {
                        let _ = handle_app.emit_all("ai_token", ChatTokenEvent {
                            id: id_clone,
                            token: String::new(),
                            done: true
                        });
                    }
                    Err(e) => {
                        let _ = handle_app.emit_all("ai_token", ChatTokenEvent {
                            id: id_clone,
                            token: format!("[ERROR: {}]", e),
                            done: true
                        });
                    }
                }
            });
            
            if let Ok(mut list) = sessions().lock() {
                list.push(Session { id: id.clone(), cancel: Some(tx_cancel), handle });
            }
        }
        _ => {
            // Local LLM (default) - use existing generate_tokens
            let words: Vec<String> = generate_tokens(&prompt);
            let handle = tokio::spawn(async move {
                for (i, w) in words.iter().enumerate() {
                    tokio::select! {
                        _ = rx_cancel.recv() => {
                            let _ = handle_app.emit_all("ai_token", ChatTokenEvent {
                                id: id_clone.clone(),
                                token: "[CANCEL]".into(),
                                done: true
                            });
                            return;
                        }
                        _ = tokio::time::sleep(Duration::from_millis(80)) => {
                            let done = i == words.len() - 1;
                            let _ = handle_app.emit_all("ai_token", ChatTokenEvent {
                                id: id_clone.clone(),
                                token: w.clone(),
                                done
                            });
                            if done {
                                println!("[fontaine] Sitzung {} abgeschlossen ({} Tokens)", 
                                        id_clone, words.len());
                            }
                        }
                    }
                }
            });
            
            if let Ok(mut list) = sessions().lock() {
                list.push(Session { id: id.clone(), cancel: Some(tx_cancel), handle });
            }
        }
    }
    
    Ok(id)
}
