/**
 * LanguageTool Service - Grammatik, Zeichensetzung, Stil
 * 
 * Nutzt LanguageTool API (kostenlos oder Premium) für:
 * - Grammatikfehler
 * - Zeichensetzung
 * - Stilvorschläge
 * - Typografie
 */

import { invoke } from '@tauri-apps/api/tauri';

// Issue types matching Rust backend
export type IssueType = 'misspelling' | 'grammar' | 'punctuation' | 'style' | 'typographical' | 'other';

export interface LtIssue {
  message: string;
  shortMessage: string | null;
  offset: number;
  length: number;
  contextText: string;
  replacements: string[];
  ruleId: string;
  issueType: IssueType;
  category: string;
}

interface LtCheckResponse {
  issues: LtIssue[];
}

// Settings for what to check
export interface ProofreadingSettings {
  // Global toggle
  enabled: boolean;
  
  // Hunspell (local, fast)
  spellcheck: boolean;
  
  // LanguageTool (API, more comprehensive)
  grammar: boolean;
  punctuation: boolean;
  style: boolean;
  typography: boolean;
  
  // Custom analysis
  wordRepetition: boolean;
  wordRepetitionDistance: number; // How many words apart is "too close"
  wordRepetitionMinLength: number; // Minimum word length to consider for repetition
  
  // LanguageTool credentials (optional for premium)
  ltApiKey?: string;
  ltUsername?: string;
  
  // Rules to disable
  disabledRules: string[];
}

// Default settings
export const defaultProofreadingSettings: ProofreadingSettings = {
  enabled: true,
  spellcheck: true,
  grammar: true,
  punctuation: true,
  style: false, // Off by default (can be noisy)
  typography: true,
  wordRepetition: true,
  wordRepetitionDistance: 50, // Within 50 words
  wordRepetitionMinLength: 4, // Ignore short words (der, die, das, und, etc.)
  disabledRules: [],
};

// Storage key
const SETTINGS_KEY = 'featherworks-proofreading-settings';

// Load settings from localStorage
export function loadProofreadingSettings(): ProofreadingSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return { ...defaultProofreadingSettings, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.warn('[proofreading] Could not load settings:', e);
  }
  return defaultProofreadingSettings;
}

// Save settings to localStorage
export function saveProofreadingSettings(settings: ProofreadingSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('[proofreading] Could not save settings:', e);
  }
}

// Cache for LanguageTool results
const ltCache = new Map<string, LtIssue[]>();
const MAX_CACHE_SIZE = 50;

