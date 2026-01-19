//! Model Registry
//! Definiert verfügbare Modelle mit ihren Eigenschaften und Download-URLs

#[derive(Clone, Debug, PartialEq)]
pub enum ModelKind { 
    Phi3Mini,      // Microsoft Phi-3-mini-4k-instruct (3.8B params)
    Ministral8B,   // Mistral Ministral-8B-Instruct-2410 (8B params)
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
        Self { ctx: 4096, temperature: 0.7, top_p: 0.9, repeat_penalty: 1.1, gpu_layers: 99 }
    }
}

#[derive(Clone, Debug)]
pub struct ModelInfo { 
    pub id: &'static str,           // Unique identifier
    pub name: &'static str,         // Display name
    pub file: &'static str,         // Relative path to GGUF file
    pub kind: ModelKind,            // Model type
    pub params: ModelParams,        // Default parameters
    pub size_bytes: u64,            // File size for download progress
    pub ram_required_mb: u32,       // Minimum RAM needed
    pub is_bundled: bool,           // Included in app bundle?
    pub download_url: Option<&'static str>, // URL for optional download
    pub quantization: &'static str, // e.g. "Q4_K_M"
}

/// Model Registry - all supported models
pub static REGISTRY: &[ModelInfo] = &[
    // Default model - downloaded on first use
    ModelInfo { 
        id: "phi-3-mini", 
        name: "Phi-3 Mini 128K",
        file: "phi-3-mini-128K-Instruct_q4_k_m.gguf", 
        kind: ModelKind::Phi3Mini, 
        // 128K context - use 16384 for efficiency, can go higher if needed
        params: ModelParams { ctx: 16384, temperature: 0.7, top_p: 0.9, repeat_penalty: 1.1, gpu_layers: 99 },
        size_bytes: 2_394_518_624,  // ~2.3 GB
        ram_required_mb: 4096,       // 4 GB RAM minimum
        is_bundled: false,
        download_url: Some("https://huggingface.co/microsoft/Phi-3-mini-128k-instruct-gguf/resolve/main/Phi-3-mini-128k-instruct-q4.gguf"),
        quantization: "Q4_K_M",
    },
    // Optional high-performance model - downloaded on demand
    ModelInfo { 
        id: "mistral-7b", 
        name: "Mistral 7B Instruct",
        file: "mistral-7b-instruct-v0.3-q4_k_m.gguf", 
        kind: ModelKind::Ministral8B, 
        params: ModelParams { ctx: 8192, temperature: 0.7, top_p: 0.9, repeat_penalty: 1.1, gpu_layers: 99 },
        size_bytes: 4_368_438_976,  // ~4.1 GB
        ram_required_mb: 6144,       // 6 GB RAM minimum
        is_bundled: false,
        download_url: Some("https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf"),
        quantization: "Q4_K_M",
    },
];

/// Find model by ID
pub fn find(id: &str) -> Option<ModelInfo> { 
    REGISTRY.iter().find(|m| m.id == id).cloned() 
}

/// Get default model (bundled)
pub fn default_model() -> &'static ModelInfo {
    &REGISTRY[0]  // phi-3-mini
}

/// List all available model IDs
pub fn list_ids() -> Vec<&'static str> {
    REGISTRY.iter().map(|m| m.id).collect()
}

/// Check if a model requires download
pub fn requires_download(id: &str) -> bool {
    find(id).map(|m| !m.is_bundled).unwrap_or(false)
}
