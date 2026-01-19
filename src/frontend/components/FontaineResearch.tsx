/**
 * FontaineResearch Component für Featherworks Author
 * 
 * KI-gestützter Recherche-Assistent basierend auf dem lokalen LLM.
 * Bietet kontext-aware Fragen zur Story, Welt und Charakteren.
 * 
 * Features (geplant):
 * - "Recherche"-Modus: Fragen zur Story/Welt beantworten
 * - Kontext-aware: Kennt Charaktere, Orte, Plotlinien
 * - Research-to-Notes: Ergebnisse als Notizen speichern
 * - Faktenfragen mit Web-Suche (optional, Pro)
 * 
 * Status: Rudimentär angelegt - wird in Phase 7+ ausgebaut
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';

// ============================================================================
// Types
// ============================================================================

interface ResearchQuery {
  id: string;
  query: string;
  response: string;
  context?: 'character' | 'location' | 'plot' | 'general';
  sources?: ResearchSource[];
  timestamp: Date;
  streaming?: boolean;
}

interface ResearchSource {
  type: 'entity' | 'note' | 'scene' | 'external';
  title: string;
  excerpt?: string;
  entityId?: string;
}

interface ResearchSuggestion {
  query: string;
  category: string;
}

interface TokenEvent {
  id: string;
  token: string;
  done: boolean;
}

interface FontaineResearchProps {
  /** Callback um Ergebnis in Notizen zu speichern */
  onSaveToNotes?: (content: string, title?: string) => void;
  /** Aktueller Projekt-Kontext */
  projectId?: number;
  /** Aktuell ausgewählte Szene für Kontext */
  sceneId?: string;
}

// ============================================================================
// Component
// ============================================================================

