//! LlamaCppEngine - Native llama.cpp integration for local LLM inference
//! 
//! This engine provides:
//! - Direct GGUF model loading (no external software required)
//! - Token-by-token streaming generation  
//! - Hardware-accelerated inference on Apple Silicon (Metal) / x86

use std::path::Path;
use std::sync::Arc;
use anyhow::{Result, anyhow, Context as AnyhowContext};
use crate::ai::{loader::ModelLoader, registry::ModelInfo};

#[cfg(feature = "local-llm")]
use {
    std::num::NonZeroU32,
    llama_cpp_2::context::params::LlamaContextParams,
    llama_cpp_2::context::LlamaContext,
    llama_cpp_2::llama_backend::LlamaBackend,
    llama_cpp_2::llama_batch::LlamaBatch,
    llama_cpp_2::model::params::LlamaModelParams,
    llama_cpp_2::model::{LlamaModel, AddBos, Special},
    llama_cpp_2::sampling::LlamaSampler,
};

/// LlamaCppEngine - Native llama.cpp integration for local LLM inference
pub struct LlamaCppEngine {
    ready: bool,
    model_path: Option<String>,
    #[cfg(feature = "local-llm")]
    backend: Option<Arc<LlamaBackend>>,
    #[cfg(feature = "local-llm")]
    model: Option<Arc<LlamaModel>>,
    /// Model parameters from registry
    model_info: Option<ModelInfo>,
}

impl Default for LlamaCppEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl LlamaCppEngine {
    pub fn new() -> Self {
        Self {
            ready: false,
            model_path: None,
            #[cfg(feature = "local-llm")]
            backend: None,
            #[cfg(feature = "local-llm")]
            model: None,
            model_info: None,
        }
    }

    /// Initialize the llama.cpp backend (call once before loading models)
    #[cfg(feature = "local-llm")]
    pub fn init_backend(&mut self) -> Result<()> {
        if self.backend.is_some() {
            return Ok(());
        }
        let backend = LlamaBackend::init()
            .map_err(|e| anyhow!("Failed to init llama backend: {:?}", e))?;
        self.backend = Some(Arc::new(backend));
        log::info!("[fontaine/llamacpp] Backend initialized");
        Ok(())
    }

    /// Get or create a context for generation
    #[cfg(feature = "local-llm")]
    fn create_context(&self) -> Result<LlamaContext<'_>> {
        let backend = self.backend.as_ref()
            .ok_or_else(|| anyhow!("Backend not initialized"))?;
        let model = self.model.as_ref()
            .ok_or_else(|| anyhow!("Model not loaded"))?;
        
        // Use full 16k context for Phi-3-mini-128k
        // The model supports up to 131072 tokens, we use 16384 for efficiency
        let ctx_size = 16384_u32;
        
        // Large batch for efficient prompt processing
        let ctx_params = LlamaContextParams::default()
            .with_n_ctx(NonZeroU32::new(ctx_size))
            .with_n_batch(8192);
        
        log::info!("[fontaine/llamacpp] Creating context with n_ctx={}, n_batch=8192", ctx_size);
        
