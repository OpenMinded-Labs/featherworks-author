//! Resident `mlx_lm.server` process.
//!
//! Without this, every inference spawns a fresh Python process that loads
//! 3.76 GB from disk, prefills the whole prompt, answers, and dies. Since
//! scenes are now passed in full (see `ai::context`), that prefill is the
//! dominant cost and it is paid on *every* request.
//!
//! Keeping one server alive also enables prefix caching: measured on a
//! 16k-char scene, follow-up questions reused 4822 of 4834 prompt tokens.
//!
//! Note this differs from `mlx_lm.generate`, which only matches whole prompts.
//!
//! Security: the server binds to 127.0.0.1 only. Upstream warns it is "not
//! recommended for production as it only implements basic security checks",
//! which is acceptable for a loopback-only, single-user desktop process.

use std::io::{BufRead, BufReader};
use std::net::TcpListener;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use anyhow::{anyhow, Result};

/// Ports probed for a free slot. Keeps the range small and predictable so a
/// stale process from a previous run is easy to spot.
const PORT_RANGE: std::ops::Range<u16> = 8765..8775;

/// The server loads the model lazily on first request, so startup only has to
/// get as far as binding the socket.
const STARTUP_TIMEOUT: Duration = Duration::from_secs(90);

/// Generation of a long answer with a reasoning block can take a while.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(600);

pub struct ServerHandle {
    child: Child,
    port: u16,
    /// Passed as `model` in requests. Must be the exact string the server was
    /// started with (see `model_id`).
    model_id: String,
}

impl ServerHandle {
    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn model_id(&self) -> &str {
        &self.model_id
    }

    pub fn base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }

    /// Returns false once the process has exited (crash, OOM, external kill).
    pub fn is_alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }
}

