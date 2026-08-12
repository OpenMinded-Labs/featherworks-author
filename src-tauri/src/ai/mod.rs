//! AI integration layer
//! Architektur: loader.rs, session.rs, engines/, tokenizer/, registry.rs
//! Dieses Modul enthält Legacy-Fallback bis vollständige Engine integriert ist.

use std::sync::{Mutex, OnceLock};
use std::path::{Path, PathBuf};
use rand::{Rng, SeedableRng};
use rand::rngs::StdRng;
use std::sync::Arc;
use crate::ai::loader::ModelLoader;
use crate::ai::engines::llamacpp::LlamaCppEngine;
use crate::ai::engines::mlx::MlxEngine;
use crate::ai::registry::{ModelInfo, RuntimeKind};
cfg_if::cfg_if! {
    if #[cfg(feature="local-llm")] {
        // llama-cpp-2 crate integration for local inference
        #[allow(unused_imports)]
        use llama_cpp_2 as _llama_cpp_2;
    }
}

pub mod stream;
pub mod hardware;
pub mod downloader;
pub mod context;
pub mod providers;
pub mod chunking;
pub mod extraction;
pub mod entity_extraction;
pub mod queue;
pub mod background;
pub mod knowledge;

pub struct ModelManager { current: Option<String>, instance: Option<ModelInstance>, loader: Option<Arc<Mutex<Box<dyn ModelLoader>>>>, model_info: Option<ModelInfo> }

/// Öffentlicher Name des KI-Assistenten (Branding). Einheitlich in UI & Logs verwenden.
pub const FONTAINE_NAME: &str = "Fontaine";

impl Default for ModelManager { fn default() -> Self { Self { current: None, instance: None, loader: None, model_info: None } } }
impl ModelManager { fn set_model_name(&mut self, name: &str) { self.current = Some(name.to_string()); } }

static MODEL_MANAGER: OnceLock<Mutex<ModelManager>> = OnceLock::new();
fn global() -> &'static Mutex<ModelManager> { MODEL_MANAGER.get_or_init(|| Mutex::new(ModelManager::default())) }

pub fn set_current_model(name: &str) { if let Ok(mut mm)=global().lock() { mm.set_model_name(name); } }
pub fn get_current_model() -> Option<String> { global().lock().ok().and_then(|m| m.current.clone()) }

