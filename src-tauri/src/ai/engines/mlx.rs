//! MlxEngine - MLX runtime bridge for local Apple Silicon inference

use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{anyhow, Result};

use crate::ai::{loader::ModelLoader, registry::ModelInfo};

pub struct MlxEngine {
    ready: bool,
    model_path: Option<PathBuf>,
    model_info: Option<ModelInfo>,
}

impl MlxEngine {
    pub fn new() -> Self {
        Self {
            ready: false,
            model_path: None,
            model_info: None,
        }
    }
}

impl Default for MlxEngine {
    fn default() -> Self {
        Self::new()
    }
}

/// Converts legacy Phi-3 style chat markers into Gemma 4 turn format.
///
/// Phi-3:   `<|system|>\nX<|end|>\n<|user|>\nY<|end|>\n<|assistant|>\n`
/// Gemma 4: `<|turn>system\nX<turn|>\n<|turn>user\nY<turn|>\n<|turn>model\n`
///
/// IMPORTANT: Gemma 4 uses `<|turn>` (id 105) / `<turn|>` (id 106). The
/// Gemma 2/3 markers `<start_of_turn>` / `<end_of_turn>` are NOT in this
/// tokenizer's vocabulary and would be split into ~8 plain-text tokens,
/// silently destroying turn structure. Verified against chat_template.jinja.
///
/// Unlike Gemma 3, Gemma 4 has a native `system` role, so the system block
/// is emitted as its own turn instead of being merged into the user turn.
///
/// Thinking is opt-in: `<|think|>` (id 98) must be the first thing inside the
/// system turn. Callers signal this by placing `<|think|>` anywhere in the
/// prompt; it is extracted here and re-emitted at the correct position.
///
/// NOTE: E2B/E4B reason even without `<|think|>` (the model card exempts them
/// from the "empty thought block" rule). Measured on gemma-4-e2b-q6, the
/// terse-answer directive below cuts generated tokens by roughly a third
/// (596 -> 373 on an identical prompt) but does not eliminate reasoning, so
/// `strip_thinking` remains mandatory and the token budget stays generous.
const TERSE_DIRECTIVE: &str =
    "Antworte direkt und knapp. Gib ausschliesslich das Ergebnis aus - keine Analyse, keine Optionen, keine Erklaerung.";

pub fn normalize_prompt_for_gemma(prompt: &str) -> String {
    const THINK: &str = "<|think|>";
    let enable_thinking = prompt.contains(THINK);
    let cleaned = prompt.replace(THINK, "");
    let prompt = cleaned.as_str();

    // Not a Phi-3 style prompt -> wrap plain text in a single user turn.
    if !prompt.contains("<|user|>") && !prompt.contains("<|system|>") {
        let mut out = String::from("<|turn>system\n");
        if enable_thinking {
            out.push_str("<|think|>\n");
        } else {
            out.push_str(TERSE_DIRECTIVE);
        }
        out.push_str("<turn|>\n");
        out.push_str(&format!(
            "<|turn>user\n{}<turn|>\n<|turn>model\n",
            prompt.trim()
        ));
        return out;
    }

    let mut system_part = String::new();
    let mut user_part = String::new();
    let mut assistant_prefix = String::new();

    // Split off the trailing assistant section (priming text, if any).
    let (head, tail) = match prompt.split_once("<|assistant|>") {
        Some((h, t)) => (h, t),
        None => (prompt, ""),
    };
    assistant_prefix.push_str(tail.trim_start_matches('\n'));

    for segment in head.split("<|end|>") {
        let segment = segment.trim();
        if segment.is_empty() {
            continue;
        }
        if let Some(rest) = segment.strip_prefix("<|system|>") {
            system_part.push_str(rest.trim());
        } else if let Some(rest) = segment.strip_prefix("<|user|>") {
            if !user_part.is_empty() {
                user_part.push_str("\n\n");
            }
            user_part.push_str(rest.trim());
        } else {
            // Unmarked leading content is treated as user content.
            if !user_part.is_empty() {
                user_part.push_str("\n\n");
            }
            user_part.push_str(segment);
        }
    }

    let mut out = String::new();

    // System turn: Gemma 4 has a native system role. `<|think|>` must sit at
    // the very top of this turn. When thinking is not requested, the terse
    // directive is appended to the caller's system text (never replacing it).
    out.push_str("<|turn>system\n");
    if enable_thinking {
        out.push_str("<|think|>\n");
        out.push_str(system_part.trim());
    } else {
        let system_text = system_part.trim();
        if system_text.is_empty() {
            out.push_str(TERSE_DIRECTIVE);
        } else {
            out.push_str(system_text);
            out.push('\n');
            out.push_str(TERSE_DIRECTIVE);
        }
    }
    out.push_str("<turn|>\n");

    out.push_str(&format!(
        "<|turn>user\n{}<turn|>\n<|turn>model\n",
        user_part.trim()
    ));

    // Preserve assistant priming (e.g. "Hier sind die gefundenen Probleme:\n\n1.")
    let priming = assistant_prefix.trim();
    if !priming.is_empty() {
        out.push_str(priming);
    }

    out
}

