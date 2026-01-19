//! AI Request Queue - Serialisiert Anfragen an das lokale LLM
//! 
//! Features:
//! - FIFO Queue mit Prioritäten (Interactive > Background)
//! - Mutex auf lokales Modell verhindert Race Conditions
//! - Cancellation Support für Background-Jobs
//! - Progress Tracking für lange Tasks

use std::collections::VecDeque;
use std::sync::{Arc, Mutex, OnceLock};
use tokio::sync::{mpsc, oneshot};
use uuid::Uuid;
use serde::{Serialize, Deserialize};

/// Priorität einer AI-Anfrage
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Priority {
    /// Hintergrund-Tasks (Summarization, Entity-Scan) - niedrigste Priorität
    Background = 0,
    /// Lektorat, Entity-Extraction - mittlere Priorität  
    Analysis = 1,
    /// Chat, direkte User-Interaktion - höchste Priorität
    Interactive = 2,
}

/// Status eines Jobs
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Queued,
    Running,
    Completed,
    Failed,
    Cancelled,
}

/// Eine AI-Anfrage in der Queue
#[derive(Debug)]
pub struct AiRequest {
    pub id: String,
    pub priority: Priority,
    pub prompt: String,
    pub max_tokens: usize,
    /// Callback für das Ergebnis
    pub response_tx: oneshot::Sender<Result<String, String>>,
    /// Optional: Cancel-Signal
    pub cancel_rx: Option<mpsc::Receiver<()>>,
}

/// Info über einen laufenden/abgeschlossenen Job
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobInfo {
    pub id: String,
    pub job_type: String,
    pub status: JobStatus,
    pub progress: Option<f32>,
    pub progress_text: Option<String>,
    pub created_at: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub error: Option<String>,
}

/// Die globale AI Queue
struct AiQueue {
    /// Wartende Anfragen, sortiert nach Priorität
    pending: VecDeque<AiRequest>,
    /// Aktuell laufender Job
    current: Option<String>,
    /// Job-Infos für UI-Tracking
    jobs: Vec<JobInfo>,
    /// Sender für neue Requests
    notify_tx: Option<mpsc::Sender<()>>,
}

impl Default for AiQueue {
    fn default() -> Self {
        Self {
            pending: VecDeque::new(),
            current: None,
            jobs: Vec::new(),
            notify_tx: None,
        }
    }
}

static AI_QUEUE: OnceLock<Arc<Mutex<AiQueue>>> = OnceLock::new();

fn queue() -> &'static Arc<Mutex<AiQueue>> {
    AI_QUEUE.get_or_init(|| Arc::new(Mutex::new(AiQueue::default())))
}

/// Initialisiere die Queue und starte den Worker
pub fn init_queue_worker() {
    let (tx, mut rx) = mpsc::channel::<()>(32);
    
    // Setze notify channel
    if let Ok(mut q) = queue().lock() {
        q.notify_tx = Some(tx);
    }
    
    // Starte Worker-Task mit tauri's async runtime
    tauri::async_runtime::spawn(async move {
        log::info!("[ai-queue] Worker gestartet");
        
        loop {
            // Warte auf Benachrichtigung über neue Requests
            if rx.recv().await.is_none() {
                log::info!("[ai-queue] Worker beendet (channel closed)");
                break;
            }
            
            // Verarbeite alle pending requests
            loop {
                let request = {
                    let mut q = match queue().lock() {
                        Ok(q) => q,
                        Err(_) => break,
                    };
                    
                    // Finde Request mit höchster Priorität
                    if q.pending.is_empty() {
                        break;
                    }
                    
                    // Sortiere nach Priorität (höchste zuerst)
                    let mut sorted: Vec<_> = q.pending.drain(..).collect();
                    sorted.sort_by(|a, b| b.priority.cmp(&a.priority));
                    
                    let next = sorted.remove(0);
                    q.pending = sorted.into();
                    q.current = Some(next.id.clone());
                    
                    // Update Job-Status
                    if let Some(job) = q.jobs.iter_mut().find(|j| j.id == next.id) {
                        job.status = JobStatus::Running;
                        job.started_at = Some(chrono::Utc::now().to_rfc3339());
                    }
                    
                    next
                };
                
                log::info!("[ai-queue] Verarbeite Request {} (Prio {:?})", request.id, request.priority);
                
                // Generiere Antwort
                let result = process_request(&request).await;
                
                // Sende Ergebnis zurück
                let _ = request.response_tx.send(result.clone());
                
                // Update Job-Status
                {
                    let mut q = match queue().lock() {
                        Ok(q) => q,
                        Err(_) => break,
                    };
                    q.current = None;
                    
                    if let Some(job) = q.jobs.iter_mut().find(|j| j.id == request.id) {
                        job.completed_at = Some(chrono::Utc::now().to_rfc3339());
                        match &result {
                            Ok(_) => job.status = JobStatus::Completed,
                            Err(e) => {
                                job.status = JobStatus::Failed;
                                job.error = Some(e.clone());
                            }
                        }
                    }
                }
            }
        }
    });
}

