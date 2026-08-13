import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
import { open } from '@tauri-apps/api/dialog';
import { invalidateEntityCache } from '../entityHighlightService';
import { AiSettingsPanel } from './AiSettingsPanel';
import { resolveContextScope, type EditorFocus, type ContextScope } from '../contextScope';

// Types
type AiMode = 'chat' | 'lektorat' | 'agent';
type ProviderType = 'local' | 'claude' | 'openai';

interface TokenEvent { id: string; token: string; done: boolean }
interface Message { 
  id: string; 
  role: 'user' | 'assistant' | 'system'; 
  content: string; 
  streaming?: boolean;
  type?: 'text' | 'suggestion' | 'analysis' | 'entity';
  timestamp: Date;
}

interface UserProfile {
  name: string | null;
  onboarding_completed: boolean;
}

interface LektoratIssue {
  type: 'vampirverb' | 'wiederholung' | 'passiv' | 'stil' | 'grammatik' | string;
  text: string;
  suggestion?: string;
  severity?: 'info' | 'warning' | 'error' | string;
  line?: number;
  offset?: number;
  length?: number;
}

interface AiProviderSettings {
  provider: string;
  claude_api_key: string | null;
  openai_api_key: string | null;
  claude_model: string | null;
  openai_model: string | null;
  enabled?: boolean;
}

interface RagDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  addedAt: string;
}

interface ExtractedEntity {
  entity_type: string;
  name: string;
  aliases: string[];
  description: string;
  notes: string;
  confidence: number;
  occurrences: string[];
}

interface EntityType {
  id: string;
  name: string;
  name_plural: string;
  icon: string;
  default_color: string;
}
// Agent Mode Types
interface AgentConfig {
  enabled: boolean;
  auto_entities: boolean;
  auto_lektorat: boolean;
  auto_spelling: boolean;
  check_interval_secs: number;
}

interface AgentActivity {
  id: string;
  timestamp: string;
  action_type: 'entities_found' | 'entities_updated' | 'lektorat_added' | 'lektorat_updated' | 'spelling_fixed' | 'error';
  scene_id?: string;
  scene_title?: string;
  description: string;
  details?: string;
}



interface FontainePanelProps {
  activeSceneId: string | null;
  sceneContent: string;
  projectTitle?: string;
  characters?: Array<{ id: string; name: string; summary?: string }>;
  onInsert: (text: string) => void;
  onApplySuggestion?: (original: string, replacement: string) => void;
  /**
   * Current selection and cursor in the editor, used to narrow the context
   * sent to the model (see contextScope.ts). Without it the whole scene is
   * used, which is wrong for local edits like "rephrase this".
   */
  getEditorFocus?: () => EditorFocus | null;
}

/**
 * How much conversation is passed along so the backend can resolve a question
 * that names nobody ("hat er nochmal?").
 *
 * Only the tail: reaching further back would revive characters the
 * conversation moved on from, and the backend restores a single subject at
 * most. The char cap is the safety net for one very long pasted turn.
 */
const RECENT_TURNS_FOR_PRONOUNS = 6;
const RECENT_TURNS_MAX_CHARS = 2000;

// Format timestamp for chat
const formatTime = (date: Date): string => {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

function renderInlineBold(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${keyPrefix}-b-${i}`}>{part.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={`${keyPrefix}-t-${i}`}>{part}</React.Fragment>;
  });
}

function renderAssistantRichText(content: string): React.ReactNode {
  const segments: Array<{ type: 'text' | 'code'; lang?: string; content: string }> = [];
  const codeRe = /```([\w-]+)?\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = codeRe.exec(content)) !== null) {
    if (m.index > last) {
      segments.push({ type: 'text', content: content.slice(last, m.index) });
    }
    segments.push({ type: 'code', lang: m[1] || '', content: m[2] || '' });
    last = codeRe.lastIndex;
  }
  if (last < content.length) {
    segments.push({ type: 'text', content: content.slice(last) });
  }

  return (
    <>
      {segments.map((seg, sIdx) => {
        if (seg.type === 'code') {
          return (
            <pre key={`seg-${sIdx}`} className="fontaine-code-block">
              {seg.lang ? <div className="fontaine-code-lang">{seg.lang}</div> : null}
              <code>{seg.content}</code>
            </pre>
          );
        }

        const lines = seg.content.split('\n');
        const blocks: React.ReactNode[] = [];
        let i = 0;
        while (i < lines.length) {
          const line = lines[i].trimEnd();
          if (!line.trim()) {
            i += 1;
            continue;
          }

          const numbered = line.match(/^\d+\.\s+(.+)/);
          if (numbered) {
            const items: string[] = [];
            while (i < lines.length) {
              const mm = lines[i].trim().match(/^\d+\.\s+(.+)/);
              if (!mm) break;
              items.push(mm[1]);
              i += 1;
            }
            blocks.push(
              <ol key={`seg-${sIdx}-ol-${i}`} className="fontaine-md-list">
                {items.map((item, li) => (
                  <li key={`seg-${sIdx}-ol-${i}-${li}`}>{renderInlineBold(item, `ol-${sIdx}-${i}-${li}`)}</li>
                ))}
              </ol>
            );
            continue;
          }

          const bullet = line.match(/^[-*]\s+(.+)/);
          if (bullet) {
            const items: string[] = [];
            while (i < lines.length) {
              const mm = lines[i].trim().match(/^[-*]\s+(.+)/);
              if (!mm) break;
              items.push(mm[1]);
              i += 1;
            }
            blocks.push(
              <ul key={`seg-${sIdx}-ul-${i}`} className="fontaine-md-list">
                {items.map((item, li) => (
                  <li key={`seg-${sIdx}-ul-${i}-${li}`}>{renderInlineBold(item, `ul-${sIdx}-${i}-${li}`)}</li>
                ))}
              </ul>
            );
            continue;
          }

          const paraLines: string[] = [line.trim()];
          i += 1;
          while (i < lines.length && lines[i].trim() && !/^\d+\.\s+/.test(lines[i].trim()) && !/^[-*]\s+/.test(lines[i].trim())) {
            paraLines.push(lines[i].trim());
            i += 1;
          }
          const paragraph = paraLines.join(' ');
          blocks.push(
            <p key={`seg-${sIdx}-p-${i}`} className="fontaine-md-paragraph">
              {renderInlineBold(paragraph, `p-${sIdx}-${i}`)}
            </p>
          );
        }

        return <React.Fragment key={`seg-${sIdx}`}>{blocks}</React.Fragment>;
      })}
    </>
  );
}

// Prompt Templates with Phi-3 chat format
// Phi-3 expects: <|user|>\n{message}<|end|>\n<|assistant|>\n
// Bilingual: German or English based on lang parameter
const createPrompts = (lang: string) => ({
  lektorat: (text: string) => lang.startsWith('de') ? `<|system|>
Du bist ein professioneller deutschsprachiger Lektor. Deine Aufgabe ist NUR die Textanalyse.
WICHTIG: Schreibe KEINE Geschichte! Gib NUR Korrekturvorschläge als Liste.
<|end|>
<|user|>
Analysiere diesen Text auf Probleme:
- Vampirverben (war, hatte, wurde)
- Wortwiederholungen
- Passivkonstruktionen
- Stilprobleme

Text zur Analyse:
"""
${text}
"""

Gib mir eine nummerierte Liste der Probleme.<|end|>
<|assistant|>
Hier sind die gefundenen Probleme:

1.` : `<|system|>
You are a professional editor. Your task is ONLY text analysis.
IMPORTANT: Do NOT write a story! Give ONLY correction suggestions as a list.
<|end|>
<|user|>
Analyze this text for problems:
- Weak verbs (was, had, were)
- Word repetitions
- Passive constructions
- Style issues

Text to analyze:
"""
${text}
"""

Give me a numbered list of problems.<|end|>
<|assistant|>
Here are the problems found:

1.`,

  agent: (text: string, context: string) => {
    // Kein Kürzen - das Backend budgetiert den Kontext bereits.
    const shortContext = context;
    
    return lang.startsWith('de') ? `<|system|>
Du bist ein Schreibassistent. Analysiere die Szene und gib strukturiertes Feedback.
WICHTIG: Schreibe KEINE Geschichte! Gib NUR Analyse-Feedback.

BEKANNTE CHARAKTERE UND INFORMATIONEN:
${shortContext}
<|end|>
<|user|>
Analysiere diese Szene auf:
- Charakterkonsistenz (passen die Handlungen zu den bekannten Charakteren?)
- Plotlücken
- Spannungsbogen
- Pacing

Szene:
"""
${text}
"""

Gib strukturiertes Feedback.<|end|>
<|assistant|>
**Analyse:**

` : `<|system|>
You are a writing assistant. Analyze the scene and give structured feedback.
IMPORTANT: Do NOT write a story! Give ONLY analysis feedback.

KNOWN CHARACTERS AND INFORMATION:
${shortContext}
<|end|>
<|user|>
Analyze this scene for:
- Character consistency (do actions match known characters?)
- Plot holes
- Tension arc
- Pacing

Scene:
"""
${text}
"""

Give structured feedback.<|end|>
<|assistant|>
**Analysis:**

`;
  },

  chat: (question: string, context: string, userName?: string) => {
    // Kein Kürzen: Das Backend (ai/context.rs) stellt den Kontext bereits
    // budgetiert zusammen und liefert die aktuelle Szene vollständig.
    // Gemma 4 hat 128k Kontext - ein Limit hier würde die Szene abschneiden.
    const shortContext = context;
    
    return lang.startsWith('de') ? `<|system|>
Du bist Fontaine, ein freundlicher Schreibassistent für einen Roman.
Nutze den KONTEXT unten, um Fragen über Charaktere, Handlung und Szenen zu beantworten.
Beziehe dich konkret auf den Text. Schreibe KEINE Geschichten weiter, wenn nicht danach gefragt wird.

KONTEXT:
${shortContext}
<|end|>
<|user|>
${userName ? `Ich bin ${userName}. ` : ''}${question}<|end|>
<|assistant|>
` : `<|system|>
You are Fontaine, a friendly writing assistant for a novel.
Use the CONTEXT below to answer questions about characters, plot, and scenes.
Refer concretely to the text. Do NOT continue the story unless asked to.

CONTEXT:
${shortContext}
<|end|>
<|user|>
${userName ? `I am ${userName}. ` : ''}${question}<|end|>
<|assistant|>
`;
  }
});

