import React, { useRef, useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// Local EditorSettings type to avoid circular import
export interface EditorSettingsLocal { 
  font_family: string; 
  font_size: number; 
  line_height: number; 
  editor_language?: 'de' | 'en'; 
  typewriter_mode?: boolean;
  typewriter_sound?: boolean;
  typewriter_volume?: number;
}
import { CodeMirrorEditor, ProofreadingErrorInfo } from './CodeMirrorEditor';
import { SynonymTooltip, WordInfo } from './SynonymTooltip';
import { SpellcheckTooltip, SpellErrorInfo } from './SpellcheckTooltip';
import { ProofreadingTooltip } from './ProofreadingTooltip';
import { EntityTooltip, EntityTooltipInfo } from './EntityTooltip';
import { EditorContextMenu, SelectionInfo } from './EditorContextMenu';
import { CreateEntityDialog } from './CreateEntityDialog';

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
  commentApi$?: (api:{
    getSelection: () => { from:number; to:number; text:string } | null;
    getFocus: () => { selectedText:string; cursorOffset:number } | null;
  })=>void;
  // Context menu callbacks
  onOpenThesaurus?: (word: string) => void;
  onResearch?: (text: string) => void;
  onFontaineAnalyze?: (text: string, from: number, to: number) => void;
  onOpenEntityTypeManager?: () => void;
}> = ({ content, wordCount, settings, isDirty, onContentChange, findQuery, regex, onSearchApiReady, onCommandApiReady, onScroll, lektoratHighlight, commentApi$, onOpenThesaurus, onResearch, onFontaineAnalyze, onOpenEntityTypeManager }) => {
  const { t } = useTranslation();
  const [synonymWordInfo, setSynonymWordInfo] = useState<WordInfo | null>(null);
  const [spellErrorInfo, setSpellErrorInfo] = useState<SpellErrorInfo | null>(null);
  const [proofreadingErrorInfo, setProofreadingErrorInfo] = useState<ProofreadingErrorInfo | null>(null);
  const [entityTooltipInfo, setEntityTooltipInfo] = useState<EntityTooltipInfo | null>(null);
  const [contextMenuInfo, setContextMenuInfo] = useState<SelectionInfo | null>(null);
  const [, forceUpdate] = useState(0);
  const commandRunnerRef = useRef<((cmd: string) => void) | null>(null);
  
  // Entity Dialog state
  const [showEntityDialog, setShowEntityDialog] = useState(false);
  const [entityDialogName, setEntityDialogName] = useState('');
  
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

  // Handler für Kontextmenü bei Textauswahl
  const handleSelectionContextMenu = useCallback((info: SelectionInfo) => {
    // Schließe andere Tooltips
    setSynonymWordInfo(null);
    setSpellErrorInfo(null);
    setProofreadingErrorInfo(null);
    setContextMenuInfo(info);
  }, []);

  // Kontextmenü-Aktionen
  const handleContextCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  const handleContextCut = useCallback((text: string, from: number, to: number) => {
    navigator.clipboard.writeText(text);
    const newContent = content.slice(0, from) + content.slice(to);
    onContentChange(newContent);
  }, [content, onContentChange]);

  const handleContextPaste = useCallback(async () => {
    // Paste wird vom Editor selbst gehandhabt via native paste
    document.execCommand('paste');
  }, []);

  const handleContextDelete = useCallback((from: number, to: number) => {
    const newContent = content.slice(0, from) + content.slice(to);
    onContentChange(newContent);
  }, [content, onContentChange]);

  const handleContextSelectAll = useCallback(() => {
    // Das muss im Editor passieren - wir senden ein Kommando
    if (commandRunnerRef.current) {
      // Fokus auf Editor setzen und alles auswählen
      document.querySelector('.cm-editor')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', metaKey: true }));
    }
  }, []);

  const handleContextFormat = useCallback((format: 'bold' | 'italic' | 'underline' | 'strike') => {
    if (commandRunnerRef.current) {
      commandRunnerRef.current(format);
    }
  }, []);

  // Speichere command runner Referenz
  const handleCommandApiReady = useCallback((runner: (cmd: string) => void) => {
    commandRunnerRef.current = runner;
    onCommandApiReady(runner);
  }, [onCommandApiReady]);


  if (!settings) return <div className="editor-placeholder">{t('editor.loading')}</div>;
  return (
    <div className="editor-wrapper editor-wrapper-font" data-editor-font={settings.font_family}>
      <CodeMirrorEditor
        value={content}
        onChange={onContentChange}
        command$={handleCommandApiReady}
        findQuery={findQuery}
        regex={regex}
        searchApi$={onSearchApiReady}
  commentApi$={commentApi$}
        onSynonymRequest={handleSynonymRequest}
        onSpellErrorClick={handleSpellErrorClick}
        onProofreadingErrorClick={handleProofreadingErrorClick}
        onEntityHover={handleEntityHover}
        onSelectionContextMenu={handleSelectionContextMenu}
        entityHighlightEnabled={true}
        editorLanguage={settings.editor_language || 'de'}
        onScroll={onScroll}
        lektoratHighlight={lektoratHighlight}
        typewriterMode={settings.typewriter_mode || false}
        typewriterSound={settings.typewriter_sound || false}
        typewriterVolume={settings.typewriter_volume ?? 50}
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
      <EditorContextMenu
        selectionInfo={contextMenuInfo}
        onCreateEntity={(text) => {
          setEntityDialogName(text);
          setShowEntityDialog(true);
        }}
        onSearchSynonym={(word) => {
          if (onOpenThesaurus) onOpenThesaurus(word);
        }}
        onResearch={(text) => {
          if (onResearch) onResearch(text);
        }}
        onFontaineAnalyze={(text, from, to) => {
          if (onFontaineAnalyze) onFontaineAnalyze(text, from, to);
        }}
        onCopy={handleContextCopy}
        onCut={handleContextCut}
        onPaste={handleContextPaste}
        onDelete={handleContextDelete}
        onSelectAll={handleContextSelectAll}
        onFormat={handleContextFormat}
        onDismiss={() => setContextMenuInfo(null)}
      />
      <CreateEntityDialog
        isOpen={showEntityDialog}
        initialName={entityDialogName}
        onClose={() => setShowEntityDialog(false)}
        onCreated={(entityId, entityName) => {
          console.log(`Entity created: ${entityName} (${entityId})`);
          // Could show a toast notification here
        }}
        onOpenTypeManager={() => {
          if (onOpenEntityTypeManager) onOpenEntityTypeManager();
        }}
      />
      <div className="editor-statusbar">
        <span>{t('status.words')}: {wordCount}</span>
        {isDirty && <span className="dirty-indicator"> ({t('status.saving')})</span>}
      </div>
    </div>
  );
};