impl ModelLoader for MlxEngine {
    fn id(&self) -> &str {
        "mlx"
    }

    fn load(&mut self, info: &ModelInfo, model_path: &Path) -> Result<()> {
        if !model_path.exists() {
            return Err(anyhow!("MLX model path missing: {}", model_path.display()));
        }
        self.model_path = Some(model_path.to_path_buf());
        self.model_info = Some(info.clone());
        self.ready = true;
        log::info!(
            "[fontaine/mlx] Model '{}' ready at {}",
            info.id,
            model_path.display()
        );
        Ok(())
    }

    fn is_ready(&self) -> bool {
        self.ready
    }

    fn generate_tokens(
        &self,
        prompt: &str,
        max_tokens: usize,
    ) -> Result<Box<dyn Iterator<Item = String>>> {
        let model_path = self
            .model_path
            .as_ref()
            .ok_or_else(|| anyhow!("MLX model not loaded"))?;

        let token_budget = token_budget_for(max_tokens);

        // Preferred path: resident server. Avoids reloading 3.76 GB per request
        // and lets the prompt cache reuse the scene prefix across questions.
        if crate::ai::server::is_running() {
            match generate_via_server(prompt, token_budget) {
                Ok(text) => return Ok(Box::new(std::iter::once(text))),
                Err(e) => {
                    // Fall through to the subprocess path rather than failing
                    // the user's request outright.
                    log::warn!("[fontaine/mlx] server request failed, using subprocess: {e}");
                }
            }
        }

        generate_via_subprocess(model_path, prompt, token_budget)
            .map(|text| Box::new(std::iter::once(text)) as Box<dyn Iterator<Item = String>>)
    }
}

/// Sends the prompt to the resident server.
///
/// The server applies Gemma 4's chat template itself, so the Phi-3 style
/// markers are split back into roles instead of being rewritten into turn
/// markers - passing pre-formatted markers here would double-encode them.
///
/// It also separates the reasoning block from the answer, which makes
/// `strip_thinking` unnecessary on this path.
fn generate_via_server(prompt: &str, token_budget: usize) -> Result<String> {
    // Callers opt into reasoning by embedding `<|think|>` anywhere in the
    // prompt - same contract as the subprocess path.
    const THINK: &str = "<|think|>";
    let thinking = prompt.contains(THINK);
    let prompt = prompt.replace(THINK, "");

    let (system, user) = split_prompt_roles(&prompt);

    let mut messages: Vec<(&str, &str)> = Vec::new();
    if !system.trim().is_empty() {
        messages.push(("system", system.as_str()));
    }
    messages.push(("user", user.as_str()));

    let completion = crate::ai::server::chat(&messages, token_budget, 0.2, thinking)?;

    log::debug!(
        "[fontaine/mlx] server: {} prompt tokens, {} cached, thinking={}",
        completion.prompt_tokens,
        completion.cached_tokens,
        thinking
    );

    Ok(completion.content)
}

