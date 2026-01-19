import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/tauri';

interface Props { 
  model: string | null; 
  onModelChange: (m: string) => void; 
  canInsert: boolean; 
  onInsertMode: (mode: string) => void; 
  lastAiText: string | null; 
  applyInsert: (mode: string) => void; 
}

export const OperatorPanel: React.FC<Props> = ({ 
  model, 
  onModelChange, 
  canInsert, 
  onInsertMode, 
  lastAiText, 
  applyInsert 
}) => {
  const { t } = useTranslation();
  const [models, setModels] = useState<string[]>(['local-draft']);
  const [state, setState] = useState('notLoaded');
  const [progress, setProgress] = useState(0);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(512);

  useEffect(() => {
    let isMounted = true;
    
    invoke<string[]>('list_ai_models').then(list => {
      if (isMounted && Array.isArray(list) && list.length) setModels(list);
    }).catch(() => {});
    
    // load persisted ai settings
    invoke<any>('get_ai_settings').then(s => {
      if (isMounted && s) {
        if (typeof s.temperature === 'number') setTemperature(s.temperature);
        if (typeof s.max_tokens === 'number') setMaxTokens(s.max_tokens);
        if (s.model_id) { onModelChange(s.model_id); }
      }
    }).catch(() => {});
    
    // Reduzierte Polling-Frequenz (3s statt 1.2s) und nur wenn Panel sichtbar
    const iv = setInterval(() => {
      if (!isMounted) return;
      invoke<{ state: string }>('get_ai_model_state').then(s => {
        if (isMounted) setState(s.state);
      }).catch(() => {});
      invoke<{ progress: number }>('get_ai_model_progress').then(p => {
        if (isMounted) setProgress(p.progress);
      }).catch(() => {});
    }, 3000);
    
    return () => {
      isMounted = false;
      clearInterval(iv);
    };
  }, []);

  // persist changes (debounced naive)
  useEffect(() => {
    const h = setTimeout(() => {
      invoke('save_ai_settings_cmd', { 
        settings: { model_id: model, temperature, max_tokens: maxTokens } 
      }).catch(() => {});
    }, 400);
    return () => clearTimeout(h);
  }, [model, temperature, maxTokens]);

  const loadSelected = () => { 
    if (!model) return; 
    invoke('load_ai_model', { name: model }).catch(() => {}); 
  };

  const getStateIcon = () => {
    switch (state) {
      case 'ready': return '🟢';
      case 'loading': return '🔄';
      case 'error': return '🔴';
      default: return '⚪';
    }
  };

  const insertModes = [
    { id: 'cursor', icon: '📍', label: t('operator.modes.cursor') },
    { id: 'replace-selection', icon: '🔄', label: t('operator.modes.replace') },
    { id: 'new-scene', icon: '📄', label: t('operator.modes.newScene') },
    { id: 'append-end', icon: '➕', label: t('operator.modes.append') },
  ];

  return (
    <div className="operator-panel">
      {/* Model Selection Section */}
      <section className="operator-section">
        <h3 className="operator-section-title">
          <span className="operator-icon">🤖</span>
          {t('operator.title')}
        </h3>
        
        <div className="operator-field">
          <label className="operator-label">{t('operator.model')}</label>
          <select 
            className="operator-select"
            aria-label={t('operator.selectModel')} 
            value={model || ''} 
            onChange={e => { 
              onModelChange(e.target.value); 
              invoke('set_ai_model', { name: e.target.value }).catch(() => {}); 
            }}
          >
            <option value="">{t('operator.auto')}</option>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className="operator-status">
          <span className="operator-status-icon">{getStateIcon()}</span>
          <span className="operator-status-text">
            {t('operator.status')}: <strong>{state}</strong>
          </span>
        </div>

        {state === 'loading' && (
          <div className="operator-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                ref={el => { if (el) el.style.width = `${Math.round(progress * 100)}%`; }}
              />
            </div>
            <span className="operator-progress-text">{Math.round(progress * 100)}%</span>
          </div>
        )}

        <button 
          type="button" 
          className="btn btn-primary operator-load-btn" 
          disabled={!model || state === 'loading'} 
          onClick={loadSelected}
        >
          {state === 'loading' ? t('operator.loading') : t('operator.loadModel')}
        </button>
      </section>

      {/* Parameters Section */}
      <section className="operator-section">
        <h4 className="operator-section-subtitle">
          <span className="operator-icon">⚙️</span>
          {t('operator.parameters')}
        </h4>
        
        <div className="operator-field">
          <div className="operator-slider-header">
            <label className="operator-label">{t('operator.temperature')}</label>
            <span className="operator-value">{temperature.toFixed(2)}</span>
          </div>
          <input 
            className="operator-slider"
            aria-label={t('operator.temperature')} 
            title={t('operator.temperature')} 
            type="range" 
            min={0} 
            max={1} 
            step={0.01} 
            value={temperature} 
            onChange={e => setTemperature(parseFloat(e.target.value))} 
          />
          <div className="operator-slider-labels">
            <span>{t('operator.precise')}</span>
            <span>{t('operator.creative')}</span>
          </div>
        </div>
        
        <div className="operator-field">
          <label className="operator-label">{t('operator.maxTokens')}</label>
          <input 
            className="operator-input"
            aria-label={t('operator.maxTokens')} 
            title={t('operator.maxTokens')} 
            type="number" 
            min={16} 
            max={8192} 
            value={maxTokens} 
            onChange={e => setMaxTokens(parseInt(e.target.value) || 0)} 
          />
        </div>
      </section>

      {/* Insert Mode Section */}
      <section className="operator-section">
        <h4 className="operator-section-subtitle">
          <span className="operator-icon">✍️</span>
          {t('operator.insertMode')}
        </h4>
        
        <div className="operator-insert-modes">
          {insertModes.map(m => (
            <button 
              type="button" 
              key={m.id} 
              className="operator-mode-btn" 
              disabled={!canInsert} 
              onClick={() => onInsertMode(m.id)}
              title={m.label}
            >
              <span className="operator-mode-icon">{m.icon}</span>
              <span className="operator-mode-label">{m.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Last Output Section */}
      <section className="operator-section">
        <h4 className="operator-section-subtitle">
          <span className="operator-icon">💬</span>
          {t('operator.lastOutput')}
        </h4>
        
        <div className="operator-output">
          {lastAiText ? (
            <p className="operator-output-text">{lastAiText}</p>
          ) : (
            <p className="operator-output-empty">{t('operator.none')}</p>
          )}
        </div>
        
        <button 
          type="button" 
          className="btn btn-primary" 
          disabled={!lastAiText || !canInsert} 
          onClick={() => applyInsert('append-end')}
        >
          {t('operator.insert')}
        </button>
      </section>

      <p className="operator-note">{t('operator.note')}</p>
    </div>
  );
};
