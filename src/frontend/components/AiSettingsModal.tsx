import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen, emit } from '@tauri-apps/api/event';
import { useTranslation } from 'react-i18next';

interface AiProviderSettings {
  provider: string;
  claude_api_key: string | null;
  openai_api_key: string | null;
  claude_model: string | null;
  openai_model: string | null;
  enabled?: boolean;
}

const CLAUDE_MODELS = [
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (Empfohlen)' },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (Schneller)' },
  { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus (Stärker)' },
];

const OPENAI_MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o (Empfohlen)' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Schneller)' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
];

export const AiSettingsModal: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isGerman = i18n.language === 'de';
  
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState<AiProviderSettings>({
    provider: 'local',
    claude_api_key: null,
    openai_api_key: null,
    claude_model: 'claude-3-5-sonnet-20241022',
    openai_model: 'gpt-4o',
    enabled: true,
  });
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Listen for all AI menu events
  useEffect(() => {
    const openModal = () => {
      setIsOpen(true);
      loadSettings();
    };
    
    const unlisteners = [
      listen('menu_ai_settings', openModal),
      // NOTE: 'menu_ai_local_model' is now handled by LocalAiDialog in main.tsx
      listen('menu_ai_connect_api', openModal),
    ];
    
    return () => { 
      unlisteners.forEach(p => p.then(fn => fn())); 
    };
  }, []);

  const loadSettings = async () => {
    try {
      const loaded = await invoke<AiProviderSettings>('get_ai_provider_settings');
      setSettings(loaded);
    } catch (e) {
      console.error('Failed to load AI settings:', e);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await invoke('save_ai_provider_settings', { settings });
      // Notify other components that AI settings changed
      emit('ai-settings-changed');
      setIsOpen(false);
    } catch (e) {
      console.error('Failed to save AI settings:', e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    const apiKey = settings.provider === 'claude' ? settings.claude_api_key : settings.openai_api_key;
    if (!apiKey) {
      setTestResult({ success: false, message: isGerman ? 'Kein API-Schlüssel eingegeben' : 'No API key entered' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    try {
      const success = await invoke<boolean>('test_ai_provider_connection', {
        provider: settings.provider,
        apiKey,
      });
      setTestResult({
        success,
        message: success 
          ? (isGerman ? 'Verbindung erfolgreich!' : 'Connection successful!')
          : (isGerman ? 'Verbindung fehlgeschlagen' : 'Connection failed'),
      });
    } catch (e) {
      setTestResult({
        success: false,
        message: isGerman ? `Fehler: ${e}` : `Error: ${e}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={() => setIsOpen(false)}>
      <div className="modal-content ai-settings-modal" onClick={e => e.stopPropagation()}>
        <h2>{isGerman ? 'KI-Einstellungen' : 'AI Settings'}</h2>
        
        <div className="settings-section">
          <label>{isGerman ? 'KI Support' : 'AI Support'}</label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings.enabled !== false}
              onChange={e => setSettings({ ...settings, enabled: e.target.checked })}
            />
            <span>{settings.enabled !== false ? (isGerman ? 'Aktiv' : 'Enabled') : (isGerman ? 'Deaktiviert' : 'Disabled')}</span>
          </label>
        </div>

        <div className="settings-section">
          <label htmlFor="ai-provider-select">{isGerman ? 'KI-Anbieter' : 'AI Provider'}</label>
          <select
            id="ai-provider-select"
            value={settings.provider}
            onChange={e => {
              setSettings({ ...settings, provider: e.target.value });
              setTestResult(null);
            }}
          >
            <option value="local">{isGerman ? 'Lokal (Phi-3 Mini)' : 'Local (Phi-3 Mini)'}</option>
            <option value="claude">Claude (Anthropic)</option>
            <option value="openai">OpenAI (GPT)</option>
          </select>
        </div>

        {settings.provider === 'local' && (
          <div className="settings-info">
            <p>
              {isGerman 
                ? 'Die lokale KI läuft vollständig auf deinem Gerät. Keine Daten werden an externe Server gesendet.'
                : 'The local AI runs entirely on your device. No data is sent to external servers.'}
            </p>
          </div>
        )}

        {settings.provider === 'claude' && (
          <>
            <div className="settings-section">
              <label>API-Schlüssel</label>
              <input
                type="password"
                value={settings.claude_api_key || ''}
                onChange={e => setSettings({ ...settings, claude_api_key: e.target.value })}
                placeholder="sk-ant-..."
              />
              <small>
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">
                  {isGerman ? 'API-Schlüssel bei Anthropic holen' : 'Get API key from Anthropic'}
                </a>
              </small>
            </div>
            <div className="settings-section">
              <label htmlFor="claude-model-select">Modell</label>
              <select
                id="claude-model-select"
                value={settings.claude_model || 'claude-3-5-sonnet-20241022'}
                onChange={e => setSettings({ ...settings, claude_model: e.target.value })}
              >
                {CLAUDE_MODELS.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {settings.provider === 'openai' && (
          <>
            <div className="settings-section">
              <label>API-Schlüssel</label>
              <input
                type="password"
                value={settings.openai_api_key || ''}
                onChange={e => setSettings({ ...settings, openai_api_key: e.target.value })}
                placeholder="sk-..."
              />
              <small>
                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
                  {isGerman ? 'API-Schlüssel bei OpenAI holen' : 'Get API key from OpenAI'}
                </a>
              </small>
            </div>
            <div className="settings-section">
              <label htmlFor="openai-model-select">Modell</label>
              <select
                id="openai-model-select"
                value={settings.openai_model || 'gpt-4o'}
                onChange={e => setSettings({ ...settings, openai_model: e.target.value })}
              >
                {OPENAI_MODELS.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {settings.provider !== 'local' && (
          <div className="settings-section">
            <button
              className="test-button"
              onClick={handleTestConnection}
              disabled={isTesting}
            >
              {isTesting 
                ? (isGerman ? 'Teste...' : 'Testing...') 
                : (isGerman ? 'Verbindung testen' : 'Test Connection')}
            </button>
            {testResult && (
              <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
                {testResult.message}
              </div>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button className="cancel-button" onClick={() => setIsOpen(false)}>
            {isGerman ? 'Abbrechen' : 'Cancel'}
          </button>
          <button className="save-button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? (isGerman ? 'Speichern...' : 'Saving...') : (isGerman ? 'Speichern' : 'Save')}
          </button>
        </div>
      </div>

      <style>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
        }

        .ai-settings-modal {
          background: var(--bg-secondary, #1e1e1e);
          border-radius: 12px;
          padding: 24px;
          min-width: 400px;
          max-width: 500px;
          color: var(--text-primary, #fff);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        }

        .ai-settings-modal h2 {
          margin: 0 0 20px 0;
          font-size: 1.4rem;
        }

        .settings-section {
          margin-bottom: 16px;
        }

        .settings-section label {
          display: block;
          margin-bottom: 6px;
          font-size: 0.9rem;
          color: var(--text-secondary, #aaa);
        }

        .settings-section select,
        .settings-section input {
          width: 100%;
          padding: 10px 12px;
          border-radius: 6px;
          border: 1px solid var(--border-color, #444);
          background: var(--bg-tertiary, #2a2a2a);
          color: var(--text-primary, #fff);
          font-size: 1rem;
        }

        .settings-section select:focus,
        .settings-section input:focus {
          outline: none;
          border-color: var(--accent-color, #6366f1);
        }

        .settings-section small {
          display: block;
          margin-top: 6px;
          color: var(--text-secondary, #888);
        }

        .settings-section small a {
          color: var(--accent-color, #6366f1);
          text-decoration: none;
        }

        .settings-section small a:hover {
          text-decoration: underline;
        }

        .settings-info {
          background: var(--bg-tertiary, #2a2a2a);
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 16px;
        }

        .settings-info p {
          margin: 0;
          font-size: 0.9rem;
          color: var(--text-secondary, #aaa);
        }

        .test-button {
          padding: 8px 16px;
          border-radius: 6px;
          border: 1px solid var(--border-color, #444);
          background: transparent;
          color: var(--text-primary, #fff);
          cursor: pointer;
          transition: all 0.2s;
        }

        .test-button:hover:not(:disabled) {
          background: var(--bg-tertiary, #2a2a2a);
        }

        .test-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .test-result {
          margin-top: 8px;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 0.9rem;
        }

        .test-result.success {
          background: rgba(34, 197, 94, 0.2);
          color: #22c55e;
        }

        .test-result.error {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 24px;
          padding-top: 16px;
          border-top: 1px solid var(--border-color, #333);
        }

        .cancel-button,
        .save-button {
          padding: 10px 20px;
          border-radius: 6px;
          font-size: 0.95rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .cancel-button {
          background: transparent;
          border: 1px solid var(--border-color, #444);
          color: var(--text-primary, #fff);
        }

        .cancel-button:hover {
          background: var(--bg-tertiary, #2a2a2a);
        }

        .save-button {
          background: var(--accent-color, #6366f1);
          border: none;
          color: white;
        }

        .save-button:hover:not(:disabled) {
          filter: brightness(1.1);
        }

        .save-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};

export default AiSettingsModal;
