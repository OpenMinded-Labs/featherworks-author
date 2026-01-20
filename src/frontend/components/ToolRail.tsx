import React from 'react';
import { useTranslation } from 'react-i18next';

export type ToolId = 'info' | 'editor' | 'entities' | 'plot' | 'research' | 'proofreading' | 'thesaurus' | 'fontaine' | 'stats' | 'shortcuts' | 'human' | 'layout';

// Tools that REQUIRE AI to be available (completely unusable without it)
// Note: 'entities' is NOT here - it works without AI, just hides AI extraction features
const AI_DEPENDENT_TOOLS: ToolId[] = ['fontaine'];

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
  { id: 'stats', icon: '📊', labelKey: 'info.stats' },
  { id: 'shortcuts', icon: '⌨️', labelKey: 'info.shortcuts' },
  { id: 'human', icon: '🧑‍💻', labelKey: 'humanReview.title' },
];

interface Props {
  activeTool: ToolId | null;
  pinnedTool: ToolId | null;
  onToolClick: (id: ToolId) => void;
  onToolPin: (id: ToolId | null) => void;
  /** True if AI is completely unavailable (disabled by user OR no model downloaded) */
  aiUnavailable?: boolean;
}

export const ToolRail: React.FC<Props> = ({ activeTool, pinnedTool, onToolClick, onToolPin, aiUnavailable = false }) => {
  const { t } = useTranslation();

  const handleClick = (id: ToolId) => {
    // Don't allow clicking AI tools if AI is unavailable
    if (aiUnavailable && AI_DEPENDENT_TOOLS.includes(id)) {
      return;
    }
    if (activeTool === id && !pinnedTool) {
      onToolClick(id);
    } else {
      onToolClick(id);
    }
  };

  const handleDoubleClick = (id: ToolId) => {
    // Don't allow pinning AI tools if AI is unavailable
    if (aiUnavailable && AI_DEPENDENT_TOOLS.includes(id)) {
      return;
    }
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
        const isAiTool = AI_DEPENDENT_TOOLS.includes(tool.id);
        const isDisabled = aiUnavailable && isAiTool;
        
        const tooltipText = isDisabled 
          ? t('tools.aiUnavailable', 'KI nicht verfügbar – Modell herunterladen oder aktivieren')
          : t(tool.labelKey);
        
        return (
          <button
            key={tool.id}
            type="button"
            className={`tool-rail-item ${isActive ? 'active' : ''} ${isPinned ? 'pinned' : ''} ${isDisabled ? 'disabled' : ''}`}
            onClick={() => handleClick(tool.id)}
            onDoubleClick={() => handleDoubleClick(tool.id)}
            title={tooltipText}
            aria-label={tooltipText}
            disabled={isDisabled}
          >
            <span className="tool-rail-icon">
              {tool.isImage ? (
                <img src={tool.icon} alt={t(tool.labelKey)} className={`tool-rail-img ${isDisabled ? 'grayscale' : ''}`} />
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
