import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { useTranslation } from 'react-i18next';

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCategory?: 'bug' | 'feedback';
}

interface SystemInfo {
  os: string;
  os_version: string;
  arch: string;
  total_ram_mb: number;
  available_ram_mb: number;
  cpu_cores: number;
  gpu: string | null;
  rust_version: string;
  tauri_version: string;
}

const categories = [
  { id: 'bug', label: 'Bug / Fehler', icon: '🐛' },
  { id: 'crash', label: 'Absturz', icon: '💥' },
  { id: 'performance', label: 'Performance', icon: '🐢' },
  { id: 'ui', label: 'Benutzeroberfläche', icon: '🎨' },
  { id: 'ai', label: 'KI / Fontaine', icon: '🤖' },
  { id: 'feature', label: 'Feature-Wunsch', icon: '💡' },
  { id: 'other', label: 'Sonstiges', icon: '📝' },
] as const;

type CategoryId = typeof categories[number]['id'];

export const BugReportModal: React.FC<BugReportModalProps> = ({ 
  isOpen, 
  onClose,
  initialCategory = 'bug'
}) => {
  const { t } = useTranslation();
  const [category, setCategory] = useState<CategoryId>(initialCategory === 'feedback' ? 'feature' : 'bug');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [includeLogs, setIncludeLogs] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Reset form when opened
      setSubject('');
      setDescription('');
      setIncludeLogs(true);
      setSubmitted(false);
      setError(null);
      
      // Load system info
      invoke<SystemInfo>('get_system_info').then(setSystemInfo).catch(console.error);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!subject.trim() || !description.trim()) {
      setError('Bitte fülle alle Pflichtfelder aus.');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const reportId = await invoke<string>('submit_bug_report', {
        req: {
          category,
          subject: subject.trim(),
          description: description.trim(),
          email: email.trim() || null,
          includeLogs,
        }
      });
      
      console.log('[BugReport] Submitted:', reportId);
      setSubmitted(true);
    } catch (e) {
      console.error('[BugReport] Error:', e);
      setError(String(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal bug-report-modal" 
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{initialCategory === 'feedback' ? '💬 Feedback senden' : '🐛 Fehler melden'}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {submitted ? (
          <div className="modal-body bug-report-thanks">
            <div className="bug-report-icon">✅</div>
            <h3>Vielen Dank!</h3>
            <p className="bug-report-subtext">
              Dein Feedback wurde erfolgreich gesendet.
            </p>
            <button 
              className="btn btn-primary bug-report-close-btn" 
              onClick={onClose}
              type="button"
            >
              Schließen
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {/* Kategorie */}
              <div className="form-group">
                <label>Kategorie</label>
                <div className="category-grid">
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      className={`category-btn ${category === cat.id ? 'active' : ''}`}
                      onClick={() => setCategory(cat.id)}
                    >
                      <span className="icon">{cat.icon}</span>
                      <span className="label">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Betreff */}
              <div className="form-group">
                <label htmlFor="subject">Betreff *</label>
                <input
                  id="subject"
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="Kurze Beschreibung des Problems..."
                  maxLength={100}
                />
              </div>

              {/* Beschreibung */}
              <div className="form-group">
                <label htmlFor="description">Beschreibung *</label>
                <textarea
                  id="description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Was ist passiert? Was hast du erwartet? Wie kann man das Problem reproduzieren?"
                  rows={6}
                />
              </div>

              {/* E-Mail */}
              <div className="form-group">
                <label htmlFor="email">E-Mail (optional)</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="Falls du eine Antwort möchtest..."
                />
              </div>

              {/* Logs */}
              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={includeLogs}
                    onChange={e => setIncludeLogs(e.target.checked)}
                  />
                  <span>Log-Dateien anhängen (empfohlen für Bug-Reports)</span>
                </label>
              </div>

              {/* System Info */}
              {systemInfo && (
                <details className="system-info-details">
                  <summary>System-Informationen (werden mitgesendet)</summary>
                  <div className="system-info-grid">
                    <div><strong>OS:</strong> {systemInfo.os} {systemInfo.os_version}</div>
                    <div><strong>Architektur:</strong> {systemInfo.arch}</div>
                    <div><strong>RAM:</strong> {Math.round(systemInfo.available_ram_mb / 1024)} / {Math.round(systemInfo.total_ram_mb / 1024)} GB</div>
                    <div><strong>CPU:</strong> {systemInfo.cpu_cores} Kerne</div>
                    {systemInfo.gpu && <div><strong>GPU:</strong> {systemInfo.gpu}</div>}
                  </div>
                </details>
              )}

              {/* Error */}
              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Abbrechen
              </button>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Wird gesendet...' : 'Absenden'}
              </button>
            </div>
          </form>
        )}
      </div>

      <style>{`
        .bug-report-modal .category-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
          gap: 8px;
          margin-top: 8px;
        }
        
        .bug-report-modal .category-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 12px 8px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--bg-secondary);
          cursor: pointer;
          transition: all 0.15s;
        }
        
        .bug-report-modal .category-btn:hover {
          border-color: var(--accent-color);
          background: var(--bg-tertiary);
        }
        
        .bug-report-modal .category-btn.active {
          border-color: var(--accent-color);
          background: var(--accent-color-light);
        }
        
        .bug-report-modal .category-btn .icon {
          font-size: 20px;
        }
        
        .bug-report-modal .category-btn .label {
          font-size: 11px;
          color: var(--text-secondary);
        }
        
        .bug-report-modal .category-btn.active .label {
          color: var(--accent-color);
        }
        
        .bug-report-modal .form-group {
          margin-bottom: 16px;
        }
        
        .bug-report-modal .form-group label {
          display: block;
          margin-bottom: 6px;
          font-weight: 500;
          font-size: 13px;
        }
        
        .bug-report-modal .form-group input[type="text"],
        .bug-report-modal .form-group input[type="email"],
        .bug-report-modal .form-group textarea {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: 14px;
        }
        
        .bug-report-modal .form-group textarea {
          resize: vertical;
          min-height: 100px;
        }
        
        .bug-report-modal .checkbox-group label {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }
        
        .bug-report-modal .checkbox-group input[type="checkbox"] {
          width: 16px;
          height: 16px;
        }
        
        .bug-report-modal .system-info-details {
          margin-top: 16px;
          padding: 12px;
          background: var(--bg-secondary);
          border-radius: 6px;
          font-size: 12px;
        }
        
        .bug-report-modal .system-info-details summary {
          cursor: pointer;
          color: var(--text-secondary);
        }
        
        .bug-report-modal .system-info-grid {
          margin-top: 8px;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 4px;
          color: var(--text-secondary);
        }
        
        .bug-report-modal .error-message {
          padding: 12px;
          background: rgba(255, 0, 0, 0.1);
          border: 1px solid rgba(255, 0, 0, 0.3);
          border-radius: 6px;
          color: #ff6b6b;
          font-size: 13px;
        }
      `}</style>
    </div>
  );
};

export default BugReportModal;
