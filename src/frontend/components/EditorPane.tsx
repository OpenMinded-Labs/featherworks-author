import React, { useRef, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Local EditorSettings type to avoid circular import
export interface EditorSettingsLocal { font_family: string; font_size: number; line_height: number; editor_language?: 'de' | 'en'; }
import { CodeMirrorEditor, ProofreadingErrorInfo } from './CodeMirrorEditor';
import { SynonymTooltip, WordInfo } from './SynonymTooltip';
import { SpellcheckTooltip, SpellErrorInfo } from './SpellcheckTooltip';
import { ProofreadingTooltip } from './ProofreadingTooltip';
import { EntityTooltip, EntityTooltipInfo } from './EntityTooltip';

export const EditorPane: React.FC<{
  content: string;
  wordCount: number;
  settings: EditorSettingsLocal | null;
  isDirty: boolean;
  onContentChange: (newContent: string) => void;
  findQuery: string | undefined;
  regex: boolean;
  onSearchApiReady: (api: any) => void;
  onCommandApiReady: (runner: (cmd: string) => void) => void;
  onScroll?: (scrollTop: number) => void;
  lektoratHighlight?: { from: number; to: number; id?: string } | null;
  commentApi$?: (api:{ getSelection: () => { from:number; to:number; text:string } | null })=>void;
}> = ({ content, wordCount, settings, isDirty, onContentChange, findQuery, regex, onSearchApiReady, onCommandApiReady, onScroll, lektoratHighlight, commentApi$ }) => {
  const { t } = useTranslation();
  const [synonymWordInfo, setSynonymWordInfo] = useState<WordInfo | null>(null);
  const [spellErrorInfo, setSpellErrorInfo] = useState<SpellErrorInfo | null>(null);
  const [proofreadingErrorInfo, setProofreadingErrorInfo] = useState<ProofreadingErrorInfo | null>(null);
  const [entityTooltipInfo, setEntityTooltipInfo] = useState<EntityTooltipInfo | null>(null);
  const [, forceUpdate] = useState(0);
  
  // Handler für Wort-Ersetzung durch Synonym
  const handleSynonymReplace = useCallback((oldWord: string, newWord: string, from: number, to: number) => {
    const newContent = content.slice(0, from) + newWord + content.slice(to);
    onContentChange(newContent);
  }, [content, onContentChange]);
  
  // Callback wenn Editor eine Synonym-Anfrage hat
  const handleSynonymRequest = useCallback((wordInfo: WordInfo | null) => {
    setSynonymWordInfo(wordInfo);
  }, []);
  
  // Callback wenn Editor einen Rechtschreibfehler-Klick hat
  const handleSpellErrorClick = useCallback((errorInfo: SpellErrorInfo | null) => {
    setSpellErrorInfo(errorInfo);
  }, []);
  
  // Callback wenn Editor einen Grammatik/Stil/Wiederholungs-Fehler-Klick hat
  const handleProofreadingErrorClick = useCallback((errorInfo: ProofreadingErrorInfo | null) => {
    setProofreadingErrorInfo(errorInfo);
  }, []);
  
  // Callback wenn Editor über Entity hovert
  const handleEntityHover = useCallback((info: EntityTooltipInfo | null) => {
    setEntityTooltipInfo(info);
  }, []);
  
  // Handler wenn Wort zum Wörterbuch hinzugefügt wurde
  const handleAddToDictionary = useCallback((word: string) => {
    forceUpdate(n => n + 1);
  }, []);
  
  // Handler für Rechtschreib-Korrektur
  const handleSpellReplace = useCallback((from: number, to: number, newWord: string) => {
    const newContent = content.slice(0, from) + newWord + content.slice(to);
    onContentChange(newContent);
  }, [content, onContentChange]);
  
  // Handler für Proofreading-Korrektur (Grammatik, Stil, etc.)
  const handleProofreadingReplace = useCallback((from: number, to: number, newWord: string) => {
    const newContent = content.slice(0, from) + newWord + content.slice(to);
    onContentChange(newContent);
  }, [content, onContentChange]);


  if (!settings) return <div className="editor-placeholder">{t('editor.loading')}</div>;
  return (
    <div className="editor-wrapper editor-wrapper-font" data-editor-font={settings.font_family}>
      <CodeMirrorEditor
        value={content}
        onChange={onContentChange}
        command$={onCommandApiReady}
        findQuery={findQuery}
        regex={regex}
        searchApi$={onSearchApiReady}
  commentApi$={commentApi$}
        onSynonymRequest={handleSynonymRequest}
        onSpellErrorClick={handleSpellErrorClick}
        onProofreadingErrorClick={handleProofreadingErrorClick}
        onEntityHover={handleEntityHover}
        entityHighlightEnabled={true}
        editorLanguage={settings.editor_language || 'de'}
        onScroll={onScroll}
        lektoratHighlight={lektoratHighlight}
      />
      <SynonymTooltip 
        wordInfo={synonymWordInfo}
        onReplace={handleSynonymReplace}
        onDismiss={() => setSynonymWordInfo(null)}
      />
      <SpellcheckTooltip
        errorInfo={spellErrorInfo}
        onAddToDictionary={handleAddToDictionary}
        onReplace={handleSpellReplace}
        onDismiss={() => setSpellErrorInfo(null)}
      />
      <ProofreadingTooltip
        errorInfo={proofreadingErrorInfo}
        onReplace={handleProofreadingReplace}
        onDismiss={() => setProofreadingErrorInfo(null)}
      />
      <EntityTooltip
        info={entityTooltipInfo}
        onClose={() => setEntityTooltipInfo(null)}
      />
      <div className="editor-statusbar">
        <span>{t('status.words')}: {wordCount}</span>
        {isDirty && <span className="dirty-indicator"> ({t('status.saving')})</span>}
      </div>
    </div>
  );
};