export const FontainePanel: React.FC<FontainePanelProps> = ({ 
  activeSceneId, 
  sceneContent, 
  projectTitle,
  characters = [],
  onInsert,
  onApplySuggestion,
  getEditorFocus
}) => {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<AiMode>('chat');
  const [messages, setMessages] = useState<Message[]>([]);

  // Read inside buildContext, which is a useCallback: depending on `messages`
  // directly would rebuild it on every single token during streaming.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [input, setInput] = useState('');
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lektoratIssues, setLektoratIssues] = useState<LektoratIssue[]>([]);
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [userName, setUserName] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showModelSettings, setShowModelSettings] = useState(false); // Modal für Model-Einstellungen
  const [activeProvider, setActiveProvider] = useState<ProviderType>('local');
  const [providerSettings, setProviderSettings] = useState<AiProviderSettings | null>(null);
  const aiEnabled = providerSettings?.enabled !== false;
  const [ragDocuments, setRagDocuments] = useState<RagDocument[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [extractedEntities, setExtractedEntities] = useState<ExtractedEntity[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionSessionId, setExtractionSessionId] = useState<string | null>(null);
  const [extractionJobId, setExtractionJobId] = useState<string | null>(null);
  const [extractionProgress, setExtractionProgress] = useState<{ current: number; total: number } | null>(null);
  const [upsertJobId, setUpsertJobId] = useState<string | null>(null);
  const [upsertProgress, setUpsertProgress] = useState<{ scene?: number; totalScenes?: number; current: number; total: number } | null>(null);
  const [upsertStats, setUpsertStats] = useState<{ created: number; updated: number } | null>(null);
  const [lektoratJobId, setLektoratJobId] = useState<string | null>(null);
  const [lektoratProgress, setLektoratProgress] = useState<{ current: number; total: number } | null>(null);
  const [includeGrammar, setIncludeGrammar] = useState(false); // Checkbox: Grammatik bei Lektorat prüfen
  const [autoSaveEntities, setAutoSaveEntities] = useState(true); // Checkbox: Auto-save to Weltdatenbank
  const autoSaveEntitiesRef = useRef(true); // Ref for event handlers
  const extractionBufferRef = useRef<string>(''); // Buffer für Entity-Extraction (nicht im Chat anzeigen)
  const extractionJobIdRef = useRef<string | null>(null);
  const upsertJobIdRef = useRef<string | null>(null);
  const lektoratJobIdRef = useRef<string | null>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  
  // Agent Mode State
  const [agentConfig, setAgentConfig] = useState<AgentConfig>({
    enabled: false,
    auto_entities: true,
    auto_lektorat: true,
    auto_spelling: false,
    check_interval_secs: 30,
  });
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentActivities, setAgentActivities] = useState<AgentActivity[]>([]);

  // Keep ref in sync with state for event handlers
  useEffect(() => {
    autoSaveEntitiesRef.current = autoSaveEntities;
  }, [autoSaveEntities]);

  // Load user profile
  useEffect(() => {
    invoke<UserProfile>('get_user_profile')
      .then(profile => { 
        setUserName(profile.name);
      })
      .catch(e => console.error('Failed to load user profile', e));
  }, []);

  // NOTE: 'menu_ai_local_model' event is now handled by LocalAiDialog in main.tsx

  // Chunked Entity-Extraction Events (Progress / Done / Error)
  useEffect(() => {
    const unsubscribers: Array<Promise<() => void>> = [];

    unsubscribers.push(listen('entity_extraction_progress', (evt) => {
      const payload = evt.payload as any;
      if (payload?.job_id && payload.job_id === extractionJobIdRef.current) {
        setExtractionProgress({ current: payload.current_chunk ?? 0, total: payload.total_chunks ?? 0 });
        setIsExtracting(true);
      }
    }));

    unsubscribers.push(listen('entity_extraction_done', async (evt) => {
      const payload = evt.payload as any;
      if (payload?.job_id && payload.job_id === extractionJobIdRef.current) {
        const entities: ExtractedEntity[] = payload.entities || [];
        
        if (autoSaveEntitiesRef.current) {
          // Auto-save mode: save directly to Weltdatenbank
          await saveEntities(entities);
        } else {
          // Manual mode: show entities for review
          setExtractedEntities(entities);
          if (entities.length > 0) {
            setMessages(prev => [...prev, {
              id: crypto.randomUUID(),
              role: 'system',
              content: `✨ ${entities.length} Entitäten gefunden. Klicke "Speichern" um sie zur Weltdatenbank hinzuzufügen.`,
              timestamp: new Date()
            }]);
          } else {
            setMessages(prev => [...prev, {
              id: crypto.randomUUID(),
              role: 'system',
              content: '✓ Keine neuen Entitäten gefunden',
              timestamp: new Date()
            }]);
          }
        }
        
        setExtractionProgress(null);
        setExtractionJobId(null);
        extractionJobIdRef.current = null;
        setIsExtracting(false);
      }
    }));

    unsubscribers.push(listen('entity_extraction_error', (evt) => {
      const payload = evt.payload as any;
      if (payload?.job_id && payload.job_id === extractionJobIdRef.current) {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'system',
          content: `⚠️ Chunk ${payload.chunk || '?'}: ${payload.error}`,
          timestamp: new Date()
        }]);
      }
    }));

    return () => {
      unsubscribers.forEach(unsubPromise => unsubPromise.then(unsub => unsub()));
    };
  }, [t, entityTypes]);

  // Chunked Lektorat Events
  useEffect(() => {
    const unsubscribers: Array<Promise<() => void>> = [];

    unsubscribers.push(listen('lektorat_progress', (evt) => {
      const payload = evt.payload as any;
      if (payload?.job_id && payload.job_id === lektoratJobIdRef.current) {
        setLektoratProgress({ current: payload.current_chunk ?? 0, total: payload.total_chunks ?? 0 });
        setIsAnalyzing(true);
      }
    }));

    unsubscribers.push(listen('lektorat_done', (evt) => {
      const payload = evt.payload as any;
      if (payload?.job_id && payload.job_id === lektoratJobIdRef.current) {
        const notes: any[] = payload.notes || [];
        const mapped: LektoratIssue[] = notes.map((n: any) => ({
          type: n.type ?? 'stil',
          text: n.text || n.message || '',
          suggestion: n.suggestion,
          severity: n.severity,
          line: n.line,
          offset: n.offset,
          length: n.length,
        }));

        setLektoratIssues(mapped);

        const content = mapped.length === 0
          ? t('fontaine.lektoratNoIssues', '✓ Keine Lektoratsfunde')
          : mapped.map(n => `• [${n.type}/${n.severity || 'info'}] Zeile ${n.line ?? '?'}: ${n.text}${n.suggestion ? ` – Vorschlag: ${n.suggestion}` : ''}`).join('\n');

        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content,
          timestamp: new Date()
        }]);

        // Öffne das Lektorat-Sidepanel im Editor, damit die Funde sichtbar werden
        try {
          window.dispatchEvent(new CustomEvent('fw-open-lektorat-sidebar', { detail: { line: mapped[0]?.line } }));
        } catch (e) {
          console.warn('Unable to dispatch lektorat sidebar event', e);
        }

        setLektoratProgress(null);
        setLektoratJobId(null);
        lektoratJobIdRef.current = null;
        setIsAnalyzing(false);
      }
    }));

    unsubscribers.push(listen('lektorat_error', (evt) => {
      const payload = evt.payload as any;
      if (payload?.job_id && payload.job_id === lektoratJobIdRef.current) {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'system',
          content: `⚠️ Lektorat-Chunk ${payload.chunk || '?'}: ${payload.error}`,
          timestamp: new Date()
        }]);
      }
    }));

    return () => { unsubscribers.forEach(u => u.then(fn => fn())); };
  }, [t]);

  // Chunked Entity-Upsert Events (Szene & Manuskript)
  useEffect(() => {
    const unsubscribers: Array<Promise<() => void>> = [];

    unsubscribers.push(listen('entity_upsert_progress', (evt) => {
      const payload = evt.payload as any;
      if (!payload?.job_id || payload.job_id !== upsertJobIdRef.current) return;
      setUpsertProgress({
        scene: payload.scene,
        totalScenes: payload.total_scenes,
        current: payload.current_chunk ?? 0,
        total: payload.total_chunks ?? 0,
      });
      setIsExtracting(true);
    }));

    unsubscribers.push(listen('entity_upsert_error', (evt) => {
      const payload = evt.payload as any;
      if (!payload?.job_id || payload.job_id !== upsertJobIdRef.current) return;
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'system',
        content: `⚠️ Entity-Upsert Chunk ${payload.chunk || '?'}${payload.scene ? ` Szene ${payload.scene}` : ''}: ${payload.error}`,
        timestamp: new Date()
      }]);
    }));

    unsubscribers.push(listen('entity_upsert_done', (evt) => {
      const payload = evt.payload as any;
      if (!payload?.job_id || payload.job_id !== upsertJobIdRef.current) return;
      const created = payload.new ?? 0;
      const updated = payload.updated ?? 0;
      setUpsertStats({ created, updated });
      setUpsertProgress(null);
      setUpsertJobId(null);
      upsertJobIdRef.current = null;
      setIsExtracting(false);
      invalidateEntityCache();

      const msg = created + updated === 0
        ? t('fontaine.noEntitiesFound', '✓ Keine neuen Entitäten gefunden')
        : `✅ Entities aktualisiert: ${created} neu, ${updated} aktualisiert`;

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: msg,
        timestamp: new Date()
      }]);
    }));

    return () => { unsubscribers.forEach(u => u.then(fn => fn())); };
  }, [t]);

  // Load AI provider settings
  useEffect(() => {
    invoke<AiProviderSettings>('get_ai_provider_settings')
      .then(async settings => {
        setProviderSettings(settings);
        setActiveProvider(settings.provider as ProviderType);
        // Set backend provider state with all required data
        await invoke('set_active_ai_provider', { 
          provider: settings.provider,
          claudeApiKey: settings.claude_api_key,
          openaiApiKey: settings.openai_api_key,
          claudeModel: settings.claude_model,
          openaiModel: settings.openai_model,
        });
      })
      .catch(e => console.error('Failed to load AI provider settings', e));
  }, []);

  // Load entity types
  useEffect(() => {
    invoke<EntityType[]>('list_entity_types')
      .then(types => setEntityTypes(types))
      .catch(e => console.warn('Entity types not available:', e));
  }, []);

  // Load RAG documents for current project
  useEffect(() => {
    if (activeSceneId) {
      invoke<RagDocument[]>('list_rag_documents')
        .then(docs => setRagDocuments(docs))
        .catch(e => console.warn('RAG documents not available:', e));
    }
  }, [activeSceneId]);

  // Load Agent config and status
  useEffect(() => {
    invoke<AgentConfig>('get_agent_config')
      .then(config => setAgentConfig(config))
      .catch(e => console.warn('Agent config not available:', e));
    
    invoke<boolean>('is_agent_running')
      .then(running => setAgentRunning(running))
      .catch(() => {});
  }, []);

  // Poll agent activities when agent mode is active
  useEffect(() => {
    if (mode !== 'agent') return;
    
    const loadActivities = () => {
      invoke<AgentActivity[]>('get_agent_activities', { limit: 20 })
        .then(activities => setAgentActivities(activities))
        .catch(() => {});
      
      invoke<boolean>('is_agent_running')
        .then(running => setAgentRunning(running))
        .catch(() => {});
    };
    
    loadActivities();
    const interval = setInterval(loadActivities, 5000);
    return () => clearInterval(interval);
  }, [mode]);

  // Notify backend when scene content changes
  useEffect(() => {
    if (activeSceneId && sceneContent && agentConfig.enabled) {
      invoke('notify_scene_changed', { 
        sceneId: activeSceneId, 
        content: sceneContent 
      }).catch(() => {});
    }
  }, [activeSceneId, sceneContent, agentConfig.enabled]);

  // Close settings when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    if (showSettings) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettings]);

  // Auto-scroll
  useEffect(() => { 
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); 
  }, [messages]);

  // Check model status and auto-load if needed
  useEffect(() => {
    const checkAndLoad = async () => {
      try {
        const state = await invoke<{ state: string }>('get_ai_model_state');
        if (state.state === 'ready') {
          setModelStatus('ready');
        } else if (state.state === 'loading') {
          setModelStatus('loading');
        } else if (state.state.startsWith('error:')) {
          // Model loading failed - show error
          const errorMsg = state.state.replace('error:', '');
          setModelStatus('error');
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role: 'system',
            content: `⚠️ **Modell-Fehler:** ${errorMsg}`,
            timestamp: new Date()
          }]);
        } else {
          // Model not loaded - auto-load the default model
          setModelStatus('loading');
          console.log('[Fontaine] Auto-loading AI model...');
          try {
            await invoke('load_ai_model', { name: 'gemma-4-e2b-mlx-q6' });
            // Check again after loading
            const newState = await invoke<{ state: string }>('get_ai_model_state');
            if (newState.state === 'ready') {
              setModelStatus('ready');
            } else if (newState.state.startsWith('error:')) {
              const errorMsg = newState.state.replace('error:', '');
              setModelStatus('error');
              setMessages(prev => [...prev, {
                id: crypto.randomUUID(),
                role: 'system',
                content: `⚠️ **Modell konnte nicht geladen werden:** ${errorMsg}`,
                timestamp: new Date()
              }]);
            } else {
              setModelStatus('error');
            }
          } catch (loadErr) {
            console.error('[Fontaine] Failed to load model:', loadErr);
            setModelStatus('error');
            setMessages(prev => [...prev, {
              id: crypto.randomUUID(),
              role: 'system',
              content: `⚠️ **Modell-Ladefehler:** ${loadErr}`,
              timestamp: new Date()
            }]);
          }
        }
      } catch (e) {
        setModelStatus('error');
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'system',
          content: `⚠️ **KI-System nicht verfügbar:** ${e}`,
          timestamp: new Date()
        }]);
      }
    };
    checkAndLoad();
  }, []);

  // Listen for "fontaine-analyze" events from context menu
  // Sends an analysis request with a pre-built prompt for fast output
  useEffect(() => {
    const handleFontaineAnalyze = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { text: string; from: number; to: number } | undefined;
      if (!detail?.text) return;
      
      const { text } = detail;
      const lang = i18n.language;
      const isGerman = lang.startsWith('de');
      
      // Add user message showing what's being analyzed
      const displayText = text.length > 100 ? text.slice(0, 97) + '...' : text;
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'user',
        content: isGerman 
          ? `Analysiere diese Passage: „${displayText}"`
          : `Analyze this passage: "${displayText}"`,
        timestamp: new Date()
      }]);
      
      // Build a focused analysis prompt (short for fast response)
      const analysisPrompt = isGerman 
        ? `<|system|>
Du bist ein Schreibassistent. Gib KURZE, prägnante Analyse (max 3-4 Punkte).
<|end|>
<|user|>
Analysiere diese Passage kurz:
"""
${text}
"""

Gib mir:
1. Stimmung/Ton (1 Satz)
2. Stilistische Stärke (1 Satz)
3. Verbesserungsvorschlag (1 Satz)
<|end|>
<|assistant|>
**Kurzanalyse:**
`
        : `<|system|>
You are a writing assistant. Give SHORT, concise analysis (max 3-4 points).
<|end|>
<|user|>
Briefly analyze this passage:
"""
${text}
"""

Give me:
1. Mood/tone (1 sentence)
2. Stylistic strength (1 sentence)  
3. Improvement suggestion (1 sentence)
<|end|>
<|assistant|>
**Quick Analysis:**
`;

      setIsAnalyzing(true);
      
      try {
        // Start AI chat with pre-built prompt (uses existing streaming infrastructure)
        const id = await invoke<string>('start_ai_chat', { 
          req: { 
            prompt: analysisPrompt,
            sceneId: activeSceneId,
            mode: 'chat'
          } 
        });
        setCurrentId(id);
        setMessages(prev => [...prev, { 
          id, 
          role: 'assistant', 
          content: '', 
          streaming: true, 
          timestamp: new Date() 
        }]);
      } catch (err) {
        console.error('Fontaine analysis failed:', err);
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'system',
          content: isGerman ? '⚠️ Analyse fehlgeschlagen' : '⚠️ Analysis failed',
          timestamp: new Date()
        }]);
        setIsAnalyzing(false);
      }
    };
    
    window.addEventListener('fontaine-analyze', handleFontaineAnalyze);
    return () => window.removeEventListener('fontaine-analyze', handleFontaineAnalyze);
  }, [i18n.language, activeSceneId]);

  // Speichert Entities (Upsert) und erstellt eine Ergebnisnachricht
  const saveEntities = async (entities: ExtractedEntity[]) => {
    if (!entities || entities.length === 0) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'system',
        content: t('fontaine.noEntitiesFound', '✓ Keine neuen Entitäten gefunden'),
        timestamp: new Date()
      }]);
      return;
    }

    let newCount = 0;
    let updatedCount = 0;
    const newNames: string[] = [];
    const updatedNames: string[] = [];

    // Mapping von LLM-Outputs auf bekannte Entity-Typen
    const typeAliases: Record<string, string[]> = {
      'character': ['person', 'charakter', 'figur', 'menschen', 'mensch', 'protagonistin', 'protagonist'],
      'location': ['ort', 'place', 'platz', 'setting', 'schauplatz', 'location'],
      'item': ['objekt', 'object', 'gegenstand', 'ding', 'artefakt'],
      'organization': ['organisation', 'org', 'gruppe', 'fraktion', 'firma'],
      'event': ['ereignis', 'event', 'vorfall', 'geschehen'],
    };

    for (const entity of entities) {
      // Match by ID, name, or plural name (case-insensitive)
      // LLM may return English ("character") or German ("Charakter")
      const entityTypeLower = entity.entity_type.toLowerCase();
      
      // Zuerst: direkter Match
      let typeMatch = entityTypes.find(et =>
        et.id.toLowerCase() === entityTypeLower ||
        et.name.toLowerCase() === entityTypeLower ||
        et.name_plural.toLowerCase() === entityTypeLower
      );
      
      // Falls nicht gefunden: Alias-Mapping versuchen
      if (!typeMatch) {
        for (const [typeId, aliases] of Object.entries(typeAliases)) {
          if (aliases.includes(entityTypeLower)) {
            typeMatch = entityTypes.find(et => et.id.toLowerCase() === typeId);
            if (typeMatch) {
              console.log(`[Entity] Mapped type "${entity.entity_type}" → "${typeMatch.id}"`);
              break;
            }
          }
        }
      }
      
      // Fallback: Wenn der Typ selbst als Name verwendet wurde (z.B. "Grabsteine" als Typ)
      // versuche den Entity-Typ aus dem Kontext zu erraten
      if (!typeMatch) {
        // Wenn es wie ein Ort klingt, nimm "location"
        if (['friedhof', 'gruft', 'kirche', 'haus', 'stadt', 'dorf', 'wald', 'see', 'berg'].some(w => entityTypeLower.includes(w) || entity.name.toLowerCase().includes(w))) {
          typeMatch = entityTypes.find(et => et.id.toLowerCase() === 'location');
        }
        // Wenn es wie ein Objekt klingt
        else if (['kreuz', 'ring', 'schwert', 'buch', 'brief', 'schlüssel'].some(w => entityTypeLower.includes(w) || entity.name.toLowerCase().includes(w))) {
          typeMatch = entityTypes.find(et => et.id.toLowerCase() === 'item');
        }
        // Default: Character (für Personen)
        else {
          typeMatch = entityTypes.find(et => et.id.toLowerCase() === 'character');
        }
        
        if (typeMatch) {
          console.log(`[Entity] Fallback type for "${entity.name}" (was: ${entity.entity_type}) → "${typeMatch.id}"`);
        }
      }

      if (!typeMatch) {
        console.warn(`[Entity] Unknown type: ${entity.entity_type}, available: ${entityTypes.map(t => t.id).join(', ')}`);
        continue;
      }

      try {
        const result = await invoke<{ entity: any; was_updated: boolean }>('save_extracted_entity', {
          req: {
            typeId: typeMatch.id,
            name: entity.name,
            aliases: entity.aliases || [],
            description: entity.description || '',
            notes: entity.notes || ''
          }
        });

        if (result.was_updated) {
          updatedCount++;
          updatedNames.push(`**${entity.name}**`);
        } else {
          newCount++;
          newNames.push(`**${entity.name}** (${typeMatch.name})`);
        }
      } catch (saveError) {
        console.error(`[Entity] Failed to save ${entity.name}:`, saveError);
      }
    }

    invalidateEntityCache();

    let resultMessage: string;
    const parts: string[] = [];

    if (newCount > 0) {
      if (newCount === 1) {
        parts.push(`${newNames[0]} neu angelegt`);
      } else {
        const lastNew = newNames.pop();
        parts.push(`${newNames.join(', ')} und ${lastNew} neu angelegt`);
      }
    }

    if (updatedCount > 0) {
      if (updatedCount === 1) {
        parts.push(`${updatedNames[0]} aktualisiert`);
      } else {
        const lastUpdated = updatedNames.pop();
        parts.push(`${updatedNames.join(', ')} und ${lastUpdated} aktualisiert`);
      }
    }

    if (parts.length === 0) {
      resultMessage = t('fontaine.noEntitiesFound', '✓ Keine neuen Entitäten im Text gefunden.');
    } else {
      resultMessage = `✅ Ich habe ${parts.join('; ')}.`;
    }

    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: resultMessage,
      timestamp: new Date()
    }]);
  };

  // Helper: parse LLM response (legacy stream) and save
  const parseAndSaveEntities = async (content: string) => {
    try {
      console.log('[Entity] Raw LLM response:', content);
      console.log('[Entity] Response length:', content.length);

      const jsonArrays: ExtractedEntity[][] = [];
      let normalizedContent = content.trim();
      if (normalizedContent.startsWith('{')) {
        normalizedContent = '[' + normalizedContent;
      }

      let searchStart = 0;
      while (true) {
        const arrayStart = normalizedContent.indexOf('[', searchStart);
        if (arrayStart === -1) break;
        let arrayEnd = arrayStart;
        while (true) {
          arrayEnd = normalizedContent.indexOf(']', arrayEnd + 1);
          if (arrayEnd === -1) break;
          const candidate = normalizedContent.substring(arrayStart, arrayEnd + 1);
          try {
            const parsed = JSON.parse(candidate);
            if (Array.isArray(parsed) && parsed.length > 0) {
              if (parsed[0].entity_type && parsed[0].name) {
                jsonArrays.push(parsed);
                break;
              }
            }
          } catch {
            // ignore
          }
        }
        searchStart = arrayStart + 1;
      }

      if (jsonArrays.length === 0) {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'system',
          content: t('fontaine.noEntitiesFound', '✓ Keine neuen Entitäten gefunden'),
          timestamp: new Date()
        }]);
        return;
      }

      const entities = jsonArrays.reduce((best, current) =>
        current.length > best.length ? current : best
      );

      await saveEntities(entities);
    } catch (e) {
      console.error('[Entity] Parse error:', e);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'system',
        content: t('fontaine.entityParseError', '⚠️ Fehler beim Parsen der Entitäten'),
        timestamp: new Date()
      }]);
    }
  };

  // Token streaming listener
  useEffect(() => {
    const stop = listen<TokenEvent>('ai_token', (evt) => {
      const ev = evt.payload;
      
      // Check for LLM errors - display as system message
      if (ev.token.startsWith('[LLM_ERROR:')) {
        const errorMsg = ev.token.replace('[LLM_ERROR:', '').replace(']', '').trim();
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'system',
          content: `⚠️ **KI-Fehler:** ${errorMsg}`,
          timestamp: new Date()
        }]);
        setIsExtracting(false);
        setIsAnalyzing(false);
        setExtractionSessionId(null);
        extractionBufferRef.current = '';
        return;
      }
      
      // Bei Entity-Extraction: Tokens nur intern sammeln, nicht im Chat anzeigen
      if (extractionSessionId === ev.id) {
        extractionBufferRef.current += ev.token;
        
        if (ev.done) {
          // Parse und speichere Entities
          parseAndSaveEntities(extractionBufferRef.current);
          extractionBufferRef.current = '';
          setExtractionSessionId(null);
          setIsExtracting(false);
        }
        return;
      }
      
      // Normale Chat-Messages
      setMessages(prev => {
        const idx = prev.findIndex(m => m.id === ev.id && m.role === 'assistant');
        if (idx === -1) {
          return [...prev, { id: ev.id, role: 'assistant', content: ev.token, streaming: !ev.done, timestamp: new Date() }];
        } else {
          const clone = [...prev];
          const m = { ...clone[idx] };
          m.content = m.content + ev.token;
          m.streaming = !ev.done;
          clone[idx] = m;
          return clone;
        }
      });
      if (ev.done) { 
        setCurrentId(null);
        setIsAnalyzing(false);
      }
    });
    return () => { stop.then(f => f()); };
  }, [entityTypes, t, extractionSessionId]);

  // Which slice of the scene the model currently sees. Shown in the UI because
  // otherwise identical questions give different answers for no visible reason.
  const [activeScope, setActiveScope] = useState<{ scope: ContextScope; paragraphIndices?: number[] }>({ scope: 'scene' });

  // The scope has to be visible *before* sending, otherwise the label always
  // describes the previous request. CodeMirror emits no cursor event we can
  // subscribe to from here, so poll while the panel is open - cheap, and only
  // triggers a render when the scope actually changed.
  // The prop is an inline arrow in the parent, so keep it in a ref: depending
  // on it directly would tear down the interval on every parent render.
  const focusRef = useRef(getEditorFocus);
  focusRef.current = getEditorFocus;

  useEffect(() => {
    const sameIndices = (a?: number[], b?: number[]) =>
      a === b || (!!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]));

    const tick = () => {
      const scoped = resolveContextScope(sceneContent, focusRef.current?.() ?? null);
      setActiveScope(prev =>
        prev.scope === scoped.scope && sameIndices(prev.paragraphIndices, scoped.paragraphIndices)
          ? prev
          : { scope: scoped.scope, paragraphIndices: scoped.paragraphIndices },
      );
    };
    tick();
    const id = window.setInterval(tick, 400);
    return () => window.clearInterval(id);
  }, [sceneContent]);


  // Build context string using RAG from backend
  const buildContext = useCallback(async (query: string): Promise<string> => {
    // Marked paragraphs beat selection beats whole scene.
    const focus = getEditorFocus?.() ?? null;
    const scoped = resolveContextScope(sceneContent, focus);
    setActiveScope({ scope: scoped.scope, paragraphIndices: scoped.paragraphIndices });

    // Last turns, so a question naming nobody ("hat er nochmal?") keeps its
    // subject. Only the tail: older turns would resurrect long-dropped
    // characters, and the backend only ever restores a single subject anyway.
    const recentTurns = messagesRef.current
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-RECENT_TURNS_FOR_PRONOUNS)
      .map(m => `${m.role}: ${m.content}`)
      .join('\n')
      .slice(-RECENT_TURNS_MAX_CHARS) || null;

    try {
      // Try to get RAG context from backend (includes entities, relevant scenes)
      const result = await invoke<{ context: string; entityCount: number; relevantSceneCount: number }>('build_fontaine_context', {
        req: {
          query,
          sceneId: activeSceneId,
          // Only override when actually narrowed - otherwise let the backend
          // use its own scene text.
          sceneOverride: scoped.scope === 'scene' ? null : scoped.text,
          recentTurns,
        }
      });
      console.log(`[Fontaine] RAG context: ${result.entityCount} entities, ${result.relevantSceneCount} relevant scenes, ${result.context.length} chars, scope=${scoped.scope}`);
      return result.context;
    } catch (e) {
      console.warn('[Fontaine] RAG context failed, using fallback:', e);
      // Fallback to simple context
      const parts: string[] = [];
      if (projectTitle) parts.push(`Projekt: ${projectTitle}`);
      if (scoped.text) {
        const label = scoped.scope === 'scene' ? 'Aktuelle Szene' : 'Aktueller Abschnitt';
        parts.push(`${label}:\n${scoped.text}`);
      }
      return parts.join('\n');
    }
  }, [activeSceneId, projectTitle, sceneContent, getEditorFocus]);

  // Send message based on mode
  const send = async (customPrompt?: string) => {
    const text = customPrompt || input.trim();
    if (!text && mode === 'chat') return;

    let prompt: string;
    
    // Build context asynchronously using RAG
    const context = await buildContext(text);

    // The text to work *on* follows the same scope rule as the context: a
    // selected paragraph should be edited, not the whole scene.
    const scopedTarget = resolveContextScope(sceneContent, getEditorFocus?.() ?? null);
    const targetText = scopedTarget.text;

    switch (mode) {
      case 'lektorat':
        if (!sceneContent) {
          setMessages(prev => [...prev, { 
            id: crypto.randomUUID(), 
            role: 'system', 
            content: t('fontaine.noSceneActive'),
            timestamp: new Date()
          }]);
          return;
        }
        setMessages(prev => [...prev, { 
          id: crypto.randomUUID(), 
          role: 'user', 
          content: t('fontaine.lektoratStarted'),
          timestamp: new Date()
        }]);
        setIsAnalyzing(true);
        try {
          const jobId = await invoke<string>('analyze_lektorat_chunked', {
            req: {
              text: targetText,
              sceneId: activeSceneId,
              lang: i18n.language,
              includeGrammar,
            }
          });
          setLektoratJobId(jobId);
          lektoratJobIdRef.current = jobId;
        } catch (e) {
          setIsAnalyzing(false);
          setMessages(prev => [...prev, { 
            id: crypto.randomUUID(), 
            role: 'system', 
            content: `${t('fontaine.error')}: ${e}`,
            timestamp: new Date()
          }]);
        }
        return;
      
      case 'agent':
        if (!sceneContent) {
          setMessages(prev => [...prev, { 
            id: crypto.randomUUID(), 
            role: 'system', 
            content: t('fontaine.noSceneActive'),
            timestamp: new Date()
          }]);
          return;
        }
        prompt = createPrompts(i18n.language).agent(targetText, context);
        setMessages(prev => [...prev, { 
          id: crypto.randomUUID(), 
          role: 'user', 
          content: t('fontaine.agentStarted'),
          timestamp: new Date()
        }]);
        break;
      
      case 'chat':
      default:
        prompt = createPrompts(i18n.language).chat(text, context, userName || undefined);
        setMessages(prev => [...prev, { 
          id: crypto.randomUUID(), 
          role: 'user', 
          content: text,
          timestamp: new Date()
        }]);
        setInput('');
        break;
    }

    setIsAnalyzing(true);
    
    try {
      const id = await invoke<string>('start_ai_chat', { 
        req: { 
          prompt,
          sceneId: activeSceneId,
          mode 
        } 
      });
      setCurrentId(id);
      setMessages(prev => [...prev, { id, role: 'assistant', content: '', streaming: true, timestamp: new Date() }]);
    } catch (e) { 
      console.error('[Fontaine] Error:', e);
      setMessages(prev => [...prev, { 
        id: crypto.randomUUID(), 
        role: 'system', 
        content: `${t('fontaine.error')}: ${e}`,
        timestamp: new Date()
      }]);
      setIsAnalyzing(false);
    }
  };

  const cancel = async () => {
    if (currentId) {
      try { 
        await invoke('cancel_ai_chat', { req: { id: currentId } }); 
      } catch (e) { 
        console.warn(e); 
      }
    }
    setIsAnalyzing(false);
    setCurrentId(null);
  };

  const insertLast = () => {
    const last = [...messages].reverse().find(m => m.role === 'assistant' && !m.streaming);
    if (last) { onInsert(last.content.trim()); }
  };

  const clearChat = () => {
    setMessages([]);
    setLektoratIssues([]);
  };

  // Switch AI provider
  const switchProvider = async (provider: ProviderType) => {
    // Check if cloud providers are configured
    if (provider === 'claude' && !providerSettings?.claude_api_key) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'system',
        content: t('fontaine.claudeNotConfigured'),
        timestamp: new Date()
      }]);
      return;
    }
    if (provider === 'openai' && !providerSettings?.openai_api_key) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'system',
        content: t('fontaine.openaiNotConfigured'),
        timestamp: new Date()
      }]);
      return;
    }
    
    setActiveProvider(provider);
    // Set active provider for streaming with all required data
    await invoke('set_active_ai_provider', { 
      provider,
      claudeApiKey: providerSettings?.claude_api_key,
      openaiApiKey: providerSettings?.openai_api_key,
      claudeModel: providerSettings?.claude_model,
      openaiModel: providerSettings?.openai_model,
    });
    // Save preference
    if (providerSettings) {
      const updated = { ...providerSettings, provider, enabled: providerSettings.enabled ?? true };
      await invoke('save_ai_provider_settings', { settings: updated });
      setProviderSettings(updated);
    }
  };

  const toggleAiEnabled = async (value: boolean) => {
    const next = { ...(providerSettings ?? { provider: activeProvider, claude_api_key: null, openai_api_key: null, claude_model: null, openai_model: null }), enabled: value };
    setProviderSettings(next);
    try {
      await invoke('save_ai_provider_settings', { settings: next });
      // Notify main.tsx about AI status change for ToolRail graying
      window.dispatchEvent(new CustomEvent('ai-status-changed', { detail: { enabled: value } }));
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'system',
        content: value ? '✅ KI aktiviert' : '⏹ KI deaktiviert – alle KI-Buttons sind gesperrt',
        timestamp: new Date()
      }]);
    } catch (e) {
      console.error('Failed to save AI enabled flag', e);
    }
  };

  // Agent Mode Controls
  const toggleAgentFeature = async (feature: keyof AgentConfig, value: boolean) => {
    const newConfig = { ...agentConfig, [feature]: value };
    setAgentConfig(newConfig);
    try {
      await invoke('set_agent_config', { config: newConfig });
    } catch (e) {
      console.error('Failed to update agent config:', e);
    }
  };

  const startAgent = async () => {
    const newConfig = { ...agentConfig, enabled: true };
    setAgentConfig(newConfig);
    try {
      await invoke('set_agent_config', { config: newConfig });
      await invoke('start_agent_loop');
      setAgentRunning(true);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'system',
        content: '🤖 Agent gestartet. Überwache Änderungen...',
        timestamp: new Date()
      }]);
    } catch (e) {
      console.error('Failed to start agent:', e);
    }
  };

  const stopAgent = async () => {
    try {
      await invoke('stop_agent_loop');
      const newConfig = { ...agentConfig, enabled: false };
      setAgentConfig(newConfig);
      await invoke('set_agent_config', { config: newConfig });
      setAgentRunning(false);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'system',
        content: '⏹ Agent gestoppt.',
        timestamp: new Date()
      }]);
    } catch (e) {
      console.error('Failed to stop agent:', e);
    }
  };

  const formatActivityTime = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Import document for RAG
  const importDocument = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{
          name: 'Dokumente',
          extensions: ['pdf', 'docx', 'txt', 'md']
        }]
      });
      
      if (!selected) return;
      
      const files = Array.isArray(selected) ? selected : [selected];
      setIsImporting(true);
      
      for (const filePath of files) {
        try {
          await invoke('import_rag_document', { path: filePath });
        } catch (e) {
          console.error('Failed to import document:', filePath, e);
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role: 'system',
            content: `❌ ${t('fontaine.importFailed')}: ${filePath}`,
            timestamp: new Date()
          }]);
        }
      }
      
      // Refresh document list
      const docs = await invoke<RagDocument[]>('list_rag_documents');
      setRagDocuments(docs);
      
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'system',
        content: `✅ ${files.length} ${t('fontaine.documentsImported')}`,
        timestamp: new Date()
      }]);
    } catch (e) {
      console.error('Import error:', e);
    } finally {
      setIsImporting(false);
    }
  };

  // Remove RAG document
  const removeDocument = async (docId: string) => {
    try {
      await invoke('remove_rag_document', { id: docId });
      setRagDocuments(prev => prev.filter(d => d.id !== docId));
    } catch (e) {
      console.error('Failed to remove document:', e);
    }
  };

  // Extract entities from current scene
  const extractEntitiesFromScene = async () => {
    if (!sceneContent || sceneContent.length < 50) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'system',
        content: t('fontaine.noSceneForExtraction', 'Szene ist zu kurz für Entity-Extraktion'),
        timestamp: new Date()
      }]);
      return;
    }

    setIsExtracting(true);
    setExtractedEntities([]); // Clear previous results
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'user',
      content: '🔍 Analysiere Szene auf Charaktere, Orte, Gegenstände...',
      timestamp: new Date()
    }]);

    try {
      const typeNames = entityTypes.map(t => t.name);
      if (typeNames.length === 0) {
        typeNames.push('Charakter', 'Ort', 'Gegenstand');
      }

      const jobId = await invoke<string>('extract_entities_ai', {
        req: {
          text: sceneContent,
          entityTypes: typeNames,
          lang: i18n.language.startsWith('de') ? 'de' : 'en'
        }
      });
      extractionJobIdRef.current = jobId;
      setExtractionJobId(jobId);
      setExtractionProgress({ current: 0, total: 0 });
    } catch (e) {
      console.error('Entity extraction error:', e);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'system',
        content: `Fehler bei Entity-Extraktion: ${e}`,
        timestamp: new Date()
      }]);
      setIsExtracting(false);
    }
  };

  // Extract entities from entire manuscript
  const extractEntitiesFromManuscript = async () => {
    setIsExtracting(true);
    setExtractedEntities([]); // Clear previous results
    setUpsertStats(null);
    
    try {
      if (autoSaveEntities) {
        // Auto-save mode: use upsert command that saves directly to DB
        const jobId = await invoke<string>('extract_entities_manuscript_upsert');
        setUpsertJobId(jobId);
        upsertJobIdRef.current = jobId;
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'user',
          content: '� Scanne gesamtes Manuskript und speichere Entities...',
          timestamp: new Date()
        }]);
      } else {
        // Manual mode: for now, show info that manuscript scan requires auto-save
        // TODO: Implement non-upsert manuscript scan if needed
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'system',
          content: '⚠️ Manuskript-Scan erfordert "Automatisch speichern". Bitte aktiviere die Option oder scanne einzelne Szenen.',
          timestamp: new Date()
        }]);
        setIsExtracting(false);
      }
    } catch (e) {
      setIsExtracting(false);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'system',
        content: `⚠️ Scan-Fehler: ${e}`,
        timestamp: new Date()
      }]);
    }
  };

  // Legacy function name for compatibility
  const extractEntities = extractEntitiesFromScene;

  // Legacy functions - kept for backward compatibility but marked as deprecated
  const startSceneUpsert = extractEntitiesFromScene;
  const startManuscriptUpsert = extractEntitiesFromManuscript;

  // Save extracted entity to database
  const saveEntity = async (entity: ExtractedEntity) => {
    try {
      // Find matching entity type
      const typeMatch = entityTypes.find(t => 
        t.name.toLowerCase() === entity.entity_type.toLowerCase() ||
        t.name_plural.toLowerCase() === entity.entity_type.toLowerCase()
      );
      
      if (!typeMatch) {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'system',
          content: t('fontaine.unknownEntityType', `Unbekannter Entity-Typ: ${entity.entity_type}`),
          timestamp: new Date()
        }]);
        return;
      }

      const result = await invoke<{ entity: any; was_updated: boolean }>('save_extracted_entity', {
        req: {
          typeId: typeMatch.id,
          name: entity.name,
          aliases: entity.aliases,
          description: entity.description,
          notes: entity.notes
        }
      });
      
      // Invalidate entity cache so highlighting updates
      invalidateEntityCache();

      const action = result.was_updated ? 'aktualisiert' : 'gespeichert';
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'system',
        content: `✅ ${entity.name} als ${typeMatch.name} ${action}`,
        timestamp: new Date()
      }]);

      // Remove from extracted list
      setExtractedEntities(prev => prev.filter(e => e.name !== entity.name));
    } catch (e) {
      console.error('Save entity error:', e);
    }
  };

  // Get provider display info
  const getProviderInfo = () => {
    switch (activeProvider) {
      case 'claude':
        return { name: 'Claude', icon: '🟣', model: providerSettings?.claude_model || 'claude-3-5-sonnet' };
      case 'openai':
        return { name: 'GPT', icon: '🟢', model: providerSettings?.openai_model || 'gpt-4o' };
      default:
        return { name: 'Lokal', icon: '💻', model: 'Gemma 4 E2B (MLX)' };
    }
  };

  // Mode tabs
  const modes: { key: AiMode; label: string; icon: string }[] = [
    { key: 'chat', label: t('fontaine.modeChat'), icon: '💬' },
    { key: 'lektorat', label: t('fontaine.modeLektorat'), icon: '📝' },
    { key: 'agent', label: t('fontaine.modeAgent'), icon: '🤖' },
  ];

  return (
    <div className="fontaine-panel flex-col full-height">
      {/* Header with mode tabs */}
      <div className="fontaine-header">
        <div className="fontaine-title">
          <span className="fontaine-logo">✨</span>
          <span>{t('fontaine.title')}</span>
          <span className={`fontaine-status fontaine-status-${modelStatus}`}>
            {modelStatus === 'ready' ? '●' : modelStatus === 'loading' ? '◐' : '○'}
          </span>
          {/* Provider indicator */}
          <span className="fontaine-provider-badge" title={getProviderInfo().model}>
            {getProviderInfo().icon} {getProviderInfo().name}
          </span>
          {/* Settings button */}
          <button 
            className="fontaine-settings-btn" 
            onClick={() => setShowSettings(!showSettings)}
            title={t('fontaine.settings')}
          >
            ⚙️
          </button>
        </div>
        
        {/* Settings dropdown */}
        {showSettings && (
          <div className="fontaine-settings-dropdown" ref={settingsRef}>
            <div className="settings-section">
              <label>KI Support</label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={aiEnabled}
                  onChange={e => toggleAiEnabled(e.target.checked)}
                />
                <span>{aiEnabled ? 'Aktiv' : 'Deaktiviert'}</span>
              </label>
              <small className="settings-hint">Schaltet alle KI-Funktionen sichtbar/benutzbar.</small>
            </div>

            <div className="settings-section">
              <label>{t('fontaine.aiProvider')}</label>
              <div className="provider-options">
                <button 
                  className={`provider-btn ${activeProvider === 'local' ? 'active' : ''}`}
                  onClick={() => switchProvider('local')}
                >
                  💻 Lokal
                </button>
                <button 
                  className={`provider-btn ${activeProvider === 'claude' ? 'active' : ''} ${!providerSettings?.claude_api_key ? 'disabled' : ''}`}
                  onClick={() => switchProvider('claude')}
                  disabled={!providerSettings?.claude_api_key}
                  title={!providerSettings?.claude_api_key ? t('fontaine.configureInMenu') : 'Claude API'}
                >
                  🟣 Claude {!providerSettings?.claude_api_key && '🔒'}
                </button>
                <button 
                  className={`provider-btn ${activeProvider === 'openai' ? 'active' : ''} ${!providerSettings?.openai_api_key ? 'disabled' : ''}`}
                  onClick={() => switchProvider('openai')}
                  disabled={!providerSettings?.openai_api_key}
                  title={!providerSettings?.openai_api_key ? t('fontaine.configureInMenu') : 'OpenAI API'}
                >
                  🟢 GPT {!providerSettings?.openai_api_key && '🔒'}
                </button>
              </div>
              <small className="settings-hint">{t('fontaine.configureApiHint')}</small>
            </div>
            
            <div className="settings-divider" />
            
            <div className="settings-section">
              <label>{t('fontaine.ragDocuments')}</label>
              <div className="rag-documents">
                {ragDocuments.length === 0 ? (
                  <p className="rag-empty">{t('fontaine.noDocuments')}</p>
                ) : (
                  <ul className="rag-list">
                    {ragDocuments.map(doc => (
                      <li key={doc.id} className="rag-item">
                        <span className="rag-icon">
                          {doc.type === 'pdf' ? '📕' : doc.type === 'docx' ? '📘' : '📄'}
                        </span>
                        <span className="rag-name">{doc.name}</span>
                        <button 
                          className="rag-remove" 
                          onClick={() => removeDocument(doc.id)}
                          title={t('fontaine.removeDocument')}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button 
                  className="btn btn-sm btn-secondary"
                  onClick={importDocument}
                  disabled={isImporting}
                >
                  {isImporting ? '⏳' : '📎'} {t('fontaine.importDocuments')}
                </button>
              </div>
              <small className="settings-hint">{t('fontaine.ragHint')}</small>
            </div>
            
            <div className="settings-divider" />
            
            {/* Model Settings Link */}
            <button 
              className="btn btn-sm btn-secondary settings-model-btn"
              onClick={() => {
                setShowSettings(false);
                setShowModelSettings(true);
              }}
            >
              🤖 {t('ai.settings.title', 'Modell-Einstellungen')}
            </button>
          </div>
        )}
        
        <div className="fontaine-modes">
          {modes.map(m => (
            <button
              key={m.key}
              className={`fontaine-mode-btn ${mode === m.key ? 'active' : ''}`}
              onClick={() => setMode(m.key)}
              title={m.label}
            >
              <span>{m.icon}</span>
              <span className="fontaine-mode-label">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Context info */}
      <div className="fontaine-context">
        {activeSceneId ? (
          <span className="fontaine-context-active">
            📄 {t('fontaine.sceneActive')} {t('fontaine.wordsCount', { count: sceneContent?.split(/\s+/).length || 0 })}
            {' · '}
            {activeScope.scope === 'selection' && 'Kontext: Auswahl'}
            {activeScope.scope === 'paragraphs' && (
              (activeScope.paragraphIndices ?? []).length === 1
                ? `Kontext: Absatz ${activeScope.paragraphIndices![0]}`
                : `Kontext: Absätze ${(activeScope.paragraphIndices ?? []).join(', ')}`
            )}
            {activeScope.scope === 'scene' && 'Kontext: ganze Szene'}
          </span>
        ) : (
          <span className="fontaine-context-none">{t('fontaine.noSceneSelected')}</span>
        )}
      </div>

      {mode === 'lektorat' && (
        <div className="lektorat-summary-card">
          <div className="lektorat-summary-top">
            <div>
              <div className="lektorat-eyebrow">📝 {t('fontaine.modeLektorat')}</div>
              <h4 className="lektorat-title">{t('lektorat.title.clearer', 'Klarerer Text, weniger Füllwörter')}</h4>
              <p className="lektorat-subtitle">
                {t('lektorat.subtitle', 'Checkt Vampirverben, Wiederholungen, Passivkonstruktionen und Stilbremsen. Ein Klick, saubere Szene.')}
              </p>
              <div className="lektorat-tags">
                <span>{t('lektorat.tag.vampireVerbs', 'Vampirverben')}</span>
                <span>{t('lektorat.tag.repetitions', 'Wiederholungen')}</span>
                <span>{t('lektorat.tag.passive', 'Passiv')}</span>
                <span>{t('lektorat.tag.style', 'Stil')}</span>
                {includeGrammar && <span className="tag-grammar">{t('lektorat.tag.grammar', 'Grammatik')}</span>}
              </div>
              <label className="lektorat-grammar-checkbox">
                <input
                  type="checkbox"
                  checked={includeGrammar}
                  onChange={(e) => setIncludeGrammar(e.target.checked)}
                />
                <span>{t('lektorat.includeGrammar', 'Grammatik mit KI prüfen')}</span>
              </label>
            </div>
            <div className="lektorat-actions">
              <button
                className="btn btn-primary btn-sm"
                onClick={() => send()}
                disabled={!sceneContent || isAnalyzing || !aiEnabled}
              >
                📝 {t('fontaine.analyzeScene')}
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={startManuscriptUpsert}
                disabled={isExtracting || isAnalyzing || !aiEnabled}
              >
                📚 {t('fontaine.scanManuscript', 'Manuskript scannen')}
              </button>
            </div>
          </div>
          <div className="lektorat-stats-row">
            <div className="lektorat-stat">
              <span className="stat-label">Wörter Szene</span>
              <span className="stat-value">{sceneContent?.split(/\s+/).length || 0}</span>
            </div>
            <div className="lektorat-stat">
              <span className="stat-label">Provider</span>
              <span className="stat-value">{getProviderInfo().name}</span>
            </div>
            <div className="lektorat-stat">
              <span className="stat-label">Status</span>
              <span className="stat-value">{isAnalyzing ? 'läuft …' : aiEnabled ? 'bereit' : 'aus'}</span>
            </div>
          </div>
        </div>
      )}

      {mode === 'lektorat' && lektoratIssues.length > 0 && (
        <div className="lektorat-issues-panel">
          <div className="issues-header">
            <div className="issues-title">{t('fontaine.lektoratFindings', 'Lektoratsfunde')} <span className="issues-count">{lektoratIssues.length}</span></div>
            <div className="issues-actions">
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => {
                  try { window.dispatchEvent(new CustomEvent('fw-open-lektorat-sidebar', { detail: { line: lektoratIssues[0]?.line } })); } catch (e) { console.warn(e); }
                }}
                title={t('fontaine.showInEditor', 'Im Editor anzeigen')}
              >
                👁️ {t('fontaine.showInEditor', 'Im Editor anzeigen')}
              </button>
            </div>
          </div>
          <div className="lektorat-issues-list">
            {lektoratIssues.map((issue, idx) => (
              <div key={idx} className={`lektorat-issue-card severity-${issue.severity || 'info'}`}>
                <div className="issue-meta">
                  <span className="issue-chip">{issue.type}</span>
                  {issue.line && <span className="issue-line">Z. {issue.line}</span>}
                  {issue.severity && <span className={`issue-severity issue-${issue.severity}`}>{issue.severity}</span>}
                </div>
                <div className="issue-text">„{issue.text}“</div>
                {issue.suggestion && (
                  <div className="issue-suggestion">
                    <span className="suggestion-label">💡 {t('fontaine.suggestion', 'Vorschlag')}:</span>
                    <span className="suggestion-text">{issue.suggestion}</span>
                  </div>
                )}
                <div className="issue-actions">
                  {issue.suggestion && (
                    <>
                      <button className="btn btn-xs" onClick={() => onInsert(issue.suggestion!)} title={t('fontaine.insertReply')}>
                        ↩️ {t('fontaine.insertReply')}
                      </button>
                      {onApplySuggestion && issue.text && (
                        <button className="btn btn-xs btn-secondary" onClick={() => onApplySuggestion(issue.text, issue.suggestion!)}>
                          ✂️ {t('fontaine.applySuggestion', 'Im Text ersetzen')}
                        </button>
                      )}
                    </>
                  )}
                  <button className="btn btn-ghost btn-xs" onClick={() => navigator.clipboard.writeText(issue.text + (issue.suggestion ? ` → ${issue.suggestion}` : ''))}>
                    📋 {t('fontaine.copyReply')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

  {/* Messages area */}
  <div className={`fontaine-messages ${aiEnabled ? '' : 'fontaine-ai-disabled'}`}>
        {/* Extracted entities for manual review (when auto-save is off) */}
        {extractedEntities.length > 0 && !autoSaveEntities && (
          <div className="extracted-entities-review">
            <div className="extracted-entities-header">
              <span>✨ {extractedEntities.length} gefundene Entitäten</span>
              <button 
                className="btn btn-xs btn-primary" 
                onClick={async () => {
                  await saveEntities(extractedEntities);
                  setExtractedEntities([]);
                }}
              >
                Alle speichern
              </button>
            </div>
            <div className="extracted-entities-list">
              {extractedEntities.map((entity, idx) => (
                <div key={`${entity.name}-${idx}`} className="extracted-entity-card">
                  <div className="entity-card-header">
                    <span className="entity-name">{entity.name}</span>
                    <span className="entity-type">{entity.entity_type}</span>
                  </div>
                  {entity.description && (
                    <div className="entity-description">{entity.description}</div>
                  )}
                  <div className="entity-card-actions">
                    <button 
                      className="btn btn-xs btn-secondary"
                      onClick={() => saveEntity(entity)}
                    >
                      💾 Speichern
                    </button>
                    <button 
                      className="btn btn-xs btn-ghost"
                      onClick={() => setExtractedEntities(prev => prev.filter(e => e.name !== entity.name))}
                    >
                      ✕ Verwerfen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {(isExtracting && extractionProgress) || (isAnalyzing && lektoratProgress) || (isExtracting && upsertProgress) ? (
          <div className="entities-loading sticky-progress">
            {isExtracting && upsertProgress && (
              upsertProgress.totalScenes
                ? `⏳ Upsert Szene ${upsertProgress.scene}/${upsertProgress.totalScenes} – Chunk ${upsertProgress.current}/${upsertProgress.total || '?'}`
                : `⏳ Upsert: Chunk ${upsertProgress.current}/${upsertProgress.total || '?'}`
            )}
            {!upsertProgress && isExtracting && extractionProgress && `⏳ Entities: Chunk ${extractionProgress.current}/${extractionProgress.total || '?'}`}
            {isAnalyzing && lektoratProgress && !isExtracting && `⏳ Lektorat: Chunk ${lektoratProgress.current}/${lektoratProgress.total || '?'}`}
          </div>
        ) : null}
        {messages.length === 0 && (
          <div className="fontaine-empty">
            {mode === 'chat' && <p>{t('fontaine.chatHint')}</p>}
            {mode === 'lektorat' && <p>{t('fontaine.lektoratHint')}</p>}
            {mode === 'agent' && <p>{t('fontaine.agentHint')}</p>}
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`chat-bubble chat-bubble-${m.role}`}>
            <div className="chat-bubble-header">
              <span className="chat-bubble-sender">
                {m.role === 'user' 
                  ? (userName || t('fontaine.you'))
                  : m.role === 'assistant' 
                    ? 'Fontaine' 
                    : t('fontaine.system')}
              </span>
              <span className="chat-bubble-time">{formatTime(m.timestamp)}</span>
            </div>
            <div className="chat-bubble-content">
              {m.content
                ? (m.role === 'assistant' && !m.streaming
                    ? renderAssistantRichText(m.content)
                    : m.content)
                : (m.streaming ? <span className="typing-indicator">●●●</span> : '')}
            </div>
            {m.role === 'assistant' && !m.streaming && m.content && (
              <div className="chat-bubble-actions">
                <button className="btn-xs" onClick={() => onInsert(m.content)} title={t('fontaine.insertReply')}>
                  ↩️
                </button>
                <button className="btn-xs" onClick={() => navigator.clipboard.writeText(m.content)} title={t('fontaine.copyReply')}>
                  📋
                </button>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
  <div className={`fontaine-input-area ${aiEnabled ? '' : 'fontaine-ai-disabled'}`}>
        {mode === 'chat' ? (
          <div className="fontaine-chat-input">
            <textarea
              className="fontaine-textarea"
              placeholder={t('fontaine.askPlaceholder')}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
            />
            <div className="fontaine-input-buttons">
              {isAnalyzing ? (
                <button className="btn btn-cancel" onClick={cancel}>⏹ {t('fontaine.stop')}</button>
              ) : (
                <button className="btn btn-primary" onClick={() => send()} disabled={!input.trim()}>
                  {t('aichat.send')}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="fontaine-action-buttons">
            {isAnalyzing || isExtracting ? (
              <button className="btn btn-cancel btn-full" onClick={cancel}>
                ⏹ {t('fontaine.cancelAnalysis')}
              </button>
            ) : mode === 'agent' ? (
              <div className="agent-panel">
                <div className="agent-header">
                  <div className="agent-status">
                    <span className={`agent-indicator ${agentRunning ? 'running' : 'stopped'}`}>●</span>
                    <span>{agentRunning ? 'Agent aktiv' : 'Agent inaktiv'}</span>
                  </div>
                  {agentRunning ? (
                    <button className="btn btn-cancel btn-sm" onClick={stopAgent}>⏹ Stoppen</button>
                  ) : (
                    <button className="btn btn-primary btn-sm" onClick={startAgent}>▶️ Starten</button>
                  )}
                </div>
                
                <div className="agent-features">
                  <label className="agent-feature">
                    <input type="checkbox" checked={agentConfig.auto_entities} onChange={(e) => toggleAgentFeature('auto_entities', e.target.checked)} />
                    <span>✨ Entities erkennen</span>
                  </label>
                  <label className="agent-feature">
                    <input type="checkbox" checked={agentConfig.auto_lektorat} onChange={(e) => toggleAgentFeature('auto_lektorat', e.target.checked)} />
                    <span>📝 Lektorat</span>
                  </label>
                  <label className="agent-feature">
                    <input type="checkbox" checked={agentConfig.auto_spelling} onChange={(e) => toggleAgentFeature('auto_spelling', e.target.checked)} />
                    <span>🔤 Rechtschreibung</span>
                  </label>
                </div>
                
                {agentActivities.length > 0 && (
                  <div className="agent-activities">
                    <div className="agent-activities-header">Letzte Aktionen</div>
                    <ul className="agent-activity-list">
                      {agentActivities.slice(0, 5).map(activity => (
                        <li key={activity.id} className={`agent-activity ${activity.action_type}`}>
                          <span className="activity-time">{formatActivityTime(activity.timestamp)}</span>
                          <span className="activity-desc">{activity.description}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                <div className="agent-manual-actions">
                  {isExtracting && extractionProgress && (
                    <div className="entities-loading">
                      {`⏳ Chunk ${extractionProgress.current}/${extractionProgress.total || '?'} wird analysiert...`}
                    </div>
                  )}
                  
                  <div className="entity-extraction-controls">
                    <label className="auto-save-checkbox">
                      <input 
                        type="checkbox" 
                        checked={autoSaveEntities} 
                        onChange={(e) => setAutoSaveEntities(e.target.checked)} 
                      />
                      <span>Auto-Speichern</span>
                    </label>
                    <button className="btn btn-secondary btn-sm" onClick={extractEntitiesFromScene} disabled={!sceneContent || isExtracting || !aiEnabled}>
                      ✨ Szene scannen
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={extractEntitiesFromManuscript} disabled={isExtracting || isAnalyzing || !aiEnabled}>
                      📚 Manuskript scannen
                    </button>
                  </div>
                  
                  <button className="btn btn-secondary btn-sm" onClick={() => send()} disabled={!sceneContent || isAnalyzing || !aiEnabled}>
                    📝 Lektorat jetzt
                  </button>
                  {upsertStats && (
                    <div className="upsert-stats">
                      ✅ {upsertStats.created} neu, {upsertStats.updated} aktualisiert
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="standard-actions">
                <div className="entity-extraction-controls">
                  <label className="auto-save-checkbox">
                    <input 
                      type="checkbox" 
                      checked={autoSaveEntities} 
                      onChange={(e) => setAutoSaveEntities(e.target.checked)} 
                    />
                    <span>Auto-Speichern</span>
                  </label>
                  <button className="btn btn-secondary btn-sm" onClick={extractEntitiesFromScene} disabled={!sceneContent || isExtracting || !aiEnabled}>
                    ✨ Szene
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={extractEntitiesFromManuscript} disabled={isExtracting || isAnalyzing || !aiEnabled}>
                    📚 Manuskript
                  </button>
                </div>
                {upsertStats && (
                  <span className="upsert-stats-chip">✅ {upsertStats.created} neu / {upsertStats.updated} aktualisiert</span>
                )}
                <button 
                  className="btn btn-primary btn-full" 
                  onClick={() => send()}
                  disabled={!sceneContent || !aiEnabled}
                >
                  🔍 {t('fontaine.analyzeScene')}
                </button>
              </div>
            )}
          </div>
        )}
        
        <div className="fontaine-footer-actions">
          <button className="btn-xs" onClick={insertLast} disabled={!messages.some(m => m.role === 'assistant' && !m.streaming)}>
            ↩️ {t('fontaine.insertLast')}
          </button>
          <button className="btn-xs" onClick={clearChat}>
            🗑️ {t('fontaine.clearChat')}
          </button>
        </div>
      </div>
      
      {/* Model Settings Modal */}
      {showModelSettings && (
        <div className="modal-overlay" onClick={() => setShowModelSettings(false)}>
          <div className="modal-container ai-settings-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowModelSettings(false)}>×</button>
            <AiSettingsPanel onClose={() => setShowModelSettings(false)} />
          </div>
        </div>
      )}
    </div>
  );
};
