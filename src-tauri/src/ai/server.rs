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

/// Kills `mlx_lm server` processes left over from a previous run.
///
/// `Drop` and the exit hook handle an orderly shutdown, but neither runs after
/// a crash or a force quit. Because `start` looks for a *free* port, a stale
/// server does not collide with the new one - it just keeps several GB of
/// wired memory for as long as the machine stays up. Two of them were found
/// alive from earlier sessions while measuring, and they slowed generation
/// down by roughly 8x.
///
/// Matching is deliberately narrow: only our own module invocation with a
/// `--model` argument. No user filter is needed - killing a process owned by
/// somebody else fails with EPERM, which is exactly the desired outcome.
fn kill_stale_servers() {
    // Extended regex, because the process is started two different ways:
    // directly as `-m mlx_lm server` by older builds, and via the watchdog
    // bootstrap, whose command line carries `mlx_lm.server`. Missing either
    // spelling would leave the stale process alive.
    let Ok(output) = Command::new("pgrep")
        .arg("-f")
        .arg("mlx_lm[. ]server")
        .output()
    else {
        return;
    };

    let own_pid = std::process::id();
    for pid in String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|l| l.trim().parse::<u32>().ok())
        .filter(|pid| *pid != own_pid)
    {
        log::warn!("[fontaine/server] killing stale server process {pid}");
        let _ = Command::new("kill").arg("-9").arg(pid.to_string()).status();
    }
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

    // A crashed predecessor leaves its server behind holding GBs of memory.
    kill_stale_servers();

    let port = find_free_port()
        .ok_or_else(|| anyhow!("no free port in {}..{}", PORT_RANGE.start, PORT_RANGE.end))?;

    let mut child = Command::new(python)
        .arg("-c")
        .arg(WATCHDOG_BOOTSTRAP)
        // Read back by the bootstrap and removed from argv before the server
        // sees it.
        .arg(std::process::id().to_string())
        // No `server` argument here: that is the subcommand of the `mlx_lm`
        // package, while the bootstrap runs the `mlx_lm.server` module
        // directly, which parses only its own flags. Passing it makes the
        // server exit with "unrecognized arguments: server".
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

/// Python bootstrap that runs `mlx_lm.server` under a parent watchdog.
///
/// `stop()` and `Drop` only run when the app shuts down in an orderly way.
/// After a crash or a Force Quit no Rust code runs at all, so the server
/// survives holding several GB of wired memory until the next app start
/// cleans it up. That cannot be fixed from the parent - `SIGKILL` is not
/// interceptable - so the child has to take responsibility for itself.
///
/// When the parent dies the child is reparented, on macOS to launchd, and
/// `getppid()` changes. Polling that is enough to notice, and `os._exit`
/// skips the interpreter teardown that a half-loaded model can hang in.
///
/// `argv` is rebuilt because `runpy` hands it to the server unchanged.
const WATCHDOG_BOOTSTRAP: &str = r#"
import os, sys, threading, time, runpy

original_parent = int(sys.argv.pop(1))

def watch():
    while True:
        if os.getppid() != original_parent:
            os._exit(0)
        time.sleep(1.0)

threading.Thread(target=watch, daemon=True).start()

sys.argv[0] = "mlx_lm server"
runpy.run_module("mlx_lm.server", run_name="__main__")
"#;

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

fn build_chat_body(
    model_id: String,
    messages: &[(&str, &str)],
    max_tokens: usize,
    temperature: f32,
    thinking: bool,
    stream: bool,
) -> serde_json::Value {
    serde_json::json!({
        "model": model_id,
        "messages": messages
            .iter()
            .map(|(role, content)| serde_json::json!({ "role": role, "content": content }))
            .collect::<Vec<_>>(),
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": stream,
        // Passed through to the tokenizer's chat template (server.py handles
        // `chat_template_kwargs` per request), which emits `<|think|>` only
        // when this is true.
        "chat_template_kwargs": { "enable_thinking": thinking },
    })
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

    let body = build_chat_body(model_id, messages, max_tokens, temperature, thinking, false);

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

/// Streams a chat completion token-by-token via SSE.
///
/// The callback receives only user-visible content deltas (no reasoning block).
/// Cancellation is handled by dropping the returned future.
pub async fn chat_stream<F>(
    messages: &[(&str, &str)],
    max_tokens: usize,
    temperature: f32,
    thinking: bool,
    mut on_token: F,
) -> Result<Completion>
where
    F: FnMut(String) + Send,
{
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

    let body = build_chat_body(model_id, messages, max_tokens, temperature, thinking, true);

    let client = reqwest::Client::builder().timeout(REQUEST_TIMEOUT).build()?;
    let mut response = client
        .post(format!("http://127.0.0.1:{port}/v1/chat/completions"))
        .json(&body)
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(anyhow!("mlx server stream error ({}): {}", status, text));
    }

    let mut stream_buf: Vec<u8> = Vec::new();
    let mut full_content = String::new();

    while let Some(chunk) = response.chunk().await? {
        stream_buf.extend_from_slice(&chunk);

        for event in drain_sse_events(&mut stream_buf) {
            match event {
                SseEvent::Delta(delta) => {
                    full_content.push_str(&delta);
                    on_token(delta);
                }
                SseEvent::Error(err) => {
                    return Err(anyhow!("mlx server stream error: {}", err));
                }
                SseEvent::Ignored => {}
            }
        }
    }

    let content = full_content.trim().to_string();
    if content.is_empty() {
        return Err(anyhow!(
            "model produced no answer while streaming (empty content)"
        ));
    }

    Ok(Completion {
        content,
        prompt_tokens: 0,
        cached_tokens: 0,
    })
}

