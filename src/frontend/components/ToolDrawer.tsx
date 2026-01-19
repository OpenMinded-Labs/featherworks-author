import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ToolId } from './ToolRail';

interface Props {
  activeTool: ToolId | null;
  isPinned: boolean;
  onClose: () => void;
  onPin: () => void;
  children: React.ReactNode;
}

const TOOL_TITLES: Record<ToolId, string> = {
  info: 'info.project',
  editor: 'info.editor',
  layout: 'tools.layout',
  entities: 'entities.title',
  plot: 'tools.plot',
  research: 'tools.research',
  proofreading: 'proofreading.title',
  thesaurus: 'tools.thesaurus',
  fontaine: 'info.fontaine',
  stats: 'info.stats',
  shortcuts: 'info.shortcuts',
  human: 'humanReview.title',
};

const TOOL_ICONS: Record<ToolId, string> = {
  info: 'ℹ️',
  editor: '⚙️',
  layout: '📄',
  entities: '🌍',
  plot: '📈',
  research: '🔬',
  proofreading: '🔍',
  thesaurus: '📖',
  fontaine: '✨',
  stats: '📊',
  shortcuts: '⌨️',
  human: '🧑‍💻',
};

export const ToolDrawer: React.FC<Props> = ({ activeTool, isPinned, onClose, onPin, children }) => {
  const { t } = useTranslation();

  if (!activeTool) return null;

  const isOpen = activeTool !== null;

  return (
    <div className={`tool-drawer ${isOpen ? 'open' : ''} ${isPinned ? 'pinned' : ''}`}>
      <div className="tool-drawer-header">
        <div className="tool-drawer-title">
          <span>{TOOL_ICONS[activeTool]}</span>
          <span>{t(TOOL_TITLES[activeTool])}</span>
        </div>
        <div className="tool-drawer-actions">
          <button
            type="button"
            className={`tool-drawer-pin ${isPinned ? 'active' : ''}`}
            onClick={onPin}
            title={isPinned ? t('tools.unpin') : t('tools.pin')}
            aria-label={isPinned ? t('tools.unpin') : t('tools.pin')}
          >
            📌
          </button>
          {!isPinned && (
            <button
              type="button"
              className="tool-drawer-close"
              onClick={onClose}
              title={t('actions.close')}
              aria-label={t('actions.close')}
            >
              ✕
            </button>
          )}
        </div>
      </div>
      <div className="tool-drawer-content">
        {children}
      </div>
    </div>
  );
};
