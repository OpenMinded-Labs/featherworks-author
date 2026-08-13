use super::generate_tokens;
use super::engines::mlx::split_prompt_roles;
use super::providers::{claude::ClaudeProvider, openai::OpenAIProvider, LlmProvider};
use super::server;
use serde::{Deserialize, Serialize};
use std::{
    sync::{Mutex, OnceLock},
    time::Duration,
};
use tauri::{AppHandle, Manager};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartChatRequest {
    pub prompt: String,
}

/// How many tokens a mode may generate.
///
/// Note what this does *not* buy: unused budget is free. Measured on a 4k-token
/// prompt, the same request took 10.2 s at a cap of 1024 and 10.1 s at 2048,
/// because the model stops on its own after ~250 tokens either way.
///
/// The cap is a bound on the *worst* case, not the typical one. Generation runs
/// at ~37 tok/s, so a model that starts repeating itself burns 55 s at 2048 and
/// 20 s at 768 before anything cuts it off. Sizing the ceiling per mode keeps a
/// degenerate answer from holding the UI hostage.
pub(crate) fn token_budget_for_mode(mode: Option<&str>, prompt_chars: usize) -> usize {
    match mode {
        // A bounded list of findings, one line each.
        Some("lektorat") => 768,
        // The agent rewrites the passage it was given, so the answer scales
        // with the input. ~4 chars per token, doubled for headroom, clamped so
        // a huge selection cannot run away.
        Some("agent") => (prompt_chars / 2).clamp(512, 2048),
        // Free-form conversation: long enough for a real explanation, short
        // enough that a runaway answer stops on its own.
        _ => 1024,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatTokenEvent {
    pub id: String,
    pub token: String,
    pub done: bool,
}

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
        log::info!(
            "[fontaine] Active provider set to: {}",
            provider.provider_type
        );
    }
}

/// Get the current active provider configuration
pub fn get_active_provider() -> ActiveProvider {
    active_provider()
        .lock()
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
fn sessions() -> &'static Mutex<Vec<Session>> {
    SESSIONS.get_or_init(|| Mutex::new(Vec::new()))
}

pub fn cancel_session(id: &str) -> bool {
    if let Ok(mut list) = sessions().lock() {
        if let Some(pos) = list.iter().position(|s| s.id == id) {
            if let Some(tx) = list[pos].cancel.take() {
                let _ = tx.try_send(());
            }
            true
        } else {
            false
        }
    } else {
        false
    }
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
    log::warn!(
        "[fontaine] Prompt truncated from {} to {} chars (safety limit)",
        text.len(),
        end
    );
    truncated.to_string()
}

