//! Background Jobs - Lange KI-Tasks die das Manuskript durcharbeiten
//!
//! Use Cases:
//! - Entity-Scan über gesamtes Manuskript
//! - Summarization aller Szenen/Kapitel
//! - Konsistenz-Checks
//! - RAG-Indexierung

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex, OnceLock};
use tokio::sync::mpsc;
use uuid::Uuid;

use super::entity_extraction::{
    build_extraction_prompt, build_scene_summary_prompt, parse_summary_response,
};
use super::queue::{enqueue, JobStatus, Priority};

/// Typ eines Background-Jobs
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BackgroundJobType {
    /// Entity-Extraction über alle Szenen
    EntityScan,
    /// Zusammenfassungen für alle Szenen generieren
    SummarizeScenes,
    /// Zusammenfassungen für alle Kapitel generieren
    SummarizeChapters,
    /// Konsistenz-Check
    ConsistencyCheck,
}

/// Status eines Background-Jobs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackgroundJobStatus {
    pub id: String,
    pub job_type: BackgroundJobType,
    pub status: JobStatus,
    /// Fortschritt 0.0 - 1.0
    pub progress: f32,
    /// Aktuelle Szene/Kapitel
    pub current_item: Option<String>,
    /// Anzahl verarbeiteter Items
    pub processed: usize,
    /// Anzahl gesamt Items
    pub total: usize,
    /// Fehler während der Verarbeitung (nicht-fatal)
    pub errors: Vec<String>,
    /// Cancel-Signal wurde gesendet
    pub cancel_requested: bool,
}

/// Aktive Background-Jobs
struct BackgroundJobs {
    active: Vec<BackgroundJobStatus>,
    cancel_channels: Vec<(String, mpsc::Sender<()>)>,
}

impl Default for BackgroundJobs {
    fn default() -> Self {
        Self {
            active: Vec::new(),
            cancel_channels: Vec::new(),
        }
    }
}

static BACKGROUND_JOBS: OnceLock<Arc<Mutex<BackgroundJobs>>> = OnceLock::new();

fn jobs() -> &'static Arc<Mutex<BackgroundJobs>> {
    BACKGROUND_JOBS.get_or_init(|| Arc::new(Mutex::new(BackgroundJobs::default())))
}

