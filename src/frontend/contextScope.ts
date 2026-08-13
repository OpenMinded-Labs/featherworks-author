/**
 * Decides which slice of a scene the model should see.
 *
 * Feeding the whole scene is wrong for local edits: asked to "rephrase this",
 * the model cannot tell which part is meant. Feeding only a paragraph is wrong
 * for questions about the scene as a whole.
 *
 * Rule: an explicit selection wins, otherwise the paragraph under the cursor,
 * otherwise the whole scene.
 */

export type ContextScope = 'selection' | 'paragraph' | 'scene';

export interface EditorFocus {
  /** Text of the current selection, empty when nothing is selected. */
  selectedText: string;
  /** Cursor offset in the document, used to locate the paragraph. */
  cursorOffset: number;
}

export interface ScopedContext {
  text: string;
  scope: ContextScope;
  /** 1-based paragraph number, only set for scope === 'paragraph'. */
  paragraphIndex?: number;
}

/** Paragraphs are separated by one or more blank lines. */
const PARAGRAPH_SEPARATOR = /\n\s*\n/;

/**
 * Fallback separator. Not every manuscript uses blank lines - prose written
 * with a single newline per paragraph would otherwise collapse into one block
 * and never scope to a paragraph at all.
 */
const SINGLE_NEWLINE_SEPARATOR = /\n/;

/**
 * A selection shorter than this is treated as a pointer rather than content -
 * a double-clicked word should not become the entire context.
 */
const MIN_SELECTION_CHARS = 15;

function splitOn(text: string, separator: RegExp): Array<{ text: string; from: number; to: number }> {
  const result: Array<{ text: string; from: number; to: number }> = [];
  let offset = 0;

  for (const chunk of text.split(separator)) {
    const start = text.indexOf(chunk, offset);
    if (start === -1) continue;
    if (chunk.trim().length > 0) {
      result.push({ text: chunk, from: start, to: start + chunk.length });
    }
    offset = start + chunk.length;
  }

  return result;
}

/**
 * Splits into paragraphs while keeping each one's offset range, so a cursor
 * position can be mapped back to the paragraph containing it.
 */
export function splitParagraphs(text: string): Array<{ text: string; from: number; to: number }> {
  const byBlankLine = splitOn(text, PARAGRAPH_SEPARATOR);
  if (byBlankLine.length > 1) return byBlankLine;

  // Only one block: either the scene really is one paragraph, or it uses
  // single newlines. Retry - if that yields more, it was the latter.
  const byNewline = splitOn(text, SINGLE_NEWLINE_SEPARATOR);
  return byNewline.length > byBlankLine.length ? byNewline : byBlankLine;
}

/** Paragraph containing `offset`, or null if the scene has none. */
export function paragraphAt(
  text: string,
  offset: number,
): { text: string; index: number } | null {
  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) return null;

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    // `to` is inclusive here: a cursor resting at the end of a paragraph still
    // belongs to it, not to the next one.
    if (offset >= p.from && offset <= p.to) {
      return { text: p.text, index: i + 1 };
    }
  }

  // Cursor sits in the gap between paragraphs (or past the end): use the last
  // paragraph that starts before it.
  const preceding = paragraphs.filter((p) => p.from <= offset);
  if (preceding.length > 0) {
    const last = preceding[preceding.length - 1];
    return { text: last.text, index: preceding.length };
  }

  return { text: paragraphs[0].text, index: 1 };
}

/**
 * Picks the context for a request.
 *
 * `focus` is null when the editor has no cursor (panel opened without focus),
 * in which case the whole scene is used.
 */
export function resolveContextScope(
  sceneContent: string,
  focus: EditorFocus | null,
): ScopedContext {
  if (!sceneContent.trim()) {
    return { text: '', scope: 'scene' };
  }

  const selection = focus?.selectedText?.trim() ?? '';
  if (selection.length >= MIN_SELECTION_CHARS) {
    return { text: selection, scope: 'selection' };
  }

  if (focus && sceneContent.length > 0) {
    const paragraph = paragraphAt(sceneContent, focus.cursorOffset);
    // A single paragraph that is nearly the whole scene adds no focus, so keep
    // the scene label rather than pretending to have narrowed anything.
    if (paragraph && paragraph.text.length < sceneContent.length * 0.9) {
      return {
        text: paragraph.text,
        scope: 'paragraph',
        paragraphIndex: paragraph.index,
      };
    }
  }

  return { text: sceneContent, scope: 'scene' };
}
