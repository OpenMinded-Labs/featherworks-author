import React from 'react';
import { useTranslation } from 'react-i18next';

export type ToolId = 'info' | 'editor' | 'entities' | 'plot' | 'research' | 'proofreading' | 'thesaurus' | 'fontaine' | 'ai' | 'stats' | 'shortcuts' | 'human' | 'layout';

interface ToolConfig {
  id: ToolId;
  icon: string;
  labelKey: string;
  isImage?: boolean; // true if icon is an image path instead of emoji
}

const TOOLS: ToolConfig[] = [
  { id: 'info', icon: 'ℹ️', labelKey: 'info.project' },
  { id: 'editor', icon: '⚙️', labelKey: 'info.editor' },
  { id: 'layout', icon: '📄', labelKey: 'tools.layout' },
  { id: 'entities', icon: '🌍', labelKey: 'entities.title' },
  { id: 'plot', icon: '📈', labelKey: 'tools.plot' },
  { id: 'research', icon: '🔬', labelKey: 'tools.research' },
  { id: 'proofreading', icon: '🔍', labelKey: 'proofreading.title' },
  { id: 'thesaurus', icon: '📖', labelKey: 'tools.thesaurus' },
  { id: 'fontaine', icon: '/fontaine.png', labelKey: 'info.fontaine', isImage: true },
  { id: 'ai', icon: '🤖', labelKey: 'ai.settings.title' },
  { id: 'stats', icon: '📊', labelKey: 'info.stats' },
  { id: 'shortcuts', icon: '⌨️', labelKey: 'info.shortcuts' },
  { id: 'human', icon: '🧑‍💻', labelKey: 'humanReview.title' },
];

interface Props {
  activeTool: ToolId | null;
  pinnedTool: ToolId | null;
  onToolClick: (id: ToolId) => void;
  onToolPin: (id: ToolId | null) => void;
}

export const ToolRail: React.FC<Props> = ({ activeTool, pinnedTool, onToolClick, onToolPin }) => {
  const { t } = useTranslation();

  const handleClick = (id: ToolId) => {
    if (activeTool === id && !pinnedTool) {
      onToolClick(id);
    } else {
      onToolClick(id);
    }
  };

  const handleDoubleClick = (id: ToolId) => {
    if (pinnedTool === id) {
      onToolPin(null);
    } else {
      onToolPin(id);
    }
  };

  return (
    <div className="tool-rail">
      {TOOLS.map((tool) => {
        const isActive = activeTool === tool.id;
        const isPinned = pinnedTool === tool.id;
        return (
          <button
            key={tool.id}
            type="button"
            className={`tool-rail-item ${isActive ? 'active' : ''} ${isPinned ? 'pinned' : ''}`}
            onClick={() => handleClick(tool.id)}
            onDoubleClick={() => handleDoubleClick(tool.id)}
            title={t(tool.labelKey)}
            aria-label={t(tool.labelKey)}
          >
            <span className="tool-rail-icon">
              {tool.isImage ? (
                <img src={tool.icon} alt={t(tool.labelKey)} className="tool-rail-img" />
              ) : (
                tool.icon
              )}
            </span>
            {isPinned && <span className="tool-rail-pin">📌</span>}
          </button>
        );
      })}
      
      <div className="tool-rail-spacer" />
      
      {pinnedTool && (
        <button
          type="button"
          className="tool-rail-unpin"
          onClick={() => onToolPin(null)}
          title={t('tools.unpin')}
          aria-label={t('tools.unpin')}
        >
          📌
        </button>
      )}
    </div>
  );
};