/// Starte Entity-Scan über alle Szenen
pub async fn start_entity_scan(
    conn: Arc<Mutex<rusqlite::Connection>>,
    entity_types: Vec<String>,
) -> Result<String, String> {
    let job_id = Uuid::new_v4().to_string();
    let (cancel_tx, mut cancel_rx) = mpsc::channel::<()>(1);

    // Hole alle Szenen
    let scenes: Vec<(String, String, String)> = {
        let conn_guard = conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn_guard
            .prepare(
                "SELECT s.id, s.title, s.content FROM scenes s 
             JOIN chapters c ON s.chapter_id = c.id 
             ORDER BY c.order_num, s.order_num",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                ))
            })
            .map_err(|e| e.to_string())?;

        rows.filter_map(|r| r.ok()).collect()
    };

    let total = scenes.len();

    // Registriere Job
    {
        let mut bg = jobs().lock().map_err(|e| e.to_string())?;
        bg.active.push(BackgroundJobStatus {
            id: job_id.clone(),
            job_type: BackgroundJobType::EntityScan,
            status: JobStatus::Running,
            progress: 0.0,
            current_item: None,
            processed: 0,
            total,
            errors: Vec::new(),
            cancel_requested: false,
        });
        bg.cancel_channels.push((job_id.clone(), cancel_tx));
    }

    let job_id_clone = job_id.clone();
    let entity_types_clone = entity_types.clone();

    // Starte async Verarbeitung
    tokio::spawn(async move {
        log::info!("[bg-job] EntityScan gestartet: {} Szenen", total);

        for (idx, (scene_id, scene_title, scene_content)) in scenes.iter().enumerate() {
            // Check for cancellation
            if cancel_rx.try_recv().is_ok() {
                log::info!("[bg-job] EntityScan abgebrochen");
                update_job_status(&job_id_clone, |s| {
                    s.status = JobStatus::Cancelled;
                    s.cancel_requested = true;
                });
                return;
            }

            // Update progress
            update_job_status(&job_id_clone, |s| {
                s.current_item = Some(scene_title.clone());
                s.processed = idx;
                s.progress = idx as f32 / total as f32;
            });

            // Skip empty scenes
            if scene_content.trim().len() < 50 {
                continue;
            }

            // Baue Prompt und enqueue
            let type_refs: Vec<&str> = entity_types_clone.iter().map(|s| s.as_str()).collect();
            let prompt = build_extraction_prompt(scene_content, &type_refs);

            let (_req_id, rx) = enqueue(prompt, 512, Priority::Background, "entity_scan");

            // Warte auf Ergebnis (mit Timeout)
            match tokio::time::timeout(tokio::time::Duration::from_secs(60), rx).await {
                Ok(Ok(Ok(response))) => {
                    // Entity-Parsing erfolgt im Frontend via EntitiesPanel
                    // Background-Job sammelt nur Rohdaten für spätere Analyse
                    log::debug!(
                        "[bg-job] Szene {} verarbeitet: {} chars Antwort",
                        scene_title,
                        response.len()
                    );
                }
                Ok(Ok(Err(e))) => {
                    log::warn!("[bg-job] Fehler bei Szene {}: {}", scene_title, e);
                    update_job_status(&job_id_clone, |s| {
                        s.errors.push(format!("{}: {}", scene_title, e));
                    });
                }
                Ok(Err(_)) => {
                    log::warn!("[bg-job] Channel closed für Szene {}", scene_title);
                }
                Err(_) => {
                    log::warn!("[bg-job] Timeout für Szene {}", scene_title);
                    update_job_status(&job_id_clone, |s| {
                        s.errors.push(format!("{}: Timeout", scene_title));
                    });
                }
            }
        }

        // Job abgeschlossen
        update_job_status(&job_id_clone, |s| {
            s.status = JobStatus::Completed;
            s.progress = 1.0;
            s.processed = total;
            s.current_item = None;
        });

        log::info!(
            "[bg-job] EntityScan abgeschlossen: {} Szenen, {} Fehler",
            total,
            jobs()
                .lock()
                .map(|j| j
                    .active
                    .iter()
                    .find(|a| a.id == job_id_clone)
                    .map(|a| a.errors.len())
                    .unwrap_or(0))
                .unwrap_or(0)
        );
    });

    Ok(job_id)
}

