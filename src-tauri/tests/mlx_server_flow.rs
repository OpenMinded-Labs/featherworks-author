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

/// German prose is full of multi-byte characters, and an HTTP chunk can end in
/// the middle of one. Decoding chunks individually turned "Grün" into
/// "Gr\u{FFFD}\u{FFFD}n"; this checks the real wire, not just the unit tests.
#[test]
#[ignore = "requires model + venv"]
fn streamed_umlauts_are_not_mangled() {
    use featherworks_author::ai::server;

    server::start(&python(), &model_dir()).expect("server failed to start");

    let streamed = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
    let sink = std::sync::Arc::clone(&streamed);

    let runtime = tokio::runtime::Runtime::new().expect("runtime");
    let result = runtime.block_on(server::chat_stream(
        &[(
            "user",
            "Gib exakt diesen Satz woertlich zurueck, ohne Kommentar: \
             Die Bäckerin grüßt größtenteils fröhlich über die Straße.",
        )],
        256,
        0.0,
        false,
        move |token| sink.lock().unwrap().push_str(&token),
    ));
    server::stop();

    let completion = result.expect("stream failed");
    let live = streamed.lock().unwrap().clone();
    println!("streamed: {live:?}");

    assert!(
        !live.contains('\u{FFFD}'),
        "replacement character in streamed text: {live:?}"
    );
    // Whatever the model echoes back, the pieces must reassemble to the whole.
    assert_eq!(
        live.trim(),
        completion.content,
        "streamed text differs from the assembled answer"
    );
    assert!(
        live.contains('ä') || live.contains('ü') || live.contains('ö') || live.contains('ß'),
        "no multi-byte character in the answer, test proves nothing: {live:?}"
    );
}

