/**
 * ProofreadingSettingsPanel - Einstellungen für Textprüfung
 * 
 * Erlaubt Nutzern zu konfigurieren:
 * - Rechtschreibprüfung (Hunspell)
 * - Grammatik (LanguageTool)
 * - Zeichensetzung
 * - Stilprüfung
 * - Wortwiederholungen
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ProofreadingSettings,
  defaultProofreadingSettings,
  loadProofreadingSettings,
  saveProofreadingSettings,
  testLanguageToolConnection,
} from '../languageToolService';

interface Props {
  editorLanguage: 'de' | 'en';
  onSettingsChange?: (settings: ProofreadingSettings) => void;
}

// Toggle Switch Component
const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  id: string;
  label: string;
}> = ({ checked, onChange, id, label }) => (
  <label className="toggle-switch" htmlFor={id} title={label}>
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={e => onChange(e.target.checked)}
      aria-label={label}
    />
    <span className="toggle-slider" />
  </label>
);

export const ProofreadingSettingsPanel: React.FC<Props> = ({ editorLanguage, onSettingsChange }) => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<ProofreadingSettings>(defaultProofreadingSettings);
  const [ltTestStatus, setLtTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  // Load settings on mount
  useEffect(() => {
    setSettings(loadProofreadingSettings());
  }, []);

  // Save and notify on change
  const updateSetting = <K extends keyof ProofreadingSettings>(key: K, value: ProofreadingSettings[K]) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    saveProofreadingSettings(newSettings);
    onSettingsChange?.(newSettings);
  };

  // Test LanguageTool connection
  const handleTestConnection = async () => {
    setLtTestStatus('testing');
    const success = await testLanguageToolConnection(
      editorLanguage,
      settings.ltApiKey,
      settings.ltUsername
    );
    setLtTestStatus(success ? 'success' : 'error');
    setTimeout(() => setLtTestStatus('idle'), 3000);
  };

  return (
    <div className="proofreading-panel">
      {/* Main Checks Section */}
      <div className="proofreading-section">
        <h3>{t('proofreading.title')}</h3>
        
        {/* Spellcheck */}
        <div className="proofreading-option">
          <ToggleSwitch
            id="proofreading-spelling"
            label={t('proofreading.spelling')}
            checked={settings.spellcheck}
            onChange={v => updateSetting('spellcheck', v)}
          />
          <div className="proofreading-option-text">
            <div className="proofreading-option-label">{t('proofreading.spelling')}</div>
            <div className="proofreading-option-desc">{t('proofreading.spellingDesc')}</div>
          </div>
        </div>

        {/* Grammar */}
        <div className="proofreading-option">
          <ToggleSwitch
            id="proofreading-grammar"
            label={t('proofreading.grammar')}
            checked={settings.grammar}
            onChange={v => updateSetting('grammar', v)}
          />
          <div className="proofreading-option-text">
            <div className="proofreading-option-label">{t('proofreading.grammar')}</div>
            <div className="proofreading-option-desc">{t('proofreading.grammarDesc')}</div>
          </div>
        </div>

        {/* Punctuation */}
        <div className="proofreading-option">
          <ToggleSwitch
            id="proofreading-punctuation"
            label={t('proofreading.punctuation')}
            checked={settings.punctuation}
            onChange={v => updateSetting('punctuation', v)}
          />
          <div className="proofreading-option-text">
            <div className="proofreading-option-label">{t('proofreading.punctuation')}</div>
            <div className="proofreading-option-desc">{t('proofreading.punctuationDesc')}</div>
          </div>
        </div>

        {/* Style */}
        <div className="proofreading-option">
          <ToggleSwitch
            id="proofreading-style"
            label={t('proofreading.style')}
            checked={settings.style}
            onChange={v => updateSetting('style', v)}
          />
          <div className="proofreading-option-text">
            <div className="proofreading-option-label">{t('proofreading.style')}</div>
            <div className="proofreading-option-desc">{t('proofreading.styleDesc')}</div>
          </div>
        </div>
      </div>

      {/* Word Repetitions Section */}
      <div className="proofreading-section">
        <h3>{t('proofreading.repetitions')}</h3>
        
        <div className="proofreading-option">
          <ToggleSwitch
            id="proofreading-repetitions"
            label={t('proofreading.repetitions')}
            checked={settings.wordRepetition}
            onChange={v => updateSetting('wordRepetition', v)}
          />
          <div className="proofreading-option-text">
            <div className="proofreading-option-label">{t('proofreading.repetitions')}</div>
            <div className="proofreading-option-desc">{t('proofreading.repetitionsDesc')}</div>
          </div>
        </div>

        {settings.wordRepetition && (
          <div className="proofreading-subsettings">
            <div className="proofreading-subfield">
              <label htmlFor="rep-min-length">{t('proofreading.repetitionMinLength')}</label>
              <input
                type="number"
                id="rep-min-length"
                min={2}
                max={10}
                value={settings.wordRepetitionMinLength || 4}
                onChange={e => updateSetting('wordRepetitionMinLength', Number(e.target.value))}
              />
              <span className="proofreading-subfield-unit">{t('proofreading.characters')}</span>
            </div>
            <div className="proofreading-subfield">
              <label htmlFor="rep-window">{t('proofreading.repetitionWindow')}</label>
              <input
                type="number"
                id="rep-window"
                min={10}
                max={200}
                step={5}
                value={settings.wordRepetitionDistance}
                onChange={e => updateSetting('wordRepetitionDistance', Number(e.target.value))}
              />
              <span className="proofreading-subfield-unit">{t('proofreading.words')}</span>
            </div>
          </div>
        )}
        
        <div className="proofreading-note">
          {t('proofreading.localOnly')}
        </div>
      </div>

      {/* LanguageTool API Section */}
      <div className="proofreading-section">
        <h3>{t('proofreading.languageTool')}</h3>
        <p className="proofreading-option-desc proofreading-section-intro">
          {t('proofreading.languageToolDesc')}
        </p>
        
        <div className="proofreading-input-group">
          <label htmlFor="lt-username">{t('proofreading.username')}</label>
          <input
            type="text"
            id="lt-username"
            placeholder="email@example.com"
            value={settings.ltUsername || ''}
            onChange={e => updateSetting('ltUsername', e.target.value || undefined)}
          />
          <span className="proofreading-input-hint">{t('proofreading.usernameDesc')}</span>
        </div>

        <div className="proofreading-input-group">
          <label htmlFor="lt-apikey">{t('proofreading.apiKey')}</label>
          <input
            type="password"
            id="lt-apikey"
            placeholder="••••••••"
            value={settings.ltApiKey || ''}
            onChange={e => updateSetting('ltApiKey', e.target.value || undefined)}
          />
          <span className="proofreading-input-hint">{t('proofreading.apiKeyDesc')}</span>
        </div>

        <button
          className={`proofreading-test-btn ${ltTestStatus !== 'idle' ? ltTestStatus : ''}`}
          onClick={handleTestConnection}
          disabled={ltTestStatus === 'testing'}
        >
          {ltTestStatus === 'testing' && '⏳ '}
          {ltTestStatus === 'success' && '✅ '}
          {ltTestStatus === 'error' && '❌ '}
          {ltTestStatus === 'idle' && '🔗 '}
          {ltTestStatus === 'testing' 
            ? t('proofreading.testing')
            : ltTestStatus === 'success'
            ? t('proofreading.connectionSuccess')
            : ltTestStatus === 'error'
            ? t('proofreading.connectionError')
            : t('proofreading.testConnection')
          }
        </button>
      </div>
    </div>
  );
};

export default ProofreadingSettingsPanel;
