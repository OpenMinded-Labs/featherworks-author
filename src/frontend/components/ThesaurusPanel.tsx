import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { findSynonyms, getThesaurusStats, preloadGermanThesaurus } from '../thesaurusService';

interface Props {
  selectedWord: string;
  onReplace: (newWord: string) => void;
  editorLanguage?: 'de' | 'en';  // Editor language for synonyms (separate from UI)
}

/**
 * Thesaurus-Panel für das rechte OperatorPanel
 * Zeigt alle Synonyme für ein ausgewähltes Wort
 * 
 * Verwendet:
 * - OpenThesaurus (200.000+ deutsche Wörter)
 * - MyThes/LibreOffice (30.000+ englische Wörter)
 */
export const ThesaurusPanel: React.FC<Props> = ({ selectedWord, onReplace, editorLanguage }) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [synonyms, setSynonyms] = useState<string[]>([]);
  const [wordCount, setWordCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  // Use editorLanguage prop (for content) instead of i18n.language (for UI)
  const lang = editorLanguage || 'de';
  
  // Verwende entweder das selektierte Wort oder den Suchbegriff
  const activeWord = searchTerm.trim() || selectedWord;
  
  // Thesaurus vorladen beim Mount
  useEffect(() => {
    preloadGermanThesaurus();
    getThesaurusStats(lang).then(setWordCount);
  }, [lang]);
  
  // Synonyme laden wenn sich das Wort ändert
  useEffect(() => {
    if (!activeWord) {
      setSynonyms([]);
      return;
    }
    
    setLoading(true);
    findSynonyms(activeWord, lang).then((results: string[]) => {
      setSynonyms(results);
      setLoading(false);
    });
  }, [activeWord, lang]);

  return (
    <div className="thesaurus-panel">
      <div className="panel-title">� {t('thesaurus.title')}</div>
      
      {/* Suchfeld */}
      <div className="thesaurus-search">
        <input
          type="text"
          placeholder={t('thesaurus.search')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="thesaurus-input"
        />
      </div>
      
      {/* Aktuelles Wort */}
      {activeWord && (
        <div className="thesaurus-current">
          <span className="thesaurus-label">{t('thesaurus.synonymsFor')}:</span>
          <span className="thesaurus-word">{activeWord}</span>
        </div>
      )}
      
      {/* Synonyme Liste */}
      {synonyms.length > 0 ? (
        <div className="thesaurus-list">
          {synonyms.map((syn, i) => (
            <button
              key={i}
              className="thesaurus-item"
              onClick={() => onReplace(syn)}
              title={t('thesaurus.replaceWith', { word: syn })}
            >
              {syn}
            </button>
          ))}
        </div>
      ) : activeWord ? (
        <div className="thesaurus-empty">
          {loading ? '...' : t('thesaurus.noSynonyms', { word: activeWord })}
        </div>
      ) : (
        <div className="thesaurus-hint">
          <p>{t('thesaurus.selectWord')}</p>
          <p className="thesaurus-stats">{wordCount.toLocaleString()} {t('thesaurus.wordsInThesaurus')}</p>
        </div>
      )}
      
      {/* Tipp */}
      <div className="thesaurus-tip">
        💡 {t('thesaurus.tip')}
      </div>
      
      {/* Credits */}
      <div className="thesaurus-credits">
        {lang === 'de' ? (
          <a href="https://www.openthesaurus.de" target="_blank" rel="noopener noreferrer">
            {t('thesaurus.poweredBy')} OpenThesaurus.de
          </a>
        ) : (
          <span>{t('thesaurus.poweredBy')} MyThes/LibreOffice</span>
        )}
      </div>
    </div>
  );
};

export default ThesaurusPanel;