impl Drop for ServerHandle {
    fn drop(&mut self) {
        // The child holds several GB of wired memory; leaking it would strand
        // that until reboot.
        log::info!("[fontaine/server] stopping (port {})", self.port);
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

static SERVER: OnceLock<Mutex<Option<ServerHandle>>> = OnceLock::new();

fn slot() -> &'static Mutex<Option<ServerHandle>> {
    SERVER.get_or_init(|| Mutex::new(None))
}

/// First port in `PORT_RANGE` that nothing is listening on.
///
/// Inherently racy - another process can take the port between the probe and
/// the server's own bind - but the window is small and startup failure is
/// detected and reported.
fn find_free_port() -> Option<u16> {
    PORT_RANGE
        .clone()
        .find(|port| TcpListener::bind(("127.0.0.1", *port)).is_ok())
}

/// The `model` field of a request is resolved by the server independently of
/// its `--model` flag: an unknown value is treated as a Hugging Face repo id
/// and **downloaded**. Verified - `"model": "gemma"` produced a 404 fetch
/// against huggingface.co rather than using the loaded model.
///
/// For an offline desktop app that is unacceptable, so requests must echo the
/// exact string the server was started with.
fn model_id_for(model_path: &Path) -> String {
    model_path.to_string_lossy().to_string()
}

/// Starts the server and waits until it accepts connections.
pub fn start(python: &str, model_path: &Path) -> Result<()> {
    let mut guard = slot().lock().map_err(|_| anyhow!("server lock poisoned"))?;

    if let Some(handle) = guard.as_mut() {
        if handle.is_alive() {
            return Ok(());
        }
        log::warn!("[fontaine/server] previous instance died, restarting");
        *guard = None;
    }

    let port = find_free_port()
        .ok_or_else(|| anyhow!("no free port in {}..{}", PORT_RANGE.start, PORT_RANGE.end))?;

    let mut child = Command::new(python)
        .arg("-m")
        .arg("mlx_lm")
        .arg("server")
        .arg("--model")
        .arg(model_path)
        .arg("--port")
        .arg(port.to_string())
        // Bound explicitly: the default is already loopback, but an accidental
        // 0.0.0.0 would expose an unauthenticated endpoint on the network.
        .arg("--host")
        .arg("127.0.0.1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| anyhow!("failed to spawn mlx_lm server: {e}"))?;

    drain_output(&mut child);

    let handle = ServerHandle {
        child,
        port,
        model_id: model_id_for(model_path),
    };

    match wait_until_ready(port) {
        Ok(()) => {
            log::info!("[fontaine/server] ready on port {port}");
            *guard = Some(handle);
            Ok(())
        }
        Err(e) => {
            // Dropping the handle kills the child, so a half-started server
            // does not linger holding memory and the port.
            drop(handle);
            Err(e)
        }
    }
}

/// Forwards the child's stdout/stderr into the app log.
///
/// Also prevents the pipes from filling up, which would block the server once
/// the OS buffer is full.
fn drain_output(child: &mut Child) {
    for (name, stream) in [
        (
            "out",
            child
                .stdout
                .take()
                .map(|s| Box::new(s) as Box<dyn std::io::Read + Send>),
        ),
        (
            "err",
            child
                .stderr
                .take()
                .map(|s| Box::new(s) as Box<dyn std::io::Read + Send>),
        ),
    ] {
        let Some(stream) = stream else { continue };
        std::thread::spawn(move || {
            for line in BufReader::new(stream)
                .lines()
                .map_while(std::result::Result::ok)
            {
                log::debug!("[fontaine/server/{name}] {line}");
            }
        });
    }
}

fn wait_until_ready(port: u16) -> Result<()> {
    let deadline = Instant::now() + STARTUP_TIMEOUT;
    let url = format!("http://127.0.0.1:{port}/v1/models");
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()?;

    while Instant::now() < deadline {
        if client
            .get(&url)
            .send()
            .map(|r| r.status().is_success())
            .unwrap_or(false)
        {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(500));
    }

    Err(anyhow!(
        "mlx_lm server did not become ready within {}s",
        STARTUP_TIMEOUT.as_secs()
    ))
}

/// Stops the server if one is running. Safe to call when none is.
pub fn stop() {
    if let Ok(mut guard) = slot().lock() {
        *guard = None; // Drop kills the child.
    }
}

pub fn is_running() -> bool {
    slot()
        .lock()
        .map(|mut g| g.as_mut().is_some_and(|h| h.is_alive()))
        .unwrap_or(false)
}

/// Result of a chat completion.
pub struct Completion {
    /// User-facing answer, with the reasoning block already removed by the
    /// server - no `strip_thinking` needed on this path.
    pub content: String,
    pub prompt_tokens: usize,
    pub cached_tokens: usize,
}

/// Sends a chat completion to the running server.
///
/// `messages` are (role, content) pairs; the server applies Gemma 4's chat
/// template itself, so callers must **not** pre-format turn markers.
///
/// `thinking` controls the model's internal reasoning block. Measured on real
/// manuscript text (`scripts/bench_thinking_flag.py`, 6k chars of narrative):
///
/// | Aufgabe | mit | ohne |
/// | --- | --- | --- |
/// | Entitäten | 186 s, **leere Antwort** | 24,5 s, 2/2 Namen, gültiges JSON |
/// | Zusammenfassung | 40 s, **leere Antwort** | 5,9 s, korrekt |
/// | Stilkritik | 25 s, nach 159 Zeichen abgebrochen | 24,7 s, 2753 Zeichen |
///
/// The reasoning block consumed the entire token budget, so the answer never
/// arrived. Enabling it is therefore opt-in per task, not the default.
pub fn chat(
    messages: &[(&str, &str)],
    max_tokens: usize,
    temperature: f32,
    thinking: bool,
) -> Result<Completion> {
    let (port, model_id) = {
        let mut guard = slot().lock().map_err(|_| anyhow!("server lock poisoned"))?;
        let handle = guard
            .as_mut()
            .ok_or_else(|| anyhow!("server not running"))?;
        if !handle.is_alive() {
            return Err(anyhow!("server process has exited"));
        }
        (handle.port, handle.model_id.clone())
    };

    let body = serde_json::json!({
        "model": model_id,
        "messages": messages
            .iter()
            .map(|(role, content)| serde_json::json!({ "role": role, "content": content }))
            .collect::<Vec<_>>(),
        "max_tokens": max_tokens,
        "temperature": temperature,
        // Passed through to the tokenizer's chat template (server.py handles
        // `chat_template_kwargs` per request), which emits `<|think|>` only
        // when this is true.
        "chat_template_kwargs": { "enable_thinking": thinking },
    });

    let client = reqwest::blocking::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()?;

    let response: serde_json::Value = client
        .post(format!("http://127.0.0.1:{port}/v1/chat/completions"))
        .json(&body)
        .send()?
        .json()?;

    if let Some(err) = response.get("error") {
        return Err(anyhow!("mlx server error: {}", err));
    }

    let message = response
        .pointer("/choices/0/message")
        .ok_or_else(|| anyhow!("malformed response: {}", truncate(&response.to_string())))?;

    let content = message
        .get("content")
        .and_then(|c| c.as_str())
        .unwrap_or_default()
        .trim()
        .to_string();

    if content.is_empty() {
        // Typically means the token budget was spent inside the reasoning
        // block, which the server reports separately as `reasoning`.
        let reasoning_len = message
            .get("reasoning")
            .and_then(|r| r.as_str())
            .map_or(0, str::len);
        return Err(anyhow!(
            "model produced no answer (reasoning block: {reasoning_len} chars) - raise max_tokens"
        ));
    }

    let usage = response.get("usage");
    Ok(Completion {
        content,
        prompt_tokens: usage
            .and_then(|u| u.get("prompt_tokens"))
            .and_then(serde_json::Value::as_u64)
            .unwrap_or(0) as usize,
        cached_tokens: usage
            .and_then(|u| u.pointer("/prompt_tokens_details/cached_tokens"))
            .and_then(serde_json::Value::as_u64)
            .unwrap_or(0) as usize,
    })
}

fn truncate(s: &str) -> String {
    s.chars().take(200).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A bare name like "gemma" makes the server fetch from Hugging Face, so
    /// the id must stay the full path the server was started with.
    #[test]
    fn model_id_is_the_full_path() {
        let id = model_id_for(Path::new("/models/gemma-4-e2b-mlx-q6-text"));
        assert_eq!(id, "/models/gemma-4-e2b-mlx-q6-text");
        assert!(id.contains('/'), "bare names trigger a HF download");
    }

    #[test]
    fn free_port_is_within_range() {
        let port = find_free_port().expect("no free port for test");
        assert!(PORT_RANGE.contains(&port));
    }

    #[test]
    fn not_running_before_start() {
        assert!(!is_running());
    }

    #[test]
    fn stop_without_start_is_noop() {
        stop();
        assert!(!is_running());
    }
}