/// Starte Summarization aller Szenen
pub async fn start_summarize_scenes(
    conn: Arc<Mutex<rusqlite::Connection>>,
) -> Result<String, String> {
    let job_id = Uuid::new_v4().to_string();
    let (cancel_tx, mut cancel_rx) = mpsc::channel::<()>(1);

    // Hole alle Szenen ohne Summary
    let scenes: Vec<(String, String, String)> = {
        let conn_guard = conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn_guard
            .prepare(
                "SELECT s.id, s.title, s.content FROM scenes s 
             JOIN chapters c ON s.chapter_id = c.id 
             WHERE s.summary IS NULL OR s.summary = ''
             ORDER BY c.order_num, s.order_num",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                ))
            })
            .map_err(|e| e.to_string())?;

        rows.filter_map(|r| r.ok()).collect()
    };

    let total = scenes.len();

    if total == 0 {
        return Ok("no_scenes".to_string());
    }

    // Registriere Job
    {
        let mut bg = jobs().lock().map_err(|e| e.to_string())?;
        bg.active.push(BackgroundJobStatus {
            id: job_id.clone(),
            job_type: BackgroundJobType::SummarizeScenes,
            status: JobStatus::Running,
            progress: 0.0,
            current_item: None,
            processed: 0,
            total,
            errors: Vec::new(),
            cancel_requested: false,
        });
        bg.cancel_channels.push((job_id.clone(), cancel_tx));
    }

    let job_id_clone = job_id.clone();
    let conn_clone = conn.clone();

    tokio::spawn(async move {
        log::info!("[bg-job] SummarizeScenes gestartet: {} Szenen", total);

        for (idx, (scene_id, scene_title, scene_content)) in scenes.iter().enumerate() {
            // Check for cancellation
            if cancel_rx.try_recv().is_ok() {
                log::info!("[bg-job] SummarizeScenes abgebrochen");
                update_job_status(&job_id_clone, |s| {
                    s.status = JobStatus::Cancelled;
                    s.cancel_requested = true;
                });
                return;
            }

            // Update progress
            update_job_status(&job_id_clone, |s| {
                s.current_item = Some(scene_title.clone());
                s.processed = idx;
                s.progress = idx as f32 / total as f32;
            });

            // Skip empty/short scenes
            if scene_content.trim().len() < 50 {
                continue;
            }

            // Baue Prompt
            let prompt = build_scene_summary_prompt(scene_title, scene_content);

            let (_req_id, rx) = enqueue(prompt, 200, Priority::Background, "summarize_scene");

            // Warte auf Ergebnis
            match tokio::time::timeout(tokio::time::Duration::from_secs(60), rx).await {
                Ok(Ok(Ok(response))) => {
                    let summary = parse_summary_response(&response);

                    // Speichere Summary in DB
                    if let Ok(conn_guard) = conn_clone.lock() {
                        if let Err(e) = conn_guard.execute(
                            "UPDATE scenes SET summary = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
                            rusqlite::params![summary, scene_id]
                        ) {
                            log::warn!("[bg-job] DB-Fehler für {}: {}", scene_title, e);
                        }
                    }

                    log::debug!("[bg-job] Szene {} zusammengefasst", scene_title);
                }
                Ok(Ok(Err(e))) => {
                    update_job_status(&job_id_clone, |s| {
                        s.errors.push(format!("{}: {}", scene_title, e));
                    });
                }
                Ok(Err(_)) => {}
                Err(_) => {
                    update_job_status(&job_id_clone, |s| {
                        s.errors.push(format!("{}: Timeout", scene_title));
                    });
                }
            }
        }

        // Job abgeschlossen
        update_job_status(&job_id_clone, |s| {
            s.status = JobStatus::Completed;
            s.progress = 1.0;
            s.processed = total;
            s.current_item = None;
        });

        log::info!("[bg-job] SummarizeScenes abgeschlossen");
    });

    Ok(job_id)
}

/// Helper: Update Job-Status
fn update_job_status<F>(job_id: &str, f: F)
where
    F: FnOnce(&mut BackgroundJobStatus),
{
    if let Ok(mut bg) = jobs().lock() {
        if let Some(status) = bg.active.iter_mut().find(|s| s.id == job_id) {
            f(status);
        }
    }
}

/// Abbrechen eines Background-Jobs
pub fn cancel_background_job(job_id: &str) -> bool {
    if let Ok(mut bg) = jobs().lock() {
        // Sende Cancel-Signal
        if let Some(pos) = bg.cancel_channels.iter().position(|(id, _)| id == job_id) {
            let (_, tx) = bg.cancel_channels.remove(pos);
            let _ = tx.try_send(());

            // Markiere als cancel_requested
            if let Some(status) = bg.active.iter_mut().find(|s| s.id == job_id) {
                status.cancel_requested = true;
            }
            return true;
        }
    }
    false
}

/// Hole Status eines Background-Jobs
pub fn get_background_job_status(job_id: &str) -> Option<BackgroundJobStatus> {
    if let Ok(bg) = jobs().lock() {
        bg.active.iter().find(|s| s.id == job_id).cloned()
    } else {
        None
    }
}

/// Hole alle aktiven Background-Jobs
pub fn list_background_jobs() -> Vec<BackgroundJobStatus> {
    if let Ok(bg) = jobs().lock() {
        bg.active
            .iter()
            .filter(|s| matches!(s.status, JobStatus::Queued | JobStatus::Running))
            .cloned()
            .collect()
    } else {
        Vec::new()
    }
}

/// Bereinige abgeschlossene Jobs
pub fn cleanup_completed_jobs() {
    if let Ok(mut bg) = jobs().lock() {
        bg.active
            .retain(|s| matches!(s.status, JobStatus::Queued | JobStatus::Running));
        // Collect active IDs first to avoid borrow conflict
        let active_ids: Vec<String> = bg.active.iter().map(|s| s.id.clone()).collect();
        bg.cancel_channels.retain(|(id, _)| active_ids.contains(id));
    }
}