pub fn start_session(app: &AppHandle, prompt: String, mode: Option<String>) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    let provider_config = get_active_provider();

    // Safety truncation for local LLM - Gemma 4 has a very large context window.
    // 100000 chars (~25000 tokens) comfortably covers whole chapters plus context.
    let prompt =
        if provider_config.provider_type.is_empty() || provider_config.provider_type == "local" {
            truncate_prompt_safe(&prompt, 100_000)
        } else {
            prompt
        };

    println!(
        "[fontaine] Starte Sitzung {} mit Provider '{}', Prompt-Länge {}",
        id,
        provider_config.provider_type,
        prompt.len()
    );

    let max_tokens = token_budget_for_mode(mode.as_deref(), prompt.len());

    let (tx_cancel, mut rx_cancel) = mpsc::channel::<()>(1);
    let handle_app = app.clone();
    let id_clone = id.clone();

    // Choose the right generation method based on provider
    match provider_config.provider_type.as_str() {
        "claude" => {
            let api_key = provider_config
                .claude_api_key
                .clone()
                .ok_or("Claude API key not configured")?;
            let model = provider_config
                .claude_model
                .clone()
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
                    res = provider.generate_stream(&prompt, max_tokens as u32, move |token| {
                        let _ = app_for_callback.emit_all("ai_token", ChatTokenEvent {
                            id: id_for_callback.clone(),
                            token,
                            done: false
                        });
                    }) => res
                };

                match result {
                    Ok(()) => {
                        let _ = handle_app.emit_all(
                            "ai_token",
                            ChatTokenEvent {
                                id: id_clone,
                                token: String::new(),
                                done: true,
                            },
                        );
                    }
                    Err(e) => {
                        let _ = handle_app.emit_all(
                            "ai_token",
                            ChatTokenEvent {
                                id: id_clone,
                                token: format!("[ERROR: {}]", e),
                                done: true,
                            },
                        );
                    }
                }
            });

            if let Ok(mut list) = sessions().lock() {
                list.push(Session {
                    id: id.clone(),
                    cancel: Some(tx_cancel),
                    handle,
                });
            }
        }
        "openai" => {
            let api_key = provider_config
                .openai_api_key
                .clone()
                .ok_or("OpenAI API key not configured")?;
            let model = provider_config
                .openai_model
                .clone()
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
                    res = provider.generate_stream(&prompt, max_tokens as u32, move |token| {
                        let _ = app_for_callback.emit_all("ai_token", ChatTokenEvent {
                            id: id_for_callback.clone(),
                            token,
                            done: false
                        });
                    }) => res
                };

                match result {
                    Ok(()) => {
                        let _ = handle_app.emit_all(
                            "ai_token",
                            ChatTokenEvent {
                                id: id_clone,
                                token: String::new(),
                                done: true,
                            },
                        );
                    }
                    Err(e) => {
                        let _ = handle_app.emit_all(
                            "ai_token",
                            ChatTokenEvent {
                                id: id_clone,
                                token: format!("[ERROR: {}]", e),
                                done: true,
                            },
                        );
                    }
                }
            });

            if let Ok(mut list) = sessions().lock() {
                list.push(Session {
                    id: id.clone(),
                    cancel: Some(tx_cancel),
                    handle,
                });
            }
        }
        _ => {
            // Local LLM (default): prefer true token streaming from the
            // resident mlx server; fall back to simulated token chunks when
            // no server is running.
            const THINK: &str = "<|think|>";
            let thinking = prompt.contains(THINK);
            let prompt_clean = prompt.replace(THINK, "");
            let (system, user) = split_prompt_roles(&prompt_clean);

            let mut messages: Vec<(String, String)> = Vec::new();
            if !system.trim().is_empty() {
                messages.push(("system".to_string(), system));
            }
            messages.push(("user".to_string(), user));

            let handle = tokio::spawn(async move {
                if server::is_running() {
                    let id_for_callback = id_clone.clone();
                    let app_for_callback = handle_app.clone();
                    let message_refs: Vec<(&str, &str)> = messages
                        .iter()
                        .map(|(role, content)| (role.as_str(), content.as_str()))
                        .collect();

                    let result = tokio::select! {
                        _ = rx_cancel.recv() => {
                            let _ = handle_app.emit_all("ai_token", ChatTokenEvent {
                                id: id_clone.clone(),
                                token: "[CANCEL]".into(),
                                done: true
                            });
                            return;
                        }
                        res = server::chat_stream(&message_refs, max_tokens, 0.2, thinking, move |token| {
                            let _ = app_for_callback.emit_all("ai_token", ChatTokenEvent {
                                id: id_for_callback.clone(),
                                token,
                                done: false
                            });
                        }) => res
                    };

                    match result {
                        Ok(_) => {
                            let _ = handle_app.emit_all("ai_token", ChatTokenEvent {
                                id: id_clone,
                                token: String::new(),
                                done: true,
                            });
                        }
                        Err(e) => {
                            let _ = handle_app.emit_all("ai_token", ChatTokenEvent {
                                id: id_clone,
                                token: format!("[ERROR: {}]", e),
                                done: true,
                            });
                        }
                    }
                    return;
                }

                // Fallback path when no resident server is available.
                let words: Vec<String> = generate_tokens(&prompt_clean);
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
                list.push(Session {
                    id: id.clone(),
                    cancel: Some(tx_cancel),
                    handle,
                });
            }
        }
    }

    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::token_budget_for_mode;

    #[test]
    fn lektorat_gets_a_tight_budget() {
        // Findings are one line each; a long input must not raise the ceiling.
        assert_eq!(token_budget_for_mode(Some("lektorat"), 500), 768);
        assert_eq!(token_budget_for_mode(Some("lektorat"), 90_000), 768);
    }

    #[test]
    fn agent_budget_follows_the_input() {
        // A rewrite is roughly as long as the passage it rewrites.
        assert_eq!(token_budget_for_mode(Some("agent"), 4_000), 2_000);
        // Tiny selections still get room for a usable answer.
        assert_eq!(token_budget_for_mode(Some("agent"), 100), 512);
        // ... and a whole chapter cannot blow the ceiling.
        assert_eq!(token_budget_for_mode(Some("agent"), 100_000), 2_048);
    }

    #[test]
    fn chat_and_unknown_modes_share_the_default() {
        assert_eq!(token_budget_for_mode(Some("chat"), 4_000), 1_024);
        assert_eq!(token_budget_for_mode(None, 4_000), 1_024);
        assert_eq!(token_budget_for_mode(Some("etwas-neues"), 4_000), 1_024);
    }
}
