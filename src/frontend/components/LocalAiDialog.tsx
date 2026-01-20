import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/tauri';
import { open } from '@tauri-apps/api/dialog';
import { toast } from 'sonner';
import '../styles/local-ai-dialog.css';

interface RagDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  addedAt: string;
}

interface AiProviderSettings {
  provider: string;
  claude_api_key: string | null;
  openai_api_key: string | null;
  claude_model: string | null;
  openai_model: string | null;
  enabled?: boolean;
  local_model?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const LocalAiDialog: React.FC<Props> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [aiSettings, setAiSettings] = useState<AiProviderSettings | null>(null);
  const [ragDocuments, setRagDocuments] = useState<RagDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [modelStatus, setModelStatus] = useState<'checking' | 'available' | 'unavailable'>('checking');
  
  // Load settings and RAG documents
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [settings, docs] = await Promise.all([
        invoke<AiProviderSettings>('get_ai_provider_settings'),
        invoke<RagDocument[]>('list_rag_documents').catch(() => [])
      ]);
      setAiSettings(settings);
      setRagDocuments(docs);
      
      // Check if local model is available and ready
      const available = await invoke<boolean>('check_ai_available').catch(() => false);
      setModelStatus(available ? 'available' : 'unavailable');
    } catch (e) {
      console.error('Failed to load AI settings:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);
  
  // Toggle AI enabled/disabled
  const handleToggleAi = async (enabled: boolean) => {
    if (!aiSettings) return;
    
    const newSettings = { ...aiSettings, enabled };
    try {
      await invoke('save_ai_provider_settings', { settings: newSettings });
      setAiSettings(newSettings);
      // Notify other components
      window.dispatchEvent(new CustomEvent('ai-status-changed', { detail: { enabled } }));
      toast.success(enabled ? t('localAi.aiEnabled', 'KI aktiviert') : t('localAi.aiDisabled', 'KI deaktiviert'));
    } catch (e) {
      console.error('Failed to toggle AI:', e);
      toast.error(t('localAi.toggleFailed', 'Fehler beim Umschalten'));
    }
  };
  
  // Import document to RAG
  const handleImportDocument = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Dokumente',
          extensions: ['txt', 'md', 'pdf']
        }]
      });
      
      if (!selected || typeof selected !== 'string') return;
      
      setIsImporting(true);
      await invoke('import_rag_document', { path: selected });
      toast.success(t('localAi.importSuccess', 'Dokument importiert'));
      await loadData(); // Refresh list
    } catch (e: any) {
      console.error('Failed to import document:', e);
      toast.error(t('localAi.importFailed', 'Import fehlgeschlagen: ') + (e?.message || e));
    } finally {
      setIsImporting(false);
    }
  };
  
  // Remove single RAG document
  const handleRemoveDocument = async (id: string) => {
    try {
      await invoke('remove_rag_document', { id });
      setRagDocuments(prev => prev.filter(d => d.id !== id));
      toast.success(t('localAi.documentRemoved', 'Dokument entfernt'));
    } catch (e) {
      console.error('Failed to remove document:', e);
      toast.error(t('localAi.removeFailed', 'Entfernen fehlgeschlagen'));
    }
  };
  
  // Clear all RAG data
  const handleClearAllRag = async () => {
    if (!window.confirm(t('localAi.clearConfirm', 'Alle RAG-Daten wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.'))) {
      return;
    }
    
    setIsClearing(true);
    try {
      await invoke('clear_all_rag_data');
      setRagDocuments([]);
      toast.success(t('localAi.ragCleared', 'Alle RAG-Daten gelöscht'));
    } catch (e) {
      console.error('Failed to clear RAG:', e);
      toast.error(t('localAi.clearFailed', 'Löschen fehlgeschlagen'));
    } finally {
      setIsClearing(false);
    }
  };
  
  // Format file size
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };
  
  // Format date
  const formatDate = (dateStr: string): string => {
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };
  
  if (!isOpen) return null;
  
  const aiEnabled = aiSettings?.enabled !== false;
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal local-ai-dialog" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label={t('close')}>×</button>
        
        <div className="local-ai-header">
          <div className="local-ai-icon">🤖</div>
          <div className="local-ai-title-section">
            <h2 className="local-ai-title">{t('localAi.title', 'Lokale KI verwalten')}</h2>
            <p className="local-ai-subtitle">{t('localAi.subtitle', 'Phi-3 Mini · Offline-Textverarbeitung')}</p>
          </div>
        </div>
        
        <div className="local-ai-content">
          {isLoading ? (
            <div className="local-ai-loading">
              <div className="spinner" />
              <span>{t('localAi.loading', 'Lade Einstellungen...')}</span>
            </div>
          ) : (
            <>
              {/* Model Status Section */}
              <section className="local-ai-section">
                <h3>{t('localAi.modelStatus', 'Modell-Status')}</h3>
                
                <div className="local-ai-model-card">
                  <div className="model-info">
                    <div className="model-name">
                      <span className="model-icon">🧠</span>
                      Phi-3 Mini 128K Instruct
                    </div>
                    <div className="model-details">
                      <span className="model-size">~2.4 GB</span>
                      <span className="model-type">GGUF Q4_K_M</span>
                    </div>
                  </div>
                  
                  <div className={`model-status ${modelStatus}`}>
                    {modelStatus === 'checking' && (
                      <><div className="spinner-small" /> {t('localAi.checking', 'Prüfe...')}</>
                    )}
                    {modelStatus === 'available' && (
                      <><span className="status-dot available" /> {t('localAi.available', 'Verfügbar')}</>
                    )}
                    {modelStatus === 'unavailable' && (
                      <><span className="status-dot unavailable" /> {t('localAi.unavailable', 'Nicht geladen')}</>
                    )}
                  </div>
                </div>
                
                {/* AI Toggle */}
                <div className="local-ai-toggle-row">
                  <label className="toggle-label">
                    <span>{t('localAi.enableAi', 'KI-Funktionen aktivieren')}</span>
                    <span className="toggle-hint">
                      {t('localAi.enableHint', 'Fontaine, Entity-Extraktion, Lektorat')}
                    </span>
                  </label>
                  <label className="toggle-switch">
                    <input 
                      type="checkbox" 
                      checked={aiEnabled}
                      onChange={e => handleToggleAi(e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
                
                {/* Future: Model Selection */}
                <div className="local-ai-future-hint">
                  <span className="future-icon">🔮</span>
                  <span>{t('localAi.futureModels', 'Weitere Modelle (z.B. Mistral 7B) werden in zukünftigen Updates verfügbar sein.')}</span>
                </div>
              </section>
              
              {/* RAG Section */}
              <section className="local-ai-section">
                <div className="section-header">
                  <h3>{t('localAi.ragTitle', 'Wissensdatenbank (RAG)')}</h3>
                  <div className="section-actions">
                    <button 
                      className="btn btn-secondary btn-sm"
                      onClick={handleImportDocument}
                      disabled={isImporting}
                    >
                      {isImporting ? (
                        <><div className="spinner-small" /> {t('localAi.importing', 'Importiere...')}</>
                      ) : (
                        <>{t('localAi.addDocument', '+ Dokument')}</>
                      )}
                    </button>
                  </div>
                </div>
                
                <p className="section-description">
                  {t('localAi.ragDescription', 'Füge Recherche-Dokumente hinzu, um der KI mehr Kontext für dein Projekt zu geben.')}
                </p>
                
                {ragDocuments.length === 0 ? (
                  <div className="rag-empty">
                    <span className="rag-empty-icon">📚</span>
                    <span>{t('localAi.noDocuments', 'Keine Dokumente geladen')}</span>
                  </div>
                ) : (
                  <div className="rag-list">
                    {ragDocuments.map(doc => (
                      <div key={doc.id} className="rag-item">
                        <div className="rag-item-info">
                          <span className="rag-item-name">{doc.name}</span>
                          <span className="rag-item-meta">
                            {formatSize(doc.size)} · {formatDate(doc.addedAt)}
                          </span>
                        </div>
                        <button 
                          className="rag-item-remove"
                          onClick={() => handleRemoveDocument(doc.id)}
                          title={t('localAi.remove', 'Entfernen')}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                {ragDocuments.length > 0 && (
                  <div className="rag-actions">
                    <button 
                      className="btn btn-danger btn-sm"
                      onClick={handleClearAllRag}
                      disabled={isClearing}
                    >
                      {isClearing ? (
                        <><div className="spinner-small" /> {t('localAi.clearing', 'Lösche...')}</>
                      ) : (
                        t('localAi.clearAll', 'Alle löschen')
                      )}
                    </button>
                    <span className="rag-count">
                      {ragDocuments.length} {ragDocuments.length === 1 
                        ? t('localAi.document', 'Dokument') 
                        : t('localAi.documents', 'Dokumente')}
                    </span>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
        
        <div className="local-ai-footer">
          <button className="btn btn-primary" onClick={onClose}>
            {t('close', 'Schließen')}
          </button>
        </div>
      </div>
    </div>
  );
};
