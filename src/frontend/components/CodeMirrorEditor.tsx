import React, { useEffect, useRef, useCallback } from 'react';
import { EditorState, StateEffect, StateField, Text, Range } from '@codemirror/state';
import { EditorView, keymap, highlightActiveLine, Decoration, DecorationSet, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { history, historyKeymap, undo, redo } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { hasSynonyms } from '../thesaurusService';
import { checkSpellingDebounced, isInCustomDictionary, SpellError } from '../spellcheckService';
import { 
  checkWithLanguageTool, 
  findWordRepetitions, 
  loadProofreadingSettings,
  LtIssue,
  IssueType,
  WordRepetition
} from '../languageToolService';
import { fetchEntityHighlights, findEntityMatches, EntityMatch, EntityHighlight } from '../entityHighlightService';
import { TypewriterSound } from '../typewriterSoundService';
import i18n from '../i18n';
import type { WordInfo } from './SynonymTooltip';
import type { SpellErrorInfo } from './SpellcheckTooltip';
import type { EntityTooltipInfo } from './EntityTooltip';
import type { SelectionInfo } from './EditorContextMenu';
import { paragraphRangeAt, type MarkedRange } from '../contextScope';

// Extended error info for all issue types
export interface ProofreadingErrorInfo {
  word: string;
  from: number;
  to: number;
  x: number;
  y: number;
  issueType: 'spelling' | 'grammar' | 'punctuation' | 'style' | 'typography' | 'repetition';
  message?: string;
  suggestions?: string[];
  lang?: 'de' | 'en';
}

interface Props { 
  value:string; 
  onChange:(v:string)=>void; 
  command$?: (runner:(cmd:string)=>void)=>void; 
  findQuery?:string; 
  regex?:boolean; 
  searchApi$?: (api:{ next:()=>void; prev:()=>void; replaceOne:(replacement:string)=>void; replaceAll:(replacement:string)=>void })=>void;
  commentApi$?: (api:{
    getSelection: () => { from:number; to:number; text:string } | null;
    /** Selection plus the paragraphs the user marked, for scoping AI context (see contextScope.ts). */
    getFocus: () => { selectedText:string; markedParagraphs: MarkedRange[] } | null;
  })=>void;
  onSynonymRequest?: (wordInfo: WordInfo | null) => void;
  onSpellErrorClick?: (errorInfo: SpellErrorInfo | null) => void;
  onProofreadingErrorClick?: (errorInfo: ProofreadingErrorInfo | null) => void;
  onEntityHover?: (info: EntityTooltipInfo | null) => void;
  onSelectionContextMenu?: (info: SelectionInfo) => void;
  entityHighlightEnabled?: boolean;
  editorLanguage?: 'de' | 'en';  // Editor language for spellcheck
  onScroll?: (scrollTop: number) => void;
  lektoratHighlight?: { from: number; to: number; id?: string } | null;
  typewriterMode?: boolean;  // Keep cursor vertically centered
  typewriterSound?: boolean;  // Play typewriter sounds
  typewriterVolume?: number;  // Sound volume 0-1
}

// Effects & field for search highlights
interface Match { from:number; to:number }
const setSearchMatches = StateEffect.define<{matches:Match[]; active:number}|null>();
const searchDecoField = StateField.define<DecorationSet>({
  create() { return Decoration.none; },
  update(old, tr) {
    for(const e of tr.effects){
      if(e.is(setSearchMatches)) {
        const payload = e.value; if(!payload) return Decoration.none;
        const { matches, active } = payload;
        // Filter out invalid ranges (from must be < to)
        const validMatches = matches.filter(m => m.from < m.to);
        if (validMatches.length === 0) return Decoration.none;
        return Decoration.set(validMatches.map((m,i)=> Decoration.mark({ class: 'cm-search-hit'+(i===active?' cm-search-hit-active':'') }).range(m.from, m.to)));
      }
    }
    if(tr.docChanged) return Decoration.none; // recompute externally on value change
    return old;
  },
  provide: f => EditorView.decorations.from(f)
});

// ---- Paragraph marking: the user picks what Fontaine sees ----
//
// Nothing here is inferred. Earlier the cursor position decided the AI
// context, which meant an editor that had never been touched still reported a
// cursor at offset 0 and silently narrowed every request to the first
// paragraph. Marks are explicit, visible and persistent instead.

const toggleParagraphMark = StateEffect.define<{ from: number; to: number }>();
const clearParagraphMarks = StateEffect.define<null>();

const paragraphMarkDeco = Decoration.mark({ class: 'cm-context-paragraph' });

const paragraphMarkField = StateField.define<DecorationSet>({
  create() { return Decoration.none; },
  update(marks, tr) {
    // Marks stay glued to their text while the user keeps writing above them.
    marks = marks.map(tr.changes);

    for (const e of tr.effects) {
      if (e.is(clearParagraphMarks)) {
        marks = Decoration.none;
        continue;
      }
      if (!e.is(toggleParagraphMark)) continue;

      const { from, to } = e.value;
      // Collect into an array rather than a single variable: assigning inside
      // the callback would leave TypeScript narrowing it to `null`.
      const existing: Array<{ from: number; to: number }> = [];
      marks.between(from, to, (mFrom, mTo) => {
        existing.push({ from: mFrom, to: mTo });
      });

      marks = existing.length > 0
        ? marks.update({
            filter: (f, t) => !existing.some(x => x.from === f && x.to === t),
          })
        : marks.update({ add: [paragraphMarkDeco.range(from, to)] });
    }
    return marks;
  },
  provide: f => EditorView.decorations.from(f)
});

/** The marked ranges, in document order. */
function readParagraphMarks(state: EditorState): Array<{ from: number; to: number }> {
  const out: Array<{ from: number; to: number }> = [];
  state.field(paragraphMarkField).between(0, state.doc.length, (from, to) => {
    out.push({ from, to });
  });
  return out;
}

/**
 * Whether a mouse event is the "mark this paragraph" gesture.
 *
 * Split out from the handler so the condition can be checked directly. Which
 * clicks mark and which do not is the whole point of this feature, and it was
 * wrong once already: a plain click used to mark, which fired on every click
 * into the text while writing.
 */
export function isParagraphMarkGesture(
  event: Pick<MouseEvent, 'button' | 'altKey' | 'metaKey' | 'ctrlKey'>,
): boolean {
  // Alt alone is a text-selection modifier in CodeMirror (block select), so
  // the platform's command key has to be part of the combination.
  const withCommandKey = event.metaKey || event.ctrlKey;
  return event.button === 0 && event.altKey && withCommandKey;
}

/**
 * Cmd+Alt+click (Ctrl+Alt on Windows/Linux) toggles the paragraph under the
 * pointer.
 *
 * A plain click cannot be used for this. It is the ordinary way to place the
 * caret while writing, and it already drives the synonym lookup, which runs on
 * every cursor move. Marking on a plain click meant every click into the text
 * silently changed what Fontaine reads, and it collided with the tooltip.
 *
 * The event is deliberately *not* consumed, so CodeMirror still places the
 * caret. Marking is reversible by repeating the same combination.
 */
const paragraphMarkClick = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (!isParagraphMarkGesture(event)) return false;

    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) return false;

    const paragraph = paragraphRangeAt(view.state.doc.toString(), pos);
    // Clicking a blank line between paragraphs marks nothing.
    if (!paragraph) return false;

    view.dispatch({
      effects: toggleParagraphMark.of({ from: paragraph.from, to: paragraph.to }),
    });
    return false; // let CodeMirror move the caret
  },
});

