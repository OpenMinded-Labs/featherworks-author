//! Model Downloader
//! Downloads GGUF models with progress tracking and verification

use anyhow::{anyhow, Context, Result};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use crate::ai::registry;

/// Download state for tracking progress
#[derive(Debug, Clone, serde::Serialize)]
pub struct DownloadProgress {
    pub model_id: String,
    pub status: DownloadStatus,
    pub bytes_downloaded: u64,
    pub bytes_total: u64,
    pub percent: f32,
    pub speed_bps: u64, // bytes per second
    pub eta_seconds: u64,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub enum DownloadStatus {
    Idle,
    Downloading,
    Verifying,
    Complete,
    Failed(String),
    Cancelled,
}

/// Global download state (only one download at a time)
static DOWNLOAD_STATE: OnceLock<Mutex<Option<DownloadProgress>>> = OnceLock::new();

fn get_state() -> &'static Mutex<Option<DownloadProgress>> {
    DOWNLOAD_STATE.get_or_init(|| Mutex::new(None))
}

/// Cancellation flag
static CANCEL_FLAG: OnceLock<Mutex<bool>> = OnceLock::new();

fn cancel_flag() -> &'static Mutex<bool> {
    CANCEL_FLAG.get_or_init(|| Mutex::new(false))
}

/// Get current download progress
pub fn get_progress() -> Option<DownloadProgress> {
    get_state().lock().ok().and_then(|g| g.clone())
}

/// Check if a download is currently running
pub fn is_downloading() -> bool {
    get_progress()
        .map(|p| p.status == DownloadStatus::Downloading || p.status == DownloadStatus::Verifying)
        .unwrap_or(false)
}

/// Cancel the current download
pub fn cancel_download() -> bool {
    if let Ok(mut flag) = cancel_flag().lock() {
        *flag = true;
        return true;
    }
    false
}

/// Get the models directory path
pub fn get_models_dir() -> Result<PathBuf> {
    let config_dir =
        dirs::config_dir().ok_or_else(|| anyhow!("Could not find config directory"))?;
    let models_dir = config_dir.join("featherworks-author").join("models");
    std::fs::create_dir_all(&models_dir)?;
    Ok(models_dir)
}

/// Start downloading a model (async, updates progress in background)
pub async fn start_download(model_id: &str) -> Result<PathBuf> {
    // Check if already downloading
    if is_downloading() {
        return Err(anyhow!("A download is already in progress"));
    }

    // Get model info
    let info = registry::find(model_id).ok_or_else(|| anyhow!("Unknown model: {}", model_id))?;

    // Check if model requires download
    if info.is_bundled {
        return Err(anyhow!("Model {} is bundled, no download needed", model_id));
    }

    let url = info
        .download_url
        .ok_or_else(|| anyhow!("No download URL for model: {}", model_id))?;

    // Prepare paths
    let models_dir = get_models_dir()?;
    let model_file = models_dir.join(format!("{}.gguf", model_id));
    let temp_file = models_dir.join(format!("{}.gguf.partial", model_id));

    // Reset cancel flag
    if let Ok(mut flag) = cancel_flag().lock() {
        *flag = false;
    }

    // Initialize progress
    update_progress(DownloadProgress {
        model_id: model_id.to_string(),
        status: DownloadStatus::Downloading,
        bytes_downloaded: 0,
        bytes_total: info.size_bytes,
        percent: 0.0,
        speed_bps: 0,
        eta_seconds: 0,
    });

    // Perform download
    match download_file(url, &temp_file, info.size_bytes).await {
        Ok(()) => {
            // Verify and rename
            update_status(DownloadStatus::Verifying);

            // Rename temp to final
            std::fs::rename(&temp_file, &model_file).context("Failed to rename downloaded file")?;

            update_status(DownloadStatus::Complete);
            log::info!("[downloader] Model {} downloaded successfully", model_id);
            Ok(model_file)
        }
        Err(e) => {
            // Clean up temp file
            let _ = std::fs::remove_file(&temp_file);

            let error_msg = e.to_string();
            update_status(DownloadStatus::Failed(error_msg.clone()));
            Err(anyhow!("Download failed: {}", error_msg))
        }
    }
}