/// Splits a Phi-3 style prompt into (system, user) text.
///
/// Any assistant priming (text after `<|assistant|>`) is appended to the user
/// message: the server owns the final `<|turn>model` marker, so priming cannot
/// be injected after it.
fn split_prompt_roles(prompt: &str) -> (String, String) {
    let mut system = String::new();
    let mut user = String::new();
    let mut priming = String::new();

    let mut rest = prompt;
    if let Some(idx) = rest.find("<|system|>") {
        let after = &rest[idx + "<|system|>".len()..];
        let end = after.find("<|end|>").unwrap_or(after.len());
        system = after[..end].trim().to_string();
        rest = &after[end.min(after.len())..];
    }

    if let Some(idx) = rest.find("<|user|>") {
        let after = &rest[idx + "<|user|>".len()..];
        let end = after.find("<|end|>").unwrap_or(after.len());
        user = after[..end].trim().to_string();
        rest = &after[end.min(after.len())..];
    }

    if let Some(idx) = rest.find("<|assistant|>") {
        priming = rest[idx + "<|assistant|>".len()..].trim().to_string();
    }

    // No markers at all -> the whole prompt is the user message.
    if system.is_empty() && user.is_empty() {
        user = prompt.trim().to_string();
    }

    if !priming.is_empty() {
        user.push_str("\n\nBeginne deine Antwort mit:\n");
        user.push_str(&priming);
    }

    (system, user)
}

