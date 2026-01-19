/**
 * ProofreadingTooltip - Tooltip für Grammatik, Stil, Zeichensetzung, Wortwiederholungen
 * 
 * Zeigt:
 * - Farbcodiertes Icon je nach Fehlertyp
 * - Fehlermeldung
 * - Korrekturvorschläge (falls vorhanden)
 * - Aktionen: Ersetzen, Ignorieren, Regel deaktivieren
 */

import React, { useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProofreadingErrorInfo } from './CodeMirrorEditor';

interface Props {
  errorInfo: ProofreadingErrorInfo | null;
  onReplace?: (from: number, to: number, newWord: string) => void;
  onIgnore?: (ruleId?: string) => void;
  onDismiss: () => void;
}

// Get color and icon for issue type
function getIssueStyle(type: ProofreadingErrorInfo['issueType']): { color: string; icon: string; label: string } {
  switch (type) {
    case 'spelling':
      return { color: '#dc3545', icon: '📝', label: 'Rechtschreibung' };
    case 'grammar':
      return { color: '#3182ce', icon: '📖', label: 'Grammatik' };
    case 'punctuation':
      return { color: '#2b6cb0', icon: '✏️', label: 'Zeichensetzung' };
    case 'style':
      return { color: '#d69e2e', icon: '🎨', label: 'Stil' };
    case 'typography':
      return { color: '#805ad5', icon: '🔤', label: 'Typografie' };
    case 'repetition':
      return { color: '#b83280', icon: '🔄', label: 'Wortwiederholung' };
    default:
      return { color: '#718096', icon: '❓', label: 'Sonstiges' };
  }
}

// Get localized label
function getLocalizedLabel(type: ProofreadingErrorInfo['issueType'], lang: 'de' | 'en'): string {
  if (lang === 'en') {
    switch (type) {
      case 'spelling': return 'Spelling';
      case 'grammar': return 'Grammar';
      case 'punctuation': return 'Punctuation';
      case 'style': return 'Style';
      case 'typography': return 'Typography';
      case 'repetition': return 'Word Repetition';
      default: return 'Other';
    }
  }
  // German
  switch (type) {
    case 'spelling': return 'Rechtschreibung';
    case 'grammar': return 'Grammatik';
    case 'punctuation': return 'Zeichensetzung';
    case 'style': return 'Stil';
    case 'typography': return 'Typografie';
    case 'repetition': return 'Wortwiederholung';
    default: return 'Sonstiges';
  }
}

export const ProofreadingTooltip: React.FC<Props> = ({ errorInfo, onReplace, onIgnore, onDismiss }) => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'de') as 'de' | 'en';
  
  // ESC to close
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    if (errorInfo) {
      document.addEventListener('keydown', handleKeyDown);
      // Click outside closes
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.proofreading-tooltip')) {
          onDismiss();
        }
      };
      setTimeout(() => document.addEventListener('click', handleClickOutside), 100);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [errorInfo, handleKeyDown, onDismiss]);

  if (!errorInfo) return null;

  const style = getIssueStyle(errorInfo.issueType);
  const label = getLocalizedLabel(errorInfo.issueType, lang);
  const suggestions = errorInfo.suggestions || [];

  const handleReplace = (newWord: string) => {
    if (onReplace && errorInfo) {
      onReplace(errorInfo.from, errorInfo.to, newWord);
    }
    onDismiss();
  };

  const handleIgnore = () => {
    onIgnore?.();
    onDismiss();
  };

  // Calculate position (ensure visible)
  const x = Math.min(errorInfo.x, window.innerWidth - 320);
  const y = Math.min(errorInfo.y + 20, window.innerHeight - 280);

  // CSS class for issue type coloring
  const typeClass = `proofreading-type-${errorInfo.issueType}`;

  return (
    <div 
      className={`proofreading-tooltip ${typeClass}`}
      data-pos-x={x}
      data-pos-y={y}
      ref={(el) => {
        if (el) {
          el.style.left = `${x}px`;
          el.style.top = `${y}px`;
        }
      }}
    >
      {/* Header with type icon and label */}
      <div className="proofreading-tooltip-header">
        <span className="proofreading-tooltip-icon">{style.icon}</span>
        <span className="proofreading-tooltip-label">{label}</span>
      </div>
      
      {/* Highlighted word/text */}
      <div className="proofreading-tooltip-word">
        „{errorInfo.word}"
      </div>
      
      {/* Error message */}
      {errorInfo.message && (
        <div className="proofreading-tooltip-message">
          {errorInfo.message}
        </div>
      )}
      
      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="proofreading-tooltip-suggestions">
          <div className="proofreading-tooltip-suggestions-label">
            {t('spellcheck.suggestions', 'Vorschläge')}:
          </div>
          <div className="proofreading-tooltip-suggestions-list">
            {suggestions.slice(0, 5).map((suggestion, i) => (
              <button
                key={i}
                className="proofreading-tooltip-suggestion"
                onClick={() => handleReplace(suggestion)}
                title={t('thesaurus.replaceWith', { word: suggestion })}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
      
      {/* Actions */}
      <div className="proofreading-tooltip-actions">
        <button
          className="proofreading-tooltip-action proofreading-tooltip-ignore"
          onClick={handleIgnore}
          title={t('spellcheck.ignore', 'Ignorieren')}
        >
          ✕ {t('spellcheck.ignore', 'Ignorieren')}
        </button>
      </div>
    </div>
  );
};

export default ProofreadingTooltip;
