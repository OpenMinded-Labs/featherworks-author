/**
 * Decides which slice of a scene the model should see.
 *
 * Feeding the whole scene is wrong for local edits: asked to "rephrase this",
 * the model cannot tell which part is meant. Feeding only a fragment is wrong
 * for questions about the scene as a whole.
 *
 * The user decides explicitly by marking paragraphs in the editor. Nothing is
 * inferred from the cursor: an editor that was never touched still reports a
 * cursor at offset 0, which used to silently narrow every request to the first
 * paragraph.
 *
 * Rule: marked paragraphs win, otherwise a substantial selection, otherwise
 * the whole scene.
 */

export type ContextScope = 'selection' | 'paragraphs' | 'scene';

/** A range of the document the user marked as relevant. */
export interface MarkedRange {
  from: number;
  to: number;
}

export interface EditorFocus {
  /** Text of the current selection, empty when nothing is selected. */
  selectedText: string;
  /** Paragraphs the user explicitly marked. Empty means "no opinion". */
  markedParagraphs: MarkedRange[];
}

export interface ScopedContext {
  text: string;
  scope: ContextScope;
  /** 1-based paragraph numbers, only set for scope === 'paragraphs'. */
  paragraphIndices?: number[];
}

export interface Paragraph {
  text: string;
  from: number;
  to: number;
}

/** Paragraphs are separated by one or more blank lines. */
const PARAGRAPH_SEPARATOR = /\n\s*\n/;

/**
 * Fallback separator. Not every manuscript uses blank lines - prose written
 * with a single newline per paragraph would otherwise collapse into one block
 * and could never be marked paragraph by paragraph.
 */
const SINGLE_NEWLINE_SEPARATOR = /\n/;

/**
 * A selection shorter than this is treated as a pointer rather than content -
 * a double-clicked word should not become the entire context.
 */
const MIN_SELECTION_CHARS = 15;

function splitOn(text: string, separator: RegExp): Paragraph[] {
  const result: Paragraph[] = [];
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
 * Splits into paragraphs while keeping each one's offset range, so a click
 * position can be mapped back to the paragraph containing it.
 *
 * This is the single definition of "paragraph" in the app: the editor uses it
 * to decide what a click marks, and the context builder uses it to decide what
 * the model sees. If the two disagreed, the highlight would not match the
 * context the model actually gets.
 */
export function splitParagraphs(text: string): Paragraph[] {
  const byBlankLine = splitOn(text, PARAGRAPH_SEPARATOR);
  if (byBlankLine.length > 1) return byBlankLine;

  // Only one block: either the scene really is one paragraph, or it uses
  // single newlines. Retry - if that yields more, it was the latter.
  const byNewline = splitOn(text, SINGLE_NEWLINE_SEPARATOR);
  return byNewline.length > byBlankLine.length ? byNewline : byBlankLine;
}

/**
 * The paragraph containing `offset`, or null when the offset sits in the gap
 * between paragraphs (a blank line).
 */
export function paragraphRangeAt(
  text: string,
  offset: number,
): (Paragraph & { index: number }) | null {
  const paragraphs = splitParagraphs(text);

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    // `to` is inclusive: a click at the very end of a paragraph belongs to it.
    if (offset >= p.from && offset <= p.to) {
      return { ...p, index: i + 1 };
    }
  }

  return null;
}

/** Do two ranges share at least one character? */
function overlaps(a: MarkedRange, b: { from: number; to: number }): boolean {
  return a.from < b.to && a.to > b.from;
}

/**
 * Picks the context for a request.
 *
 * `focus` is null when the editor is not mounted, in which case the whole
 * scene is used.
 */
export function resolveContextScope(
  sceneContent: string,
  focus: EditorFocus | null,
): ScopedContext {
  if (!sceneContent.trim()) {
    return { text: '', scope: 'scene' };
  }

  // Marks beat a selection: they are visible and persistent, so the user has
  // committed to them, while a selection can happen by accident (a stray drag,
  // a double-clicked word).
  const marks = focus?.markedParagraphs ?? [];
  if (marks.length > 0) {
    const chosen = splitParagraphs(sceneContent)
      .map((paragraph, i) => ({ paragraph, index: i + 1 }))
      .filter(({ paragraph }) => marks.some((m) => overlaps(m, paragraph)));

    if (chosen.length > 0) {
      return {
        // Always in document order, regardless of the order they were clicked.
        text: chosen.map((c) => c.paragraph.text).join('\n\n'),
        scope: 'paragraphs',
        paragraphIndices: chosen.map((c) => c.index),
      };
    }
  }

  const selection = focus?.selectedText?.trim() ?? '';
  if (selection.length >= MIN_SELECTION_CHARS) {
    return { text: selection, scope: 'selection' };
  }

  return { text: sceneContent, scope: 'scene' };
}
