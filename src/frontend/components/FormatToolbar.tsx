import React from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  onCommand: (cmd: string) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  editorLanguage?: 'de' | 'en';
  onEditorLanguageChange?: (lang: 'de' | 'en') => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl+';

interface ButtonDef {
  cmd: string;
  label: string;
  titleKey: string;
  className?: string;
}

export const FormatToolbar: React.FC<Props> = ({ onCommand, canUndo = true, canRedo = true, editorLanguage = 'de', onEditorLanguageChange }) => {
  const { t } = useTranslation();

  const formatButtons: ButtonDef[] = [
    { cmd: 'bold', label: 'B', titleKey: 'format.bold', className: 'fmt-bold' },
    { cmd: 'italic', label: 'I', titleKey: 'format.italic', className: 'fmt-italic' },
    { cmd: 'underline', label: 'U', titleKey: 'format.underline', className: 'fmt-underline' },
    { cmd: 'strike', label: 'S', titleKey: 'format.strike', className: 'fmt-strike' },
  ];

  const historyButtons: ButtonDef[] = [
    { cmd: 'undo', label: '↶', titleKey: 'shortcuts.undo' },
    { cmd: 'redo', label: '↷', titleKey: 'shortcuts.redo' },
  ];

  const getShortcut = (cmd: string): string => {
    switch (cmd) {
      case 'bold': return `${mod}B`;
      case 'italic': return `${mod}I`;
      case 'underline': return `${mod}U`;
      case 'strike': return `${mod}⇧S`;
      case 'undo': return `${mod}Z`;
      case 'redo': return `${mod}⇧Z`;
      default: return '';
    }
  };

  return (
    <div className="format-toolbar" role="toolbar" aria-label={t('format.bold')}>
      {formatButtons.map(b => {
        const title = `${t(b.titleKey)} (${getShortcut(b.cmd)})`;
        return (
          <button
            type="button"
            key={b.cmd}
            onClick={() => onCommand(b.cmd)}
            className={`btn small-btn ${b.className || ''}`}
            title={title}
            aria-label={title}
          >
            {b.label}
          </button>
        );
      })}
      <span className="toolbar-divider" aria-hidden="true" />
      {historyButtons.map(b => {
        const title = `${t(b.titleKey)} (${getShortcut(b.cmd)})`;
        return (
          <button
            type="button"
            key={b.cmd}
            onClick={() => onCommand(b.cmd)}
            className="btn small-btn"
            title={title}
            aria-label={title}
            disabled={b.cmd === 'undo' ? !canUndo : !canRedo}
          >
            {b.label}
          </button>
        );
      })}
      
      {/* Editor Language Selector */}
      {onEditorLanguageChange && (
        <>
          <span className="toolbar-divider" aria-hidden="true" />
          <div className="editor-lang-selector" title={t('settings.editorLanguage.tooltip')}>
            <span className="editor-lang-label">📝</span>
            <select
              value={editorLanguage}
              onChange={(e) => onEditorLanguageChange(e.target.value as 'de' | 'en')}
              className="editor-lang-select"
              aria-label={t('settings.editorLanguage')}
            >
              <option value="de">🇩🇪 DE</option>
              <option value="en">🇬🇧 EN</option>
            </select>
          </div>
        </>
      )}
    </div>
  );
};
