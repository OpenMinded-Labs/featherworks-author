import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface HumanCommentItem {
  id: string;
  from: number;
  to: number;
  text: string;
  note: string;
  suggestion?: string;
  status: 'open' | 'accepted' | 'rejected';
}

interface Props {
  comments: HumanCommentItem[];
  onAdd: (note: string, suggestion?: string) => void;
  onUpdate: (id: string, patch: Partial<Pick<HumanCommentItem, 'note' | 'suggestion'>>) => void;
  onApply: (id: string) => void;
  onReject: (id: string) => void;
  onFocus: (id: string) => void;
  onPreview?: (content: string) => void;
  baseContent: string;
}

export const HumanReviewPanel: React.FC<Props> = ({ comments, onAdd, onUpdate, onApply, onReject, onFocus, baseContent }) => {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [suggestion, setSuggestion] = useState('');

  const openCount = comments.filter(c => c.status === 'open').length;
  const acceptedCount = comments.filter(c => c.status === 'accepted').length;
  const rejectedCount = comments.filter(c => c.status === 'rejected').length;

  const previewPatched = useMemo(() => {
    // Apply accepted suggestions in order of position
    const sorted = comments
      .filter(c => c.status === 'accepted' && c.suggestion)
      .sort((a, b) => a.from - b.from);
    let result = baseContent;
    let offset = 0;
    for (const c of sorted) {
      const start = c.from + offset;
      const end = c.to + offset;
      const replacement = c.suggestion ?? '';
      result = result.slice(0, start) + replacement + result.slice(end);
      offset += replacement.length - (c.to - c.from);
    }
    return result;
  }, [comments, baseContent]);

  const handleAdd = () => {
    if (!note.trim()) return;
    onAdd(note.trim(), suggestion.trim() ? suggestion.trim() : undefined);
    setNote('');
    setSuggestion('');
  };

  return (
    <div className="human-panel">
      <div className="human-panel-header">
        <div className="title">
          <span>🧑‍💻</span>
          <span>{t('humanReview.title', 'Human Review')}</span>
          <span className="count">{comments.length}</span>
        </div>
        <div className="badges">
          <span className="badge badge-open">{openCount} offen</span>
          <span className="badge badge-accepted">{acceptedCount} akzeptiert</span>
          <span className="badge badge-rejected">{rejectedCount} verworfen</span>
        </div>
      </div>

      <div className="human-panel-form">
        <label>{t('humanReview.note', 'Kommentar')}</label>
  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={t('humanReview.notePlaceholder', 'Kommentar zur Auswahl')} aria-label={t('humanReview.note', 'Kommentar')} />
        <label>{t('humanReview.suggestion', 'Vorschlag (optional)')}</label>
        <input value={suggestion} onChange={(e) => setSuggestion(e.target.value)} placeholder={t('humanReview.suggestionPlaceholder', 'Ersetze Auswahl durch...')} />
        <button className="btn add-comment-btn" onClick={handleAdd} disabled={!note.trim()}>
          ➕ {t('humanReview.add', 'Kommentar anfügen')}
        </button>
      </div>

      {comments.length === 0 && (
        <div className="human-comments-empty">
          <span>{t('humanReview.empty', 'Keine Kommentare')}</span>
          <small>{t('humanReview.emptyHint', 'Markiere Text im Editor und füge oben einen Kommentar hinzu.')}</small>
        </div>
      )}

      {comments.length > 0 && (
        <div className="human-panel-list">
          {comments.map((c) => (
            <div key={c.id} className={`human-card status-${c.status}`} onMouseEnter={() => onFocus(c.id)}>
              <div className="human-card-header">
                <span className={`status status-${c.status}`}>{c.status}</span>
                <span className="range">{c.from}–{c.to}</span>
              </div>
              <div className="human-card-text">„{c.text.slice(0, 140)}{c.text.length > 140 ? '…' : ''}“</div>
              <textarea
                className="human-card-note"
                value={c.note}
                onChange={(e) => onUpdate(c.id, { note: e.target.value })}
                rows={2}
                aria-label={t('humanReview.note', 'Kommentar')}
              />
              <input
                className="human-card-suggestion"
                value={c.suggestion || ''}
                onChange={(e) => onUpdate(c.id, { suggestion: e.target.value })}
                placeholder={t('humanReview.editSuggestion', 'Vorschlag bearbeiten')}
              />
              <div className="human-card-actions">
                <button className="btn btn-ghost" onClick={() => onFocus(c.id)}>🔍</button>
                <button className="btn btn-success" disabled={c.status !== 'open' || !c.suggestion} onClick={() => onApply(c.id)}>
                  ✓ {t('humanReview.apply', 'Übernehmen')}
                </button>
                <button className="btn btn-secondary" disabled={c.status !== 'open'} onClick={() => onReject(c.id)}>
                  ✕ {t('humanReview.reject', 'Verwerfen')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="human-panel-preview">
        <div className="preview-header">{t('humanReview.preview', 'Vorschau (akzeptierte Änderungen)')}</div>
        <textarea value={previewPatched} readOnly rows={8} />
      </div>
    </div>
  );
};

export default HumanReviewPanel;
