/**
 * WebWorker for word/character counting
 * Offloads text analysis from main thread for large documents
 */

interface CountResult {
  words: number;
  chars: number;
  charsNoSpaces: number;
  paragraphs: number;
  sentences: number;
  readingTimeMin: number; // ~200 wpm average
}

function countText(text: string): CountResult {
  if (!text || text.trim().length === 0) {
    return { words: 0, chars: 0, charsNoSpaces: 0, paragraphs: 0, sentences: 0, readingTimeMin: 0 };
  }

  const chars = text.length;
  const charsNoSpaces = text.replace(/\s/g, '').length;
  
  // Words: split on whitespace, filter empty
  const words = text.split(/\s+/).filter(w => w.length > 0).length;
  
  // Paragraphs: double newline or more
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0).length || 1;
  
  // Sentences: rough heuristic (. ! ?)
  const sentences = (text.match(/[.!?]+(\s|$)/g) || []).length || 1;
  
  // Reading time at ~200 wpm
  const readingTimeMin = Math.max(1, Math.round(words / 200));

  return { words, chars, charsNoSpaces, paragraphs, sentences, readingTimeMin };
}

// Worker message handler
self.onmessage = (e: MessageEvent<{ text: string; id?: string }>) => {
  const { text, id } = e.data;
  const result = countText(text);
  self.postMessage({ id, ...result });
};

export {}; // Make this a module