// Spellcheck state - managed via StateEffect for async updates

let currentEditorLanguage: 'de' | 'en' = 'de';
let currentSpellErrors: SpellError[] = [];
let currentLtIssues: LtIssue[] = [];
let currentRepetitions: WordRepetition[] = [];

// Effect to update spellcheck decorations
const setSpellcheckErrors = StateEffect.define<SpellError[]>();

// Effect to update LanguageTool decorations
const setLanguageToolIssues = StateEffect.define<LtIssue[]>();

// Effect to update word repetition decorations
const setWordRepetitions = StateEffect.define<WordRepetition[]>();

// StateField for spellcheck decorations (red underline)
const spellcheckField = StateField.define<DecorationSet>({
  create() { return Decoration.none; },
  update(old, tr) {
    for (const e of tr.effects) {
      if (e.is(setSpellcheckErrors)) {
        const errors = e.value;
        if (errors.length === 0) return Decoration.none;
        // Filter out invalid ranges (start must be < end)
        const validErrors = errors.filter(err => err.start < err.end);
        if (validErrors.length === 0) return Decoration.none;
        const decos = validErrors.map(err => 
          Decoration.mark({ class: 'cm-spelling-error' }).range(err.start, err.end)
        );
        return Decoration.set(decos, true);
      }
    }
    // Map decorations through document changes
    if (tr.docChanged) {
      return old.map(tr.changes);
    }
    return old;
  },
  provide: f => EditorView.decorations.from(f)
});

// StateField for LanguageTool decorations (grammar=blue, style=orange, punctuation=blue, typography=purple)
const languageToolField = StateField.define<DecorationSet>({
  create() { return Decoration.none; },
  update(old, tr) {
    for (const e of tr.effects) {
      if (e.is(setLanguageToolIssues)) {
        const issues = e.value;
        if (issues.length === 0) return Decoration.none;
        // Filter out invalid ranges (offset + length must be > offset)
        const validIssues = issues.filter(issue => issue.length > 0);
        if (validIssues.length === 0) return Decoration.none;
        const decos = validIssues.map(issue => {
          const className = getIssueClassName(issue.issueType);
          return Decoration.mark({ 
            class: className,
            attributes: { 
              'data-issue-type': issue.issueType,
              'data-message': issue.message,
              'data-rule-id': issue.ruleId
            }
          }).range(issue.offset, issue.offset + issue.length);
        });
        return Decoration.set(decos, true);
      }
    }
    // Map decorations through document changes
    if (tr.docChanged) {
      return old.map(tr.changes);
    }
    return old;
  },
  provide: f => EditorView.decorations.from(f)
});