/// One-shot `mlx_lm generate` in a fresh process.
///
/// Fallback for when the server is disabled or unreachable. Pays the full
/// model load (~2-3 s) on every call.
fn generate_via_subprocess(model_path: &Path, prompt: &str, token_budget: usize) -> Result<String> {
    // Runs: <python> -m mlx_lm generate --model <dir> --prompt <text> ...
    // Requires mlx-lm in the resolved Python environment (see python_executable).
    let gemma_prompt = normalize_prompt_for_gemma(prompt);
    let python = python_executable();

    let output = Command::new(&python)
        .arg("-m")
        .arg("mlx_lm")
        .arg("generate")
        .arg("--model")
        .arg(model_path)
        .arg("--prompt")
        .arg(&gemma_prompt)
        .arg("--max-tokens")
        .arg(token_budget.to_string())
        .arg("--temp")
        .arg("0.2")
        .output()
        .map_err(|e| anyhow!("Failed to start mlx_lm generate: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // The most common failure is a Python without mlx-lm; say so
        // explicitly instead of surfacing a raw ImportError.
        if stderr.contains("No module named mlx_lm") {
            return Err(anyhow!(
                "MLX-Runtime nicht gefunden: '{}' hat kein mlx-lm installiert. \
                 Erwartet wird die Projekt-venv '.venv-mlx' \
                 (oder setze FONTAINE_PYTHON auf einen Interpreter mit mlx-lm).",
                python
            ));
        }
        return Err(anyhow!(
            "MLX inference failed (exit={}): {}",
            output.status,
            stderr.trim()
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let text = extract_generation(&stdout);

    if text.trim().is_empty() {
        return Err(anyhow!(
            "MLX returned no usable output (increase max_tokens if the model was still reasoning)"
        ));
    }

    Ok(text)
}/// mlx_lm wraps the generated text between `==========` separators
/// and appends timing statistics. This extracts only the generated content.
fn extract_generation(stdout: &str) -> String {
    let parts: Vec<&str> = stdout.split("==========").collect();
    let raw = if parts.len() >= 2 {
        parts[1].trim()
    } else {
        stdout.trim()
    };
    strip_thinking(raw)
}

/// Gemma 4 emits an internal reasoning block before the final answer:
///
/// ```text
/// <|channel>thought
/// Thinking Process: ...
/// <channel|>Actual answer
/// ```
///
/// Note the markers are asymmetric: the block *opens* with `<|channel>` and
/// *closes* with `<channel|>` (see the model's `chat_template.jinja`).
///
/// Only the text after the closing marker is user-facing. If generation was
/// truncated inside the thought block, we return an empty string so callers
/// treat it as "no usable output" instead of leaking reasoning into the document.
fn strip_thinking(text: &str) -> String {
    const CLOSE_MARKER: &str = "<channel|>";
    const OPEN_MARKER: &str = "<|channel>";

    if let Some(idx) = text.rfind(CLOSE_MARKER) {
        let tail = &text[idx + CLOSE_MARKER.len()..];
        return tail.trim_start_matches('\n').trim().to_string();
    }

    // Thought started but never closed -> truncated, unusable.
    if text.contains(OPEN_MARKER) {
        return String::new();
    }

    text.trim().to_string()
}

/// Gemma 4 spends a substantial number of tokens on its internal reasoning
/// block before emitting the answer. Callers size `max_tokens` for the *visible*
/// answer, so we add generous headroom for the thought block — otherwise
/// generation gets cut off mid-reasoning and yields nothing usable.
///
/// The model stops on its own once the answer is complete, so a high ceiling
/// costs nothing in practice while preventing truncation on complex tasks.
fn token_budget_for(requested: usize) -> usize {
    const THINKING_HEADROOM: usize = 2048;
    const MIN_BUDGET: usize = 2048;
    const MAX_BUDGET: usize = 16384;

    requested
        .saturating_add(THINKING_HEADROOM)
        .max(MIN_BUDGET)
        .min(MAX_BUDGET)
}

/// Resolves the Python interpreter used for MLX inference.
///
/// Resolution order:
/// 1. `FONTAINE_PYTHON` environment variable (explicit override)
/// 2. Bundled/project virtualenv at `.venv-mlx/bin/python`
/// 3. System `python3`
pub fn python_executable() -> String {
    if let Ok(explicit) = std::env::var("FONTAINE_PYTHON") {
        if !explicit.trim().is_empty() {
            return explicit;
        }
    }

    let candidates = venv_candidates();
    for candidate in &candidates {
        if candidate.exists() {
            return candidate.to_string_lossy().to_string();
        }
    }

    // Falling back to system python almost always fails (no mlx_lm installed),
    // so log the searched locations to make the cause obvious.
    log::warn!(
        "[fontaine/mlx] no .venv-mlx found, falling back to system python3. Searched: {}",
        candidates
            .iter()
            .map(|p| p.display().to_string())
            .collect::<Vec<_>>()
            .join(", ")
    );
    "python3".to_string()
}

/// Possible locations of the project-local MLX virtualenv.
fn venv_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    const VENV_REL: &str = ".venv-mlx/bin/python";

    // Walk up from the executable. Depth must cover the deepest layout, which
    // is the macOS bundle in a debug tree:
    //   <repo>/src-tauri/target/release/bundle/macos/<App>.app/Contents/MacOS
    // That is 8 levels from the binary to the repository root.
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().map(|p| p.to_path_buf());
        for _ in 0..10 {
            let Some(current) = dir else { break };
            candidates.push(current.join(VENV_REL));
            dir = current.parent().map(|p| p.to_path_buf());
        }
    }

    // Current working directory (dev server / cargo run). A bundled app is
    // launched with cwd="/", so this only helps during development.
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join(VENV_REL));
        if let Some(parent) = cwd.parent() {
            candidates.push(parent.join(VENV_REL));
        }
    }

    // User data directory - where an installed runtime would live.
    if let Some(config) = dirs::config_dir() {
        candidates.push(config.join("featherworks-author").join(VENV_REL));
    }

    candidates
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The macOS bundle sits 8 levels below the repository root, so a shallow
    /// walk silently falls back to system python (which lacks mlx-lm).
    #[test]
    fn venv_search_reaches_repo_root_from_bundled_app() {
        let candidates = venv_candidates();
        assert!(
            candidates.len() >= 10,
            "walk-up depth too shallow: {} candidates",
            candidates.len()
        );
    }

    #[test]
    fn plain_text_becomes_single_user_turn() {
        let out = normalize_prompt_for_gemma("Hallo Welt");
        assert!(out.starts_with("<|turn>system\n"));
        assert!(out.contains(TERSE_DIRECTIVE));
        assert!(out.ends_with("<|turn>user\nHallo Welt<turn|>\n<|turn>model\n"));
    }

    #[test]
    fn system_becomes_its_own_turn() {
        let input = "<|system|>\nDu bist ein Lektor.\n<|end|>\n<|user|>\nPrüfe das.\n<|end|>\n<|assistant|>\n";
        let out = normalize_prompt_for_gemma(input);
        assert!(out.starts_with("<|turn>system\nDu bist ein Lektor.\n"));
        assert!(out.ends_with("<|turn>user\nPrüfe das.<turn|>\n<|turn>model\n"));
    }

    /// The caller's system prompt carries task semantics and must survive.
    #[test]
    fn terse_directive_augments_rather_than_replaces_system_text() {
        let input =
            "<|system|>\nDu bist ein Lektor.\n<|end|>\n<|user|>\nX\n<|end|>\n<|assistant|>\n";
        let out = normalize_prompt_for_gemma(input);
        assert!(out.contains("Du bist ein Lektor."));
        assert!(out.contains(TERSE_DIRECTIVE));
    }

    /// Reasoning quality matters more than brevity when thinking is requested,
    /// so the two directives must never be combined.
    #[test]
    fn thinking_mode_omits_terse_directive() {
        let out = normalize_prompt_for_gemma("<|think|>Hallo Welt");
        assert!(out.starts_with("<|turn>system\n<|think|>\n"));
        assert!(!out.contains(TERSE_DIRECTIVE));
    }

    #[test]
    fn thinking_token_is_moved_to_top_of_system_turn() {
        let input = "<|system|>\n<|think|>Du bist ein Lektor.\n<|end|>\n<|user|>\nPrüfe das.\n<|end|>\n<|assistant|>\n";
        let out = normalize_prompt_for_gemma(input);
        assert!(out.starts_with("<|turn>system\n<|think|>\nDu bist ein Lektor."));
        // The marker must appear exactly once, at the documented position.
        assert_eq!(out.matches("<|think|>").count(), 1);
    }

    #[test]
    fn no_thinking_by_default() {
        let out = normalize_prompt_for_gemma("<|user|>\nHallo\n<|end|>\n<|assistant|>\n");
        assert!(!out.contains("<|think|>"));
    }

    /// Guards against a regression to Gemma 2/3 markers, which are absent from
    /// the Gemma 4 vocabulary and would be tokenized as plain text.
    #[test]
    fn never_emits_gemma3_markers() {
        for input in [
            "Hallo Welt",
            "<|system|>\nS<|end|>\n<|user|>\nU<|end|>\n<|assistant|>\n",
        ] {
            let out = normalize_prompt_for_gemma(input);
            assert!(!out.contains("<start_of_turn>"), "leaked marker: {out}");
            assert!(!out.contains("<end_of_turn>"), "leaked marker: {out}");
        }
    }

    #[test]
    fn assistant_priming_is_preserved() {
        let input =
            "<|user|>\nListe Probleme.\n<|end|>\n<|assistant|>\nHier sind die Probleme:\n\n1.";
        let out = normalize_prompt_for_gemma(input);
        assert!(out.contains("<|turn>model\n"));
        assert!(out.trim_end().ends_with("1."));
    }

    #[test]
    fn extracts_generation_between_separators() {
        let stdout =
            "Fetching model...\n==========\nDas ist die Antwort.\n==========\nPrompt: 12 tokens";
        assert_eq!(extract_generation(stdout), "Das ist die Antwort.");
    }

    #[test]
    fn extract_generation_falls_back_to_raw() {
        assert_eq!(extract_generation("  nur text  "), "nur text");
    }

    #[test]
    fn strips_thinking_and_keeps_final_answer() {
        let raw =
            "<|channel>thought\nThinking Process:\n1. Analyze\n<channel|>Das ist die Antwort.";
        assert_eq!(strip_thinking(raw), "Das ist die Antwort.");
    }

    #[test]
    fn truncated_thinking_yields_empty() {
        let raw = "<|channel>thought\nThinking Process:\n1. Analyze the request";
        assert_eq!(strip_thinking(raw), "");
    }

    #[test]
    fn plain_answer_passes_through() {
        assert_eq!(
            strip_thinking("Einfach eine Antwort."),
            "Einfach eine Antwort."
        );
    }

    #[test]
    fn thinking_is_stripped_end_to_end() {
        let stdout = "==========\n<|channel>thought\nHmm...\n<channel|>Fertig.\n==========\nPrompt: 10 tokens";
        assert_eq!(extract_generation(stdout), "Fertig.");
    }

    #[test]
    fn multiline_answer_after_thought_is_kept() {
        let raw = "<|channel>thought\nPlan\n<channel|>Zeile eins.\n\nZeile zwei.";
        assert_eq!(strip_thinking(raw), "Zeile eins.\n\nZeile zwei.");
    }

    #[test]
    fn token_budget_adds_thinking_headroom() {
        assert_eq!(token_budget_for(512), 2560);
        assert_eq!(token_budget_for(4096), 6144);
    }

    #[test]
    fn token_budget_has_generous_floor() {
        // Even tiny requests need room for the reasoning block.
        assert_eq!(token_budget_for(0), 2048);
        assert_eq!(token_budget_for(1), 2049);
    }

    #[test]
    fn token_budget_is_capped() {
        assert_eq!(token_budget_for(100_000), 16384);
        assert_eq!(token_budget_for(usize::MAX), 16384);
    }

    // --- role splitting (server path) ---
    //
    // The server applies the chat template itself, so prompts must be handed
    // over as roles. Emitting turn markers here would double-encode them.

    #[test]
    fn splits_system_and_user() {
        let input = "<|system|>\nDu bist ein Lektor.\n<|end|>\n<|user|>\nPrüfe das.\n<|end|>\n<|assistant|>\n";
        let (system, user) = split_prompt_roles(input);
        assert_eq!(system, "Du bist ein Lektor.");
        assert_eq!(user, "Prüfe das.");
    }

    #[test]
    fn plain_text_becomes_user_message() {
        let (system, user) = split_prompt_roles("Hallo Welt");
        assert!(system.is_empty());
        assert_eq!(user, "Hallo Welt");
    }

    /// Priming cannot follow the model marker (the server owns it), so it is
    /// folded into the user message instead of being dropped.
    #[test]
    fn assistant_priming_moves_into_user_message() {
        let input = "<|user|>\nListe Probleme.\n<|end|>\n<|assistant|>\nHier sind die Probleme:\n\n1.";
        let (_, user) = split_prompt_roles(input);
        assert!(user.starts_with("Liste Probleme."));
        assert!(user.contains("Hier sind die Probleme:"));
    }

    #[test]
    fn role_split_never_leaks_markers() {
        let input = "<|system|>\nS<|end|>\n<|user|>\nU<|end|>\n<|assistant|>\n";
        let (system, user) = split_prompt_roles(input);
        for text in [&system, &user] {
            assert!(!text.contains("<|"), "marker leaked: {text}");
            assert!(!text.contains("|>"), "marker leaked: {text}");
        }
    }
}
