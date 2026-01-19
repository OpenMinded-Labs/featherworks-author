import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';

interface TokenEvent { id: string; token: string; done: boolean }
interface Message { id: string; role: 'user' | 'assistant'; content: string; streaming?: boolean }

export const AiChatPanel: React.FC<{ activeSceneId: string | null; onInsert: (text: string) => void; }> = ({ activeSceneId, onInsert }) => {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [currentId, setCurrentId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    const stop = listen<TokenEvent>('ai_token', (evt) => {
      const ev = evt.payload;
      setMessages(prev => {
        const idx = prev.findIndex(m => m.id === ev.id && m.role === 'assistant');
        if (idx === -1) {
          return [...prev, { id: ev.id, role: 'assistant', content: ev.token, streaming: !ev.done }];
        } else {
          const clone = [...prev];
          const m = { ...clone[idx] };
          m.content = (m.content ? m.content + ' ' : '') + ev.token;
          m.streaming = !ev.done;
          clone[idx] = m;
          return clone;
        }
      });
      if (ev.done) { setCurrentId(null); }
    });
    return () => { stop.then(f => f()); };
  }, []);

  const send = async () => {
    if (!input.trim()) return;
    const prompt = input.trim();
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', content: prompt }]);
    setInput('');
    try {
      const id = await invoke<string>('start_ai_chat', { req: { prompt } });
      setCurrentId(id);
      setMessages(prev => [...prev, { id, role: 'assistant', content: '', streaming: true }]);
    } catch (e) { console.error(e); }
  };

  const cancel = async () => {
    if (currentId) {
      try { await invoke('cancel_ai_chat', { req: { id: currentId } }); } catch (e) { console.warn(e); }
    }
  };

  const insertLast = () => {
    const last = [...messages].reverse().find(m => m.role === 'assistant' && !m.streaming);
    if (last) { onInsert(last.content.trim()); }
  };

  return (
    <div className="flex-col-gap-8 full-height">
      <div className="panel-title">{t('aichat.title')}</div>
      <div className="panel-body">
        {messages.map(m => (
          <div key={m.id} className="mb-8">
            <div className="muted-small">
              {m.role === 'user' ? t('aichat.you') : t('aichat.assistant')}
              {m.streaming ? ' …' : ''}
            </div>
            <div>{m.content}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="row-gap-6">
        <input
          className="inline-input-flex"
          aria-label={t('aichat.inputLabel')}
          placeholder={t('aichat.placeholder')}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        {currentId ? (
          <button type="button" className="btn btn-sm" onClick={cancel}>{t('aichat.stop')}</button>
        ) : (
          <button type="button" className="btn btn-sm" onClick={send}>{t('aichat.send')}</button>
        )}
        <button
          type="button"
          className="btn btn-sm"
          disabled={!messages.some(m => m.role === 'assistant' && !m.streaming)}
          onClick={insertLast}
        >
          {t('aichat.insert')}
        </button>
      </div>
      <div className="panel-note">{t('aichat.scene')}: {activeSceneId ? activeSceneId : '—'}</div>
    </div>
  );
};