// StateField for word repetition decorations (violet/magenta)
const repetitionField = StateField.define<DecorationSet>({
  create() { return Decoration.none; },
  update(old, tr) {
    for (const e of tr.effects) {
      if (e.is(setWordRepetitions)) {
        const repetitions = e.value;
        if (repetitions.length === 0) return Decoration.none;
        const decos: Range<Decoration>[] = [];
        for (const rep of repetitions) {
          // Skip if word is empty
          if (rep.word.length === 0) continue;
          for (const pos of rep.positions) {
            decos.push(
              Decoration.mark({ 
                class: 'cm-repetition-error',
                attributes: { 
                  'data-issue-type': 'repetition',
                  'data-word': rep.word,
                  'data-distance': rep.distance.toString()
                }
              }).range(pos, pos + rep.word.length)
            );
          }
        }
        if (decos.length === 0) return Decoration.none;
        return Decoration.set(decos, true);
      }
    }
    // Map decorations through document changes
    if (tr.docChanged) {
      return old.map(tr.changes);
    }
    return old;
  },
  provide: f => EditorView.decorations.from(f)
});

// Effect + field for lektorat highlight (focus a single selection)
const setLektoratHighlight = StateEffect.define<{ from: number; to: number } | null>();
const lektoratHighlightField = StateField.define<DecorationSet>({
  create() { return Decoration.none; },
  update(old, tr) {
    for (const e of tr.effects) {
      if (e.is(setLektoratHighlight)) {
        const payload = e.value;
        if (!payload) return Decoration.none;
        // Guard against empty ranges (from must be < to)
        if (payload.from >= payload.to) return Decoration.none;
        return Decoration.set([
          Decoration.mark({ class: 'cm-lektorat-focus' }).range(payload.from, payload.to)
        ]);
      }
    }
    // Clear on doc change (will be recomputed externally)
    if (tr.docChanged) return Decoration.none;
    return old;
  },
  provide: f => EditorView.decorations.from(f)
});

// Effect to update entity highlighting decorations
const setEntityHighlights = StateEffect.define<EntityMatch[]>();

// Entity highlighting storage
let currentEntityMatches: EntityMatch[] = [];
let currentEntities: EntityHighlight[] = [];

// StateField for entity highlighting (colored background)
const entityHighlightField = StateField.define<DecorationSet>({
  create() { return Decoration.none; },
  update(old, tr) {
    for (const e of tr.effects) {
      if (e.is(setEntityHighlights)) {
        const matches = e.value;
        if (matches.length === 0) return Decoration.none;
        // Filter out invalid ranges (from must be < to)
        const validMatches = matches.filter(m => m.from < m.to);
        if (validMatches.length === 0) return Decoration.none;
        const decos = validMatches.map(m => 
          Decoration.mark({ 
            class: `cm-entity-highlight cm-entity-type-${m.typeId}`,
            attributes: { 
              'data-entity-id': m.entityId,
              'data-entity-name': m.entityName,
              'data-entity-type': m.typeId,
              'data-entity-color': m.color
            }
          }).range(m.from, m.to)
        );
        return Decoration.set(decos, true);
      }
    }
    // Map decorations through document changes
    if (tr.docChanged) {
      return old.map(tr.changes);
    }
    return old;
  },
  provide: f => EditorView.decorations.from(f)
});

// Get CSS class for issue type
function getIssueClassName(type: IssueType): string {
  switch (type) {
    case 'misspelling': return 'cm-spelling-error';
    case 'grammar': return 'cm-grammar-error';
    case 'punctuation': return 'cm-punctuation-error';
    case 'style': return 'cm-style-error';
    case 'typographical': return 'cm-typography-error';
    default: return 'cm-grammar-error';
  }
}

