// LektoratEditorSidebar.tsx
// Lektorat-Anmerkungen neben dem Editor, auf Zeilenhöhe synchronisiert
// Features:
// - Echtzeit-Lektorat bei Absatz-Ende (Paragraph completion trigger)
// - Persistente Annotations (werden in DB gespeichert)
// - Re-Evaluate Button für komplette Neu-Analyse
// - Dismiss/Resolve Status für Annotations
// - Text-Highlighting der betroffenen Stellen

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { useTranslation } from 'react-i18next';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LektoratAnnotation {
  id: string;
  line: number;
  startCol?: number;
  endCol?: number;
  type: 'spelling' | 'grammar' | 'style' | 'suggestion' | 'repetition' | 'clarity';
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
  context?: string;
  textHash?: string;
  status: 'active' | 'dismissed' | 'resolved';
  // DB fields
  annotation_type?: string;
}

export interface HumanComment {
  id: string;
  from: number;
  to: number;
  text: string;
  note: string;
  suggestion?: string;
  status: 'open' | 'accepted' | 'rejected';
}

interface LektoratEditorSidebarProps {
  content: string;
  sceneId: string;
  editorScrollTop: number;
  lineHeight?: number;
  visible: boolean;
  realtimeLektorat?: boolean;
  onToggle: () => void;
  onAnnotationClick?: (annotation: LektoratAnnotation) => void;
  onApplySuggestion?: (annotation: LektoratAnnotation) => void;
  onHighlightText?: (line: number, startCol?: number, endCol?: number) => void;
  humanComments?: HumanComment[];
  onAddComment?: (note: string, suggestion?: string) => void;
  onApplyComment?: (id: string) => void;
  onRejectComment?: (id: string) => void;
  onFocusComment?: (id: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Components with ref-based dynamic styles
// ─────────────────────────────────────────────────────────────────────────────

const LineSpacer: React.FC<{ height: number; children: React.ReactNode }> = ({ height, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = `${height}px`;
    }
  }, [height]);
  return <div className="lektorat-line-spacer" ref={ref}>{children}</div>;
};

const LineAnnotationGroup: React.FC<{ top: number; children: React.ReactNode }> = ({ top, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.style.top = `${top}px`;
    }
  }, [top]);
  return <div className="lektorat-line-annotations" ref={ref}>{children}</div>;
};

const ProgressFill: React.FC<{ progress: number }> = ({ progress }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.style.width = `${progress}%`;
    }
  }, [progress]);
  return <div className="lektorat-progress-fill" ref={ref} />;
};

