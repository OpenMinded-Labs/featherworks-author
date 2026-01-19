import React, { useEffect, useCallback, useState, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getSuggestions, addToCustomDictionary } from '../spellcheckService';

export interface SpellErrorInfo {
  word: string;
  from: number;
  to: number;
  x: number;
  y: number;
  lang?: 'de' | 'en';  // Language for suggestions
}

interface Props {
  errorInfo: SpellErrorInfo | null;
  onAddToDictionary: (word: string) => void;
  onReplace?: (from: number, to: number, newWord: string) => void;
  onDismiss: () => void;
}

export const SpellcheckTooltip: React.FC<Props> = ({ errorInfo, onAddToDictionary, onReplace, onDismiss }) => {
  const { t } = useTranslation();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  
  // Korrekturvorschläge vom Backend holen
  useEffect(() => {
    if (!errorInfo) {
      setSuggestions([]);
      return;
    }
    
    setLoading(true);
    const lang = errorInfo.lang || 'de';
    getSuggestions(errorInfo.word, lang)
      .then(results => {
        setSuggestions(results);
        setLoading(false);
      })
      .catch(() => {
        setSuggestions([]);
        setLoading(false);
      });
  }, [errorInfo?.word, errorInfo?.lang]);
  
  // ESC zum Schließen
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    if (errorInfo) {
      document.addEventListener('keydown', handleKeyDown);
      // Click outside schließt
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.spellcheck-tooltip')) {
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

  // Position berechnen (sicherstellen dass sichtbar)
  const x = errorInfo ? Math.min(errorInfo.x, window.innerWidth - 280) : 0;
  const y = errorInfo ? Math.min(errorInfo.y + 20, window.innerHeight - 250) : 0;

  useLayoutEffect(() => {
    if (!errorInfo || !tooltipRef.current) return;
    tooltipRef.current.style.position = 'fixed';
    tooltipRef.current.style.left = `${x}px`;
    tooltipRef.current.style.top = `${y}px`;
    tooltipRef.current.style.zIndex = '1000';
  }, [errorInfo, x, y]);

  if (!errorInfo) return null;

  const handleAddToDictionary = () => {
    addToCustomDictionary(errorInfo.word);
    onAddToDictionary(errorInfo.word);
    onDismiss();
  };

  const handleReplace = (newWord: string) => {
    if (onReplace && errorInfo) {
      onReplace(errorInfo.from, errorInfo.to, newWord);
    }
    onDismiss();
  };

  return (
    <div 
      ref={tooltipRef}
      className="spellcheck-tooltip"
    >
      <div className="spellcheck-tooltip-header">
        <span className="spellcheck-word">„{errorInfo.word}"</span>
        <span className="spellcheck-label">{t('spellcheck.error')}</span>
      </div>
      
      {/* Korrekturvorschläge */}
      {suggestions.length > 0 && (
        <div className="spellcheck-suggestions">
          <div className="spellcheck-suggestions-label">{t('spellcheck.suggestions')}:</div>
          <div className="spellcheck-suggestions-list">
            {suggestions.map((suggestion, i) => (
              <button
                key={i}
                className="spellcheck-suggestion"
                onClick={() => handleReplace(suggestion)}
                title={t('thesaurus.replaceWith', { word: suggestion })}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
      
      <div className="spellcheck-tooltip-actions">
        <button
          className="spellcheck-action"
          onClick={handleAddToDictionary}
          title={t('spellcheck.addToDictionary')}
        >
          📖 {t('spellcheck.addToDictionary')}
        </button>
        <button
          className="spellcheck-action spellcheck-ignore"
          onClick={onDismiss}
          title={t('spellcheck.ignore')}
        >
          ✕ {t('spellcheck.ignore')}
        </button>
      </div>
    </div>
  );
};

export default SpellcheckTooltip;