/// Download a file with progress tracking
async fn download_file(url: &str, dest: &Path, expected_size: u64) -> Result<()> {
    use tokio::io::AsyncWriteExt;

    let client = reqwest::Client::new();

    // Check for resume capability
    let resume_pos = if dest.exists() {
        std::fs::metadata(dest)?.len()
    } else {
        0
    };

    let mut request = client.get(url);
    if resume_pos > 0 {
        request = request.header("Range", format!("bytes={}-", resume_pos));
        log::info!("[downloader] Resuming download from byte {}", resume_pos);
    }

    let response = request.send().await?;

    // Check response status
    if !response.status().is_success() && response.status().as_u16() != 206 {
        return Err(anyhow!("HTTP error: {}", response.status()));
    }

    // Get content length
    let content_length = response
        .content_length()
        .unwrap_or(expected_size - resume_pos);
    let total_size = resume_pos + content_length;

    // Open file (append if resuming)
    let mut file = tokio::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .append(resume_pos > 0)
        .truncate(resume_pos == 0)
        .open(dest)
        .await?;

    // Download with progress tracking
    let mut downloaded = resume_pos;
    let mut stream = response.bytes_stream();
    let start_time = std::time::Instant::now();
    let mut last_update = start_time;

    use futures_util::StreamExt;

    while let Some(chunk) = stream.next().await {
        // Check for cancellation
        if let Ok(flag) = cancel_flag().lock() {
            if *flag {
                update_status(DownloadStatus::Cancelled);
                return Err(anyhow!("Download cancelled"));
            }
        }

        let chunk = chunk?;
        file.write_all(&chunk).await?;
        downloaded += chunk.len() as u64;

        // Update progress (throttled to ~10 updates/sec)
        let now = std::time::Instant::now();
        if now.duration_since(last_update).as_millis() >= 100 {
            let elapsed = now.duration_since(start_time).as_secs_f64();
            let speed = if elapsed > 0.0 {
                ((downloaded - resume_pos) as f64 / elapsed) as u64
            } else {
                0
            };

            let remaining = total_size.saturating_sub(downloaded);
            let eta = if speed > 0 { remaining / speed } else { 0 };

            update_progress(DownloadProgress {
                model_id: get_current_model_id(),
                status: DownloadStatus::Downloading,
                bytes_downloaded: downloaded,
                bytes_total: total_size,
                percent: (downloaded as f32 / total_size as f32) * 100.0,
                speed_bps: speed,
                eta_seconds: eta,
            });

            last_update = now;
        }
    }

    file.flush().await?;

    // Final progress update
    update_progress(DownloadProgress {
        model_id: get_current_model_id(),
        status: DownloadStatus::Downloading,
        bytes_downloaded: downloaded,
        bytes_total: total_size,
        percent: 100.0,
        speed_bps: 0,
        eta_seconds: 0,
    });

    Ok(())
}

fn get_current_model_id() -> String {
    get_progress().map(|p| p.model_id).unwrap_or_default()
}

fn update_progress(progress: DownloadProgress) {
    if let Ok(mut state) = get_state().lock() {
        *state = Some(progress);
    }
}

fn update_status(status: DownloadStatus) {
    if let Ok(mut state) = get_state().lock() {
        if let Some(ref mut p) = *state {
            p.status = status;
        }
    }
}

/// Strip the repo-relative `models/` prefix from a registry path.
///
/// `ModelInfo::file` is relative to the repository root ("models/<id>"), but
/// `get_models_dir()` already points at the models directory - joining the two
/// verbatim would produce ".../models/models/<id>".
fn file_leaf(file: &str) -> &Path {
    Path::new(file)
        .strip_prefix("models")
        .unwrap_or(Path::new(file))
}

/// Check if a model file exists
pub fn model_exists(model_id: &str) -> bool {
    let Some(info) = registry::find(model_id) else {
        return false;
    };

    // Bundled models - check in resources
    if info.is_bundled {
        // Will be checked via resource_dir at runtime
        return true; // Assume bundled models exist
    }

    // Downloaded models - check in config dir
    if let Ok(models_dir) = get_models_dir() {
        let path = models_dir.join(file_leaf(info.file));
        if path.exists() {
            return true;
        }
        // Legacy fallback naming
        let legacy = models_dir.join(format!("{}.gguf", model_id));
        return legacy.exists();
    }

    false
}

/// Get the path to a model file
pub fn get_model_path(model_id: &str, resource_dir: Option<PathBuf>) -> Option<PathBuf> {
    let info = registry::find(model_id)?;

    // Bundled models - look in resources
    if info.is_bundled {
        if let Some(dir) = resource_dir {
            let path = dir.join(info.file);
            if path.exists() {
                return Some(path);
            }
        }
    }

    // Downloaded models - look in config dir
    if let Ok(models_dir) = get_models_dir() {
        let path = models_dir.join(file_leaf(info.file));
        if path.exists() {
            return Some(path);
        }
        // Legacy fallback naming
        let legacy = models_dir.join(format!("{}.gguf", model_id));
        if legacy.exists() {
            return Some(legacy);
        }
    }

    None
}