/// Verarbeite eine einzelne Anfrage
async fn process_request(request: &AiRequest) -> Result<String, String> {
    use super::generate_tokens_for_prompt;
    
    // Generiere Tokens
    let tokens = generate_tokens_for_prompt(&request.prompt, request.max_tokens);
    let response = tokens.join(" ");
    
    if response.is_empty() {
        Err("Keine Antwort vom Modell".to_string())
    } else {
        Ok(response)
    }
}

/// Füge eine Anfrage zur Queue hinzu
pub fn enqueue(
    prompt: String,
    max_tokens: usize,
    priority: Priority,
    job_type: &str,
) -> (String, oneshot::Receiver<Result<String, String>>) {
    let id = Uuid::new_v4().to_string();
    let (tx, rx) = oneshot::channel();
    
    let request = AiRequest {
        id: id.clone(),
        priority,
        prompt,
        max_tokens,
        response_tx: tx,
        cancel_rx: None,
    };
    
    let job_info = JobInfo {
        id: id.clone(),
        job_type: job_type.to_string(),
        status: JobStatus::Queued,
        progress: None,
        progress_text: None,
        created_at: chrono::Utc::now().to_rfc3339(),
        started_at: None,
        completed_at: None,
        error: None,
    };
    
    if let Ok(mut q) = queue().lock() {
        q.pending.push_back(request);
        q.jobs.push(job_info);
        
        // Benachrichtige Worker
        if let Some(tx) = &q.notify_tx {
            let _ = tx.try_send(());
        }
    }
    
    log::info!("[ai-queue] Request {} eingereiht (Prio {:?}, Typ {})", id, priority, job_type);
    
    (id, rx)
}

/// Abbrechen eines Jobs
pub fn cancel_job(job_id: &str) -> bool {
    if let Ok(mut q) = queue().lock() {
        // Aus pending entfernen
        let initial_len = q.pending.len();
        q.pending.retain(|r| r.id != job_id);
        
        if q.pending.len() < initial_len {
            // War in pending - als cancelled markieren
            if let Some(job) = q.jobs.iter_mut().find(|j| j.id == job_id) {
                job.status = JobStatus::Cancelled;
            }
            return true;
        }
        
        // Laufende Jobs können nicht abgebrochen werden (wäre Cooperative Cancellation nötig)
    }
    false
}

/// Hole alle aktiven Jobs
pub fn get_active_jobs() -> Vec<JobInfo> {
    if let Ok(q) = queue().lock() {
        q.jobs.iter()
            .filter(|j| matches!(j.status, JobStatus::Queued | JobStatus::Running))
            .cloned()
            .collect()
    } else {
        Vec::new()
    }
}

/// Hole Job-Info
pub fn get_job_info(job_id: &str) -> Option<JobInfo> {
    if let Ok(q) = queue().lock() {
        q.jobs.iter().find(|j| j.id == job_id).cloned()
    } else {
        None
    }
}

/// Bereinige alte abgeschlossene Jobs (älter als 1 Stunde)
pub fn cleanup_old_jobs() {
    if let Ok(mut q) = queue().lock() {
        let cutoff = chrono::Utc::now() - chrono::Duration::hours(1);
        q.jobs.retain(|j| {
            if matches!(j.status, JobStatus::Completed | JobStatus::Failed | JobStatus::Cancelled) {
                if let Some(completed) = &j.completed_at {
                    if let Ok(ts) = chrono::DateTime::parse_from_rfc3339(completed) {
                        return ts > cutoff;
                    }
                }
                false
            } else {
                true
            }
        });
    }
}

/// Queue-Statistiken
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueStats {
    pub pending_count: usize,
    pub running: bool,
    pub current_job_id: Option<String>,
    pub current_job_type: Option<String>,
}

pub fn get_queue_stats() -> QueueStats {
    if let Ok(q) = queue().lock() {
        let current_job_type = q.current.as_ref()
            .and_then(|id| q.jobs.iter().find(|j| &j.id == id))
            .map(|j| j.job_type.clone());
        
        QueueStats {
            pending_count: q.pending.len(),
            running: q.current.is_some(),
            current_job_id: q.current.clone(),
            current_job_type,
        }
    } else {
        QueueStats {
            pending_count: 0,
            running: false,
            current_job_id: None,
            current_job_type: None,
        }
    }
}