function hashText(text: string, lang: string): string {
  let hash = 0;
  const str = `lt:${lang}:${text}`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * Check text with LanguageTool API
 */
export async function checkWithLanguageTool(
  text: string,
  lang: 'de' | 'en',
  settings: ProofreadingSettings
): Promise<LtIssue[]> {
  if (!settings.enabled || (!settings.grammar && !settings.punctuation && !settings.style && !settings.typography)) {
    return [];
  }
  
  if (!text || text.length < 10) return [];
  
  // Check cache
  const cacheKey = hashText(text, lang);
  const cached = ltCache.get(cacheKey);
  if (cached) return filterIssuesBySettings(cached, settings);
  
  try {
    // Build disabled rules list
    const disabledRules = [...settings.disabledRules];
    
    // Disable categories based on settings
    if (!settings.style) {
      disabledRules.push('STYLE', 'REDUNDANCY', 'CASING');
    }
    
    const response = await invoke<LtCheckResponse>('languagetool_check', {
      req: {
        text,
        language: lang === 'de' ? 'de-DE' : 'en-US',
        apiKey: settings.ltApiKey || null,
        username: settings.ltUsername || null,
        disabledRules: disabledRules.length > 0 ? disabledRules : null,
      }
    });
    
    // Cache result
    if (ltCache.size >= MAX_CACHE_SIZE) {
      const firstKey = ltCache.keys().next().value;
      if (firstKey) ltCache.delete(firstKey);
    }
    ltCache.set(cacheKey, response.issues);
    
    return filterIssuesBySettings(response.issues, settings);
  } catch (e) {
    console.warn('[languagetool] API error:', e);
    return [];
  }
}

/**
 * Filter issues based on user settings
 */
function filterIssuesBySettings(issues: LtIssue[], settings: ProofreadingSettings): LtIssue[] {
  return issues.filter(issue => {
    switch (issue.issueType) {
      case 'misspelling':
        return settings.spellcheck;
      case 'grammar':
        return settings.grammar;
      case 'punctuation':
        return settings.punctuation;
      case 'style':
        return settings.style;
      case 'typographical':
        return settings.typography;
      default:
        return settings.grammar; // Other issues treated as grammar
    }
  });
}

/**
 * Test LanguageTool connection
 */
export async function testLanguageToolConnection(
  lang: 'de' | 'en',
  apiKey?: string,
  username?: string
): Promise<boolean> {
  try {
    return await invoke<boolean>('languagetool_test', {
      req: {
        language: lang === 'de' ? 'de-DE' : 'en-US',
        apiKey: apiKey || null,
        username: username || null,
      }
    });
  } catch (e) {
    console.warn('[languagetool] Connection test failed:', e);
    return false;
  }
}

/**
 * Find word repetitions within a certain distance
 */
export interface WordRepetition {
  word: string;
  positions: number[]; // Character offsets
  distance: number; // Words apart
}

export function findWordRepetitions(
  text: string,
  maxDistance: number = 50,
  minWordLength: number = 4
): WordRepetition[] {
  const repetitions: WordRepetition[] = [];
  
  // Extract words with positions.
  //
  // The bound has to come from the setting. It used to be hardcoded to {4,},
  // while the settings panel offers 2 upwards, so choosing 2 or 3 silently
  // did nothing - a three-letter word repeated twice was never reported.
  const bound = Math.max(1, Math.floor(minWordLength));
  const wordRegex = new RegExp(`\\b([a-zA-Z\u00e4\u00f6\u00fc\u00c4\u00d6\u00dc\u00df]{${bound},})\\b`, 'gi');
  const words: { word: string; pos: number; index: number }[] = [];
  
  let match;
  let wordIndex = 0;
  while ((match = wordRegex.exec(text)) !== null) {
    const word = match[1].toLowerCase();
    // Skip common words
    if (!isCommonWord(word) && word.length >= minWordLength) {
      words.push({ word, pos: match.index, index: wordIndex });
    }
    wordIndex++;
  }
  
  // Find repetitions
  const seen = new Map<string, { pos: number; index: number }>();
  
  for (const { word, pos, index } of words) {
    const prev = seen.get(word);
    if (prev && (index - prev.index) <= maxDistance) {
      // Found repetition within distance
      const existing = repetitions.find(r => r.word === word);
      if (existing) {
        if (!existing.positions.includes(pos)) {
          existing.positions.push(pos);
        }
      } else {
        repetitions.push({
          word,
          positions: [prev.pos, pos],
          distance: index - prev.index
        });
      }
    }
    seen.set(word, { pos, index });
  }
  
  return repetitions;
}

// Common words to ignore in repetition check
const COMMON_WORDS_DE = new Set([
  'aber', 'alle', 'allem', 'allen', 'aller', 'alles', 'also', 'andere', 'anderem',
  'anderen', 'anderer', 'anderes', 'anders', 'auch', 'auf', 'aus', 'bei', 'beide',
  'beiden', 'beider', 'beim', 'bereits', 'bevor', 'bin', 'bis', 'bist', 'dabei',
  'dadurch', 'dafür', 'dagegen', 'daher', 'dahin', 'damit', 'danach', 'daneben',
  'dann', 'daran', 'darauf', 'daraus', 'darin', 'darum', 'darunter', 'das', 'davon',
  'davor', 'dazu', 'dass', 'dein', 'deine', 'deinem', 'deinen', 'deiner', 'dem',
  'den', 'denen', 'denn', 'dennoch', 'der', 'deren', 'des', 'deshalb', 'dessen',
  'dich', 'die', 'dies', 'diese', 'dieselbe', 'dieselben', 'diesem', 'diesen',
  'dieser', 'dieses', 'doch', 'dort', 'drin', 'dritte', 'dritten', 'dritter',
  'durch', 'dürfen', 'dürft', 'eben', 'ebenso', 'eigen', 'eigene', 'eigenen',
  'eigener', 'eigenes', 'eigentlich', 'ein', 'einander', 'eine', 'einem', 'einen',
  'einer', 'eines', 'einig', 'einige', 'einigem', 'einigen', 'einiger', 'einiges',
  'einmal', 'erst', 'erste', 'ersten', 'erster', 'etwa', 'etwas', 'euch', 'euer',
  'eure', 'eurem', 'euren', 'eurer', 'falls', 'fast', 'ferner', 'folgende',
  'folgenden', 'folgender', 'folgendes', 'ganz', 'ganze', 'ganzen', 'ganzer',
  'gar', 'gegen', 'gehabt', 'gehen', 'gemacht', 'genau', 'genug', 'gerade',
  'gern', 'gerne', 'gewesen', 'gewollt', 'geworden', 'gibt', 'ging', 'gleich',
  'große', 'großen', 'großer', 'großes', 'gute', 'guten', 'guter', 'gutes',
  'haben', 'habt', 'halt', 'hat', 'hatte', 'hatten', 'hattest', 'hattet', 'hier',
  'hin', 'hinaus', 'hindurch', 'hinein', 'hinter', 'ich', 'ihm', 'ihn', 'ihnen',
  'ihr', 'ihre', 'ihrem', 'ihren', 'ihrer', 'immer', 'indem', 'infolge', 'innen',
  'innerhalb', 'ins', 'irgend', 'ist', 'jede', 'jedem', 'jeden', 'jeder', 'jedes',
  'jedoch', 'jemals', 'jemand', 'jene', 'jenem', 'jenen', 'jener', 'jenes', 'jetzt',
  'kam', 'kann', 'kannst', 'kaum', 'kein', 'keine', 'keinem', 'keinen', 'keiner',
  'kleine', 'kleinen', 'kleiner', 'können', 'könnt', 'könnte', 'lange', 'langen',
  'langer', 'langsam', 'längst', 'lässt', 'laut', 'lediglich', 'machen', 'macht',
  'machte', 'man', 'manch', 'manche', 'manchem', 'manchen', 'mancher', 'manchmal',
  'mehr', 'mein', 'meine', 'meinem', 'meinen', 'meiner', 'meist', 'meisten', 'mir',
  'mit', 'miteinander', 'möchte', 'möchten', 'mögen', 'möglich', 'muss', 'müssen',
  'musst', 'musste', 'nach', 'nachdem', 'nachher', 'nächste', 'nämlich', 'natürlich',
  'neben', 'nein', 'nennen', 'neu', 'neue', 'neuem', 'neuen', 'neuer', 'neues',
  'nicht', 'nichts', 'nie', 'niemand', 'nimmt', 'noch', 'nun', 'nur', 'ob', 'oben',
  'oder', 'ohne', 'schon', 'sehr', 'seid', 'sein', 'seine', 'seinem', 'seinen',
  'seiner', 'seit', 'selbst', 'sich', 'sicher', 'sie', 'siehe', 'sind', 'so',
  'sogar', 'solch', 'solche', 'solchem', 'solchen', 'solcher', 'soll', 'sollen',
  'sollte', 'sollten', 'sondern', 'sonst', 'sowie', 'später', 'statt', 'trotz',
  'über', 'überall', 'überhaupt', 'übrigens', 'um', 'ums', 'und', 'uns', 'unser',
  'unsere', 'unserem', 'unseren', 'unserer', 'unten', 'unter', 'viel', 'viele',
  'vielem', 'vielen', 'vielleicht', 'vom', 'von', 'vor', 'vorbei', 'vorher',
  'vorne', 'während', 'wann', 'war', 'wäre', 'waren', 'wären', 'warum', 'was',
  'weder', 'wegen', 'weil', 'weiß', 'weiter', 'weitere', 'weiteren', 'weiterer',
  'welch', 'welche', 'welchem', 'welchen', 'welcher', 'welches', 'wem', 'wen',
  'wenig', 'wenige', 'wenigstens', 'wenn', 'wer', 'werde', 'werden', 'weshalb',
  'wessen', 'wie', 'wieder', 'will', 'wir', 'wird', 'wirklich', 'wissen', 'wo',
  'wohl', 'wollen', 'wollte', 'würde', 'würden', 'zwar', 'zwischen',
]);

const COMMON_WORDS_EN = new Set([
  'about', 'above', 'after', 'again', 'against', 'all', 'also', 'always', 'and',
  'another', 'any', 'are', 'around', 'as', 'at', 'back', 'be', 'because', 'been',
  'before', 'being', 'below', 'between', 'both', 'but', 'by', 'came', 'can',
  'come', 'could', 'did', 'do', 'does', 'doing', 'done', 'down', 'during', 'each',
  'even', 'every', 'few', 'first', 'for', 'from', 'get', 'give', 'go', 'going',
  'good', 'got', 'great', 'had', 'has', 'have', 'having', 'he', 'her', 'here',
  'him', 'his', 'how', 'however', 'if', 'in', 'into', 'is', 'it', 'its', 'just',
  'know', 'last', 'left', 'let', 'like', 'little', 'long', 'look', 'made', 'make',
  'many', 'may', 'me', 'might', 'more', 'most', 'much', 'must', 'my', 'never',
  'new', 'no', 'not', 'now', 'of', 'off', 'on', 'once', 'one', 'only', 'or',
  'other', 'our', 'out', 'over', 'own', 'part', 'people', 'put', 'quite', 'rather',
  'really', 'right', 'said', 'same', 'saw', 'say', 'see', 'she', 'should', 'since',
  'so', 'some', 'still', 'such', 'take', 'than', 'that', 'the', 'their', 'them',
  'then', 'there', 'these', 'they', 'thing', 'think', 'this', 'those', 'though',
  'through', 'time', 'to', 'too', 'two', 'under', 'until', 'up', 'upon', 'us',
  'use', 'used', 'very', 'want', 'was', 'way', 'we', 'well', 'went', 'were',
  'what', 'when', 'where', 'which', 'while', 'who', 'will', 'with', 'within',
  'without', 'would', 'year', 'yes', 'yet', 'you', 'your',
]);

function isCommonWord(word: string): boolean {
  return COMMON_WORDS_DE.has(word) || COMMON_WORDS_EN.has(word);
}

/**
 * Get color for issue type (for UI)
 */
export function getIssueColor(type: IssueType): string {
  switch (type) {
    case 'misspelling': return '#e53e3e';    // Red
    case 'grammar': return '#3182ce';        // Blue
    case 'punctuation': return '#3182ce';    // Blue
    case 'style': return '#d69e2e';          // Yellow/Orange
    case 'typographical': return '#805ad5';  // Purple
    default: return '#718096';               // Gray
  }
}

/**
 * Get label for issue type
 */
export function getIssueLabel(type: IssueType, lang: 'de' | 'en' = 'de'): string {
  if (lang === 'de') {
    switch (type) {
      case 'misspelling': return 'Rechtschreibung';
      case 'grammar': return 'Grammatik';
      case 'punctuation': return 'Zeichensetzung';
      case 'style': return 'Stil';
      case 'typographical': return 'Typografie';
      default: return 'Sonstiges';
    }
  } else {
    switch (type) {
      case 'misspelling': return 'Spelling';
      case 'grammar': return 'Grammar';
      case 'punctuation': return 'Punctuation';
      case 'style': return 'Style';
      case 'typographical': return 'Typography';
      default: return 'Other';
    }
  }
}

// Clear cache (e.g., when language changes)
export function clearLanguageToolCache(): void {
  ltCache.clear();
}