#[derive(Clone)]
struct LlamaCtx { model_name: String, _path: String, seed: u64, #[allow(dead_code)] simulated: bool }

impl LlamaCtx {
    fn generate(&self, prompt: &str) -> Vec<String> {
        // Fallback-Generierung wenn LlamaCppEngine nicht aktiv
        // (Feature local-llm deaktiviert oder Modell nicht geladen)
        let prompt_lower = prompt.to_lowercase();
        
        // Entity extraction - return proper JSON for frontend parsing
        if prompt_lower.contains("entities") || prompt_lower.contains("entitäten") || prompt_lower.contains("extrahiere") {
            return vec![
                r#"[{"entity_type":"Charakter","name":"Anna","aliases":[],"description":"Protagonistin","notes":"","confidence":0.9,"occurrences":["Anna betrat"]},"#.to_string(),
                r#"{"entity_type":"Ort","name":"München","aliases":[],"description":"Handlungsort","notes":"","confidence":0.85,"occurrences":["in München"]}]"#.to_string(),
            ];
        }
        
        // Lektorat - return proper JSON for frontend parsing
        if prompt_lower.contains("lektorat") || prompt_lower.contains("lektoriere") {
            return vec![
                r#"[{"line":3,"type":"style","severity":"warning","message":"Passivkonstruktion erkannt","suggestion":"Aktiv formulieren"},"#.to_string(),
                r#"{"line":7,"type":"repetition","severity":"info","message":"Wortwiederholung","suggestion":"Variation nutzen"}]"#.to_string(),
            ];
        }
        
        // Regular chat response
        let mut rng = StdRng::seed_from_u64(self.seed ^ (prompt.len() as u64));
        let mut out = Vec::new();
        out.push(format!("Antwort ({}):", self.model_name));
        let words: Vec<&str> = prompt.split_whitespace().collect();
        let take = words.len().min(12);
        if take>0 { out.extend(words[..take].iter().map(|w| w.to_string())); }
        let fillers = ["–", "Reflexion", "Idee", "Detail", "Konflikt", "Motivation", "Emotion"];        
        for _ in 0..(8 + rng.gen::<u8>() % 12) { out.push(fillers[rng.gen::<usize>() % fillers.len()].to_string()); }
        out
    }
}

#[derive(Clone)]
enum ModelInstance { Simulated, Llama(LlamaCtx) }

impl ModelInstance { fn generate(&self, prompt:&str) -> Vec<String> { match self { ModelInstance::Simulated => default_simulated_tokens(prompt), ModelInstance::Llama(ctx)=> ctx.generate(prompt) } } }

/// Detect locally bundled models (placeholder implementation).
/// We look for model files placed under resources/models/* inside the app bundle.
pub mod loader;
pub mod session;
pub mod tokenizer;
pub mod registry; // (einmalig)
pub mod engines;

fn resolve_model_alias(model: &str) -> String {
    match model {
        "phi-3-mini" | "phi-3-mini-128k" => "gemma-4-e2b-mlx-q6".to_string(),
        _ => model.to_string(),
    }
}

pub fn list_local_models(resource_dir: Option<PathBuf>) -> Vec<String> {
    let mut models: Vec<String> = registry::REGISTRY.iter().map(|m| m.id.to_string()).collect();
    if let Some(dir) = resource_dir { models.retain(|id| registry::find(id).map(|mi| dir.join(mi.file).exists()).unwrap_or(false)); }
    if models.is_empty() { models.push("local-draft".into()); }
    models
}

// --- Llama / Phi-3 Backend -----------------------------------------------------------
// Lokale Inferenz via llama-cpp-2 crate (siehe engines/llamacpp.rs)
// Bei aktivem Feature `local-llm` wird echte GPU-beschleunigte Inferenz verwendet.
// Fallback: Simulierte Antworten für Entwicklung/Tests.

#[derive(Debug)]
pub enum LoadState { NotLoaded, Loading, Ready, Error(String) }

static MODEL_STATE: OnceLock<Mutex<LoadState>> = OnceLock::new();
fn model_state() -> &'static Mutex<LoadState> { MODEL_STATE.get_or_init(|| Mutex::new(LoadState::NotLoaded)) }

static MODEL_PROGRESS: OnceLock<Mutex<Option<f32>>> = OnceLock::new();
fn model_progress() -> &'static Mutex<Option<f32>> { MODEL_PROGRESS.get_or_init(|| Mutex::new(None)) }

pub fn begin_load(model: &str, resource_dir: Option<PathBuf>) -> bool {
    let resolved_model = resolve_model_alias(model);
    log::info!("[fontaine] begin_load called for model '{}' (resolved='{}'), resource_dir: {:?}", model, resolved_model, resource_dir);
    
    let mut st = model_state().lock().ok().unwrap();
    match &*st {
        LoadState::Loading => return false,
        LoadState::Ready if get_current_model().as_deref()==Some(resolved_model.as_str()) => return false,
        _ => {}
    }
    *st = LoadState::Loading;

    let info = match registry::find(&resolved_model) {
        Some(i) => i,
        None => {
            *st = LoadState::Error(format!("Unbekanntes Modell: {}", resolved_model));
            return true;
        }
    };

    // Resolve path candidates for bundled/local models
    let dev_resource_root = resource_dir.as_ref()
        .and_then(|rd| rd.parent())
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .map(|p| p.join("resources"));

    // `info.file` is repo-relative ("models/<id>"), while the user data dir is
    // already the models directory - joining it verbatim would yield
    // ".../models/models/<id>", so strip the prefix for that root.
    let file_leaf = Path::new(info.file)
        .strip_prefix("models")
        .unwrap_or(Path::new(info.file));

    let possible_paths: Vec<PathBuf> = vec![
        dev_resource_root.as_ref().map(|root| root.join(info.file)),
        resource_dir.as_ref().map(|rd| rd.join(info.file)),
        Some(PathBuf::from("resources").join(info.file)),
        // Downloaded/linked models in the user data directory.
        downloader::get_models_dir().ok().map(|dir| dir.join(file_leaf)),
    ]
    .into_iter()
    .flatten()
    .collect();

    let model_path = possible_paths.iter().find(|p| p.exists()).cloned();

    let path = match model_path {
        Some(p) => p,
        None => {
            let tried = possible_paths
                .iter()
                .map(|p| p.display().to_string())
                .collect::<Vec<_>>()
                .join(", ");
            log::error!("[fontaine] model '{}' not found; tried: {}", resolved_model, tried);
            *st = LoadState::Error(format!("Modelldatei/-ordner nicht gefunden für '{}' (erwartet: {})", resolved_model, info.file));
            return true;
        }
    };

    if let Ok(mut prog)=model_progress().lock() { *prog = Some(0.5); }

    if let Ok(mut mm)=global().lock() {
        mm.instance = Some(ModelInstance::Llama(LlamaCtx{
            model_name: resolved_model.clone(),
            _path: path.to_string_lossy().to_string(),
            seed: 42,
            simulated: false
        }));

        let loader_result: Result<Box<dyn ModelLoader>, String> = match info.runtime {
            RuntimeKind::Mlx => {
                let mut engine = MlxEngine::new();
                match engine.load(&info, std::path::Path::new(&path)) {
                    Ok(()) => Ok(Box::new(engine)),
                    Err(e) => Err(format!("MLX load failed: {}", e)),
                }
            }
            RuntimeKind::LlamaCpp => {
                let mut engine = LlamaCppEngine::new();
                match engine.load(&info, std::path::Path::new(&path)) {
                    Ok(()) => Ok(Box::new(engine)),
                    Err(e) => Err(format!("llama.cpp load failed: {}", e)),
                }
            }
        };

        match loader_result {
            Ok(loader) => {
                mm.loader = Some(Arc::new(Mutex::new(loader)));
                mm.model_info = Some(info);
            }
            Err(e) => {
                log::error!("[fontaine] {}", e);
                *st = LoadState::Error(e);
                return true;
            }
        }
    }

    if let Ok(mut prog)=model_progress().lock() { *prog = Some(1.0); }
    log::info!("[fontaine] Model '{}' loading complete", resolved_model);
    *st = LoadState::Ready;
    set_current_model(&resolved_model);
    true
}

pub fn current_load_state() -> LoadState {
    if let Ok(guard) = model_state().lock() {
        match &*guard {
            LoadState::NotLoaded => LoadState::NotLoaded,
            LoadState::Loading => LoadState::Loading,
            LoadState::Ready => LoadState::Ready,
            LoadState::Error(e) => LoadState::Error(e.clone()),
        }
    } else { LoadState::NotLoaded }
}

/// Check if local LLM is actually ready for generation
pub fn is_local_llm_ready() -> bool {
    // Method 1: Check LoadState
    let state_ready = if let Ok(guard) = model_state().lock() {
        let ready = matches!(&*guard, LoadState::Ready);
        log::info!("[fontaine] is_local_llm_ready: LoadState={:?}, state_ready={}", 
            match &*guard {
                LoadState::NotLoaded => "NotLoaded",
                LoadState::Loading => "Loading", 
                LoadState::Ready => "Ready",
                LoadState::Error(_) => "Error",
            }, ready);
        ready
    } else {
        log::warn!("[fontaine] is_local_llm_ready: could not lock model_state");
        false
    };
    
    // Method 2: Check if we have a current model name set
    let has_current_model = get_current_model().is_some();
    log::info!("[fontaine] is_local_llm_ready: has_current_model={}, current_model={:?}", 
        has_current_model, get_current_model());
    
    // Method 3: Check the loader directly
    let loader_ready = if let Ok(mm) = global().lock() {
        if let Some(loader_arc) = &mm.loader {
            if let Ok(l) = loader_arc.lock() {
                let ready = l.is_ready();
                log::info!("[fontaine] is_local_llm_ready: loader.is_ready()={}", ready);
                ready
            } else {
                log::warn!("[fontaine] is_local_llm_ready: could not lock loader");
                false
            }
        } else {
            log::info!("[fontaine] is_local_llm_ready: no loader present");
            false
        }
    } else {
        log::warn!("[fontaine] is_local_llm_ready: could not lock global");
        false
    };
    
    // AI is ready if:
    // 1. LoadState is Ready AND we have a current model, OR
    // 2. The loader explicitly says it's ready
    let result = (state_ready && has_current_model) || loader_ready;
    log::info!("[fontaine] is_local_llm_ready: RESULT={}", result);
    result
}

pub fn current_progress() -> Option<f32> { model_progress().lock().ok().and_then(|p| *p) }

// Public token generation entry used by streaming layer
pub fn generate_tokens(prompt:&str) -> Vec<String> { generate_tokens_for_prompt(prompt, 512) }

pub fn generate_tokens_for_prompt(prompt:&str, max_tokens: usize) -> Vec<String> {
    // If loader-based engine ready, use it
    if let Ok(mm)=global().lock() {
        if let Some(loader_arc) = &mm.loader {
            if let Ok(l) = loader_arc.lock() {
                log::info!("[fontaine] generate_tokens: loader ready={}", l.is_ready());
                if l.is_ready() {
                    match l.generate_tokens(prompt, max_tokens) {
                        Ok(iter) => {
                            log::info!("[fontaine] Using real LLM generation");
                            return iter.collect();
                        }
                        Err(e) => {
                            // Return error as special token that frontend can detect
                            log::error!("[fontaine] LLM generation error: {}", e);
                            return vec![format!("[LLM_ERROR: {}]", e)];
                        }
                    }
                } else {
                    log::error!("[fontaine] Loader not ready");
                    return vec!["[LLM_ERROR: Model not ready. Please wait for initialization.]".to_string()];
                }
            } else {
                log::error!("[fontaine] Failed to lock loader");
                return vec!["[LLM_ERROR: Internal error - failed to access model.]".to_string()];
            }
        } else {
            log::error!("[fontaine] No loader available - model not loaded");
            return vec!["[LLM_ERROR: No LLM model loaded. Check local model artifacts in resources/models/.]".to_string()];
        }
    }
    log::error!("[fontaine] Failed to lock model manager");
    vec!["[LLM_ERROR: Internal error - failed to access model manager.]".to_string()]
}

fn default_simulated_tokens(prompt:&str) -> Vec<String> {
    let prompt_lower = prompt.to_lowercase();
    
    // Entity extraction - return proper JSON for frontend parsing
    if prompt_lower.contains("entities") || prompt_lower.contains("entitäten") || prompt_lower.contains("extrahiere") {
        return vec![
            r#"[{"entity_type":"Charakter","name":"Anna","aliases":[],"description":"Protagonistin","notes":"","confidence":0.9,"occurrences":["Anna betrat"]},"#.to_string(),
            r#"{"entity_type":"Ort","name":"München","aliases":[],"description":"Handlungsort","notes":"","confidence":0.85,"occurrences":["in München"]}]"#.to_string(),
        ];
    }
    
    // Lektorat - return proper JSON for frontend parsing
    if prompt_lower.contains("lektorat") || prompt_lower.contains("lektoriere") {
        return vec![
            r#"[{"line":3,"type":"style","severity":"warning","message":"Passivkonstruktion erkannt","suggestion":"Aktiv formulieren"},"#.to_string(),
            r#"{"line":7,"type":"repetition","severity":"info","message":"Wortwiederholung","suggestion":"Variation nutzen"}]"#.to_string(),
        ];
    }
    
    let base = format!("Simulierte Antwort auf: {prompt}\n\n");
    base.split_whitespace().map(|s| s.to_string()).collect()
}

