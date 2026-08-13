//! Model Registry
//! Definiert verfügbare Modelle mit ihren Eigenschaften und Download-URLs

#[derive(Clone, Debug, PartialEq)]
pub enum ModelKind {
    Gemma4E2B, // Gemma 4 E2B (MLX)
    Mistral7B, // Mistral 7B (GGUF)
}

#[derive(Clone, Debug, PartialEq)]
pub enum RuntimeKind {
    Mlx,
    LlamaCpp,
}

#[derive(Clone, Debug)]
pub struct ModelParams {
    pub ctx: usize,          // Context length in tokens
    pub temperature: f32,    // Default temperature
    pub top_p: f32,          // Default nucleus sampling
    pub repeat_penalty: f32, // Repetition penalty
    pub gpu_layers: u32,     // Number of layers to offload to GPU (0 = CPU only)
}

impl Default for ModelParams {
    fn default() -> Self {
        Self {
            ctx: 4096,
            temperature: 0.7,
            top_p: 0.9,
            repeat_penalty: 1.1,
            gpu_layers: 99,
        }
    }
}

#[derive(Clone, Debug)]
pub struct ModelInfo {
    pub id: &'static str,                   // Unique identifier
    pub name: &'static str,                 // Display name
    pub file: &'static str,                 // Relative path to GGUF file
    pub kind: ModelKind,                    // Model type
    pub params: ModelParams,                // Default parameters
    pub size_bytes: u64,                    // File size for download progress
    pub ram_required_mb: u32,               // Minimum RAM needed
    pub is_bundled: bool,                   // Included in app bundle?
    pub download_url: Option<&'static str>, // URL for optional download
    pub quantization: &'static str,         // e.g. "Q4_K_M"
    pub runtime: RuntimeKind,               // Runtime backend (MLX / llama.cpp)
}

/// Model Registry - all supported models
pub static REGISTRY: &[ModelInfo] = &[
    // Default model - Apple-first local runtime (MLX)
    ModelInfo { 
        id: "gemma-4-e2b-mlx-q6", 
        name: "Gemma 4 E2B (MLX Q6)",
        // For MLX we expect a model directory containing MLX-converted artifacts.
        // The `-text` variant has the vision/audio towers stripped (see
        // scripts/strip_gemma_multimodal.py): Fontaine is text-only, so the
        // encoders were ~0.95 GB of dead weight.
        file: "models/gemma-4-e2b-mlx-q6-text", 
        kind: ModelKind::Gemma4E2B,
        // 131072 per the model's own config.json (max_position_embeddings).
        // 30 of 35 layers use sliding attention (window 512), 5 use full
        // attention - so long context is cheap on KV cache but recall across
        // the full span is untested. See docs/LLM-STATUS.md.
        params: ModelParams { ctx: 131072, temperature: 0.7, top_p: 0.9, repeat_penalty: 1.1, gpu_layers: 99 },
        size_bytes: 3_760_000_000,
        ram_required_mb: 6144,
        is_bundled: true,
        download_url: None,
        quantization: "MLX Q6",
        runtime: RuntimeKind::Mlx,
    },
    // Windows/Linux fallback runtime (GGUF + llama.cpp)
    ModelInfo { 
        id: "mistral-7b", 
        name: "Mistral 7B Instruct",
        file: "mistral-7b-instruct-v0.3-q4_k_m.gguf", 
        kind: ModelKind::Mistral7B,
        params: ModelParams { ctx: 8192, temperature: 0.7, top_p: 0.9, repeat_penalty: 1.1, gpu_layers: 99 },
        size_bytes: 4_368_438_976,  // ~4.1 GB
        ram_required_mb: 6144,       // 6 GB RAM minimum
        is_bundled: false,
        download_url: Some("https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf"),
        quantization: "Q4_K_M",
        runtime: RuntimeKind::LlamaCpp,
    },
];

/// Find model by ID
pub fn find(id: &str) -> Option<ModelInfo> {
    REGISTRY.iter().find(|m| m.id == id).cloned()
}

/// Get default model (bundled)
pub fn default_model() -> &'static ModelInfo {
    &REGISTRY[0] // gemma-4-e2b-mlx-q6
}

/// List all available model IDs
pub fn list_ids() -> Vec<&'static str> {
    REGISTRY.iter().map(|m| m.id).collect()
}

/// Check if a model requires download
pub fn requires_download(id: &str) -> bool {
    find(id).map(|m| !m.is_bundled).unwrap_or(false)
}
