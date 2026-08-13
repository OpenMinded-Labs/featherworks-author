//! Exercises the real `mlx_lm.server` lifecycle.
//!
//! Ignored by default: needs the venv, the model on disk, and ~5 GB of RAM.
//!
//!     cargo test --features local-llm --test mlx_server_flow -- --ignored --nocapture

#![cfg(feature = "local-llm")]

use std::path::PathBuf;
use std::time::Instant;

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri has a parent")
        .to_path_buf()
}

fn model_dir() -> PathBuf {
    repo_root().join("resources/models/gemma-4-e2b-mlx-q6-text")
}

fn python() -> String {
    let venv = repo_root().join(".venv-mlx/bin/python");
    assert!(venv.exists(), "venv missing at {}", venv.display());
    venv.to_string_lossy().to_string()
}

#[test]
#[ignore = "requires model + venv"]
fn server_starts_answers_and_stops() {
    use featherworks_author::ai::server;

    let model = model_dir();
    assert!(model.exists(), "model missing at {}", model.display());

    let t = Instant::now();
    server::start(&python(), &model).expect("server failed to start");
    println!("startup: {:.1}s", t.elapsed().as_secs_f64());
    assert!(server::is_running());

    // Cold: nothing cached yet.
    let scene = "Der Regen schlug gegen das Fenster. Marla zaehlte die Sekunden \
                 zwischen Blitz und Donner. "
        .repeat(200);
    let system = format!("Du bist Fontaine.\n\nKONTEXT:\n{scene}");

    let t = Instant::now();
    let first = server::chat(
        &[("system", &system), ("user", "Wer kommt in der Szene vor?")],
        512,
        0.2,
        false,
    )
    .expect("first completion failed");
    let cold = t.elapsed().as_secs_f64();
    println!(
        "cold : {cold:5.1}s | prompt={} cached={}",
        first.prompt_tokens, first.cached_tokens
    );
    assert!(!first.content.is_empty());
    // The server strips the reasoning block itself.
    assert!(!first.content.contains("<|channel>"), "reasoning leaked");

    // Warm: same prefix, different question -> prefix cache should hit.
    let t = Instant::now();
    let second = server::chat(
        &[("system", &system), ("user", "Welche Stimmung herrscht?")],
        512,
        0.2,
        false,
    )
    .expect("second completion failed");
    let warm = t.elapsed().as_secs_f64();
    println!(
        "warm : {warm:5.1}s | prompt={} cached={}",
        second.prompt_tokens, second.cached_tokens
    );

    assert!(
        second.cached_tokens > first.prompt_tokens / 2,
        "prefix cache did not engage: {} of {} tokens",
        second.cached_tokens,
        second.prompt_tokens
    );

    server::stop();
    assert!(!server::is_running(), "server still running after stop");
}

/// A bare model name makes the server fetch from Hugging Face. Requests must
/// therefore carry the exact path the server was started with - otherwise a
/// shipped app would silently hit the network.
#[test]
#[ignore = "requires model + venv"]
fn requests_never_trigger_a_download() {
    use featherworks_author::ai::server;

    server::start(&python(), &model_dir()).expect("server failed to start");

    let result = server::chat(&[("user", "Sag Hallo.")], 256, 0.2, false);
    server::stop();

    let completion = result.expect("completion failed");
    assert!(!completion.content.is_empty());
}

/// The reasoning block eats the token budget: measured on real manuscript text,
/// entity extraction and summarisation returned *empty* answers with thinking
/// on, and correct ones with it off. Guards against flipping the default.
#[test]
#[ignore = "requires model + venv"]
fn thinking_disabled_answers_within_budget() {
    use featherworks_author::ai::server;

    server::start(&python(), &model_dir()).expect("server failed to start");

    let t = Instant::now();
    let result = server::chat(
        &[("user", "Nenne drei Farben.")],
        // Deliberately tight: with reasoning enabled this budget is consumed
        // before the answer starts.
        200,
        0.2,
        false,
    );
    let elapsed = t.elapsed().as_secs_f64();
    server::stop();

    let completion = result.expect("completion failed");
    println!("no-thinking: {elapsed:.1}s -> {:?}", completion.content);
    assert!(
        !completion.content.is_empty(),
        "empty answer - reasoning block likely re-enabled"
    );
}

/// Documents that raising the answer budget is *not* what costs time: the model
/// stops on its own long before the cap. The caps in `token_budget_for_mode`
/// bound the degenerate case, they do not speed up the normal one. Re-run this
/// before "optimising" budgets again.
#[test]
#[ignore = "requires model + venv"]
fn answer_budget_is_a_ceiling_not_a_cost() {
    use featherworks_author::ai::server;

    server::start(&python(), &model_dir()).expect("server failed to start");

    let scene = "Der Regen schlug gegen das Fenster. Marla zaehlte die Sekunden \
                 zwischen Blitz und Donner. "
        .repeat(200);
    let system = format!("Du bist Fontaine.\n\nKONTEXT:\n{scene}");
    let question = "Fasse die Stimmung der Szene zusammen.";

    for budget in [768usize, 1024, 2048] {
        let t = Instant::now();
        let completion = server::chat(&[("system", &system), ("user", question)], budget, 0.2, false)
            .expect("completion failed");
        println!(
            "budget {budget:5} -> {:5.1}s, {} chars",
            t.elapsed().as_secs_f64(),
            completion.content.chars().count()
        );
    }

    server::stop();
}

/// Streaming has to deliver the answer in pieces, not as one final blob -
/// otherwise the chat UI gains nothing over the blocking path.
#[test]
#[ignore = "requires model + venv"]
fn chat_stream_delivers_incremental_tokens() {
    use featherworks_author::ai::server;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    server::start(&python(), &model_dir()).expect("server failed to start");

    let chunks = Arc::new(AtomicUsize::new(0));
    let counter = Arc::clone(&chunks);
    let first_token_at = Arc::new(std::sync::Mutex::new(None::<f64>));
    let stamp = Arc::clone(&first_token_at);

    let runtime = tokio::runtime::Runtime::new().expect("runtime");
    let t = Instant::now();
    let result = runtime.block_on(server::chat_stream(
        &[("user", "Zaehle langsam von eins bis zehn.")],
        256,
        0.2,
        false,
        move |_token| {
            if counter.fetch_add(1, Ordering::Relaxed) == 0 {
                *stamp.lock().unwrap() = Some(t.elapsed().as_secs_f64());
            }
        },
    ));
    let total = t.elapsed().as_secs_f64();
    server::stop();

    let completion = result.expect("stream failed");
    let seen = chunks.load(Ordering::Relaxed);
    println!(
        "stream: first token after {:?}s, {seen} chunks, {total:.1}s total",
        first_token_at.lock().unwrap()
    );

    assert!(!completion.content.is_empty(), "streamed content was empty");
    assert!(
        seen > 1,
        "expected incremental deltas, got {seen} callback(s)"
    );
    assert!(
        !completion.content.contains("<|channel>"),
        "reasoning leaked into the stream"
    );
}
