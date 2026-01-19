import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/tauri';
import { toast } from 'sonner';

export interface LanguageToolSettings {
  enabled: boolean;
  apiKey: string;
  username: string;
  language: string;
}

interface LanguageToolSettingsProps {
  settings: LanguageToolSettings;
  onChange: (settings: LanguageToolSettings) => void;
}

const LANGUAGES = [
  { code: 'de-DE', label: 'Deutsch (Deutschland)' },
  { code: 'de-AT', label: 'Deutsch (Österreich)' },
  { code: 'de-CH', label: 'Deutsch (Schweiz)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt-PT', label: 'Português' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'pl', label: 'Polski' },
];

export const LanguageToolSettings: React.FC<LanguageToolSettingsProps> = ({ settings, onChange }) => {
  const { t } = useTranslation();
  const [isTesting, setIsTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const result = await invoke<boolean>('languagetool_test', {
        req: {
          language: settings.language,
          apiKey: settings.apiKey || null,
          username: settings.username || null,
        }
      });
      
      if (result) {
        setTestResult('success');
        toast.success(t('languagetool.testSuccess'));
      } else {
        setTestResult('error');
        toast.error(t('languagetool.testFail'));
      }
    } catch (err) {
      setTestResult('error');
      toast.error(`${t('languagetool.connectionError')}: ${err}`);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="lt-settings">
      <div className="lt-settings-header">
        <h4>🔍 {t('languagetool.title')}</h4>
        <span className="lt-badge">
          {settings.apiKey ? 'Premium' : 'Free'}
        </span>
      </div>
      
      <p className="lt-description">
        {t('languagetool.description')}
      </p>
      
      <label className="lt-toggle">
        <input 
          type="checkbox" 
          checked={settings.enabled}
          onChange={(e) => onChange({ ...settings, enabled: e.target.checked })}
        />
        <span>{t('languagetool.enable')}</span>
      </label>
      
      {settings.enabled && (
        <>
          <div className="lt-field">
            <label htmlFor="lt-language">{t('languagetool.language')}</label>
            <select 
              id="lt-language"
              title={t('languagetool.languageTitle')}
              value={settings.language}
              onChange={(e) => onChange({ ...settings, language: e.target.value })}
            >
              {LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code}>{lang.label}</option>
              ))}
            </select>
          </div>
          
          <div className="lt-section">
            <h5>{t('languagetool.premiumTitle')}</h5>
            <p className="lt-hint">
              <a href="https://languagetool.org/premium" target="_blank" rel="noopener noreferrer">
                {t('languagetool.premiumHint')}
              </a>
            </p>
            <ul className="lt-features">
              <li>{t('languagetool.feature1')}</li>
              <li>{t('languagetool.feature2')}</li>
              <li>{t('languagetool.feature3')}</li>
              <li>{t('languagetool.feature4')}</li>
            </ul>
            
            <div className="lt-field">
              <label>{t('languagetool.username')}</label>
              <input 
                type="email"
                placeholder={t('languagetool.emailPlaceholder')}
                value={settings.username}
                onChange={(e) => onChange({ ...settings, username: e.target.value })}
              />
            </div>
            
            <div className="lt-field">
              <label>{t('languagetool.apiKey')}</label>
              <div className="lt-input-group">
                <input 
                  type={showApiKey ? 'text' : 'password'}
                  placeholder={t('languagetool.apiKeyPlaceholder')}
                  value={settings.apiKey}
                  onChange={(e) => onChange({ ...settings, apiKey: e.target.value })}
                />
                <button 
                  className="btn btn-sm btn-ghost"
                  onClick={() => setShowApiKey(!showApiKey)}
                  type="button"
                >
                  {showApiKey ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
              <span className="lt-hint-small">
                {t('languagetool.apiKeyHint')}{' '}
                <a href="https://languagetool.org/editor/settings/api" target="_blank" rel="noopener noreferrer">
                  {t('languagetool.accountLink')}
                </a>
              </span>
            </div>
          </div>
          
          <div className="lt-test">
            <button 
              className={`btn btn-sm ${testResult === 'success' ? 'btn-success' : testResult === 'error' ? 'btn-danger' : 'btn-primary'}`}
              onClick={handleTestConnection}
              disabled={isTesting}
            >
              {isTesting ? (
                <>
                  <span className="spinner-small" /> {t('languagetool.testing')}
                </>
              ) : testResult === 'success' ? (
                t('languagetool.testOk')
              ) : testResult === 'error' ? (
                t('languagetool.testFailed')
              ) : (
                t('languagetool.test')
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default LanguageToolSettings;
