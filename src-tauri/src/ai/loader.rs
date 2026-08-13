use crate::ai::registry::ModelInfo;
use anyhow::Result;
use std::path::Path;

/// Unified model loader trait (engine-agnostic)
pub trait ModelLoader: Send + Sync {
    fn id(&self) -> &str;
    fn load(&mut self, info: &ModelInfo, model_path: &Path) -> Result<()>;
    fn is_ready(&self) -> bool;
    fn generate_tokens(
        &self,
        prompt: &str,
        max_tokens: usize,
    ) -> Result<Box<dyn Iterator<Item = String>>>;
}
