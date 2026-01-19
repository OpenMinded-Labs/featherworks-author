import { useState, useEffect, useRef, useCallback } from 'react';

export interface WordCountStats {
  words: number;
  chars: number;
  charsNoSpaces: number;
  paragraphs: number;
  sentences: number;
  readingTimeMin: number;
}

const defaultStats: WordCountStats = {
  words: 0,
  chars: 0,
  charsNoSpaces: 0,
  paragraphs: 0,
  sentences: 0,
  readingTimeMin: 0,
};

/**
 * Hook for debounced word counting, optionally via WebWorker
 */
export function useWordCount(text: string, debounceMs = 200): WordCountStats {
  const [stats, setStats] = useState<WordCountStats>(defaultStats);
  const workerRef = useRef<Worker | null>(null);
  const timeoutRef = useRef<number | null>(null);

  // Try to create worker on mount
  useEffect(() => {
    try {
      // Vite supports ?worker imports but for simplicity we'll use inline fallback
      const blob = new Blob([`
        function countText(text) {
          if (!text || text.trim().length === 0) {
            return { words: 0, chars: 0, charsNoSpaces: 0, paragraphs: 0, sentences: 0, readingTimeMin: 0 };
          }
          const chars = text.length;
          const charsNoSpaces = text.replace(/\\s/g, '').length;
          const words = text.split(/\\s+/).filter(w => w.length > 0).length;
          const paragraphs = text.split(/\\n\\s*\\n/).filter(p => p.trim().length > 0).length || 1;
          const sentences = (text.match(/[.!?]+(\\s|$)/g) || []).length || 1;
          const readingTimeMin = Math.max(1, Math.round(words / 200));
          return { words, chars, charsNoSpaces, paragraphs, sentences, readingTimeMin };
        }
        self.onmessage = function(e) {
          var result = countText(e.data.text);
          result.id = e.data.id;
          self.postMessage(result);
        };
      `], { type: 'application/javascript' });
      workerRef.current = new Worker(URL.createObjectURL(blob));
      workerRef.current.onmessage = (e) => {
        setStats(e.data);
      };
    } catch {
      // Worker not supported, fallback to sync
      workerRef.current = null;
    }
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  // Fallback sync counting
  const countSync = useCallback((t: string): WordCountStats => {
    if (!t || t.trim().length === 0) return defaultStats;
    const chars = t.length;
    const charsNoSpaces = t.replace(/\s/g, '').length;
    const words = t.split(/\s+/).filter(w => w.length > 0).length;
    const paragraphs = t.split(/\n\s*\n/).filter(p => p.trim().length > 0).length || 1;
    const sentences = (t.match(/[.!?]+(\s|$)/g) || []).length || 1;
    const readingTimeMin = Math.max(1, Math.round(words / 200));
    return { words, chars, charsNoSpaces, paragraphs, sentences, readingTimeMin };
  }, []);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      if (workerRef.current) {
        workerRef.current.postMessage({ text, id: Date.now().toString() });
      } else {
        setStats(countSync(text));
      }
    }, debounceMs);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [text, debounceMs, countSync]);

  return stats;
}
