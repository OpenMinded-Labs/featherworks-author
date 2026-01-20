import React, { useEffect, useRef, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';

export interface SelectionInfo {
  text: string;
  from: number;
  to: number;
  x: number;
  y: number;
}

interface Props {
  selectionInfo: SelectionInfo | null;
  onCreateEntity: (text: string) => void;
  onSearchSynonym: (word: string) => void;
  onResearch: (text: string) => void;
  onFontaineAnalyze: (text: string, from: number, to: number) => void;
  onCopy: (text: string) => void;
  onCut: (text: string, from: number, to: number) => void;
  onPaste: () => void;
  onDelete: (from: number, to: number) => void;
  onSelectAll: () => void;
  onFormat: (format: 'bold' | 'italic' | 'underline' | 'strike') => void;
  onDismiss: () => void;
  hasClipboard?: boolean;
}

/**
 * Kontextmenü für markierten Text im Editor
 * Erscheint bei Rechtsklick auf Textauswahl
 */
export const EditorContextMenu: React.FC<Props> = ({
  selectionInfo,
  onCreateEntity,
  onSearchSynonym,
  onResearch,
  onFontaineAnalyze,
  onCopy,
  onCut,
  onPaste,
  onDelete,
  onSelectAll,
  onFormat,
  onDismiss,
  hasClipboard = false
}) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  // Klick außerhalb schließt Menü
  useEffect(() => {
    if (!selectionInfo) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismiss();
      }
    };

    // Scroll schließt auch
    const handleScroll = () => {
      onDismiss();
    };

    // Mit kleiner Verzögerung, damit der Klick nicht sofort schließt
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('scroll', handleScroll, true);
    }, 50);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [selectionInfo, onDismiss]);

  // Position berechnen (sicherstellen dass sichtbar im Viewport)
  const menuWidth = 260;
  const menuHeight = 280;
  const rightPanelWidth = 340;

  const maxX = window.innerWidth - rightPanelWidth - menuWidth;
  const maxY = window.innerHeight - menuHeight;

  const x = selectionInfo ? Math.max(10, Math.min(selectionInfo.x, maxX)) : 0;
  const y = selectionInfo ? Math.max(10, Math.min(selectionInfo.y + 5, maxY)) : 0;

  useLayoutEffect(() => {
    if (!selectionInfo || !menuRef.current) return;
    menuRef.current.style.position = 'fixed';
    menuRef.current.style.left = `${x}px`;
    menuRef.current.style.top = `${y}px`;
    menuRef.current.style.zIndex = '1100';
  }, [selectionInfo, x, y]);

  if (!selectionInfo) return null;

  const isSingleWord = !selectionInfo.text.includes(' ') && selectionInfo.text.length < 30;
  const hasSelection = selectionInfo.text.length > 0;
  const displayText = selectionInfo.text.length > 25 
    ? selectionInfo.text.slice(0, 22) + '...' 
    : selectionInfo.text;

  return (
    <div ref={menuRef} className="editor-context-menu">
      {/* Header mit selektiertem Text */}
      {hasSelection && (
        <>
          <div className="context-menu-header">
            <span className="context-menu-selection">„{displayText}"</span>
          </div>
          <div className="context-menu-divider" />
        </>
      )}

      {/* Featherworks-spezifische Aktionen */}
      {hasSelection && (
        <>
          <div className="context-menu-section">
            <button
              className="context-menu-item"
              onClick={() => {
                onCreateEntity(selectionInfo.text);
                onDismiss();
              }}
            >
              <span className="context-menu-icon">📚</span>
              <span className="context-menu-label">{t('contextMenu.createEntity')}</span>
            </button>

            {isSingleWord && (
              <button
                className="context-menu-item"
                onClick={() => {
                  onSearchSynonym(selectionInfo.text);
                  onDismiss();
                }}
              >
                <span className="context-menu-icon">📖</span>
                <span className="context-menu-label">{t('contextMenu.searchSynonym')}</span>
              </button>
            )}

            <button
              className="context-menu-item"
              onClick={() => {
                onResearch(selectionInfo.text);
                onDismiss();
              }}
            >
              <span className="context-menu-icon">🔍</span>
              <span className="context-menu-label">{t('contextMenu.research')}</span>
            </button>

            <button
              className="context-menu-item"
              onClick={() => {
                onFontaineAnalyze(selectionInfo.text, selectionInfo.from, selectionInfo.to);
                onDismiss();
              }}
            >
              <span className="context-menu-icon">🪶</span>
              <span className="context-menu-label">{t('contextMenu.fontaineAnalyze')}</span>
            </button>
          </div>

          <div className="context-menu-divider" />
        </>
      )}

      {/* Formatierung */}
      {hasSelection && (
        <>
          <div className="context-menu-section">
            <div className="context-menu-format-row">
              <button
                className="context-menu-format-btn"
                onClick={() => { onFormat('bold'); onDismiss(); }}
                title={t('contextMenu.bold')}
              >
                <strong>B</strong>
              </button>
              <button
                className="context-menu-format-btn"
                onClick={() => { onFormat('italic'); onDismiss(); }}
                title={t('contextMenu.italic')}
              >
                <em>I</em>
              </button>
              <button
                className="context-menu-format-btn"
                onClick={() => { onFormat('underline'); onDismiss(); }}
                title={t('contextMenu.underline')}
              >
                <u>U</u>
              </button>
              <button
                className="context-menu-format-btn"
                onClick={() => { onFormat('strike'); onDismiss(); }}
                title={t('contextMenu.strikethrough')}
              >
                <s>S</s>
              </button>
            </div>
          </div>

          <div className="context-menu-divider" />
        </>
      )}

      {/* Standard Bearbeiten-Aktionen */}
      <div className="context-menu-section">
        {hasSelection && (
          <>
            <button
              className="context-menu-item"
              onClick={() => {
                onCut(selectionInfo.text, selectionInfo.from, selectionInfo.to);
                onDismiss();
              }}
            >
              <span className="context-menu-icon">✂️</span>
              <span className="context-menu-label">{t('contextMenu.cut')}</span>
              <span className="context-menu-shortcut">⌘X</span>
            </button>

            <button
              className="context-menu-item"
              onClick={() => {
                onCopy(selectionInfo.text);
                onDismiss();
              }}
            >
              <span className="context-menu-icon">📋</span>
              <span className="context-menu-label">{t('contextMenu.copy')}</span>
              <span className="context-menu-shortcut">⌘C</span>
            </button>
          </>
        )}

        <button
          className="context-menu-item"
          onClick={() => {
            onPaste();
            onDismiss();
          }}
        >
          <span className="context-menu-icon">📥</span>
          <span className="context-menu-label">{t('contextMenu.paste')}</span>
          <span className="context-menu-shortcut">⌘V</span>
        </button>

        {hasSelection && (
          <button
            className="context-menu-item"
            onClick={() => {
              onDelete(selectionInfo.from, selectionInfo.to);
              onDismiss();
            }}
          >
            <span className="context-menu-icon">�️</span>
            <span className="context-menu-label">{t('contextMenu.delete')}</span>
            <span className="context-menu-shortcut">⌫</span>
          </button>
        )}
      </div>

      <div className="context-menu-divider" />

      {/* Alles auswählen */}
      <div className="context-menu-section">
        <button
          className="context-menu-item"
          onClick={() => {
            onSelectAll();
            onDismiss();
          }}
        >
          <span className="context-menu-icon">📄</span>
          <span className="context-menu-label">{t('contextMenu.selectAll')}</span>
          <span className="context-menu-shortcut">⌘A</span>
        </button>
      </div>
    </div>
  );
};

export default EditorContextMenu;
