import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ShortcutGroup {
  titleKey: string;
  shortcuts: Array<{ keys: string[]; actionKey: string }>;
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    titleKey: 'shortcuts.category.general',
    shortcuts: [
      { keys: ['⌘', 'S'], actionKey: 'shortcuts.save' },
      { keys: ['⌘', 'O'], actionKey: 'project.open' },
      { keys: ['⌘', 'N'], actionKey: 'shortcuts.newScene' },
      { keys: ['⌘', '⇧', 'N'], actionKey: 'project.new' },
    ]
  },
  {
    titleKey: 'search.title',
    shortcuts: [
      { keys: ['⌘', 'F'], actionKey: 'shortcuts.searchInScene' },
      { keys: ['⌥', 'F'], actionKey: 'search.find' },
      { keys: ['⌘', 'H'], actionKey: 'shortcuts.searchReplace' },
      { keys: ['⌘', 'G'], actionKey: 'search.next' },
      { keys: ['⌘', '⇧', 'G'], actionKey: 'search.prev' },
      { keys: ['Esc'], actionKey: 'close' },
    ]
  },
  {
    titleKey: 'shortcuts.category.formatting',
    shortcuts: [
      { keys: ['⌘', 'B'], actionKey: 'shortcuts.bold' },
      { keys: ['⌘', 'I'], actionKey: 'shortcuts.italic' },
      { keys: ['⌘', 'U'], actionKey: 'shortcuts.underline' },
      { keys: ['⌘', '⇧', 'D'], actionKey: 'shortcuts.strike' },
    ]
  },
  {
    titleKey: 'shortcuts.category.navigation',
    shortcuts: [
      { keys: ['⌘', '['], actionKey: 'shortcuts.prevScene' },
      { keys: ['⌘', ']'], actionKey: 'shortcuts.nextScene' },
      { keys: ['⌘', '⇧', '↑'], actionKey: 'shortcuts.prevChapter' },
      { keys: ['⌘', '⇧', '↓'], actionKey: 'shortcuts.nextChapter' },
    ]
  },
  {
    titleKey: 'shortcuts.category.panels',
    shortcuts: [
      { keys: ['⌘', '↵'], actionKey: 'shortcuts.focusMode' },
      { keys: ['⌘', '⇧', 'E'], actionKey: 'shortcuts.focusMode' },
      { keys: ['⌘', '\\'], actionKey: 'shortcuts.toggleSidebar' },
      { keys: ['⌘', '⇧', '/'], actionKey: 'shortcuts.togglePanel' },
      { keys: ['Esc'], actionKey: 'close' },
    ]
  },
];

// Für Windows/Linux: Ersetze ⌘ durch Ctrl, ⌥ durch Alt
const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

function convertKeys(keys: string[]): string[] {
  if (isMac) return keys;
  return keys.map(k => {
    if (k === '⌘') return 'Ctrl';
    if (k === '⌥') return 'Alt';
    if (k === '⇧') return 'Shift';
    return k;
  });
}

export const ShortcutsHelp: React.FC = () => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<number | null>(0);

  return (
    <div className="shortcuts-help">
      <div className="panel-title">{t('shortcuts.title')}</div>
      
      {SHORTCUT_GROUPS.map((group, idx) => (
        <div key={idx} className="shortcuts-group">
          <button 
            className={`shortcuts-group-header ${expanded === idx ? 'expanded' : ''}`}
            onClick={() => setExpanded(expanded === idx ? null : idx)}
          >
            {t(group.titleKey)}
            <span className="expand-icon">{expanded === idx ? '▼' : '▶'}</span>
          </button>
          
          {expanded === idx && (
            <div className="shortcuts-list">
              {group.shortcuts.map((shortcut, sIdx) => (
                <div key={sIdx} className="shortcut-row">
                  <span className="shortcut-action">{t(shortcut.actionKey)}</span>
                  <span className="shortcut-keys">
                    {convertKeys(shortcut.keys).map((key, kIdx) => (
                      <kbd key={kIdx}>{key}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ShortcutsHelp;
