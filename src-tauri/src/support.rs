//! Bug Report & Feedback System
//!
//! Sammelt System-Informationen und ermöglicht es Usern, Fehler zu melden.
//! Reports können per E-Mail oder Webhook gesendet werden.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Kategorien für Feedback/Bug Reports
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReportCategory {
    Bug,
    Crash,
    FeatureRequest,
    Performance,
    Ui,
    Ai,
    Other,
}

/// Ein Bug Report / Feedback
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BugReport {
    /// Eindeutige ID
    pub id: String,
    /// Kategorie
    pub category: ReportCategory,
    /// Betreff
    pub subject: String,
    /// Beschreibung vom User
    pub description: String,
    /// User E-Mail (optional)
    pub email: Option<String>,
    /// System-Informationen
    pub system_info: SystemInfo,
    /// Letzte Log-Zeilen
    pub recent_logs: Option<String>,
    /// App-State (optional)
    pub app_state: Option<AppStateSnapshot>,
    /// Zeitstempel
    pub created_at: String,
    /// App-Version
    pub app_version: String,
}

/// System-Informationen
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    /// Betriebssystem
    pub os: String,
    /// OS-Version
    pub os_version: String,
    /// Architektur
    pub arch: String,
    /// RAM gesamt (MB)
    pub total_ram_mb: u64,
    /// RAM verfügbar (MB)
    pub available_ram_mb: u64,
    /// CPU-Kerne
    pub cpu_cores: usize,
    /// GPU (falls erkannt)
    pub gpu: Option<String>,
    /// Rust-Version (compile-time)
    pub rust_version: String,
    /// Tauri-Version
    pub tauri_version: String,
}

/// Snapshot des App-States für Debugging
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppStateSnapshot {
    /// Aktuelles Projekt geöffnet?
    pub project_open: bool,
    /// Projekt-Pfad (anonymisiert)
    pub project_path_hash: Option<String>,
    /// Anzahl Kapitel
    pub chapter_count: Option<usize>,
    /// Anzahl Szenen
    pub scene_count: Option<usize>,
    /// AI-Modell geladen?
    pub ai_model_loaded: bool,
    /// Aktueller AI-Provider
    pub ai_provider: Option<String>,
    /// Letzte Fehlermeldung
    pub last_error: Option<String>,
}

impl SystemInfo {
    /// Sammle System-Informationen
    pub fn collect() -> Self {
        use crate::ai::hardware::HardwareInfo;

        let hw = HardwareInfo::detect();

        // Baue GPU-String aus verfügbaren Infos
        let gpu = if hw.has_metal {
            Some("Apple Metal (Apple Silicon)".to_string())
        } else if hw.has_cuda {
            Some("NVIDIA CUDA".to_string())
        } else {
            None
        };

        SystemInfo {
            os: std::env::consts::OS.to_string(),
            os_version: get_os_version(),
            arch: std::env::consts::ARCH.to_string(),
            total_ram_mb: hw.total_ram_mb,
            available_ram_mb: hw.available_ram_mb,
            cpu_cores: hw.cpu_cores,
            gpu,
            rust_version: env!("CARGO_PKG_RUST_VERSION").to_string(),
            tauri_version: "1.8".to_string(),
        }
    }
}

/// Hole OS-Version
fn get_os_version() -> String {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("sw_vers")
            .arg("-productVersion")
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| "unknown".to_string())
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "ver"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| "unknown".to_string())
    }
    #[cfg(target_os = "linux")]
    {
        fs::read_to_string("/etc/os-release")
            .ok()
            .and_then(|content| {
                content
                    .lines()
                    .find(|l| l.starts_with("PRETTY_NAME="))
                    .map(|l| {
                        l.trim_start_matches("PRETTY_NAME=")
                            .trim_matches('"')
                            .to_string()
                    })
            })
            .unwrap_or_else(|| "unknown".to_string())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        "unknown".to_string()
    }
}

/// Lese die letzten N Zeilen aus dem Log
pub fn get_recent_logs(log_dir: Option<PathBuf>, max_lines: usize) -> Option<String> {
    let log_path = log_dir?.join("featherworks.log");

    if !log_path.exists() {
        return None;
    }

    let content = fs::read_to_string(&log_path).ok()?;
    let lines: Vec<&str> = content.lines().collect();
    let start = lines.len().saturating_sub(max_lines);

    Some(lines[start..].join("\n"))
}

/// Hash einen Pfad für Anonymisierung
pub fn hash_path(path: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

/// Sende Report per Webhook (Discord/Slack kompatibel)
pub async fn send_report_webhook(report: &BugReport, webhook_url: &str) -> Result<(), String> {
    let client = reqwest::Client::new();

    // Format für Discord Webhook
    let payload = serde_json::json!({
        "embeds": [{
            "title": format!("[{}] {}", format!("{:?}", report.category), report.subject),
            "description": report.description,
            "color": match report.category {
                ReportCategory::Bug | ReportCategory::Crash => 0xFF0000,
                ReportCategory::Performance => 0xFFA500,
                ReportCategory::FeatureRequest => 0x00FF00,
                _ => 0x0000FF,
            },
            "fields": [
                {
                    "name": "App Version",
                    "value": &report.app_version,
                    "inline": true
                },
                {
                    "name": "OS",
                    "value": format!("{} {}", report.system_info.os, report.system_info.os_version),
                    "inline": true
                },
                {
                    "name": "RAM",
                    "value": format!("{} MB / {} MB", report.system_info.available_ram_mb, report.system_info.total_ram_mb),
                    "inline": true
                },
                {
                    "name": "Contact",
                    "value": report.email.as_deref().unwrap_or("(nicht angegeben)"),
                    "inline": true
                }
            ],
            "timestamp": &report.created_at
        }]
    });

    let response = client
        .post(webhook_url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Webhook-Fehler: {}", e))?;

    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!("Webhook returned: {}", response.status()))
    }
}

/// Sende Report per E-Mail (benötigt SMTP-Konfiguration)
pub async fn send_report_email(report: &BugReport, smtp_config: &SmtpConfig) -> Result<(), String> {
    // TODO: Implementieren mit lettre crate
    // Für jetzt: Fallback zu Webhook oder lokaler Speicherung
    Err("E-Mail-Versand noch nicht implementiert".to_string())
}

/// SMTP-Konfiguration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmtpConfig {
    pub server: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub from_address: String,
    pub to_address: String,
}

/// Speichere Report lokal als Fallback
pub fn save_report_locally(report: &BugReport, app_data_dir: PathBuf) -> Result<PathBuf, String> {
    let reports_dir = app_data_dir.join("bug_reports");
    fs::create_dir_all(&reports_dir).map_err(|e| e.to_string())?;

    let filename = format!("report_{}.json", report.id);
    let path = reports_dir.join(&filename);

    let json = serde_json::to_string_pretty(report).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;

    Ok(path)
}

/// Erstelle einen neuen Bug Report
pub fn create_report(
    category: ReportCategory,
    subject: String,
    description: String,
    email: Option<String>,
    include_logs: bool,
    log_dir: Option<PathBuf>,
    app_state: Option<AppStateSnapshot>,
    app_version: &str,
) -> BugReport {
    BugReport {
        id: uuid::Uuid::new_v4().to_string(),
        category,
        subject,
        description,
        email,
        system_info: SystemInfo::collect(),
        recent_logs: if include_logs {
            get_recent_logs(log_dir, 100)
        } else {
            None
        },
        app_state,
        created_at: chrono::Utc::now().to_rfc3339(),
        app_version: app_version.to_string(),
    }
}
