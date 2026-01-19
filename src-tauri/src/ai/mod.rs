//! AI integration layer
//! Architektur: loader.rs, session.rs, engines/, tokenizer/, registry.rs
//! Dieses Modul enthält Legacy-Fallback bis vollständige Engine integriert ist.

use std::sync::{Mutex, OnceLock};
use std::path::PathBuf;
use rand::{Rng, SeedableRng};
use rand::rngs::StdRng;
use std::sync::Arc;
use crate::ai::loader::ModelLoader;
use crate::ai::engines::llamacpp::LlamaCppEngine;
use crate::ai::registry::ModelInfo;
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
    log::info!("[fontaine] begin_load called for model '{}', resource_dir: {:?}", model, resource_dir);
    
    let mut st = model_state().lock().ok().unwrap();
    match &*st {
        LoadState::Loading => return false,
        LoadState::Ready if get_current_model().as_deref()==Some(model) => return false,
        _ => {}
    }
    *st = LoadState::Loading;
    
    // Try multiple paths to find the model
    let model_subpath = "models/phi-3-mini-128K-Instruct_q4_k_m.gguf";
    
    // For development: go up from target/debug to find resources/
    let dev_resources = resource_dir.as_ref()
        .and_then(|rd| rd.parent())  // target
        .and_then(|p| p.parent())    // src-tauri
        .and_then(|p| p.parent())    // project root
        .map(|p| p.join("resources").join(model_subpath));
    
    let possible_paths: Vec<PathBuf> = vec![
        // 1. Dev mode: project_root/resources/models/...
        dev_resources,
        // 2. Resource dir from Tauri (bundled app)
        resource_dir.as_ref().map(|rd| rd.join(model_subpath)),
        // 3. Direct resources folder (development, CWD-relative)
        Some(PathBuf::from("resources").join(model_subpath)),
        // 4. Absolute path for development
        Some(PathBuf::from("/Users/simonvandeloo/Desktop/featherworks-author/resources").join(model_subpath)),
    ].into_iter().flatten().collect();
    
    log::info!("[fontaine] Searching for model in paths: {:?}", possible_paths);
    
    let model_path = possible_paths.iter().find(|p| p.exists());
    
    if model == "phi-3-mini-128k" || model == "phi-3-mini" {
        let path = match model_path {
            Some(p) => p.clone(),
            None => {
                log::error!("[fontaine] Model file not found in any path!");
                *st = LoadState::Error("Modelldatei nicht gefunden (phi-3-mini-128K-Instruct_q4_k_m.gguf)".into()); 
                return true;
            }
        };
        
        log::info!("[fontaine] Found model at: {:?}", path);
        
        // Skip hash verification for faster loading (2.2GB file takes too long)
        // TODO: Add async hash verification later
        if let Ok(mut prog)=model_progress().lock() { *prog = Some(0.5); }
        
        if let Ok(mut mm)=global().lock() {
            mm.instance = Some(ModelInstance::Llama(LlamaCtx{ model_name: model.to_string(), _path: path.to_string_lossy().to_string(), seed: 42, simulated: false }));
            
            // Loader / Engine Setup - this is where the REAL model loading happens
            if let Some(info) = registry::find(model) {
                log::info!("[fontaine] Loading LlamaCppEngine with model info: {:?}", info.id);
                let mut engine = LlamaCppEngine::new();
                
                // Load model with proper error handling
                match engine.load(&info, std::path::Path::new(&path)) {
                    Ok(()) => {
                        log::info!("[fontaine] LlamaCppEngine loaded successfully, ready={}", engine.is_ready());
                        let arc = Arc::new(Mutex::new(Box::new(engine) as Box<dyn ModelLoader>));
                        mm.loader = Some(arc);
                        mm.model_info = Some(info);
                    }
                    Err(e) => {
                        log::error!("[fontaine] Failed to load LlamaCppEngine: {}", e);
                        // Still set instance for fallback simulation
                    }
                }
            } else {
                log::error!("[fontaine] Model '{}' not found in registry", model);
            }
        }
        
        if let Ok(mut prog)=model_progress().lock() { *prog = Some(1.0); }
        log::info!("[fontaine] Model 'phi-3-mini-128k' loading complete");
    } else {
        if let Ok(mut mm)=global().lock() { mm.instance = Some(ModelInstance::Simulated); mm.loader=None; mm.model_info=None; }
    }
    *st = LoadState::Ready;
    set_current_model(model);
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
            return vec!["[LLM_ERROR: No LLM model loaded. Check if phi-3-mini-128K-Instruct_q4_k_m.gguf exists in resources/models/]".to_string()];
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