        model.new_context(backend.as_ref(), ctx_params)
            .map_err(|e| anyhow!("Failed to create context: {:?}", e))
    }

    /// Generate tokens using real llama.cpp inference
    #[cfg(feature = "local-llm")]
    fn generate_real(&self, prompt: &str, max_tokens: usize) -> Result<Vec<String>> {
        let model = self.model.as_ref()
            .ok_or_else(|| anyhow!("Model not loaded"))?;
        
        let mut ctx = self.create_context()?;
        
        // DEBUG TEST: Use a simple test prompt first to verify model works
        let test_mode = std::env::var("FONTAINE_TEST_PROMPT").is_ok();
        let actual_prompt = if test_mode {
            "<|system|>\nYou are a helpful assistant.\n<|end|>\n<|user|>\nSay hello in German.\n<|end|>\n<|assistant|>\n".to_string()
        } else {
            prompt.to_string()
        };
        
        // DEBUG: Log first 300 chars of prompt to verify format
        log::info!("[fontaine/llamacpp] Prompt (test_mode={}): {}", test_mode, 
            &actual_prompt.chars().take(300).collect::<String>());
        
        // Tokenize the prompt
        // Model metadata says add_bos_token=true, so we should add BOS
        // This is important for Phi-3 to work correctly
        let tokens_list = model.str_to_token(&actual_prompt, AddBos::Always)
            .with_context(|| "Failed to tokenize prompt")?;
        
        log::info!("[fontaine/llamacpp] Prompt tokenized: {} tokens", tokens_list.len());
        
        // Safety check: With 16k context, leave room for ~500 output tokens
        let max_prompt_tokens = 15000_usize;
        if tokens_list.len() > max_prompt_tokens {
            return Err(anyhow!(
                "Prompt too long: {} tokens exceeds limit of {}. Text will be chunked.",
                tokens_list.len(), max_prompt_tokens
            ));
        }
        
        // Create batch with capacity for prompt + some generation buffer
        let batch_capacity = std::cmp::max(512, tokens_list.len() + 128);
        let mut batch = LlamaBatch::new(batch_capacity, 1);
        
        // Add prompt tokens to batch
        let last_index = (tokens_list.len() - 1) as i32;
        for (i, token) in (0_i32..).zip(tokens_list.iter()) {
            let is_last = i == last_index;
            batch.add(*token, i, &[0], is_last)
                .with_context(|| format!("Failed to add token {} to batch", i))?;
        }
        
        // Decode the prompt
        ctx.decode(&mut batch)
            .with_context(|| "Failed to decode prompt")?;
        
        // Sampling parameters - use temperature + top_p for better JSON generation
        // Greedy sampling caused "mode collapse" into hallucinated patterns
        let seed = 1234_u32;
        let temperature = 0.2_f32;  // Low temp for focused output
        let top_p = 0.9_f32;        // Nucleus sampling
        let repeat_penalty = 1.1_f32;
        
        log::info!("[fontaine/llamacpp] Using temp={} top_p={} repeat_penalty={} seed={}", 
            temperature, top_p, repeat_penalty, seed);
        
        // Build sampler chain with temperature + top_p (no grammar - caused crashes)
        let mut sampler = LlamaSampler::chain_simple([
            LlamaSampler::temp(temperature),
            LlamaSampler::top_p(top_p, 1),
            LlamaSampler::penalties(0, repeat_penalty, 0.0, 0.0),
            LlamaSampler::dist(seed),
        ]);
        
        // Generation loop
        let mut n_cur = batch.n_tokens();
        let mut output_tokens = Vec::new();
        
        let n_len = (tokens_list.len() + max_tokens) as i32;
        
        while n_cur < n_len && output_tokens.len() < max_tokens {
            // Sample next token
            let token = sampler.sample(&ctx, batch.n_tokens() - 1);
            sampler.accept(token);
            
            // Check for end of generation
            if model.is_eog_token(token) {
                log::info!("[fontaine/llamacpp] EOG token reached");
                break;
            }
            
            // Convert token to string using simple UTF-8 conversion
            // Avoid stateful decoder that might cause issues with multi-byte chars
            if let Ok(bytes) = model.token_to_bytes(token, Special::Tokenize) {
                // Convert bytes directly to UTF-8 string, replacing invalid sequences
                let output_string = String::from_utf8_lossy(&bytes).to_string();
                if !output_string.is_empty() {
                    output_tokens.push(output_string.clone());
                    // DEBUG: Log first 30 tokens with raw bytes to see what LLM generates
                    if output_tokens.len() <= 30 {
                        log::info!("[fontaine/llamacpp] Token {} (id={}): '{}' bytes={:?}", 
                            output_tokens.len(), token.0, output_string, &bytes);
                    }
                }
            }
            
            // Prepare next batch
            batch.clear();
            batch.add(token, n_cur, &[0], true)
                .with_context(|| "Failed to add generated token")?;
            
            // Decode
            ctx.decode(&mut batch)
                .with_context(|| "Failed to decode generated token")?;
            
            n_cur += 1;
        }
        
        // DEBUG: Log complete response
        let full_response: String = output_tokens.join("");
        log::info!("[fontaine/llamacpp] Full response ({} tokens): {}", output_tokens.len(), 
            if full_response.len() > 500 { format!("{}...", &full_response[..500]) } else { full_response });
        
        Ok(output_tokens)
    }
}

