import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { findSynonyms } from '../thesaurusService';

export interface WordInfo {
  word: string;
  from: number;
  to: number;
  x: number;
  y: number;
}

interface Props {
  wordInfo: WordInfo | null;
  onReplace: (oldWord: string, newWord: string, from: number, to: number) => void;
  onDismiss: () => void;
}

/**
 * Synonym-Tooltip zeigt automatisch Vorschläge für das aktive Wort an.
 * Erscheint dezent unter dem Cursor, wenn Synonyme verfügbar sind.
 * 
 * Verwendet OpenThesaurus (DE) und MyThes (EN) für umfangreiche Synonyme.
 */
export const SynonymTooltip: React.FC<Props> = ({ wordInfo, onReplace, onDismiss }) => {
  const { t, i18n } = useTranslation();
  const tooltipRef = useRef<HTMLDivElement>(null);
  const lang = i18n.language === 'de' ? 'de' : 'en';
  const [synonyms, setSynonyms] = useState<string[]>([]);
  
  // Synonyme laden wenn sich das Wort ändert
  useEffect(() => {
    if (!wordInfo) {
      setSynonyms([]);
      return;
    }
    
    findSynonyms(wordInfo.word, lang).then((results) => {
      setSynonyms(results.slice(0, 8)); // Max 8 im Tooltip
    });
  }, [wordInfo?.word, lang]);
  
  // Klick außerhalb schließt Tooltip
  useEffect(() => {
    if (!wordInfo || synonyms.length === 0) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismiss();
      }
    };
    
    // Mit kleiner Verzögerung, damit der Klick nicht sofort schließt
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }, 100);
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [wordInfo, synonyms.length, onDismiss]);

  // Synonym auswählen
  const handleSelect = (synonym: string) => {
    if (!wordInfo) return;
    onReplace(wordInfo.word, synonym, wordInfo.from, wordInfo.to);
    onDismiss();
  };

  // Position berechnen (sicherstellen dass sichtbar im Viewport)
  // Berücksichtige das OperatorPanel (rechte Sidebar, ca. 320px)
  const tooltipWidth = 280;
  const tooltipHeight = 200;
  const rightPanelWidth = 340; // OperatorPanel + etwas Puffer
  
  const maxX = window.innerWidth - rightPanelWidth - tooltipWidth;
  const maxY = window.innerHeight - tooltipHeight;
  
  const x = wordInfo ? Math.max(10, Math.min(wordInfo.x, maxX)) : 0;
  const y = wordInfo ? Math.max(10, Math.min(wordInfo.y + 20, maxY)) : 0;

  useLayoutEffect(() => {
    if (!wordInfo || !tooltipRef.current) return;
    tooltipRef.current.style.position = 'fixed';
    tooltipRef.current.style.left = `${x}px`;
    tooltipRef.current.style.top = `${y}px`;
    tooltipRef.current.style.zIndex = '1000';
    tooltipRef.current.style.maxWidth = `${tooltipWidth}px`;
  }, [wordInfo, x, y, tooltipWidth]);

  if (!wordInfo || synonyms.length === 0) return null;

  return (
    <div
      ref={tooltipRef}
      className="synonym-tooltip"
    >
      <div className="synonym-tooltip-header">
        <span className="synonym-word">{wordInfo.word}</span>
        <span className="synonym-label">{t('thesaurus.synonymsFor')}</span>
      </div>
      <div className="synonym-tooltip-list">
        {synonyms.slice(0, 6).map((syn, i) => (
          <button
            key={i}
            className="synonym-option"
            onClick={() => handleSelect(syn)}
            title={t('thesaurus.replaceWith', { word: syn })}
          >
            {syn}
          </button>
        ))}
      </div>
    </div>
  );
};

export default SynonymTooltip;
