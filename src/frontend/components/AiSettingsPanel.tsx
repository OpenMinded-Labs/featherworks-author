import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/tauri';

// Types matching Rust backend
interface AiSettings {
  enabled: boolean;
  model_id: string;
  temperature: number;
  max_tokens: number;
  auto_load: boolean;
}

interface HardwareInfo {
  total_ram_gb: number;
  available_ram_gb: number;
  has_metal: boolean;
  has_cuda: boolean;
  cpu_cores: number;
  cpu_brand: string;
  recommended_model: string;
  can_run_large_model: boolean;
}

interface ModelInfo {
  id: string;
  name: string;
  quantization: string;
  size_bytes: number;
  ram_required_mb: number;
  is_bundled: boolean;
  download_url: string | null;
}

interface DownloadProgress {
  model_id: string;
  status: string;
  bytes_downloaded: number;
  bytes_total: number;
  percent: number;
  speed_mbps: number;
  eta_seconds: number;
}

interface AiSettingsPanelProps {
  onClose?: () => void;
}

export const AiSettingsPanel: React.FC<AiSettingsPanelProps> = ({ onClose }) => {
  const { t } = useTranslation();
  
  // State
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelAvailability, setModelAvailability] = useState<Record<string, boolean>>({});
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  // Poll download progress while downloading
  useEffect(() => {
    if (downloadProgress?.status === 'downloading' || downloadProgress?.status === 'verifying') {
      const interval = setInterval(async () => {
        try {
          const progress = await invoke<DownloadProgress | null>('get_download_progress');
          setDownloadProgress(progress);
          
          // If complete, refresh model availability
          if (progress?.status === 'complete') {
            await checkModelAvailability();
          }
        } catch (e) {
          console.error('Failed to get download progress:', e);
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, [downloadProgress?.status]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsData, hardwareData, modelsData] = await Promise.all([
        invoke<AiSettings>('get_ai_settings'),
        invoke<HardwareInfo>('detect_hardware'),
        invoke<ModelInfo[]>('list_model_registry'),
      ]);
      
      setSettings(settingsData);
      setHardware(hardwareData);
      setModels(modelsData);
      
      // Check availability of each model
      await checkModelAvailability();
      
      // Check if there's an ongoing download
      const progress = await invoke<DownloadProgress | null>('get_download_progress');
      setDownloadProgress(progress);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const checkModelAvailability = async () => {
    const availability: Record<string, boolean> = {};
    for (const model of models) {
      try {
        availability[model.id] = await invoke<boolean>('is_model_available', { modelId: model.id });
      } catch {
        availability[model.id] = false;
      }
    }
    setModelAvailability(availability);
  };

  const saveSettings = async (newSettings: AiSettings) => {
    setSaving(true);
    try {
      await invoke('save_ai_settings_cmd', { settings: newSettings });
      setSettings(newSettings);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = () => {
    if (settings) {
      saveSettings({ ...settings, enabled: !settings.enabled });
    }
  };

  const handleSelectModel = async (modelId: string) => {
    const model = models.find(m => m.id === modelId);
    if (!model || !settings) return;

    // Check if model is available
    if (!modelAvailability[modelId] && !model.is_bundled) {
      // Model needs download - show confirmation
      const confirmed = window.confirm(
        t('ai.confirmDownload', {
          name: model.name,
          size: formatBytes(model.size_bytes),
        })
      );
      
      if (confirmed) {
        startDownload(modelId);
      }
      return;
    }

    // Model available - select it
    saveSettings({ ...settings, model_id: modelId });
  };

  const startDownload = async (modelId: string) => {
    try {
      await invoke('start_model_download', { modelId });
      // Immediately start polling
      const progress = await invoke<DownloadProgress | null>('get_download_progress');
      setDownloadProgress(progress);
    } catch (e) {
      setError(String(e));
    }
  };

  const cancelDownload = async () => {
    try {
      await invoke('cancel_model_download');
      setDownloadProgress(null);
    } catch (e) {
      setError(String(e));
    }
  };

  // Helper: format bytes
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // Helper: format ETA
  const formatEta = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  if (loading) {
    return (
      <div className="ai-settings-panel loading">
        <div className="spinner" />
        <p>{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="ai-settings-panel">
      <header className="panel-header">
        <h2>🤖 {t('ai.settings.title', 'Fontaine AI')}</h2>
        {onClose && (
          <button className="close-btn" onClick={onClose}>×</button>
        )}
      </header>

      {error && (
        <div className="error-banner">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Enable/Disable Toggle */}
      <section className="settings-section">
        <div className="toggle-row">
          <label htmlFor="ai-enabled">
            <strong>{t('ai.settings.enabled', 'KI-Funktionen aktivieren')}</strong>
            <span className="hint">{t('ai.settings.enabledHint', 'Fontaine für Lektorat und Chat nutzen')}</span>
          </label>
          <button 
            id="ai-enabled"
            className={`toggle-switch ${settings?.enabled ? 'on' : 'off'}`}
            onClick={handleToggleEnabled}
            disabled={saving}
          >
            <span className="toggle-knob" />
          </button>
        </div>
      </section>

      {/* Hardware Info */}
      {hardware && (
        <section className="settings-section hardware-info">
          <h3>💻 {t('ai.settings.hardware', 'System')}</h3>
          <div className="hardware-grid">
            <div className="hw-item">
              <span className="label">RAM</span>
              <span className="value">{hardware.total_ram_gb.toFixed(1)} GB</span>
            </div>
            <div className="hw-item">
              <span className="label">CPU</span>
              <span className="value">{hardware.cpu_cores} Kerne</span>
            </div>
            <div className="hw-item">
              <span className="label">GPU</span>
              <span className="value">
                {hardware.has_metal ? '✅ Metal' : hardware.has_cuda ? '✅ CUDA' : '❌ CPU only'}
              </span>
            </div>
          </div>
          {hardware.recommended_model && (
            <p className="recommendation">
              💡 {t('ai.settings.recommended', 'Empfohlen')}: <strong>{hardware.recommended_model}</strong>
            </p>
          )}
        </section>
      )}

      {/* Model Selection */}
      <section className="settings-section">
        <h3>🧠 {t('ai.settings.model', 'Modell')}</h3>
        
        <div className="model-list">
          {models.map(model => {
            const isSelected = settings?.model_id === model.id;
            const isAvailable = modelAvailability[model.id] || model.is_bundled;
            const isDownloading = downloadProgress?.model_id === model.id && 
                                  (downloadProgress.status === 'downloading' || downloadProgress.status === 'verifying');
            const canRun = hardware ? (model.ram_required_mb <= hardware.total_ram_gb * 1024) : true;

            return (
              <div 
                key={model.id}
                className={`model-card ${isSelected ? 'selected' : ''} ${!canRun ? 'disabled' : ''}`}
              >
                <div className="model-header">
                  <span className="model-name">{model.name}</span>
                  {model.is_bundled && <span className="badge bundled">Inkludiert</span>}
                  {!model.is_bundled && isAvailable && <span className="badge downloaded">Heruntergeladen</span>}
                </div>
                
                <div className="model-details">
                  <span>{formatBytes(model.size_bytes)}</span>
                  <span>•</span>
                  <span>{model.quantization}</span>
                  <span>•</span>
                  <span>{(model.ram_required_mb / 1024).toFixed(0)} GB RAM</span>
                </div>

                {!canRun && (
                  <p className="warning">⚠️ {t('ai.settings.insufficientRam', 'Nicht genügend RAM')}</p>
                )}

                {isDownloading && downloadProgress && (
                  <div className="download-progress">
                    <progress
                      className="progress-bar"
                      value={downloadProgress.percent}
                      max={100}
                    />
                    <div className="progress-info">
                      <span>{downloadProgress.percent.toFixed(1)}%</span>
                      <span>{formatBytes(downloadProgress.bytes_downloaded)} / {formatBytes(downloadProgress.bytes_total)}</span>
                      <span>{downloadProgress.speed_mbps.toFixed(1)} MB/s</span>
                      <span>ETA: {formatEta(downloadProgress.eta_seconds)}</span>
                    </div>
                    <button className="cancel-btn" onClick={cancelDownload}>
                      {t('common.cancel', 'Abbrechen')}
                    </button>
                  </div>
                )}

                {!isDownloading && (
                  <button
                    className={`select-btn ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectModel(model.id)}
                    disabled={!canRun || saving || isDownloading}
                  >
                    {isSelected 
                      ? t('ai.settings.selected', '✓ Ausgewählt')
                      : isAvailable 
                        ? t('ai.settings.select', 'Auswählen')
                        : t('ai.settings.download', 'Herunterladen')
                    }
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Advanced Settings (collapsible) */}
      {settings?.enabled && (
        <details className="settings-section advanced">
          <summary>{t('ai.settings.advanced', 'Erweiterte Einstellungen')}</summary>
          
          <div className="setting-row">
            <label htmlFor="temperature">
              {t('ai.settings.temperature', 'Kreativität')}
              <span className="value">{settings.temperature.toFixed(1)}</span>
            </label>
            <input
              id="temperature"
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={settings.temperature}
              onChange={(e) => saveSettings({ ...settings, temperature: parseFloat(e.target.value) })}
            />
            <div className="range-labels">
              <span>{t('ai.settings.precise', 'Präzise')}</span>
              <span>{t('ai.settings.creative', 'Kreativ')}</span>
            </div>
          </div>

          <div className="setting-row">
            <label htmlFor="max-tokens">
              {t('ai.settings.maxTokens', 'Max. Antwortlänge')}
              <span className="value">{settings.max_tokens}</span>
            </label>
            <input
              id="max-tokens"
              type="range"
              min="128"
              max="2048"
              step="128"
              value={settings.max_tokens}
              onChange={(e) => saveSettings({ ...settings, max_tokens: parseInt(e.target.value) })}
            />
          </div>

          <div className="toggle-row">
            <label htmlFor="auto-load">
              {t('ai.settings.autoLoad', 'Modell beim Start laden')}
            </label>
            <button
              id="auto-load"
              className={`toggle-switch ${settings.auto_load ? 'on' : 'off'}`}
              onClick={() => saveSettings({ ...settings, auto_load: !settings.auto_load })}
            >
              <span className="toggle-knob" />
            </button>
          </div>
        </details>
      )}
    </div>
  );
};

export default AiSettingsPanel;