impl ModelLoader for LlamaCppEngine {
    fn id(&self) -> &str {
        "llamacpp"
    }

    #[cfg(feature = "local-llm")]
    fn load(&mut self, info: &ModelInfo, model_path: &Path) -> Result<()> {
        if !model_path.exists() {
            return Err(anyhow!("Model file missing: {}", model_path.display()));
        }

        log::info!("[fontaine/llamacpp] Loading model '{}' from: {}", info.id, model_path.display());
        
        // Initialize backend if not done
        self.init_backend()?;
        
        let backend = self.backend.as_ref()
            .ok_or_else(|| anyhow!("Backend not available"))?;
        
        // Configure model parameters
        let gpu_layers = info.params.gpu_layers;
        let model_params = LlamaModelParams::default()
            .with_n_gpu_layers(gpu_layers);
        
        // Pin model params (required by llama-cpp-2)
        let model_params = std::pin::pin!(model_params);
        
        // Load the model
        let model = LlamaModel::load_from_file(backend.as_ref(), model_path, &model_params)
            .map_err(|e| anyhow!("Failed to load model: {:?}", e))?;
        
        self.model = Some(Arc::new(model));
        self.model_path = Some(model_path.to_string_lossy().to_string());
        self.model_info = Some(info.clone());
        self.ready = true;
        
        log::info!("[fontaine/llamacpp] Model '{}' loaded successfully", info.id);
        Ok(())
    }

    #[cfg(not(feature = "local-llm"))]
    fn load(&mut self, info: &ModelInfo, model_path: &Path) -> Result<()> {
        if !model_path.exists() {
            return Err(anyhow!("Model file missing: {}", model_path.display()));
        }
        log::warn!("[fontaine/llamacpp] local-llm feature not enabled, using simulation mode");
        self.model_path = Some(model_path.to_string_lossy().to_string());
        self.model_info = Some(info.clone());
        self.ready = true;
        Ok(())
    }

    fn is_ready(&self) -> bool {
        self.ready
    }

    fn generate_tokens(&self, prompt: &str, max_tokens: usize) -> Result<Box<dyn Iterator<Item = String>>> {
        #[cfg(feature = "local-llm")]
        {
            if self.model.is_some() {
                match self.generate_real(prompt, max_tokens) {
                    Ok(tokens) => return Ok(Box::new(tokens.into_iter())),
                    Err(e) => {
                        // Propagate error to frontend instead of silently falling back!
                        log::error!("[fontaine/llamacpp] Generation error: {}", e);
                        return Err(e);
                    }
                }
            } else {
                return Err(anyhow!("LLM model not loaded. Please wait for model initialization or check logs."));
            }
        }
        
        #[cfg(not(feature = "local-llm"))]
        {
            // Only use simulation when local-llm feature is disabled at compile time
            log::warn!("[fontaine/llamacpp] local-llm feature disabled, using simulation");
            let tokens = generate_simulated_response(prompt, max_tokens);
            return Ok(Box::new(tokens.into_iter()));
        }
    }
}

