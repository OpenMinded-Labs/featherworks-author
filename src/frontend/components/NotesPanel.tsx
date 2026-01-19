import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/tauri';

export const NotesPanel: React.FC<{ sceneId: string | null }> = ({ sceneId }) => {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'saved'>('idle');
  const saveTimer = useRef<number | null>(null);

  // Load notes when scene changes
  useEffect(() => {
    if (!sceneId) {
      setNotes('');
      setStatus('idle');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    invoke<string>('get_scene_note_cmd', { sceneId })
      .then(t => {
        if (!cancelled) {
          setNotes(t);
          setStatus('saved');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('idle');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sceneId]);

  // Debounced save
  const scheduleSave = (value: string) => {
    if (!sceneId) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setStatus('saving');
    saveTimer.current = window.setTimeout(() => {
      invoke('save_scene_note_cmd', { sceneId, content: value })
        .then(() => setStatus('saved'))
        .catch(() => setStatus('idle'));
    }, 600);
  };

  return (
    <div className="flex-col-gap-8 full-height">
      <div className="panel-header">
        <div className="panel-title">{t('notes.title')}</div>
        <small className="panel-sub">
          {status === 'loading' && t('loading')}
          {status === 'saving' && t('status.saving')}
          {status === 'saved' && t('status.saved')}
        </small>
      </div>
      <textarea
        aria-label={t('notes.sceneNotes')}
        placeholder={sceneId ? t('notes.placeholder') : t('notes.noScene')}
        disabled={!sceneId}
        value={notes}
        onChange={e => {
          const v = e.target.value;
          setNotes(v);
          scheduleSave(v);
        }}
        className="inline-input-flex"
      />
      <div className="panel-note">{t('status.saved')}</div>
    </div>
  );
};

export default NotesPanel;
