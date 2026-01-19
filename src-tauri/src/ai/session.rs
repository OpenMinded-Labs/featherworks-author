use std::sync::{Arc, Mutex};
use anyhow::Result;
use crate::ai::{loader::ModelLoader, registry::ModelInfo};

pub struct InferenceSession {
    loader: Arc<Mutex<Box<dyn ModelLoader>>>,
    _model: ModelInfo,
}

impl InferenceSession {
    pub fn new(loader: Arc<Mutex<Box<dyn ModelLoader>>>, model: ModelInfo) -> Self { Self { loader, _model: model } }
    pub fn generate(&self, prompt:&str, max_tokens:usize) -> Result<Vec<String>> {
        let guard = self.loader.lock().unwrap();
        let iter = guard.generate_tokens(prompt, max_tokens)?;
        Ok(iter.collect())
    }
}
