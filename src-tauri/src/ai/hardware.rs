//! Hardware Detection Module
//! Erkennt System-Ressourcen (RAM, GPU) und empfiehlt passende Modelle

use sysinfo::System;
use crate::ai::registry::{self, ModelInfo, ModelKind};

/// Hardware capabilities detected on the system
#[derive(Debug, Clone, serde::Serialize)]
pub struct HardwareInfo {
    /// Total system RAM in MB
    pub total_ram_mb: u64,
    /// Available RAM in MB (approximate)
    pub available_ram_mb: u64,
    /// Number of CPU cores
    pub cpu_cores: usize,
    /// Whether Apple Metal is available (macOS with Apple Silicon)
    pub has_metal: bool,
    /// Whether CUDA is available (NVIDIA GPU)
    pub has_cuda: bool,
    /// CPU brand/model string
    pub cpu_brand: String,
    /// Recommended model based on hardware
    pub recommended_model: String,
    /// Can run the high-performance model (Ministral-8B)
    pub can_run_large_model: bool,
}

impl HardwareInfo {
    /// Detect hardware capabilities
    pub fn detect() -> Self {
        let mut sys = System::new_all();
        sys.refresh_all();
        
        let total_ram_mb = sys.total_memory() / (1024 * 1024);
        let available_ram_mb = sys.available_memory() / (1024 * 1024);
        let cpu_cores = sys.cpus().len();
        
        // CPU brand from first core
        let cpu_brand = sys.cpus()
            .first()
            .map(|c| c.brand().to_string())
            .unwrap_or_else(|| "Unknown CPU".to_string());
        
        // Metal detection (Apple Silicon)
        let has_metal = Self::detect_metal();
        
        // CUDA detection (NVIDIA)
        let has_cuda = Self::detect_cuda();
        
        // Determine which models can run
        let can_run_large_model = total_ram_mb >= 8192; // 8GB minimum for Ministral-8B
        
        // Recommend model based on available resources
        let recommended_model = if can_run_large_model && (has_metal || has_cuda) {
            "ministral-8b".to_string()
        } else {
            "phi-3-mini".to_string()
        };
        
        Self {
            total_ram_mb,
            available_ram_mb,
            cpu_cores,
            has_metal,
            has_cuda,
            cpu_brand,
            recommended_model,
            can_run_large_model,
        }
    }
    
    /// Check if Apple Metal is available
    fn detect_metal() -> bool {
        #[cfg(target_os = "macos")]
        {
            // On macOS, Metal is available on all Apple Silicon and most Intel Macs
            // We check for arm64 architecture as a proxy for Apple Silicon
            #[cfg(target_arch = "aarch64")]
            return true;
            
            #[cfg(not(target_arch = "aarch64"))]
            return false; // Intel Macs - Metal exists but less performant for LLM
        }
        
        #[cfg(not(target_os = "macos"))]
        false
    }
    
    /// Check if CUDA is available
    fn detect_cuda() -> bool {
        #[cfg(target_os = "windows")]
        {
            // Check for NVIDIA driver presence
            // This is a simple heuristic - proper detection would use CUDA API
            std::path::Path::new("C:\\Windows\\System32\\nvcuda.dll").exists()
        }
        
        #[cfg(target_os = "linux")]
        {
            std::path::Path::new("/usr/lib/x86_64-linux-gnu/libcuda.so").exists()
                || std::path::Path::new("/usr/local/cuda/lib64/libcuda.so").exists()
        }
        
        #[cfg(target_os = "macos")]
        false // No CUDA on macOS
    }
    
    /// Check if a specific model can run on this hardware
    pub fn can_run_model(&self, model: &ModelInfo) -> bool {
        self.total_ram_mb >= model.ram_required_mb as u64
    }
    
    /// Get list of models that can run on this hardware
    pub fn available_models(&self) -> Vec<&'static ModelInfo> {
        registry::REGISTRY
            .iter()
            .filter(|m| self.can_run_model(m))
            .collect()
    }
    
    /// Get acceleration backend description
    pub fn acceleration_backend(&self) -> &'static str {
        if self.has_metal {
            "Apple Metal (GPU)"
        } else if self.has_cuda {
            "NVIDIA CUDA (GPU)"
        } else {
            "CPU only"
        }
    }
}

/// Get optimal inference parameters based on hardware
pub fn optimal_params(hardware: &HardwareInfo, model_kind: &ModelKind) -> InferenceParams {
    let base_threads = (hardware.cpu_cores / 2).max(2).min(8);
    
    // More threads for CPU-only, fewer when GPU accelerated
    let n_threads = if hardware.has_metal || hardware.has_cuda {
        base_threads.min(4)
    } else {
        base_threads
    };
    
    // Batch size based on available RAM
    let n_batch = if hardware.available_ram_mb > 8192 {
        512
    } else if hardware.available_ram_mb > 4096 {
        256
    } else {
        128
    };
    
    // Context size based on model
    let n_ctx = match model_kind {
        ModelKind::Phi3Mini => 4096,
        ModelKind::Ministral8B => 8192,
    };
    
    InferenceParams {
        n_threads,
        n_batch,
        n_ctx,
        use_gpu: hardware.has_metal || hardware.has_cuda,
        n_gpu_layers: if hardware.has_metal || hardware.has_cuda { 99 } else { 0 },
    }
}

/// Inference parameters for llama.cpp
#[derive(Debug, Clone)]
pub struct InferenceParams {
    pub n_threads: usize,
    pub n_batch: usize,
    pub n_ctx: usize,
    pub use_gpu: bool,
    pub n_gpu_layers: u32,
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_hardware_detection() {
        let info = HardwareInfo::detect();
        assert!(info.total_ram_mb > 0);
        assert!(info.cpu_cores > 0);
        println!("Hardware: {:?}", info);
    }
}
