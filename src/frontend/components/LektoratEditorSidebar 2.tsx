// LektoratEditorSidebar.tsx
// Lektorat-Anmerkungen neben dem Editor, auf Zeilenhöhe synchronisiert

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
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
}

interface LektoratEditorSidebarProps {
  content: string;
  editorScrollTop: number;
  lineHeight?: number;
  visible: boolean;
  onToggle: () => void;
  onAnnotationClick?: (annotation: LektoratAnnotation) => void;
  onApplySuggestion?: (annotation: LektoratAnnotation) => void;
}

interface AnalysisChunk {
  startLine: number;
  endLine: number;
  text: string;
  analyzed: boolean;
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
  editorScrollTop,
  lineHeight = 24,
  visible,
  onToggle,
  onAnnotationClick,
  onApplySuggestion
}) => {
  const { t } = useTranslation();
  
  const [annotations, setAnnotations] = useState<LektoratAnnotation[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [expandedAnnotation, setExpandedAnnotation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Berechne Zeilenanzahl
  const lines = useMemo(() => content.split('\n'), [content]);
  const totalLines = lines.length;
  
  // Gruppiere Annotations nach Zeile
  const annotationsByLine = useMemo(() => {
    const grouped = new Map<number, LektoratAnnotation[]>();
    annotations.forEach(ann => {
      const existing = grouped.get(ann.line) || [];
      existing.push(ann);
      grouped.set(ann.line, existing);
    });
    return grouped;
  }, [annotations]);
  
  // Chunked Analysis für lange Texte
  const createChunks = useCallback((text: string): AnalysisChunk[] => {
    const textLines = text.split('\n');
    const chunks: AnalysisChunk[] = [];
    const linesPerChunk = 50; // ~50 Zeilen pro Chunk
    const overlap = 5; // 5 Zeilen Überlappung für Kontext
    
    for (let i = 0; i < textLines.length; i += linesPerChunk - overlap) {
      const startLine = i + 1;
      const endLine = Math.min(i + linesPerChunk, textLines.length);
      const chunkLines = textLines.slice(i, endLine);
      
      chunks.push({
        startLine,
        endLine,
        text: chunkLines.join('\n'),
        analyzed: false
      });
      
      if (endLine >= textLines.length) break;
    }
    
    return chunks;
  }, []);
  
  // Analyse eines einzelnen Chunks
  const analyzeChunk = useCallback(async (
    chunk: AnalysisChunk, 
    chunkIndex: number,
    totalChunks: number
  ): Promise<LektoratAnnotation[]> => {
    try {
      const response = await invoke<{ annotations: LektoratAnnotation[] }>('analyze_lektorat_ai', {
        req: {
          content: chunk.text,
          startLine: chunk.startLine,
          analysisTypes: ['spelling', 'grammar', 'style', 'repetition', 'clarity'],
          language: 'de'
        }
      });
      
      // Fortschritt aktualisieren
      setAnalysisProgress(Math.round(((chunkIndex + 1) / totalChunks) * 100));
      
      return response.annotations.map((ann, idx) => ({
        ...ann,
        id: `${chunk.startLine}-${idx}-${Date.now()}`,
        line: ann.line + chunk.startLine - 1 // Offset korrigieren
      }));
    } catch (err) {
      console.error('Chunk analysis failed:', err);
      return [];
    }
  }, []);
  
  // Vollständige Analyse starten
  const startAnalysis = useCallback(async () => {
    if (isAnalyzing || !content.trim()) return;
    
    setIsAnalyzing(true);
    setAnalysisProgress(0);
    setAnnotations([]);
    setError(null);
    
    try {
      const chunks = createChunks(content);
      const allAnnotations: LektoratAnnotation[] = [];
      
      // Sequentielle Verarbeitung für bessere UX
      for (let i = 0; i < chunks.length; i++) {
        const chunkAnnotations = await analyzeChunk(chunks[i], i, chunks.length);
        allAnnotations.push(...chunkAnnotations);
        
        // Live-Update der Annotations
        setAnnotations([...allAnnotations]);
      }
      
      setAnalysisProgress(100);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsAnalyzing(false);
    }
  }, [content, isAnalyzing, createChunks, analyzeChunk]);
  
  // Annotation klicken
  const handleAnnotationClick = useCallback((annotation: LektoratAnnotation) => {
    setExpandedAnnotation(
      expandedAnnotation === annotation.id ? null : annotation.id
    );
    onAnnotationClick?.(annotation);
  }, [expandedAnnotation, onAnnotationClick]);
  
  // Vorschlag anwenden
  const handleApplySuggestion = useCallback((annotation: LektoratAnnotation, e: React.MouseEvent) => {
    e.stopPropagation();
    onApplySuggestion?.(annotation);
    // Entferne die Annotation nach Anwendung
    setAnnotations(prev => prev.filter(a => a.id !== annotation.id));
  }, [onApplySuggestion]);
  
  // Annotation verwerfen
  const dismissAnnotation = useCallback((annotationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAnnotations(prev => prev.filter(a => a.id !== annotationId));
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
  
  if (!visible) {
    return (
      <div className="lektorat-sidebar-collapsed">
        <button 
          className="lektorat-toggle-btn"
          onClick={onToggle}
          title={t('lektorat.show', 'Lektorat anzeigen')}
        >
          📝
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
          <span className="lektorat-count">{annotations.length}</span>
        </div>
        <div className="lektorat-actions">
          <button 
            className="lektorat-analyze-btn"
            onClick={startAnalysis}
            disabled={isAnalyzing || !content.trim()}
            title={t('lektorat.analyze', 'Text analysieren')}
          >
            {isAnalyzing ? '⏳' : '🔍'}
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
      
      {/* Progress Bar */}
      {isAnalyzing && (
        <div className="lektorat-progress">
          <ProgressFill progress={analysisProgress} />
          <span className="lektorat-progress-text">{analysisProgress}%</span>
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
                        {annotation.message.slice(0, 30)}
                        {annotation.message.length > 30 ? '…' : ''}
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
                            className="dismiss-btn"
                            onClick={(e) => dismissAnnotation(annotation.id, e)}
                          >
                            {t('lektorat.dismiss', 'Ignorieren')}
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
      {!isAnalyzing && annotations.length === 0 && (
        <div className="lektorat-empty">
          <span className="empty-icon">📖</span>
          <p>{t('lektorat.empty', 'Klicke auf 🔍 um den Text zu analysieren')}</p>
        </div>
      )}
      
      {/* Stats */}
      {annotations.length > 0 && (
        <div className="lektorat-stats">
          <span className="stat error">
            🔴 {annotations.filter(a => a.severity === 'error').length}
          </span>
          <span className="stat warning">
            🟡 {annotations.filter(a => a.severity === 'warning').length}
          </span>
          <span className="stat info">
            🔵 {annotations.filter(a => a.severity === 'info').length}
          </span>
        </div>
      )}
    </div>
  );
};

export default LektoratEditorSidebar;
