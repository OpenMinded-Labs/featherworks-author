import * as React from 'react';
import { useTranslation } from 'react-i18next';

export interface LektoratNote {
  id: string;
  start: number;
  end: number;
  noteType: 'style' | 'grammar' | 'word_choice' | 'repetition' | 'pacing' | 'tension' | 'dialog';
  severity: 'info' | 'warning' | 'error';
  message: string;
  explanation: string;
  suggestion?: string;
  lineNumber?: number;
}

interface Props {
  notes: LektoratNote[];
  visible: boolean;
  onToggle: () => void;
  onApplySuggestion?: (note: LektoratNote) => void;
  onDismiss?: (noteId: string) => void;
  onNoteClick?: (note: LektoratNote) => void;
  activeNoteId?: string;
  editorScrollTop?: number;
  lineHeight?: number;
}

const noteTypeIcons: Record<string, string> = {
  style: '🎨',
  grammar: '📝',
  word_choice: '💬',
  repetition: '🔄',
  pacing: '⏱️',
  tension: '⚡',
  dialog: '🗣️',
};

const noteTypeLabels: Record<string, string> = {
  style: 'Stil',
  grammar: 'Grammatik',
  word_choice: 'Wortwahl',
  repetition: 'Wiederholung',
  pacing: 'Tempo',
  tension: 'Spannung',
  dialog: 'Dialog',
};

const severityColors: Record<string, string> = {
  info: 'var(--info)',
  warning: 'var(--warning)',
  error: 'var(--danger)',
};

export const LektoratSidebar: React.FC<Props> = ({
  notes,
  visible,
  onToggle,
  onApplySuggestion,
  onDismiss,
  onNoteClick,
  activeNoteId,
  editorScrollTop = 0,
  lineHeight = 24,
}) => {
  const { t } = useTranslation();
  const [filter, setFilter] = React.useState<string | null>(null);

  const filteredNotes = filter 
    ? notes.filter(n => n.noteType === filter)
    : notes;

  const groupedNotes = React.useMemo(() => {
    const groups: Record<string, LektoratNote[]> = {};
    for (const note of filteredNotes) {
      const type = note.noteType;
      if (!groups[type]) groups[type] = [];
      groups[type].push(note);
    }
    return groups;
  }, [filteredNotes]);

  const noteTypes = React.useMemo(() => {
    const types = new Set(notes.map(n => n.noteType));
    return Array.from(types);
  }, [notes]);

  if (!visible) {
    return (
      <button 
        className="lektorat-toggle-btn lektorat-toggle-collapsed"
        onClick={onToggle}
        title={t('lektorat.showNotes', 'Anmerkungen anzeigen')}
      >
        📝 <span className="lektorat-count">{notes.length}</span>
      </button>
    );
  }

  return (
    <div className="lektorat-sidebar">
      <div className="lektorat-header">
        <h3>
          <span className="lektorat-icon">📝</span>
          {t('lektorat.title', 'Lektorat')}
          <span className="lektorat-badge">{notes.length}</span>
        </h3>
        <button 
          className="lektorat-close-btn"
          onClick={onToggle}
          title={t('lektorat.hide', 'Ausblenden')}
        >
          ×
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="lektorat-filters">
        <button 
          className={`lektorat-filter-btn ${!filter ? 'active' : ''}`}
          onClick={() => setFilter(null)}
        >
          Alle ({notes.length})
        </button>
        {noteTypes.map(type => (
          <button
            key={type}
            className={`lektorat-filter-btn ${filter === type ? 'active' : ''}`}
            onClick={() => setFilter(type)}
            title={noteTypeLabels[type]}
          >
            {noteTypeIcons[type]} {notes.filter(n => n.noteType === type).length}
          </button>
        ))}
      </div>

      {/* Notes List */}
      <div className="lektorat-notes">
        {filteredNotes.length === 0 ? (
          <div className="lektorat-empty">
            <span className="lektorat-empty-icon">✨</span>
            <p>{t('lektorat.noNotes', 'Keine Anmerkungen')}</p>
          </div>
        ) : (
          filteredNotes.map(note => (
            <div 
              key={note.id}
              className={`lektorat-note lektorat-note-${note.severity} ${activeNoteId === note.id ? 'active' : ''}`}
              onClick={() => onNoteClick?.(note)}
            >
              <div className="lektorat-note-header">
                <span className="lektorat-note-type">
                  {noteTypeIcons[note.noteType]} {noteTypeLabels[note.noteType]}
                </span>
                {note.lineNumber && (
                  <span className="lektorat-note-line">Z. {note.lineNumber}</span>
                )}
              </div>
              
              <p className="lektorat-note-message">{note.message}</p>
              
              {note.explanation && (
                <p className="lektorat-note-explanation">{note.explanation}</p>
              )}
              
              {note.suggestion && (
                <div className="lektorat-note-suggestion">
                  <span className="suggestion-label">💡 Vorschlag:</span>
                  <span className="suggestion-text">{note.suggestion}</span>
                  {onApplySuggestion && (
                    <button 
                      className="btn-apply-suggestion"
                      onClick={(e) => {
                        e.stopPropagation();
                        onApplySuggestion(note);
                      }}
                    >
                      Übernehmen
                    </button>
                  )}
                </div>
              )}
              
              {onDismiss && (
                <button 
                  className="lektorat-dismiss-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismiss(note.id);
                  }}
                  title={t('lektorat.dismiss', 'Ausblenden')}
                >
                  ✕
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Summary */}
      {notes.length > 0 && (
        <div className="lektorat-summary">
          <div className="summary-item summary-error">
            <span className="summary-count">{notes.filter(n => n.severity === 'error').length}</span>
            <span className="summary-label">Fehler</span>
          </div>
          <div className="summary-item summary-warning">
            <span className="summary-count">{notes.filter(n => n.severity === 'warning').length}</span>
            <span className="summary-label">Hinweise</span>
          </div>
          <div className="summary-item summary-info">
            <span className="summary-count">{notes.filter(n => n.severity === 'info').length}</span>
            <span className="summary-label">Tipps</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default LektoratSidebar;