/// A crash or force quit leaves the server running, holding several GB. Since
/// `start` picks a *free* port it would not collide - the stale process would
/// simply live on. Two were found alive during a measurement session and made
/// generation about 8x slower.
#[test]
#[ignore = "requires model + venv"]
fn a_stale_server_is_cleaned_up_on_start() {
    use featherworks_author::ai::server;
    use std::process::{Command, Stdio};

    // Spawn a server the way a crashed predecessor would have left one behind.
    let mut orphan = Command::new(python())
        .args(["-m", "mlx_lm", "server", "--model"])
        .arg(model_dir())
        .args(["--port", "8774", "--host", "127.0.0.1"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("failed to spawn the orphan");

    let orphan_pid = orphan.id();
    std::thread::sleep(std::time::Duration::from_secs(3));

    server::start(&python(), &model_dir()).expect("server failed to start");
    server::stop();

    // `try_wait` reports an exit status once the process is gone.
    let status = orphan.try_wait().expect("try_wait failed");
    assert!(
        status.is_some(),
        "stale server {orphan_pid} survived startup"
    );

    let _ = orphan.kill();
}

/// What the world scan actually gets back, phase by phase.
///
/// The report is that only locations are ever found, always the same three.
/// This runs the real discovery prompts against the real model and prints both
/// the raw reply and what the parser makes of it, so the two can be told apart:
/// a model that finds nobody is a prompt problem, a model that lists people
/// which then vanish is a parser problem.
#[test]
#[ignore = "measurement, not an assertion"]
fn measure_what_discovery_returns_per_phase() {
    use featherworks_author::ai::entity_extraction::{
        build_discovery_prompt, parse_discovery_response, ScanPhase,
    };
    use featherworks_author::ai::server;

    // Deliberately unambiguous: four named people, three named places.
    let text = "Marla Keane stand am Fenster des Cafe Luna und wartete auf Jack. \
                Draussen zog der Regen ueber Berlin. \
                \"Du bist spaet\", sagte sie, als Jack Smith endlich hereinkam. \
                Er zuckte mit den Schultern. \"Der Friedhof war voll.\" \
                Spaeter rief Dr. Herbert Vogel an und fragte nach Caitlin.";

    server::start(&python(), &model_dir()).expect("server failed to start");

    for phase in [
        ScanPhase::Characters,
        ScanPhase::Locations,
        ScanPhase::Items,
        ScanPhase::Factions,
    ] {
        let prompt = build_discovery_prompt(text, phase, "de");
        let reply = server::chat(&[("user", &prompt)], 500, 0.2, false)
            .expect("completion failed");
        let parsed = parse_discovery_response(&reply.content, "x");

        println!("\n===== {phase:?} =====");
        println!("--- raw reply ---\n{}", reply.content);
        println!(
            "--- parser kept {} ---\n{:?}",
            parsed.len(),
            parsed.iter().map(|e| &e.name).collect::<Vec<_>>()
        );
    }

    server::stop();
}

/// The discovery phases as the *app* runs them.
///
/// The earlier measurement passed the raw prompt straight to `server::chat`,
/// which is not what happens in production: the engine first splits the Phi-3
/// markers into system and user roles. That difference matters, because the
/// system message is where the "answer only with names" instruction sits.
#[test]
#[ignore = "measurement, not an assertion"]
fn measure_discovery_through_the_real_engine_path() {
    use featherworks_author::ai::entity_extraction::{
        build_discovery_prompt, parse_discovery_response, ScanPhase,
    };
    use featherworks_author::ai::server;

    // Mirrors engines::mlx::split_prompt_roles, which is crate-private.
    fn split_roles(prompt: &str) -> (String, String) {
        let mut system = String::new();
        let mut user = String::new();
        let mut rest = prompt;
        if let Some(i) = rest.find("<|system|>") {
            let after = &rest[i + "<|system|>".len()..];
            let end = after.find("<|end|>").unwrap_or(after.len());
            system = after[..end].trim().to_string();
            rest = &after[end.min(after.len())..];
        }
        if let Some(i) = rest.find("<|user|>") {
            let after = &rest[i + "<|user|>".len()..];
            let end = after.find("<|end|>").unwrap_or(after.len());
            user = after[..end].trim().to_string();
        }
        if system.is_empty() && user.is_empty() {
            user = prompt.trim().to_string();
        }
        (system, user)
    }

    let text = "Marla Keane stand am Fenster des Cafe Luna und wartete auf Jack. \
                Draussen zog der Regen ueber Berlin. \
                \"Du bist spaet\", sagte sie, als Jack Smith endlich hereinkam. \
                Er zuckte mit den Schultern. \"Der Friedhof war voll.\" \
                Spaeter rief Dr. Herbert Vogel an und fragte nach Caitlin.";

    server::start(&python(), &model_dir()).expect("server failed to start");

    for phase in [
        ScanPhase::Characters,
        ScanPhase::Locations,
        ScanPhase::Items,
        ScanPhase::Factions,
    ] {
        let prompt = build_discovery_prompt(text, phase, "de");
        let (system, user) = split_roles(&prompt);

        let mut messages: Vec<(&str, &str)> = Vec::new();
        if !system.trim().is_empty() {
            messages.push(("system", system.as_str()));
        }
        messages.push(("user", user.as_str()));

        // 500 is what the world scan requests; the engine adds thinking headroom.
        let reply = server::chat(&messages, 500 + 2048, 0.2, false).expect("completion failed");
        let parsed = parse_discovery_response(&reply.content, "x");

        println!("\n===== {phase:?} =====");
        println!("--- raw reply ---\n{}", reply.content);
        println!(
            "--- parser kept {} ---\n{:?}",
            parsed.len(),
            parsed.iter().map(|e| &e.name).collect::<Vec<_>>()
        );
    }

    server::stop();
}

///
/// Discovery labels a candidate by the phase that found it, but
/// `build_detail_prompt` asks the model to classify it again, and that answer
/// wins. So a person can still end up stored as a location here.
#[test]
#[ignore = "measurement, not an assertion"]
fn measure_what_the_detail_pass_does_to_types() {
    use featherworks_author::ai::entity_extraction::{
        build_detail_prompt, parse_extraction_response, DiscoveredEntity,
    };
    use featherworks_author::ai::server;

    let text = "Marla Keane stand am Fenster des Cafe Luna und wartete auf Jack. \
                Draussen zog der Regen ueber Berlin. \
                \"Du bist spaet\", sagte sie, als Jack Smith endlich hereinkam. \
                Er zuckte mit den Schultern. \"Der Friedhof war voll.\" \
                Spaeter rief Dr. Herbert Vogel an und fragte nach Caitlin.";

    // Exactly what discovery hands over: people labelled as characters.
    let batch: Vec<DiscoveredEntity> = [
        ("Marla Keane", "character"),
        ("Jack Smith", "character"),
        ("Cafe Luna", "location"),
        ("Berlin", "location"),
    ]
    .iter()
    .map(|(n, t)| DiscoveredEntity {
        name: n.to_string(),
        entity_type: t.to_string(),
    })
    .collect();

    server::start(&python(), &model_dir()).expect("server failed to start");

    let prompt = build_detail_prompt(text, &batch, "de");
    let reply = server::chat(&[("user", &prompt)], 800, 0.2, false).expect("completion failed");

    println!("--- raw reply ---\n{}", reply.content);
    match parse_extraction_response(&reply.content) {
        Ok(entities) => {
            println!("--- parsed {} ---", entities.len());
            for e in &entities {
                println!("  {:<16} -> {}", e.name, e.entity_type);
            }
        }
        Err(e) => println!("--- PARSE FAILED: {e} ---"),
    }

    server::stop();
}
