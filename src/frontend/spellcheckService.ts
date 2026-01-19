/**
 * Spellcheck Service - verwendet Hunspell-Backend über Tauri
 * 
 * Features:
 * - Vollständige DE/EN Wörterbücher (300k+ / 50k+ Wörter)
 * - Caching für Performance
 * - Debounced checking
 * - Custom dictionary support
 */

import { invoke } from '@tauri-apps/api/tauri';

// Types matching Rust backend
export interface SpellError {
  word: string;
  start: number;
  end: number;
}

interface SpellCheckResponse {
  errors: SpellError[];
}

// Cache für Spellcheck-Ergebnisse (pro Text-Hash)
const spellCheckCache = new Map<string, SpellError[]>();
const MAX_CACHE_SIZE = 100;

// Custom dictionary (user-added words)
const customWords = new Set<string>();
const STORAGE_KEY = 'featherworks-custom-dictionary';

// Load custom dictionary from localStorage
function loadCustomDictionary(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const words = JSON.parse(stored) as string[];
      words.forEach(w => customWords.add(w.toLowerCase()));
    }
  } catch (e) {
    console.warn('[spellcheck] Could not load custom dictionary:', e);
  }
}

// Save custom dictionary to localStorage
function saveCustomDictionary(): void {
  try {
    const words = Array.from(customWords);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
  } catch (e) {
    console.warn('[spellcheck] Could not save custom dictionary:', e);
  }
}

// Initialize
loadCustomDictionary();

/**
 * Simple hash for cache key
 */
function hashText(text: string, lang: string): string {
  let hash = 0;
  const str = `${lang}:${text}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * Check text for spelling errors using Hunspell backend
 */
export async function checkSpelling(text: string, lang: 'de' | 'en' = 'de'): Promise<SpellError[]> {
  if (!text || text.length < 2) return [];
  
  // Check cache first
  const cacheKey = hashText(text, lang);
  const cached = spellCheckCache.get(cacheKey);
  if (cached) return cached;
  
  try {
    const response = await invoke<SpellCheckResponse>('spell_check', {
      req: { text, lang }
    });
    
    // Filter out custom dictionary words
    const filtered = response.errors.filter(err => 
      !customWords.has(err.word.toLowerCase())
    );
    
    // Cache result
    if (spellCheckCache.size >= MAX_CACHE_SIZE) {
      // Remove oldest entry
      const firstKey = spellCheckCache.keys().next().value;
      if (firstKey) spellCheckCache.delete(firstKey);
    }
    spellCheckCache.set(cacheKey, filtered);
    
    return filtered;
  } catch (e) {
    console.warn('[spellcheck] Backend check failed:', e);
    return [];
  }
}

/**
 * Get spelling suggestions for a word
 */
export async function getSuggestions(word: string, lang: 'de' | 'en' = 'de'): Promise<string[]> {
  if (!word || word.length < 2) return [];
  
  try {
    const suggestions = await invoke<string[]>('spell_suggest', {
      req: { word, lang }
    });
    return suggestions.slice(0, 8); // Limit to 8 suggestions
  } catch (e) {
    console.warn('[spellcheck] Could not get suggestions:', e);
    return [];
  }
}

/**
 * Add word to custom dictionary
 */
export function addToCustomDictionary(word: string): void {
  if (word && word.length >= 2) {
    customWords.add(word.toLowerCase());
    saveCustomDictionary();
    // Clear cache so word is no longer marked as error
    spellCheckCache.clear();
    // Also add to backend dictionary
    invoke('spell_add_word', { req: { word } }).catch(() => {});
  }
}

/**
 * Check if word is in custom dictionary
 */
export function isInCustomDictionary(word: string): boolean {
  return customWords.has(word.toLowerCase());
}

/**
 * Get all custom dictionary words
 */
export function getCustomDictionaryWords(): string[] {
  return Array.from(customWords);
}

/**
 * Remove word from custom dictionary
 */
export function removeFromCustomDictionary(word: string): void {
  if (word) {
    customWords.delete(word.toLowerCase());
    saveCustomDictionary();
    spellCheckCache.clear();
  }
}

/**
 * Clear the spellcheck cache (call when language changes)
 */
export function clearSpellcheckCache(): void {
  spellCheckCache.clear();
}

// Debounce helper
let debounceTimer: number | null = null;
let pendingResolvers: Array<(errors: SpellError[]) => void> = [];

/**
 * Debounced spellcheck - waits for typing pause
 */
export function checkSpellingDebounced(
  text: string, 
  lang: 'de' | 'en' = 'de', 
  delayMs = 500
): Promise<SpellError[]> {
  return new Promise((resolve) => {
    pendingResolvers.push(resolve);
    
    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
    }
    
    debounceTimer = window.setTimeout(async () => {
      const errors = await checkSpelling(text, lang);
      // Resolve all pending promises with same result
      const resolvers = pendingResolvers;
      pendingResolvers = [];
      resolvers.forEach(r => r(errors));
      debounceTimer = null;
    }, delayMs);
  });
}
