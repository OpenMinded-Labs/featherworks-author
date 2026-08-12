/**
 * AutoParagraphDialog - Dialog zur Vorschau und Bestätigung von automatisch gesetzten Absätzen
 * 
 * Zeigt Original vs. Vorschlag nebeneinander an.
 * User muss explizit bestätigen bevor Änderungen übernommen werden.
 * 
 * Flow:
 * 1. Wenn KI verfügbar: User wählt zwischen KI und Regelbasiert
 * 2. Wenn keine KI: Direkt regelbasiert starten
 * 3. Analyse läuft
 * 4. Ergebnis mit Diff-Vorschau
 * 5. User bestätigt oder bricht ab
 */

import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { useTranslation } from 'react-i18next';
import './AutoParagraphDialog.css';

interface AutoParagraphResult {
  originalText: string;
  suggestedText: string;
  changeCount: number;
  success: boolean;
  error: string | null;
  usedHeuristic: boolean;  // Whether heuristic was used instead of AI
}

interface AutoParagraphDialogProps {
  isOpen: boolean;
  sceneId: string;
  sceneTitle: string;
  sceneContent: string;
  onClose: () => void;
  onApply: (newContent: string) => void;
}

type DialogPhase = 'choice' | 'loading' | 'result' | 'error';

export const AutoParagraphDialog: React.FC<AutoParagraphDialogProps> = ({
  isOpen,
  sceneId,
  sceneTitle,
  sceneContent,
  onClose,
  onApply,
}) => {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<DialogPhase>('choice');
  const [result, setResult] = useState<AutoParagraphResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<'ai' | 'rules' | null>(null);

  // Check AI availability when dialog opens
  useEffect(() => {
    if (isOpen) {
      checkAiAvailability();
      setPhase('choice');
      setResult(null);
      setError(null);
      setSelectedMethod(null);
    }
  }, [isOpen]);

  const checkAiAvailability = async () => {
    try {
      // Use get_ai_model_state which is also used by OperatorPanel
      // This returns 'ready' when the model is loaded
      const stateResult = await invoke<{ state: string }>('get_ai_model_state');
      const isReady = stateResult?.state === 'ready';
      const isLoading = stateResult?.state === 'loading';
      console.log('[AutoParagraph] AI state:', stateResult?.state, 'isReady:', isReady);
      
      // If model is already ready, show AI option
      if (isReady) {
        setAiAvailable(true);
      } else if (isLoading) {
        // Model is loading - we can show the option but it will wait
        setAiAvailable(true);
      } else {
        // Model not loaded - check if it exists and can be loaded
        // We'll offer the AI option and load on-demand when selected
        setAiAvailable(true); // Always show AI option - we'll try to load if selected
      }
    } catch (err) {
      console.error('[AutoParagraph] Error checking AI state:', err);
      setAiAvailable(false);
      setSelectedMethod('rules');
    }
  };

  const ensureModelLoaded = async (): Promise<boolean> => {
    try {
      // Check current state
      const stateResult = await invoke<{ state: string }>('get_ai_model_state');
      
      if (stateResult?.state === 'ready') {
        return true;
      }
      
      if (stateResult?.state === 'loading') {
        // Wait for loading to complete (poll every 500ms, max 60 seconds)
        for (let i = 0; i < 120; i++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          const newState = await invoke<{ state: string }>('get_ai_model_state');
          if (newState?.state === 'ready') {
            return true;
          }
          if (newState?.state.startsWith('error:')) {
            console.error('[AutoParagraph] Model load error:', newState.state);
            return false;
          }
        }
        return false;
      }
      
      // Model not loaded - initiate load
      console.log('[AutoParagraph] Initiating model load...');
      await invoke('load_ai_model', { name: 'gemma-4-e2b-mlx-q6' });
      
      // Wait for loading to complete
      for (let i = 0; i < 120; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const newState = await invoke<{ state: string }>('get_ai_model_state');
        if (newState?.state === 'ready') {
          return true;
        }
        if (newState?.state.startsWith('error:')) {
          console.error('[AutoParagraph] Model load error:', newState.state);
          return false;
        }
      }
      
      return false;
    } catch (err) {
      console.error('[AutoParagraph] Error loading model:', err);
      return false;
    }
  };

  const startAnalysis = async (useHeuristic: boolean) => {
    setPhase('loading');
    setError(null);
    
    // If using AI, ensure model is loaded first
    if (!useHeuristic) {
      const modelReady = await ensureModelLoaded();
      if (!modelReady) {
        setError('KI-Modell konnte nicht geladen werden. Versuche es mit der Schnellanalyse.');
        setPhase('error');
        return;
      }
    }
    
    try {
      const response = await invoke<AutoParagraphResult>('auto_paragraph_scene', {
        req: { 
          sceneContent,
          useHeuristic
        }
      });
      
      if (response.success) {
        setResult(response);
        setPhase('result');
      } else {
        setError(response.error || 'Unbekannter Fehler');
        setPhase('error');
      }
    } catch (err) {
      console.error('[AutoParagraph] Error:', err);
      setError(String(err));
      setPhase('error');
    }
  };

  const handleMethodSelect = (method: 'ai' | 'rules') => {
    setSelectedMethod(method);
    startAnalysis(method === 'rules');
  };

  // Re-analyze with all paragraphs removed first
  const handleReanalyze = async () => {
    if (!selectedMethod) {
      // If no method selected yet, go back to choice
      setPhase('choice');
      return;
    }
    
    setPhase('loading');
    setError(null);
    
    // Remove all existing paragraph breaks (double newlines) and normalize
    const flattenedText = sceneContent
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .join(' ');
    
    const useHeuristic = selectedMethod === 'rules';
    
    // If using AI, ensure model is loaded first
    if (!useHeuristic) {
      const modelReady = await ensureModelLoaded();
      if (!modelReady) {
        setError('KI-Modell konnte nicht geladen werden. Versuche es mit der Schnellanalyse.');
        setPhase('error');
        return;
      }
    }
    
    try {
      const response = await invoke<AutoParagraphResult>('auto_paragraph_scene', {
        req: { 
          sceneContent: flattenedText,
          useHeuristic
        }
      });
      
      if (response.success) {
        // Replace the original text in result with the actual original (not flattened)
        setResult({
          ...response,
          originalText: sceneContent,
        });
        setPhase('result');
      } else {
        setError(response.error || 'Unbekannter Fehler');
        setPhase('error');
      }
    } catch (err) {
      console.error('[AutoParagraph] Error:', err);
      setError(String(err));
      setPhase('error');
    }
  };

  const handleApply = () => {
    if (result?.suggestedText) {
      onApply(result.suggestedText);
      onClose();
    }
  };

  const handleCancel = () => {
    onClose();
  };

  const handleRetry = () => {
    setPhase('choice');
    setError(null);
  };

  if (!isOpen) return null;

  // Diff-Highlighting: Markiere neue Absätze
  const highlightDiff = (original: string, suggested: string) => {
    const parts = suggested.split(/\n\n/);
    return parts.map((part, idx) => (
      <React.Fragment key={idx}>
        <span>{part}</span>
        {idx < parts.length - 1 && (
          <>
            <span className="paragraph-marker">¶</span>
            <br /><br />
          </>
        )}
      </React.Fragment>
    ));
  };

  return (
    <div className="auto-paragraph-overlay" onClick={handleCancel}>
      <div className="auto-paragraph-dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>{t('autoParagraph.title', 'Absätze automatisch setzen')}</h2>
          <p className="dialog-subtitle">
            {t('autoParagraph.sceneLabel', 'Szene')}: <strong>{sceneTitle}</strong>
          </p>
        </div>

        <div className="dialog-content">
          {/* Phase 1: Method Choice */}
          {phase === 'choice' && (
            <div className="method-choice-state">
              <p className="choice-description">
                {t('autoParagraph.chooseMethod', 'Wie möchtest du die Absätze analysieren lassen?')}
              </p>
              
              <div className="method-options">
                {/* AI Option - only if available */}
                {aiAvailable && (
                  <button 
                    className="method-option ai-option"
                    onClick={() => handleMethodSelect('ai')}
                  >
                    <span className="method-icon">🧠</span>
                    <span className="method-name">{t('autoParagraph.methodAI', 'Fontaine KI')}</span>
                    <span className="method-desc">
                      {t('autoParagraph.methodAIDesc', 'Intelligente Analyse durch lokale KI. Erkennt Kontext und Erzählstruktur.')}
                    </span>
                  </button>
                )}
                
                {/* Rules-based Option - always available */}
                <button 
                  className="method-option rules-option"
                  onClick={() => handleMethodSelect('rules')}
                >
                  <span className="method-icon">📐</span>
                  <span className="method-name">{t('autoParagraph.methodRules', 'Schnellanalyse')}</span>
                  <span className="method-desc">
                    {t('autoParagraph.methodRulesDesc', 'Regelbasierte Erkennung von Dialogen, Zeitsprüngen und Szenenwechseln.')}
                  </span>
                </button>
              </div>
              
              {!aiAvailable && aiAvailable !== null && (
                <p className="ai-unavailable-hint">
                  {t('autoParagraph.aiUnavailable', 'Tipp: Lade ein Fontaine-Modell für intelligentere Analyse.')}
                </p>
              )}
            </div>
          )}

          {/* Phase 2: Loading */}
          {phase === 'loading' && (
            <div className="loading-state">
              <div className="spinner" />
              <p>
                {selectedMethod === 'ai' 
                  ? t('autoParagraph.analyzingAI', 'Fontaine analysiert den Text...')
                  : t('autoParagraph.analyzingRules', 'Analysiere Text...')}
              </p>
            </div>
          )}

          {/* Phase 3: Error */}
          {phase === 'error' && (
            <div className="error-state">
              <p className="error-icon">⚠️</p>
              <p className="error-message">{error}</p>
              <button className="retry-button" onClick={handleRetry}>
                {t('autoParagraph.retry', 'Erneut versuchen')}
              </button>
            </div>
          )}

          {/* Phase 4: Result */}
          {phase === 'result' && result && (
            <>
              {result.changeCount === 0 ? (
                <div className="no-changes-state">
                  <p className="info-icon">✓</p>
                  <p>{t('autoParagraph.noChanges', 'Keine zusätzlichen Absätze nötig. Der Text ist bereits gut gegliedert.')}</p>
                  <p className="reanalyze-hint">
                    {t('autoParagraph.reanalyzeHint', 'Möchtest du alle Absätze entfernen und komplett neu setzen lassen?')}
                  </p>
                  <button className="reanalyze-button" onClick={handleReanalyze}>
                    🔄 {t('autoParagraph.reanalyze', 'Absätze neu berechnen')}
                  </button>
                </div>
              ) : (
                <>
                  <div className="change-summary">
                    <span className="change-count">{result.changeCount}</span>
                    <span>{t('autoParagraph.newParagraphs', 'neue Absätze vorgeschlagen')}</span>
                    <span className={`method-badge ${result.usedHeuristic ? 'rules' : 'ai'}`}>
                      {result.usedHeuristic 
                        ? t('autoParagraph.usedRules', 'Schnellanalyse')
                        : t('autoParagraph.usedAI', 'Fontaine KI')}
                    </span>
                  </div>
                  
                  <div className="diff-container">
                    <div className="diff-column original">
                      <h3>{t('autoParagraph.original', 'Original')}</h3>
                      <div className="text-preview">
                        {result.originalText}
                      </div>
                    </div>
                    
                    <div className="diff-column suggested">
                      <h3>{t('autoParagraph.suggested', 'Vorschlag')}</h3>
                      <div className="text-preview highlighted">
                        {highlightDiff(result.originalText, result.suggestedText)}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="dialog-footer">
          <button className="cancel-button" onClick={handleCancel}>
            {t('cancel', 'Abbrechen')}
          </button>
          {phase === 'result' && result && result.changeCount > 0 && (
            <button className="apply-button" onClick={handleApply}>
              {t('autoParagraph.apply', 'Übernehmen')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AutoParagraphDialog;