const ScrollOffset: React.FC<{ offset: number; children: React.ReactNode }> = ({ offset, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.style.transform = `translateY(-${offset}px)`;
    }
  }, [offset]);
  return <div className="lektorat-annotations-inner" ref={ref}>{children}</div>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const LektoratEditorSidebar: React.FC<LektoratEditorSidebarProps> = ({
  content,
  sceneId,
  editorScrollTop,
  lineHeight = 24,
  visible,
  realtimeLektorat = false,
  onToggle,
  onAnnotationClick,
  onApplySuggestion,
  onHighlightText,
  humanComments = [],
  onAddComment,
  onApplyComment,
  onRejectComment,
  onFocusComment
}) => {
  const { t, i18n } = useTranslation();
  
  const [annotations, setAnnotations] = useState<LektoratAnnotation[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [expandedAnnotation, setExpandedAnnotation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastParagraphCount, setLastParagraphCount] = useState(0);
  const [commentNote, setCommentNote] = useState('');
  const [commentSuggestion, setCommentSuggestion] = useState('');
  
  // Streaming state for AI response
  const [streamBuffer, setStreamBuffer] = useState('');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const humanCommentList = useMemo(() => humanComments ?? [], [humanComments]);
  
  // Berechne Zeilenanzahl
  const lines = useMemo(() => content.split('\n'), [content]);
  const totalLines = lines.length;
  
  // Gruppiere Annotations nach Zeile (nur aktive)
  const annotationsByLine = useMemo(() => {
    const grouped = new Map<number, LektoratAnnotation[]>();
    annotations
      .filter(ann => ann.status === 'active')
      .forEach(ann => {
        const existing = grouped.get(ann.line) || [];
        existing.push(ann);
        grouped.set(ann.line, existing);
      });
    return grouped;
  }, [annotations]);

  const handleAddComment = useCallback(() => {
    if (!onAddComment) return;
    if (!commentNote.trim()) return;
    onAddComment(commentNote.trim(), commentSuggestion.trim() || undefined);
    setCommentNote('');
    setCommentSuggestion('');
  }, [commentNote, commentSuggestion, onAddComment]);

  const statusLabel = (status: HumanComment['status']) => {
    switch (status) {
      case 'open': return 'Offen';
      case 'accepted': return 'Akzeptiert';
      case 'rejected': return 'Abgelehnt';
    }
  };
  
  // Lade persistierte Annotations beim Szenen-Wechsel
  useEffect(() => {
    if (!sceneId) return;
    
    const loadAnnotations = async () => {
      try {
        interface DbAnnotation {
          id: string;
          line: number;
          start_col?: number;
          end_col?: number;
          annotation_type: string;
          severity: string;
          message: string;
          suggestion?: string;
          context?: string;
          text_hash?: string;
          status: string;
        }
        const loaded = await invoke<DbAnnotation[]>('load_lektorat_annotations', { sceneId });
        setAnnotations(loaded.map(a => ({
          id: a.id,
          line: a.line,
          startCol: a.start_col,
          endCol: a.end_col,
          type: a.annotation_type as LektoratAnnotation['type'],
          severity: a.severity as LektoratAnnotation['severity'],
          message: a.message,
          suggestion: a.suggestion,
          context: a.context,
          textHash: a.text_hash,
          status: a.status as LektoratAnnotation['status'],
        })));
      } catch (err) {
        console.error('Failed to load annotations:', err);
      }
    };
    
    loadAnnotations();
    setLastParagraphCount(content.split('\n\n').length);
  }, [sceneId]);
  
  // Echtzeit-Lektorat: Trigger wenn neuer Absatz (doppelter Zeilenumbruch)
  useEffect(() => {
    if (!realtimeLektorat || !sceneId || isAnalyzing) return;
    
    const paragraphs = content.split('\n\n');
    const currentParagraphCount = paragraphs.length;
    
    // Wenn ein neuer Absatz begonnen wurde (Enter+Enter gedrückt)
    if (currentParagraphCount > lastParagraphCount && content.endsWith('\n\n')) {
      const lastCompletedParagraph = paragraphs[paragraphs.length - 2];
      
      if (lastCompletedParagraph && lastCompletedParagraph.trim().length > 20) {
        // Finde die Zeilen des abgeschlossenen Absatzes
        const previousParagraphsText = paragraphs.slice(0, -2).join('\n\n');
        const startLine = previousParagraphsText.split('\n').length + 1;
        
        analyzeParagraph(lastCompletedParagraph, startLine);
      }
    }
    
    setLastParagraphCount(currentParagraphCount);
  }, [content, realtimeLektorat, isAnalyzing, lastParagraphCount, sceneId]);
  
  // Ref um currentSessionId im Listener zu tracken ohne Re-Render
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    sessionIdRef.current = currentSessionId;
  }, [currentSessionId]);
  
  // Listen for AI streaming events - läuft immer
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    
    const setupListener = async () => {
      unlisten = await listen<{ id: string; token: string; done: boolean }>('ai_token', (event) => {
        const activeSession = sessionIdRef.current;
        if (activeSession && event.payload.id === activeSession) {
          console.log('[Lektorat] Token received:', event.payload.token.substring(0, 50));
          setStreamBuffer(prev => prev + event.payload.token);
          
          // When done, trigger parsing
          if (event.payload.done) {
            console.log('[Lektorat] Stream complete');
            setIsAnalyzing(false);
          }
        }
      });
    };
    
    setupListener();
    return () => { unlisten?.(); };
  }, []); // Keine Dependencies - läuft nur einmal
  
  // Parse streamed JSON when complete - robuster Parser
  // Der Prompt endet mit "[" - die KI gibt also "{...}]" zurück
  useEffect(() => {
    if (!streamBuffer.includes(']') || !currentSessionId) return;
    
    try {
      // Normalisiere: Wenn Content mit { anfängt (weil [ im Prompt war), füge [ hinzu
      let normalizedBuffer = streamBuffer.trim();
      if (normalizedBuffer.startsWith('{')) {
        normalizedBuffer = '[' + normalizedBuffer;
      }
      
      // Finde alle JSON-Arrays im Response
      const validArrays: Record<string, unknown>[][] = [];
      let searchStart = 0;
      
      while (true) {
        const arrayStart = normalizedBuffer.indexOf('[', searchStart);
        if (arrayStart === -1) break;
        
        let arrayEnd = arrayStart;
        while (true) {
          arrayEnd = normalizedBuffer.indexOf(']', arrayEnd + 1);
          if (arrayEnd === -1) break;
          
          const candidate = normalizedBuffer.substring(arrayStart, arrayEnd + 1);
          try {
            const parsed = JSON.parse(candidate);
            if (Array.isArray(parsed) && parsed.length > 0) {
              // Prüfe ob es Lektorat-Objekte sind (haben line und message)
              if (typeof parsed[0].line === 'number' && parsed[0].message) {
                validArrays.push(parsed);
                break;
              }
            }
          } catch {
            // Weiter zum nächsten ]
          }
        }
        searchStart = arrayStart + 1;
      }
      
      // Wähle das Array mit den meisten Annotations
      if (validArrays.length === 0) {
        console.log('[Lektorat] Noch kein valides JSON-Array, warte...');
        return;
      }
      
      const parsed = validArrays.reduce((best, current) => 
        current.length > best.length ? current : best
      );
      
      console.log(`[Lektorat] Gefunden: ${validArrays.length} Arrays, gewählt: ${parsed.length} Annotations`);
      
      const newAnnotations: LektoratAnnotation[] = parsed.map((item: Record<string, unknown>, idx: number) => ({
        id: `${sceneId}-${Date.now()}-${idx}`,
        line: Number(item.line) || 1,
        startCol: item.startCol as number | undefined,
        endCol: item.endCol as number | undefined,
        type: (item.type as LektoratAnnotation['type']) || 'style',
        severity: (item.severity as LektoratAnnotation['severity']) || 'info',
        message: String(item.message || ''),
        suggestion: item.suggestion as string | undefined,
        context: item.context as string | undefined,
        status: 'active' as const,
      }));
      
      // Merge mit existierenden
      setAnnotations(prev => {
        const merged = [...prev, ...newAnnotations];
        // Speichere in DB
        saveAnnotationsToDb(merged.filter(a => a.status === 'active'));
        return merged;
      });
      
      setStreamBuffer('');
      setCurrentSessionId(null);
      setIsAnalyzing(false);
      setAnalysisProgress(100);
    } catch (e) {
      console.error('[Lektorat] Parse error:', e);
    }
  }, [streamBuffer, currentSessionId, sceneId]);
  
  // Speichere Annotations in DB
  const saveAnnotationsToDb = useCallback(async (anns: LektoratAnnotation[]) => {
    if (!sceneId) return;
    
    try {
      await invoke('save_lektorat_annotations', {
        req: {
          sceneId,
          annotations: anns.map(a => ({
            id: a.id,
            line: a.line,
            startCol: a.startCol,
            endCol: a.endCol,
            type: a.type,
            severity: a.severity,
            message: a.message,
            suggestion: a.suggestion,
            context: a.context,
            textHash: a.textHash,
          }))
        }
      });
    } catch (err) {
      console.error('Failed to save annotations:', err);
    }
  }, [sceneId]);
  
  // Analysiere einen einzelnen Absatz (für Echtzeit-Lektorat)
  const analyzeParagraph = useCallback(async (paragraph: string, _startLine: number) => {
    if (!paragraph.trim()) return;
    
    setIsAnalyzing(true);
    setAnalysisProgress(50);
    setStreamBuffer('');
    
    try {
      const sessionId = await invoke<string>('analyze_lektorat_ai', {
        req: {
          text: paragraph,
          sceneId,
          lang: i18n.language,
        }
      });
      setCurrentSessionId(sessionId);
    } catch (err) {
      setError(String(err));
      setIsAnalyzing(false);
    }
  }, [sceneId, i18n.language]);
  
  // Vollständige Re-Evaluation der Szene
  const reEvaluateScene = useCallback(async () => {
    if (isAnalyzing || !content.trim() || !sceneId) return;
    
    setIsAnalyzing(true);
    setAnalysisProgress(0);
    setError(null);
    setStreamBuffer('');
    
    try {
      // Lösche alte aktive Annotations
      await invoke('clear_scene_lektorat', { sceneId });
      setAnnotations(prev => prev.filter(a => a.status !== 'active'));
      
      // Starte neue Analyse
      const sessionId = await invoke<string>('analyze_lektorat_ai', {
        req: {
          text: content,
          sceneId,
          lang: i18n.language,
        }
      });
      setCurrentSessionId(sessionId);
    } catch (err) {
      setError(String(err));
      setIsAnalyzing(false);
    }
  }, [content, isAnalyzing, sceneId, i18n.language]);
  
  // Annotation klicken - zeige Details und highlighte Text
  const handleAnnotationClick = useCallback((annotation: LektoratAnnotation) => {
    setExpandedAnnotation(
      expandedAnnotation === annotation.id ? null : annotation.id
    );
    onAnnotationClick?.(annotation);
    onHighlightText?.(annotation.line, annotation.startCol, annotation.endCol);
  }, [expandedAnnotation, onAnnotationClick, onHighlightText]);
  
  // Vorschlag anwenden
  const handleApplySuggestion = useCallback(async (annotation: LektoratAnnotation, e: React.MouseEvent) => {
    e.stopPropagation();
    onApplySuggestion?.(annotation);
    
    // Markiere als resolved
    try {
      await invoke('dismiss_lektorat_annotation', {
        req: {
          annotationId: annotation.id,
          status: 'resolved'
        }
      });
      setAnnotations(prev => prev.map(a => 
        a.id === annotation.id ? { ...a, status: 'resolved' as const } : a
      ));
    } catch (err) {
      console.error('Failed to resolve annotation:', err);
    }
  }, [onApplySuggestion]);
  
  // Annotation als erledigt/irrelevant markieren
  const dismissAnnotation = useCallback(async (annotationId: string, status: 'dismissed' | 'resolved', e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      await invoke('dismiss_lektorat_annotation', {
        req: {
          annotationId,
          status
        }
      });
      setAnnotations(prev => prev.map(a => 
        a.id === annotationId ? { ...a, status } : a
      ));
    } catch (err) {
      console.error('Failed to dismiss annotation:', err);
    }
  }, []);
  
  // Severity Icon
  const getSeverityIcon = (severity: LektoratAnnotation['severity']) => {
    switch (severity) {
      case 'error': return '🔴';
      case 'warning': return '🟡';
      case 'info': return '🔵';
    }
  };
  
  // Type Icon
  const getTypeIcon = (type: LektoratAnnotation['type']) => {
    switch (type) {
      case 'spelling': return '📝';
      case 'grammar': return '📐';
      case 'style': return '✨';
      case 'suggestion': return '💡';
      case 'repetition': return '🔄';
      case 'clarity': return '🔍';
    }
  };
  
  // Count active annotations
  const activeCount = annotations.filter(a => a.status === 'active').length;
  
  if (!visible) {
    return (
      <div className="lektorat-sidebar-collapsed">
        <button 
          className="lektorat-toggle-btn"
          onClick={onToggle}
          title={t('lektorat.show', 'Lektorat anzeigen')}
        >
          📝
          {activeCount > 0 && (
            <span className="lektorat-badge-mini">{activeCount}</span>
          )}
        </button>
      </div>
    );
  }
  
  return (
    <div className="lektorat-editor-sidebar">
      {/* Header */}
      <div className="lektorat-header">
        <div className="lektorat-title">
          <span className="lektorat-icon">📝</span>
          <span>{t('lektorat.title', 'Lektorat')}</span>
          {activeCount > 0 && (
            <span className="lektorat-count">{activeCount}</span>
          )}
        </div>
        <div className="lektorat-actions">
          <button 
            className="lektorat-analyze-btn"
            onClick={reEvaluateScene}
            disabled={isAnalyzing || !content.trim()}
            title={t('lektorat.reEvaluate', 'Szene neu analysieren')}
          >
            {isAnalyzing ? '⏳' : '🔄'}
          </button>
          <button 
            className="lektorat-close-btn"
            onClick={onToggle}
            title={t('lektorat.hide', 'Lektorat ausblenden')}
          >
            ✕
          </button>
        </div>
      </div>
      
      {/* Realtime Status */}
      {realtimeLektorat && (
        <div className="lektorat-realtime-indicator">
          <span className="realtime-dot" />
          <span>{t('lektorat.realtime', 'Echtzeit aktiv')}</span>
        </div>
      )}
      
      {/* Progress Bar */}
      {isAnalyzing && (
        <div className="lektorat-progress">
          <ProgressFill progress={analysisProgress} />
          <span className="lektorat-progress-text">
            {analysisProgress < 100 ? t('lektorat.analyzing', 'Analysiere...') : '✓'}
          </span>
        </div>
      )}
      
      {/* Error */}
      {error && (
        <div className="lektorat-error">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}
      
      {/* Annotations Container - scrollt mit Editor */}
      <div className="lektorat-annotations-container">
        <ScrollOffset offset={editorScrollTop}>
          <LineSpacer height={totalLines * lineHeight}>
            {Array.from(annotationsByLine.entries()).map(([line, lineAnnotations]) => (
              <LineAnnotationGroup
                key={`line-${line}`}
                top={(line - 1) * lineHeight}
              >
                {lineAnnotations.map(annotation => (
                  <div
                    key={annotation.id}
                    className={`lektorat-annotation lektorat-${annotation.severity} ${
                      expandedAnnotation === annotation.id ? 'expanded' : ''
                    }`}
                    onClick={() => handleAnnotationClick(annotation)}
                  >
                    <div className="annotation-header">
                      <span className="annotation-icons">
                        {getSeverityIcon(annotation.severity)}
                        {getTypeIcon(annotation.type)}
                      </span>
                      <span className="annotation-preview">
                        {annotation.message.slice(0, 25)}
                        {annotation.message.length > 25 ? '…' : ''}
                      </span>
                    </div>
                    
                    {expandedAnnotation === annotation.id && (
                      <div className="annotation-details">
                        <p className="annotation-message">{annotation.message}</p>
                        {annotation.context && (
                          <p className="annotation-context">
                            <em>„{annotation.context}"</em>
                          </p>
                        )}
                        {annotation.suggestion && (
                          <div className="annotation-suggestion">
                            <span>💡 {annotation.suggestion}</span>
                            <button
                              className="apply-suggestion-btn"
                              onClick={(e) => handleApplySuggestion(annotation, e)}
                            >
                              ✓ {t('lektorat.apply', 'Anwenden')}
                            </button>
                          </div>
                        )}
                        <div className="annotation-actions">
                          <button
                            className="resolve-btn"
                            onClick={(e) => dismissAnnotation(annotation.id, 'resolved', e)}
                            title={t('lektorat.markResolved', 'Als erledigt markieren')}
                          >
                            ✓ {t('lektorat.resolved', 'Erledigt')}
                          </button>
                          <button
                            className="dismiss-btn"
                            onClick={(e) => dismissAnnotation(annotation.id, 'dismissed', e)}
                            title={t('lektorat.markIrrelevant', 'Als irrelevant markieren')}
                          >
                            ✗ {t('lektorat.dismiss', 'Ignorieren')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </LineAnnotationGroup>
            ))}
          </LineSpacer>
        </ScrollOffset>
      </div>
      
      {/* Empty State */}
      {!isAnalyzing && activeCount === 0 && (
        <div className="lektorat-empty">
          <span className="empty-icon">📖</span>
          <p>{t('lektorat.empty', 'Klicke auf 🔄 um die Szene zu analysieren')}</p>
          {realtimeLektorat && (
            <p className="empty-hint">{t('lektorat.realtimeHint', 'Echtzeit-Lektorat analysiert automatisch bei Absatz-Ende')}</p>
          )}
        </div>
      )}
      
      {/* Human Comments Section */}
      <div className="human-comments">
        <div className="human-comments-header">
          <div className="title">
            <span className="icon">🧑‍💻</span>
            <span>{t('humanComments.title', 'Menschliche Kommentare')}</span>
            <span className="count">{humanCommentList.length}</span>
          </div>
          <div className="badges">
            <span className="badge badge-open">{humanCommentList.filter(c => c.status === 'open').length} offen</span>
            <span className="badge badge-accepted">{humanCommentList.filter(c => c.status === 'accepted').length} akzeptiert</span>
            <span className="badge badge-rejected">{humanCommentList.filter(c => c.status === 'rejected').length} verworfen</span>
          </div>
        </div>

        <div className="human-comments-form">
          <label className="form-label">Kommentar</label>
          <textarea
            value={commentNote}
            onChange={(e) => setCommentNote(e.target.value)}
            placeholder={t('humanComments.notePlaceholder', 'Kommentar zu aktueller Auswahl')}
            rows={2}
          />
          <label className="form-label">Vorschlag (optional)</label>
          <input
            type="text"
            value={commentSuggestion}
            onChange={(e) => setCommentSuggestion(e.target.value)}
            placeholder={t('humanComments.suggestionPlaceholder', 'Ersetze Auswahl durch...')}
          />
          <button
            className="btn add-comment-btn"
            disabled={!commentNote.trim() || !onAddComment}
            onClick={handleAddComment}
          >
            ➕ {t('humanComments.add', 'Kommentar anfügen')}
          </button>
        </div>

        {humanCommentList.length === 0 && (
          <div className="human-comments-empty">
            <span>Keine Kommentare</span>
            <small>{t('humanComments.emptyHint', 'Markiere Text im Editor und füge oben einen Kommentar hinzu.')}</small>
          </div>
        )}

        {humanCommentList.length > 0 && (
          <div className="human-comments-list">
            {humanCommentList.map((comment) => (
              <div
                key={comment.id}
                className={`human-comment-card status-${comment.status}`}
                onMouseEnter={() => onFocusComment?.(comment.id)}
                onClick={() => onFocusComment?.(comment.id)}
              >
                <div className="human-comment-header">
                  <span className={`status status-${comment.status}`}>{statusLabel(comment.status)}</span>
                  <span className="range">Zeichen {comment.from}–{comment.to}</span>
                </div>
                <div className="human-comment-text">„{comment.text.slice(0, 120)}{comment.text.length > 120 ? '…' : ''}“</div>
                <div className="human-comment-note">{comment.note}</div>
                {comment.suggestion && (
                  <div className="human-comment-suggestion">💡 {t('humanComments.suggestion', 'Vorschlag')}: {comment.suggestion}</div>
                )}
                <div className="human-comment-actions">
                  <button
                    className="btn btn-ghost"
                    onClick={(e) => { e.stopPropagation(); onFocusComment?.(comment.id); }}
                  >
                    🔍 {t('humanComments.focus', 'Hervorheben')}
                  </button>
                  <button
                    className="btn btn-success"
                    disabled={comment.status !== 'open' || !comment.suggestion}
                    onClick={(e) => { e.stopPropagation(); onApplyComment?.(comment.id); }}
                  >
                    ✓ {t('humanComments.apply', 'Übernehmen')}
                  </button>
                  <button
                    className="btn btn-secondary"
                    disabled={comment.status !== 'open'}
                    onClick={(e) => { e.stopPropagation(); onRejectComment?.(comment.id); }}
                  >
                    ✕ {t('humanComments.reject', 'Verwerfen')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      {activeCount > 0 && (
        <div className="lektorat-stats">
          <span className="stat error">
            🔴 {annotations.filter(a => a.status === 'active' && a.severity === 'error').length}
          </span>
          <span className="stat warning">
            🟡 {annotations.filter(a => a.status === 'active' && a.severity === 'warning').length}
          </span>
          <span className="stat info">
            🔵 {annotations.filter(a => a.status === 'active' && a.severity === 'info').length}
          </span>
        </div>
      )}
    </div>
  );
};

export default LektoratEditorSidebar;