// Simple formatting marks using markdown shortcuts for now (bold **, italic *)
export const CodeMirrorEditor:React.FC<Props> = ({ value, onChange, command$, findQuery, regex, searchApi$, commentApi$, onSynonymRequest, onSpellErrorClick, onProofreadingErrorClick, onEntityHover, onSelectionContextMenu, entityHighlightEnabled = true, editorLanguage = 'de', onScroll, lektoratHighlight, typewriterMode = false, typewriterSound = false, typewriterVolume = 50 }) => {
  const ref = useRef<HTMLDivElement|null>(null);
  const viewRef = useRef<EditorView|null>(null);
  const matchesRef = useRef<Match[]>([]);
  const activeIndexRef = useRef(0);
  const synonymDebounceRef = useRef<number|null>(null);
  const proofreadingTimeoutRef = useRef<number|null>(null);
  const typewriterModeRef = useRef(typewriterMode);
  
  // Keep ref in sync with prop
  useEffect(() => {
    typewriterModeRef.current = typewriterMode;
  }, [typewriterMode]);
  
  // Sync typewriter sound settings
  useEffect(() => {
    TypewriterSound.setEnabled(typewriterSound && typewriterMode);
    TypewriterSound.setVolume(typewriterVolume);
  }, [typewriterSound, typewriterVolume, typewriterMode]);
  
  // When typewriter mode toggles on, center the current cursor once immediately
  useEffect(() => {
    if (typewriterMode && viewRef.current) {
      const v = viewRef.current;
      const head = v.state.selection.main.head;
      v.dispatch({
        effects: EditorView.scrollIntoView(head, { y: 'center' })
      });
    }
  }, [typewriterMode]);
  
  // Trigger async spellcheck via backend
  async function triggerSpellcheck(view: EditorView) {
    const text = view.state.doc.toString();
    if (!text || text.length < 2) {
      view.dispatch({ effects: setSpellcheckErrors.of([]) });
      return;
    }
    
    const settings = loadProofreadingSettings();
    if (!settings.enabled || !settings.spellcheck) {
      view.dispatch({ effects: setSpellcheckErrors.of([]) });
      return;
    }
    
    try {
      const errors = await checkSpellingDebounced(text, currentEditorLanguage, 400);
      currentSpellErrors = errors;
      // Update decorations via effect
      view.dispatch({ effects: setSpellcheckErrors.of(errors) });
    } catch (e) {
      console.warn('[spellcheck] Backend error:', e);
    }
  }
  
  // Trigger LanguageTool check (grammar, punctuation, style)
  async function triggerLanguageToolCheck(view: EditorView) {
    const text = view.state.doc.toString();
    if (!text || text.length < 10) {
      view.dispatch({ effects: setLanguageToolIssues.of([]) });
      return;
    }
    
    const settings = loadProofreadingSettings();
    if (!settings.enabled || (!settings.grammar && !settings.punctuation && !settings.style && !settings.typography)) {
      view.dispatch({ effects: setLanguageToolIssues.of([]) });
      return;
    }
    
    try {
      const issues = await checkWithLanguageTool(text, currentEditorLanguage, settings);
      // Filter out spelling issues (handled by Hunspell)
      const nonSpellingIssues = issues.filter(i => i.issueType !== 'misspelling');
      currentLtIssues = nonSpellingIssues;
      view.dispatch({ effects: setLanguageToolIssues.of(nonSpellingIssues) });
    } catch (e) {
      console.warn('[languagetool] Error:', e);
    }
  }
  
  // Find word repetitions
  function triggerRepetitionCheck(view: EditorView) {
    const text = view.state.doc.toString();
    if (!text || text.length < 20) {
      view.dispatch({ effects: setWordRepetitions.of([]) });
      return;
    }
    
    const settings = loadProofreadingSettings();
    if (!settings.enabled || !settings.wordRepetition) {
      view.dispatch({ effects: setWordRepetitions.of([]) });
      return;
    }
    
    const repetitions = findWordRepetitions(text, settings.wordRepetitionDistance, settings.wordRepetitionMinLength);
    currentRepetitions = repetitions;
    view.dispatch({ effects: setWordRepetitions.of(repetitions) });
  }
  
  // Trigger entity highlighting
  async function triggerEntityHighlighting(view: EditorView) {
    if (!entityHighlightEnabled) {
      view.dispatch({ effects: setEntityHighlights.of([]) });
      return;
    }
    
    const text = view.state.doc.toString();
    if (!text || text.length < 2) {
      view.dispatch({ effects: setEntityHighlights.of([]) });
      return;
    }
    
    try {
      // Fetch entities (with caching)
      const entities = await fetchEntityHighlights();
      currentEntities = entities;
      
      if (entities.length === 0) {
        view.dispatch({ effects: setEntityHighlights.of([]) });
        return;
      }
      
      // Find matches in text
      const matches = findEntityMatches(text, entities);
      currentEntityMatches = matches;
      view.dispatch({ effects: setEntityHighlights.of(matches) });
    } catch (e) {
      console.warn('[entityHighlight] Error:', e);
    }
  }
  
  // Combined proofreading trigger (debounced)
  function triggerAllProofreading(view: EditorView) {
    // Clear previous timeout
    if (proofreadingTimeoutRef.current) {
      window.clearTimeout(proofreadingTimeoutRef.current);
    }
    
    // Debounce to avoid excessive API calls
    proofreadingTimeoutRef.current = window.setTimeout(() => {
      triggerSpellcheck(view);
      triggerLanguageToolCheck(view);
      triggerRepetitionCheck(view);
      triggerEntityHighlighting(view);
    }, 500);
  }
  
  // Update global language and re-trigger all checks
  useEffect(() => {
    currentEditorLanguage = editorLanguage;
    currentSpellErrors = [];
    currentLtIssues = [];
    currentRepetitions = [];
    if (viewRef.current) {
      // Clear old decorations
      viewRef.current.dispatch({ 
        effects: [
          setSpellcheckErrors.of([]),
          setLanguageToolIssues.of([]),
          setWordRepetitions.of([])
        ]
      });
      // Re-check
      triggerAllProofreading(viewRef.current);
    }
  }, [editorLanguage]);
  
  // Wort an Position extrahieren (optional: spezifische Position statt Cursor)
  function getWordAtCursor(view: EditorView, atPos?: number): { word: string; from: number; to: number } | null {
    const pos = atPos ?? view.state.selection.main.head;
    const doc = view.state.doc.toString();
    let start = pos;
    let end = pos;
    // Rückwärts zum Wortanfang
    while (start > 0 && /[\wäöüÄÖÜß]/.test(doc[start - 1])) start--;
    // Vorwärts zum Wortende
    while (end < doc.length && /[\wäöüÄÖÜß]/.test(doc[end])) end++;
    if (start === end || (end - start) < 2) return null;
    return { word: doc.slice(start, end), from: start, to: end };
  }
  
  // Synonyme prüfen und anzeigen (async, wartet auf Thesaurus)
  async function checkSynonyms(view: EditorView) {
    if (!onSynonymRequest) return;
    const wordInfo = getWordAtCursor(view);
    // The manuscript's language, not the interface's. `editor_language` is a
    // separate setting, and spellcheck already follows it - synonyms used to
    // follow the UI instead, so an English manuscript in a German UI was
    // looked up in the German thesaurus.
    const lang = currentEditorLanguage;
    if (!wordInfo) {
      onSynonymRequest(null);
      return;
    }
    // Async check - wartet auf Thesaurus-Laden falls nötig
    const hasAny = await hasSynonyms(wordInfo.word, lang);
    if (!hasAny) {
      onSynonymRequest(null);
      return;
    }
    // Koordinaten des Wortes ermitteln
    try {
      const coords = view.coordsAtPos(wordInfo.from);
      if (!coords) {
        onSynonymRequest(null);
        return;
      }
      onSynonymRequest({
        word: wordInfo.word,
        from: wordInfo.from,
        to: wordInfo.to,
        x: coords.left,
        y: coords.bottom + 4,
        lang
      });
    } catch {
      onSynonymRequest(null);
    }
  }

  // Formatting decoration builder (simple markdown markers)
  function buildFormatting(doc:Text): DecorationSet {
    const decos: any[] = [];
    // Guard against empty ranges (from must be < to)
    const push = (from:number,to:number,cls:string)=> { if(from < to) decos.push(Decoration.mark({ class: cls }).range(from,to)); };
    let pos = 0;
    for(let iter=doc.iter(); !iter.next().done; ){
      const line = iter.value; // scan regex patterns separately to avoid nested conflicts
      // bold **text**
      const boldR = /\*\*(.+?)\*\*/g; let m:RegExpExecArray|null; while((m=boldR.exec(line))){ const start=pos+m.index; push(start, start+2, 'fmt-marker'); push(start+2, start+2+m[1].length, 'fmt-bold'); push(start+2+m[1].length, start+4+m[1].length, 'fmt-marker'); }
      // underline __text__
      const underR = /__(.+?)__/g; while((m=underR.exec(line))){ const start=pos+m.index; push(start, start+2, 'fmt-marker'); push(start+2, start+2+m[1].length, 'fmt-underline'); push(start+2+m[1].length, start+4+m[1].length, 'fmt-marker'); }
      // strike ~~text~~
      const strikeR = /~~(.+?)~~/g; while((m=strikeR.exec(line))){ const start=pos+m.index; push(start, start+2, 'fmt-marker'); push(start+2, start+2+m[1].length, 'fmt-strike'); push(start+2+m[1].length, start+4+m[1].length, 'fmt-marker'); }
      // italic *text* (avoid ** already handled) – naive: single * wrapping non-* chars
      const italicR = /(?<!\*)\*(?!\*)([^\n*]+?)\*(?<!\*)/g; while((m=italicR.exec(line))){ const start=pos+m.index; push(start, start+1, 'fmt-marker'); push(start+1, start+1+m[1].length, 'fmt-italic'); push(start+1+m[1].length, start+2+m[1].length, 'fmt-marker'); }
      pos += line.length + 1; // assume single char newline separation in stored doc
    }
    return Decoration.set(decos, true);
  }

  const formattingPlugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view:EditorView){ this.decorations = buildFormatting(view.state.doc); }
    update(u:ViewUpdate){ if(u.docChanged) { this.decorations = buildFormatting(u.state.doc); } }
  }, { decorations: v=> v.decorations });

  // helper to recompute search matches
  function dispatchMatches(){
    const v=viewRef.current; if(!v){return;} v.dispatch({ effects: setSearchMatches.of({ matches: matchesRef.current, active: activeIndexRef.current }) });
    // move selection to active
    const active = matchesRef.current[activeIndexRef.current]; if(active){ v.dispatch({ selection:{ anchor: active.from, head: active.to }, scrollIntoView:true }); }
  }

  function applySearch(query:string|undefined){
    const v = viewRef.current; if(!v) return;
    if(!query){ matchesRef.current=[]; activeIndexRef.current=0; v.dispatch({ effects: setSearchMatches.of(null) }); return; }
    let re:RegExp;
    try { re = regex? new RegExp(query,'gi'): new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'); } catch { return; }
    const text:Text = v.state.doc;
    const matches:Match[] = [];
    for(let iter=text.iter(), pos=0; !iter.next().done; ){
      const line = iter.value; let m:RegExpExecArray|null; while((m=re.exec(line))){ matches.push({ from: pos + m.index, to: pos + m.index + m[0].length }); if(m.index===re.lastIndex) re.lastIndex++; }
      pos += line.length;
    }
    matchesRef.current = matches;
    activeIndexRef.current = 0;
    dispatchMatches();
  }

  // Apply lektorat highlight when provided
  useEffect(() => {
    if (!viewRef.current) return;
    const view = viewRef.current;
    view.dispatch({ effects: setLektoratHighlight.of(lektoratHighlight ? { from: lektoratHighlight.from, to: lektoratHighlight.to } : null) });
    if (lektoratHighlight) {
      const line = view.state.doc.lineAt(lektoratHighlight.from);
      const y = view.coordsAtPos(line.from)?.top ?? 0;
      view.dispatch({ selection: { anchor: lektoratHighlight.from, head: lektoratHighlight.to } });
      view.scrollDOM.scrollTo({ top: Math.max(0, y - 80), behavior: 'smooth' });
    }
  }, [lektoratHighlight]);

  useEffect(()=>{
    if(!ref.current || viewRef.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        keymap.of([...historyKeymap]),
        markdown(),
        highlightActiveLine(),
        syntaxHighlighting(defaultHighlightStyle),
        EditorView.lineWrapping,
        searchDecoField,
        formattingPlugin,
        spellcheckField,
        languageToolField,
        repetitionField,
        entityHighlightField,
        lektoratHighlightField,
        paragraphMarkField,
        paragraphMarkClick,
        EditorView.updateListener.of(v => {
          if(v.docChanged){ 
            onChange(v.state.doc.toString());
            // Trigger all proofreading checks on content change
            triggerAllProofreading(v.view);
          }
          // Typewriter mode: use native scrollIntoView with deadzone
          // Only scroll when cursor moves outside the middle third of the viewport
          if (v.selectionSet && typewriterModeRef.current) {
            const head = v.view.state.selection.main.head;
            const coords = v.view.coordsAtPos(head);
            if (coords) {
              const scrollDOM = v.view.scrollDOM;
              const editorRect = scrollDOM.getBoundingClientRect();
              const cursorY = coords.top - editorRect.top;
              const viewportHeight = editorRect.height;
              
              // Deadzone: middle third of viewport (33%-66%)
              const deadzoneTop = viewportHeight * 0.33;
              const deadzoneBottom = viewportHeight * 0.66;
              
              // Only center if cursor is outside the deadzone
              if (cursorY < deadzoneTop || cursorY > deadzoneBottom) {
                v.view.dispatch({
                  effects: EditorView.scrollIntoView(head, { y: 'center' })
                });
              }
            }
          }
          // Synonym-Check bei Cursor-Bewegung (debounced)
          if(v.selectionSet && onSynonymRequest) {
            if(synonymDebounceRef.current) window.clearTimeout(synonymDebounceRef.current);
            synonymDebounceRef.current = window.setTimeout(() => checkSynonyms(v.view), 300);
          }
        })
      ]
    });
    viewRef.current = new EditorView({ state, parent: ref.current });
    
    // Scroll handler for Lektorat sidebar sync
    const handleScroll = () => {
      if (viewRef.current && onScroll) {
        const scrollDOM = viewRef.current.scrollDOM;
        onScroll(scrollDOM.scrollTop);
      }
    };
    
    // Add scroll listener to editor's scroll container
    if (viewRef.current && onScroll) {
      viewRef.current.scrollDOM.addEventListener('scroll', handleScroll);
    }
    
    // Typewriter sound handler
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!TypewriterSound.isEnabled()) return;
      
      // Ignore modifier-only keys and special keys
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape'].includes(e.key)) return;
      
      if (e.key === 'Enter') {
        TypewriterSound.onEnter();
      } else if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') {
        TypewriterSound.onKeyPress();
      }
    };
    
    // Add keydown listener for typewriter sounds
    if (viewRef.current) {
      viewRef.current.contentDOM.addEventListener('keydown', handleKeyDown);
    }
    
    // Initial proofreading checks
    triggerAllProofreading(viewRef.current);
    
    // Rechtsklick auf Textprüfungsfehler (Rechtschreibung, Grammatik, Stil, Wiederholung)
    const handleContextMenu = (e: MouseEvent) => {
      if (!viewRef.current) return;
      const target = e.target as HTMLElement;
      
      // Spelling error
      if (target.closest('.cm-spelling-error') && onSpellErrorClick) {
        e.preventDefault();
        const pos = viewRef.current.posAtCoords({ x: e.clientX, y: e.clientY });
        if (pos !== null) {
          const wordInfo = getWordAtCursor(viewRef.current, pos);
          const isSpellError = wordInfo && currentSpellErrors.some(
            err => err.word.toLowerCase() === wordInfo.word.toLowerCase()
          );
          if (wordInfo && isSpellError) {
            onSpellErrorClick({
              word: wordInfo.word,
              from: wordInfo.from,
              to: wordInfo.to,
              x: e.clientX,
              y: e.clientY,
              lang: currentEditorLanguage
            });
          }
        }
        return;
      }
      
      // Grammar/Punctuation/Style/Typography errors
      const ltError = target.closest('.cm-grammar-error, .cm-punctuation-error, .cm-style-error, .cm-typography-error');
      if (ltError && onProofreadingErrorClick) {
        e.preventDefault();
        const pos = viewRef.current.posAtCoords({ x: e.clientX, y: e.clientY });
        if (pos !== null) {
          // Find matching issue
          const issue = currentLtIssues.find(i => pos >= i.offset && pos < i.offset + i.length);
          if (issue) {
            const issueType = issue.issueType === 'grammar' ? 'grammar' 
              : issue.issueType === 'punctuation' ? 'punctuation'
              : issue.issueType === 'style' ? 'style'
              : issue.issueType === 'typographical' ? 'typography'
              : 'grammar';
            onProofreadingErrorClick({
              word: viewRef.current.state.sliceDoc(issue.offset, issue.offset + issue.length),
              from: issue.offset,
              to: issue.offset + issue.length,
              x: e.clientX,
              y: e.clientY,
              issueType,
              message: issue.message,
              suggestions: issue.replacements,
              lang: currentEditorLanguage
            });
          }
        }
        return;
      }
      
      // Word repetition
      if (target.closest('.cm-repetition-error') && onProofreadingErrorClick) {
        e.preventDefault();
        const pos = viewRef.current.posAtCoords({ x: e.clientX, y: e.clientY });
        if (pos !== null) {
          const wordInfo = getWordAtCursor(viewRef.current, pos);
          if (wordInfo) {
            // Find matching repetition
            const rep = currentRepetitions.find(r => 
              r.word.toLowerCase() === wordInfo.word.toLowerCase() &&
              r.positions.some(p => p === wordInfo.from)
            );
            onProofreadingErrorClick({
              word: wordInfo.word,
              from: wordInfo.from,
              to: wordInfo.to,
              x: e.clientX,
              y: e.clientY,
              issueType: 'repetition',
              message: rep ? `Wortwiederholung: "${rep.word}" erscheint ${rep.positions.length}x innerhalb von ${rep.distance} Wörtern` : 'Wortwiederholung',
              lang: currentEditorLanguage
            });
          }
        }
        return;
      }
      
      // Selection context menu - show when there's selected text or right-click anywhere
      if (onSelectionContextMenu) {
        const selection = viewRef.current.state.selection.main;
        // Check if there's a selection
        if (selection.from !== selection.to) {
          e.preventDefault();
          const selectedText = viewRef.current.state.sliceDoc(selection.from, selection.to);
          onSelectionContextMenu({
            text: selectedText,
            from: selection.from,
            to: selection.to,
            x: e.clientX,
            y: e.clientY
          });
          return;
        }
        // Or if right-clicking on a word (get the word under cursor)
        const pos = viewRef.current.posAtCoords({ x: e.clientX, y: e.clientY });
        if (pos !== null) {
          const wordInfo = getWordAtCursor(viewRef.current, pos);
          if (wordInfo && wordInfo.word.length > 0) {
            e.preventDefault();
            // Select the word in editor
            viewRef.current.dispatch({
              selection: { anchor: wordInfo.from, head: wordInfo.to }
            });
            onSelectionContextMenu({
              text: wordInfo.word,
              from: wordInfo.from,
              to: wordInfo.to,
              x: e.clientX,
              y: e.clientY
            });
            return;
          }
        }
      }
    };
    ref.current?.addEventListener('contextmenu', handleContextMenu);
    
    // Hover handler for entity tooltips
    let entityHoverTimeout: number | null = null;
    const handleMouseMove = (e: MouseEvent) => {
      if (!viewRef.current || !onEntityHover) return;
      const target = e.target as HTMLElement;
      
      // Check if hovering over entity highlight
      const entityEl = target.closest('.cm-entity-highlight') as HTMLElement;
      if (entityEl) {
        // Debounce to avoid excessive calls
        if (entityHoverTimeout) window.clearTimeout(entityHoverTimeout);
        entityHoverTimeout = window.setTimeout(() => {
          const entityId = entityEl.getAttribute('data-entity-id');
          const entityName = entityEl.getAttribute('data-entity-name');
          const typeId = entityEl.getAttribute('data-entity-type');
          const color = entityEl.getAttribute('data-entity-color');
          
          if (entityId && entityName && typeId && color) {
            onEntityHover({
              entityId,
              entityName,
              typeId,
              color,
              x: e.clientX,
              y: e.clientY + 10
            });
          }
        }, 200);
      } else {
        // Not hovering over entity - clear tooltip after short delay
        if (entityHoverTimeout) window.clearTimeout(entityHoverTimeout);
        entityHoverTimeout = window.setTimeout(() => {
          onEntityHover(null);
        }, 100);
      }
    };
    
    const handleMouseLeave = () => {
      if (entityHoverTimeout) window.clearTimeout(entityHoverTimeout);
      if (onEntityHover) onEntityHover(null);
    };
    
    ref.current?.addEventListener('mousemove', handleMouseMove);
    ref.current?.addEventListener('mouseleave', handleMouseLeave);
    
    // Listen for entity cache invalidation (e.g., when new entities are saved)
    const handleEntityCacheInvalidated = () => {
      if (viewRef.current) {
        // Force refresh entity highlighting
        triggerEntityHighlighting(viewRef.current);
      }
    };
    window.addEventListener('entity-cache-invalidated', handleEntityCacheInvalidated);
    
    // wire command channel
    if(command$){
      command$((cmd:string)=>{
        if(!viewRef.current) return;
        const v = viewRef.current;
        const sel = v.state.selection.main;
        const toggle = (marker:string)=>{
          const doc = v.state.doc.toString();
          const before = doc.slice(sel.from - marker.length, sel.from);
            const after = doc.slice(sel.to, sel.to + marker.length);
          if(sel.from >= marker.length && before === marker && after === marker){
            // remove markers
            v.dispatch({ changes:[{ from: sel.from - marker.length, to: sel.from }, { from: sel.to, to: sel.to + marker.length }], selection:{ anchor: sel.from - marker.length, head: sel.to - marker.length } });
          } else {
            const text = v.state.sliceDoc(sel.from, sel.to);
            v.dispatch({ changes:{ from: sel.from, to: sel.to, insert: marker+text+marker }, selection:{ anchor: sel.from + marker.length, head: sel.to + marker.length } });
          }
        };
        switch(cmd){
          case 'bold': toggle('**'); break;
          case 'italic': toggle('*'); break;
          case 'underline': toggle('__'); break;
          case 'strike': toggle('~~'); break;
          case 'undo': undo(v); break;
          case 'redo': redo(v); break;
        }
      });
    }
    return ()=>{ 
      if (viewRef.current?.scrollDOM) {
        viewRef.current.scrollDOM.removeEventListener('scroll', handleScroll);
      }
      if (viewRef.current?.contentDOM) {
        viewRef.current.contentDOM.removeEventListener('keydown', handleKeyDown);
      }
      viewRef.current?.destroy(); 
      viewRef.current = null;
      if(synonymDebounceRef.current) window.clearTimeout(synonymDebounceRef.current);
      if(proofreadingTimeoutRef.current) window.clearTimeout(proofreadingTimeoutRef.current);
      if(entityHoverTimeout) window.clearTimeout(entityHoverTimeout);
      ref.current?.removeEventListener('contextmenu', handleContextMenu);
      ref.current?.removeEventListener('mousemove', handleMouseMove);
      ref.current?.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('entity-cache-invalidated', handleEntityCacheInvalidated);
    };
  },[]);

  // external value change (e.g. scene switch)
  useEffect(()=>{
    const view = viewRef.current; if(!view) return; const current = view.state.doc.toString();
    // The whole document is replaced here, so any surviving marks would point
    // at unrelated text in the new scene. Drop them.
    if(current !== value){ view.dispatch({ changes: { from:0, to: current.length, insert:value }, effects: clearParagraphMarks.of(null) }); }
  },[value]);

  useEffect(()=>{ applySearch(findQuery); },[findQuery, regex]);

  // expose search API
  useEffect(()=>{
    if(!searchApi$) return; searchApi$({
      next: ()=>{ if(!matchesRef.current.length) return; activeIndexRef.current = (activeIndexRef.current + 1) % matchesRef.current.length; dispatchMatches(); },
      prev: ()=>{ if(!matchesRef.current.length) return; activeIndexRef.current = (activeIndexRef.current - 1 + matchesRef.current.length) % matchesRef.current.length; dispatchMatches(); },
      replaceOne: (replacement:string)=>{ const v=viewRef.current; if(!v || !matchesRef.current.length) return; const m = matchesRef.current[activeIndexRef.current]; v.dispatch({ changes:{ from:m.from, to:m.to, insert:replacement } }); // re-run search to rebuild ranges
        setTimeout(()=>applySearch(findQuery),0); },
      replaceAll: (replacement:string)=>{ const v=viewRef.current; if(!v || !matchesRef.current.length) return; const changes = matchesRef.current.map(m=>({ from:m.from, to:m.to, insert:replacement })); v.dispatch({ changes }); setTimeout(()=>applySearch(findQuery),0); }
    });
  },[searchApi$, findQuery, regex]);

  // expose selection for human comments
  useEffect(() => {
    if (!commentApi$) return;
    commentApi$({
      getSelection: () => {
        const view = viewRef.current;
        if (!view) return null;
        const sel = view.state.selection.main;
        if (sel.empty) return null;
        const from = Math.min(sel.from, sel.to);
        const to = Math.max(sel.from, sel.to);
        return { from, to, text: view.state.sliceDoc(from, to) };
      },
      // Unlike getSelection this also reports an empty selection, because the
      // marked paragraphs alone are enough to scope the context.
      getFocus: () => {
        const view = viewRef.current;
        if (!view) return null;
        const sel = view.state.selection.main;
        const from = Math.min(sel.from, sel.to);
        const to = Math.max(sel.from, sel.to);
        return {
          selectedText: sel.empty ? '' : view.state.sliceDoc(from, to),
          markedParagraphs: readParagraphMarks(view.state),
        };
      },
    });
  }, [commentApi$]);

  return <div className={`code-editor-container${typewriterMode ? ' typewriter-mode' : ''}`} ref={ref} />;
};