export const FontaineResearch: React.FC<FontaineResearchProps> = ({
  onSaveToNotes,
  projectId,
  sceneId,
}) => {
  const { t, i18n } = useTranslation();
  const isGerman = i18n.language === 'de';
  
  // State
  const [queries, setQueries] = useState<ResearchQuery[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [suggestions, setSuggestions] = useState<ResearchSuggestion[]>([]);
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  // Current streaming query ID
  const currentQueryIdRef = useRef<string | null>(null);

  // ============================================================================
  // Check AI Availability
  // ============================================================================
  
  useEffect(() => {
    const checkAi = async () => {
      try {
        const available = await invoke<boolean>('is_ai_available');
        setAiAvailable(available);
      } catch (e) {
        console.error('Failed to check AI availability:', e);
        setAiAvailable(false);
      }
    };
    checkAi();
  }, []);

  // ============================================================================
  // Streaming Listener
  // ============================================================================
  
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    
    const setupListener = async () => {
      unlisten = await listen<TokenEvent>('ai-token', (event) => {
        const { id, token, done } = event.payload;
        
        if (id === currentQueryIdRef.current) {
          setQueries(prev => prev.map(q => 
            q.id === id 
              ? { 
                  ...q, 
                  response: q.response + token,
                  streaming: !done,
                }
              : q
          ));
          
          if (done) {
            currentQueryIdRef.current = null;
            setIsLoading(false);
          }
        }
      });
    };
    
    setupListener();
    
    return () => {
      unlisten?.();
    };
  }, []);

  // ============================================================================
  // Auto-scroll
  // ============================================================================
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [queries]);

  // ============================================================================
  // Generate Suggestions based on context
  // ============================================================================
  
  useEffect(() => {
    // Dynamische Vorschläge basierend auf Projekt-Kontext
    const baseSuggestions: ResearchSuggestion[] = isGerman ? [
      { query: 'Wer sind die Hauptfiguren in meiner Geschichte?', category: 'Charaktere' },
      { query: 'Welche Orte habe ich bisher beschrieben?', category: 'Orte' },
      { query: 'Was sind die wichtigsten Konflikte im Plot?', category: 'Plot' },
      { query: 'Gibt es Widersprüche in meiner Timeline?', category: 'Konsistenz' },
      { query: 'Welche Charakterbeziehungen sind etabliert?', category: 'Beziehungen' },
    ] : [
      { query: 'Who are the main characters in my story?', category: 'Characters' },
      { query: 'What locations have I described so far?', category: 'Locations' },
      { query: 'What are the main conflicts in the plot?', category: 'Plot' },
      { query: 'Are there any inconsistencies in my timeline?', category: 'Consistency' },
      { query: 'What character relationships are established?', category: 'Relationships' },
    ];
    
    setSuggestions(baseSuggestions);
  }, [isGerman, projectId]);

  // ============================================================================
  // Research Query
  // ============================================================================
  
  const handleResearchQuery = useCallback(async (queryText?: string) => {
    const query = queryText || inputValue.trim();
    if (!query || isLoading) return;
    
    setInputValue('');
    setError(null);
    
    const queryId = `research-${Date.now()}`;
    currentQueryIdRef.current = queryId;
    
    // Add query to list
    const newQuery: ResearchQuery = {
      id: queryId,
      query,
      response: '',
      timestamp: new Date(),
      streaming: true,
    };
    setQueries(prev => [...prev, newQuery]);
    setIsLoading(true);
    
    try {
      // Build research prompt with project context
      const researchPrompt = isGerman
        ? `Du bist ein Recherche-Assistent für einen Autor. Beantworte die folgende Frage basierend auf dem Kontext des Projekts. Sei präzise und hilfreich.

Frage: ${query}`
        : `You are a research assistant for an author. Answer the following question based on the project context. Be precise and helpful.

Question: ${query}`;

      // TODO: Integrate with RAG system for project context
      // For now, use standard AI chat
      await invoke('ai_stream_chat', {
        id: queryId,
        prompt: researchPrompt,
        systemPrompt: isGerman
          ? 'Du bist ein hilfreicher Recherche-Assistent für kreatives Schreiben. Antworte auf Deutsch.'
          : 'You are a helpful research assistant for creative writing. Answer in English.',
      });
    } catch (e) {
      console.error('Research query failed:', e);
      setError(String(e));
      setIsLoading(false);
      currentQueryIdRef.current = null;
      
      // Update query with error
      setQueries(prev => prev.map(q => 
        q.id === queryId 
          ? { ...q, response: isGerman ? 'Fehler bei der Recherche.' : 'Research error.', streaming: false }
          : q
      ));
    }
  }, [inputValue, isLoading, isGerman]);

  // ============================================================================
  // Save to Notes
  // ============================================================================
  
  const handleSaveToNotes = useCallback((query: ResearchQuery) => {
    if (onSaveToNotes && query.response) {
      const title = isGerman 
        ? `Recherche: ${query.query.slice(0, 50)}...`
        : `Research: ${query.query.slice(0, 50)}...`;
      onSaveToNotes(query.response, title);
    }
  }, [onSaveToNotes, isGerman]);

  // ============================================================================
  // Clear History
  // ============================================================================
  
  const clearHistory = useCallback(() => {
    setQueries([]);
  }, []);

  // ============================================================================
  // Handle Key Press
  // ============================================================================
  
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleResearchQuery();
    }
  };

  // ============================================================================
  // Render
  // ============================================================================
  
  if (aiAvailable === false) {
    return (
      <div className="fontaine-research">
        <div className="research-unavailable">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5">
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3>{isGerman ? 'KI nicht verfügbar' : 'AI not available'}</h3>
          <p>
            {isGerman 
              ? 'Lade ein lokales LLM-Modell in den Fontaine-Einstellungen.'
              : 'Load a local LLM model in the Fontaine settings.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fontaine-research">
      {/* Header */}
      <div className="research-header">
        <div className="research-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <h3>{isGerman ? 'Fontaine Recherche' : 'Fontaine Research'}</h3>
        </div>
        {queries.length > 0 && (
          <button
            className="research-clear-btn"
            onClick={clearHistory}
            title={isGerman ? 'Verlauf löschen' : 'Clear history'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        )}
      </div>

      {/* Suggestions (show when no queries) */}
      {queries.length === 0 && (
        <div className="research-suggestions">
          <p className="suggestions-label">
            {isGerman ? 'Vorgeschlagene Fragen:' : 'Suggested questions:'}
          </p>
          <div className="suggestions-list">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                className="suggestion-chip"
                onClick={() => handleResearchQuery(suggestion.query)}
                disabled={isLoading}
              >
                <span className="suggestion-category">{suggestion.category}</span>
                <span className="suggestion-text">{suggestion.query}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Query History */}
      <div className="research-history">
        {queries.map((query) => (
          <div key={query.id} className="research-item">
            {/* User Query */}
            <div className="research-query">
              <div className="query-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <p>{query.query}</p>
            </div>
            
            {/* AI Response */}
            <div className="research-response">
              <div className="response-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <div className="response-content">
                {query.response || (
                  <span className="response-loading">
                    {isGerman ? 'Recherchiere...' : 'Researching...'}
                  </span>
                )}
                {query.streaming && <span className="cursor-blink">▊</span>}
              </div>
              
              {/* Actions */}
              {!query.streaming && query.response && (
                <div className="response-actions">
                  <button
                    className="response-action-btn"
                    onClick={() => handleSaveToNotes(query)}
                    title={isGerman ? 'In Notizen speichern' : 'Save to notes'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6M12 18v-6M9 15h6" />
                    </svg>
                  </button>
                  <button
                    className="response-action-btn"
                    onClick={() => navigator.clipboard.writeText(query.response)}
                    title={isGerman ? 'Kopieren' : 'Copy'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="research-input-area">
        {error && (
          <div className="research-error">
            <span>{error}</span>
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}
        <div className="research-input-wrapper">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={isGerman 
              ? 'Stelle eine Frage zu deinem Projekt...'
              : 'Ask a question about your project...'}
            rows={2}
            disabled={isLoading}
          />
          <button
            className="research-send-btn"
            onClick={() => handleResearchQuery()}
            disabled={!inputValue.trim() || isLoading}
          >
            {isLoading ? (
              <span className="spinner-small" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FontaineResearch;