fn truncate(s: &str) -> String {
    s.chars().take(200).collect()
}

/// One decoded SSE event.
enum SseEvent {
    /// A visible content delta.
    Delta(String),
    /// The server reported an error inside the stream.
    Error(String),
    /// Keep-alive, `[DONE]`, reasoning, or anything else we ignore.
    Ignored,
}

/// Pulls complete SSE events out of a byte buffer.
///
/// Takes bytes rather than a `&str` on purpose: an HTTP chunk can end in the
/// middle of a multi-byte character. Decoding each chunk on its own turns
/// "Grün" into "Gr\u{FFFD}" + "\u{FFFD}n" - very visible in German prose.
/// Only whole events, which always end at an ASCII "\n\n", are decoded.
fn drain_sse_events(buf: &mut Vec<u8>) -> Vec<SseEvent> {
    let mut events = Vec::new();

    while let Some(idx) = buf.windows(2).position(|w| w == b"\n\n") {
        let raw: Vec<u8> = buf.drain(..idx + 2).collect();
        // The event boundary is ASCII, so what precedes it is a whole number of
        // characters and this decode cannot split anything.
        let event = String::from_utf8_lossy(&raw);

        for line in event.lines() {
            let Some(payload) = line.trim().strip_prefix("data:") else {
                continue;
            };
            let payload = payload.trim();

            if payload.is_empty() || payload == "[DONE]" {
                continue;
            }

            let Ok(value) = serde_json::from_str::<serde_json::Value>(payload) else {
                continue;
            };

            if let Some(err) = value.get("error") {
                events.push(SseEvent::Error(err.to_string()));
                continue;
            }

            match value
                .pointer("/choices/0/delta/content")
                .and_then(serde_json::Value::as_str)
            {
                Some(delta) if !delta.is_empty() => {
                    events.push(SseEvent::Delta(delta.to_string()))
                }
                _ => events.push(SseEvent::Ignored),
            }
        }
    }

    events
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

    /// Collects the visible text from a sequence of raw network chunks.
    fn stream_text(chunks: &[&[u8]]) -> String {
        let mut buf = Vec::new();
        let mut out = String::new();
        for chunk in chunks {
            buf.extend_from_slice(chunk);
            for event in drain_sse_events(&mut buf) {
                if let SseEvent::Delta(d) = event {
                    out.push_str(&d);
                }
            }
        }
        out
    }

    fn frame(content: &str) -> Vec<u8> {
        format!(
            "data: {}\n\n",
            serde_json::json!({"choices":[{"delta":{"content": content}}]})
        )
        .into_bytes()
    }

    #[test]
    fn umlauts_survive_a_chunk_boundary() {
        // The regression this guards: decoding each chunk on its own turned
        // "Grün" into "Gr\u{FFFD}" + "\u{FFFD}n". German prose hits this
        // constantly, so split the frame inside the umlaut's two bytes.
        let full = frame("Grün");
        let split_at = full
            .windows(2)
            .position(|w| w == [0xC3, 0xBC])
            .expect("no ü in the frame")
            + 1;

        let text = stream_text(&[&full[..split_at], &full[split_at..]]);
        assert_eq!(text, "Grün");
        assert!(!text.contains('\u{FFFD}'), "replacement char in output");
    }

    #[test]
    fn an_event_split_across_chunks_is_held_until_complete() {
        let full = frame("Hallo Welt");
        let mid = full.len() / 2;

        let mut buf = Vec::new();
        buf.extend_from_slice(&full[..mid]);
        // Half an event is not an event.
        assert!(drain_sse_events(&mut buf).is_empty());

        buf.extend_from_slice(&full[mid..]);
        let events = drain_sse_events(&mut buf);
        assert!(matches!(events.as_slice(), [SseEvent::Delta(d)] if d == "Hallo Welt"));
        assert!(buf.is_empty(), "buffer not drained");
    }

    #[test]
    fn several_events_in_one_chunk_all_arrive() {
        let mut chunk = frame("Eins");
        chunk.extend(frame(" zwei"));
        chunk.extend(frame(" drei"));
        assert_eq!(stream_text(&[&chunk]), "Eins zwei drei");
    }

    #[test]
    fn done_and_keepalive_frames_are_ignored() {
        let mut chunk = b": keep-alive\n\n".to_vec();
        chunk.extend(frame("Text"));
        chunk.extend(b"data: [DONE]\n\n");
        assert_eq!(stream_text(&[&chunk]), "Text");
    }

    #[test]
    fn errors_inside_the_stream_are_surfaced() {
        let mut buf = b"data: {\"error\":\"model exploded\"}\n\n".to_vec();
        let events = drain_sse_events(&mut buf);
        assert!(matches!(events.as_slice(), [SseEvent::Error(_)]));
    }

    #[test]
    fn malformed_json_does_not_abort_the_stream() {
        let mut chunk = b"data: {not json\n\n".to_vec();
        chunk.extend(frame("weiter"));
        assert_eq!(stream_text(&[&chunk]), "weiter");
    }

    #[test]
    fn a_byte_at_a_time_still_reassembles() {
        // Worst case the network can hand us.
        let mut chunk = frame("Zrassha grüßt Sierrkha");
        chunk.extend(frame(" — und tschüß."));
        let singles: Vec<Vec<u8>> = chunk.iter().map(|b| vec![*b]).collect();
        let refs: Vec<&[u8]> = singles.iter().map(|v| v.as_slice()).collect();

        assert_eq!(stream_text(&refs), "Zrassha grüßt Sierrkha — und tschüß.");
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