/// Generate a simulated response for testing or when model not available
fn generate_simulated_response(prompt: &str, max_tokens: usize) -> Vec<String> {
    let mut tokens = Vec::new();
    let prompt_lower = prompt.to_lowercase();
    
    // Check for Phi-3 chat format to detect mode
    // Chat format: <|user|>\n...<|end|>\n<|assistant|>
    let is_chat_mode = prompt.contains("<|user|>") && prompt.contains("<|assistant|>");
    
    // Extract the actual user message from chat format
    let user_message = if is_chat_mode {
        // Find content between "Frage:" and "<|end|>" or between last user section
        if let Some(frage_pos) = prompt.rfind("Frage:") {
            let after_frage = &prompt[frage_pos + 6..];
            if let Some(end_pos) = after_frage.find("<|end|>") {
                after_frage[..end_pos].trim().to_lowercase()
            } else {
                after_frage.trim().to_lowercase()
            }
        } else {
            // Fallback: last part of prompt
            prompt_lower.clone()
        }
    } else {
        prompt_lower.clone()
    };
    
    // Lektorat mode - return JSON for LektoratEditorSidebar parsing
    if !is_chat_mode && (prompt_lower.contains("lektorat") || prompt_lower.contains("lektoriere")) {
        tokens.extend(vec![
            r#"{"line":3,"type":"style","severity":"warning","message":"Passivkonstruktion erkannt","suggestion":"Aktiv formulieren"},"#.to_string(),
            r#"{"line":7,"type":"repetition","severity":"info","message":"Wortwiederholung","suggestion":"Variation nutzen"}]"#.to_string(),
        ]);
    } else if !is_chat_mode && (prompt_lower.contains("agent") || prompt_lower.contains("proaktiv")) {
        tokens.extend(vec![
            "🤖 ".to_string(), "**Agent-Analyse**\n\n".to_string(),
            "Ich".to_string(), " habe".to_string(), " folgende".to_string(), " Punkte".to_string(), " identifiziert:\n\n".to_string(),
            "**Handlung:**".to_string(), " Die".to_string(), " Szene".to_string(), " entwickelt".to_string(), " sich".to_string(), " gut.\n\n".to_string(),
            "**Charaktere:**".to_string(), " Prüfe".to_string(), " Konsistenz".to_string(), " der".to_string(), " Stimmen.\n\n".to_string(),
            "**Vorschlag:**".to_string(), " Mehr".to_string(), " Dialog".to_string(), " könnte".to_string(), " die".to_string(), " Dynamik".to_string(), " erhöhen.\n".to_string(),
        ]);
    } else if prompt_lower.contains("entities") || prompt_lower.contains("entitäten") || prompt_lower.contains("extrahiere") {
        // Entity extraction - return realistic JSON array for frontend parsing
        // Simulation gibt mehrere Entities zurück für realistische Texte (~1700 Wörter)
        tokens.extend(vec![
            r#"[{"entity_type":"Charakter","name":"Anna","aliases":["Anni"],"description":"Protagonistin der Geschichte, eine junge Frau mit dunklen Haaren","notes":"Hauptfigur","confidence":0.95,"occurrences":["Anna betrat","sagte Anna","Anna dachte"]},"#.to_string(),
            r#"{"entity_type":"Charakter","name":"Thomas","aliases":["Tom"],"description":"Annas Bruder, arbeitet als Journalist","notes":"Nebenfigur","confidence":0.9,"occurrences":["Thomas kam","mit Thomas"]},"#.to_string(),
            r#"{"entity_type":"Charakter","name":"Dr. Weber","aliases":["der Doktor"],"description":"Älterer Arzt mit grauem Bart","notes":"Autoritätsfigur","confidence":0.85,"occurrences":["Dr. Weber erklärte"]},"#.to_string(),
            r#"{"entity_type":"Ort","name":"München","aliases":["die Stadt"],"description":"Handlungsort, bayerische Landeshauptstadt","notes":"Hauptschauplatz","confidence":0.95,"occurrences":["in München","durch München"]},"#.to_string(),
            r#"{"entity_type":"Ort","name":"Das alte Café","aliases":["Café"],"description":"Ein gemütliches Café in der Altstadt mit Jugendstil-Einrichtung","notes":"Wiederkehrender Treffpunkt","confidence":0.88,"occurrences":["im alten Café","das Café"]},"#.to_string(),
            r#"{"entity_type":"Gegenstand","name":"Der Brief","aliases":["das Schreiben"],"description":"Ein alter, vergilbter Brief mit wichtiger Information","notes":"Plot-Element","confidence":0.82,"occurrences":["den Brief","der Brief lag"]}]"#.to_string(),
        ]);
    } else if is_chat_mode {
        // Chat mode - respond conversationally based on user question
        if user_message.contains("wer bist du") || user_message.contains("wer bist") || user_message.contains("stell dich vor") {
            tokens.extend(vec![
                "Hallo! ".to_string(), "Ich".to_string(), " bin".to_string(), " Fontaine,".to_string(), 
                " dein".to_string(), " Schreibassistent.".to_string(), " 🪶\n\n".to_string(),
                "Ich".to_string(), " helfe".to_string(), " dir".to_string(), " beim".to_string(), " Schreiben".to_string(), 
                " und".to_string(), " Lektorieren".to_string(), " deines".to_string(), " Manuskripts.\n\n".to_string(),
                "Frag".to_string(), " mich".to_string(), " zu:\n".to_string(),
                "- ".to_string(), "Stilfragen\n".to_string(),
                "- ".to_string(), "Charakterentwicklung\n".to_string(),
                "- ".to_string(), "Plot".to_string(), " und".to_string(), " Struktur\n".to_string(),
                "- ".to_string(), "Szenenanalyse\n".to_string(),
            ]);
        } else if user_message.contains("hallo") || user_message.contains("hey") || user_message.contains("hi") {
            tokens.extend(vec![
                "Hallo! ".to_string(), "👋".to_string(), " Schön,".to_string(), " dass".to_string(), 
                " du".to_string(), " schreibst!".to_string(), "\n\n".to_string(),
                "Wie".to_string(), " kann".to_string(), " ich".to_string(), " dir".to_string(), 
                " heute".to_string(), " helfen?".to_string(), "\n".to_string(),
            ]);
        } else if user_message.contains("hilfe") || user_message.contains("help") {
            tokens.extend(vec![
                "Ich".to_string(), " kann".to_string(), " dir".to_string(), " helfen".to_string(), " mit:\n\n".to_string(),
                "📝 ".to_string(), "**Lektorat:**".to_string(), " Klicke".to_string(), " auf".to_string(), " 'Lektorat'".to_string(), 
                " für".to_string(), " Stilanalyse\n".to_string(),
                "💬 ".to_string(), "**Chat:**".to_string(), " Stelle".to_string(), " Fragen".to_string(), " zu".to_string(), 
                " deinem".to_string(), " Projekt\n".to_string(),
                "🤖 ".to_string(), "**Agent:**".to_string(), " Lass".to_string(), " mich".to_string(), " proaktiv".to_string(), 
                " analysieren\n".to_string(),
            ]);
        } else {
            // Generic chat response
            tokens.extend(vec![
                "Das".to_string(), " ist".to_string(), " eine".to_string(), " gute".to_string(), " Frage!".to_string(), " 🤔\n\n".to_string(),
                "Basierend".to_string(), " auf".to_string(), " deinem".to_string(), " Projekt".to_string(), " würde".to_string(), 
                " ich".to_string(), " sagen:\n\n".to_string(),
                "Erzähl".to_string(), " mir".to_string(), " mehr".to_string(), " über".to_string(), " den".to_string(), 
                " Kontext,".to_string(), " dann".to_string(), " kann".to_string(), " ich".to_string(), 
                " dir".to_string(), " besser".to_string(), " helfen.\n".to_string(),
            ]);
        }
    } else {
        // Generische Antwort für unbekannte Prompts
        let words: Vec<&str> = prompt.split_whitespace().take(8).collect();
        tokens.push("Bezüglich ".to_string());
        if !words.is_empty() {
            tokens.push(format!("'{}': ", words.join(" ")));
        }
        tokens.extend(vec![
            "\n\n".to_string(),
            "Das".to_string(), " ist".to_string(), " ein".to_string(), " interessanter".to_string(), " Punkt.\n".to_string(),
            "Hier".to_string(), " sind".to_string(), " meine".to_string(), " Gedanken:\n\n".to_string(),
            "- ".to_string(), "Betrachte".to_string(), " den".to_string(), " Kontext\n".to_string(),
            "- ".to_string(), "Achte".to_string(), " auf".to_string(), " Details\n".to_string(),
            "- ".to_string(), "Bleib".to_string(), " konsistent\n".to_string(),
        ]);
    }
    
    tokens.truncate(max_tokens);
    tokens
}
