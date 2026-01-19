/**
 * Thesaurus Service - Umfangreiche Synonym-Datenbanken für Deutsch und Englisch
 * 
 * Deutsch: OpenThesaurus (~200.000 Synonyme)
 * Englisch: MyThes/LibreOffice (~30.000 Synonyme)
 * 
 * Credits: 
 * - German: https://www.openthesaurus.de (CC BY-SA 4.0 / LGPL)
 * - English: MyThes/WordNet (BSD License)
 */

// Synonym-Maps (werden lazy geladen)
let germanThesaurus: Map<string, string[]> | null = null;
let englishThesaurus: Map<string, string[]> | null = null;
let germanThesaurusLoading: Promise<void> | null = null;
let englishThesaurusLoading: Promise<void> | null = null;

/**
 * Lädt den deutschen Thesaurus aus der OpenThesaurus Textdatei
 * Format: Wort1;Wort2;Wort3;... (Synonymgruppen)
 */
async function loadGermanThesaurus(): Promise<void> {
  if (germanThesaurus) return;
  if (germanThesaurusLoading) {
    await germanThesaurusLoading;
    return;
  }
  
  germanThesaurusLoading = (async () => {
    try {
      const response = await fetch('/thesaurus/openthesaurus.txt');
      if (!response.ok) {
        console.warn('OpenThesaurus nicht gefunden, verwende Fallback');
        germanThesaurus = new Map();
        return;
      }
      
      const text = await response.text();
      germanThesaurus = new Map();
      
      const lines = text.split('\n');
      for (const line of lines) {
        // Kommentare und leere Zeilen überspringen
        if (line.startsWith('#') || !line.trim()) continue;
        
        // Format: Wort1;Wort2;Wort3;...
        // Manche Einträge haben Annotationen in Klammern: Wort (fachspr.)
        const parts = line.split(';').map(p => {
          // Entferne Annotationen in Klammern
          return p.replace(/\s*\([^)]*\)/g, '').trim();
        }).filter(p => p.length > 0);
        
        if (parts.length < 2) continue;
        
        // Jedes Wort in der Gruppe bekommt alle anderen als Synonyme
        for (const word of parts) {
          const normalizedWord = word.toLowerCase();
          const synonyms = parts.filter(p => p.toLowerCase() !== normalizedWord);
          
          if (germanThesaurus.has(normalizedWord)) {
            const existing = germanThesaurus.get(normalizedWord)!;
            const merged = [...new Set([...existing, ...synonyms])];
            germanThesaurus.set(normalizedWord, merged);
          } else {
            germanThesaurus.set(normalizedWord, synonyms);
          }
        }
      }
      
      console.log(`[Thesaurus] Deutsch geladen: ${germanThesaurus.size} Wörter`);
    } catch (error) {
      console.error('Fehler beim Laden des deutschen Thesaurus:', error);
      germanThesaurus = new Map();
    }
  })();
  
  await germanThesaurusLoading;
}

/**
 * Lädt den englischen Thesaurus aus der MyThes Datei
 * Format: 
 *   word|num_meanings
 *   (type)|synonym1|synonym2|...
 */
async function loadEnglishThesaurus(): Promise<void> {
  if (englishThesaurus) return;
  if (englishThesaurusLoading) {
    await englishThesaurusLoading;
    return;
  }
  
  englishThesaurusLoading = (async () => {
    try {
      const response = await fetch('/thesaurus/th_en_US_new.dat');
      if (!response.ok) {
        console.warn('English Thesaurus nicht gefunden, verwende Fallback');
        englishThesaurus = new Map();
        return;
      }
      
      const text = await response.text();
      englishThesaurus = new Map();
      
      const lines = text.split('\n');
      let currentWord: string | null = null;
      let currentSynonyms: string[] = [];
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        // Erste Zeile ist Encoding, überspringen
        if (line.startsWith('ISO')) continue;
        
        // Wort-Zeile: word|num_meanings
        if (line.includes('|') && !line.startsWith('(')) {
          // Vorheriges Wort speichern
          if (currentWord && currentSynonyms.length > 0) {
            const normalizedWord = currentWord.toLowerCase();
            if (englishThesaurus.has(normalizedWord)) {
              const existing = englishThesaurus.get(normalizedWord)!;
              englishThesaurus.set(normalizedWord, [...new Set([...existing, ...currentSynonyms])]);
            } else {
              englishThesaurus.set(normalizedWord, currentSynonyms);
            }
          }
          
          // Neues Wort beginnen
          const parts = line.split('|');
          currentWord = parts[0].trim();
          currentSynonyms = [];
        } 
        // Synonym-Zeile: (type)|syn1|syn2|...
        else if (line.startsWith('(')) {
          const parts = line.split('|').slice(1); // Typ überspringen
          const synonyms = parts
            .map(p => p.trim())
            .filter(p => p.length > 0 && !p.startsWith('('));
          currentSynonyms.push(...synonyms);
        }
      }
      
      // Letztes Wort speichern
      if (currentWord && currentSynonyms.length > 0) {
        englishThesaurus.set(currentWord.toLowerCase(), currentSynonyms);
      }
      
      console.log(`[Thesaurus] Englisch geladen: ${englishThesaurus.size} Wörter`);
    } catch (error) {
      console.error('Fehler beim Laden des englischen Thesaurus:', error);
      englishThesaurus = new Map();
    }
  })();
  
  await englishThesaurusLoading;
}

/**
 * Findet Synonyme für ein Wort
 * @param word Das Wort, für das Synonyme gesucht werden
 * @param lang Sprache: 'de' oder 'en'
 * @returns Array von Synonymen
 */
export async function findSynonyms(word: string, lang: 'de' | 'en' = 'de'): Promise<string[]> {
  if (!word || word.length < 2) return [];
  
  const normalizedWord = word.toLowerCase().trim();
  
  if (lang === 'en') {
    await loadEnglishThesaurus();
    if (!englishThesaurus) return [];
    
    const synonyms = englishThesaurus.get(normalizedWord);
    return synonyms ? synonyms.slice(0, 20) : [];
  } else {
    await loadGermanThesaurus();
    if (!germanThesaurus) return [];
    
    // Exakte Suche
    let synonyms = germanThesaurus.get(normalizedWord);
    
    // Falls nicht gefunden, versuche Varianten
    if (!synonyms) {
      // Versuche ohne Umlaute
      const withoutUmlauts = normalizedWord
        .replace(/ä/g, 'ae')
        .replace(/ö/g, 'oe')
        .replace(/ü/g, 'ue')
        .replace(/ß/g, 'ss');
      synonyms = germanThesaurus.get(withoutUmlauts);
    }
    
    return synonyms ? synonyms.slice(0, 20) : [];
  }
}

/**
 * Synchrone Version für schnelle Checks (nur für bereits geladene Daten)
 */
export function findSynonymsSync(word: string, lang: 'de' | 'en' = 'de'): string[] {
  if (!word || word.length < 2) return [];
  
  const normalizedWord = word.toLowerCase().trim();
  
  if (lang === 'en') {
    if (!englishThesaurus) return [];
    const synonyms = englishThesaurus.get(normalizedWord);
    return synonyms ? synonyms.slice(0, 20) : [];
  } else {
    if (!germanThesaurus) return [];
    const synonyms = germanThesaurus.get(normalizedWord);
    return synonyms ? synonyms.slice(0, 20) : [];
  }
}

/**
 * Prüft, ob ein Wort Synonyme hat
 */
export async function hasSynonyms(word: string, lang: 'de' | 'en' = 'de'): Promise<boolean> {
  const synonyms = await findSynonyms(word, lang);
  return synonyms.length > 0;
}

/**
 * Synchrone Version des Synonym-Checks
 */
export function hasSynonymsSync(word: string, lang: 'de' | 'en' = 'de'): boolean {
  return findSynonymsSync(word, lang).length > 0;
}

/**
 * Gibt die Anzahl der Wörter im Thesaurus zurück
 */
export async function getThesaurusStats(lang: 'de' | 'en' = 'de'): Promise<number> {
  if (lang === 'en') {
    await loadEnglishThesaurus();
    return englishThesaurus?.size ?? 0;
  } else {
    await loadGermanThesaurus();
    return germanThesaurus?.size ?? 0;
  }
}

/**
 * Lädt beide Thesauri vor (für schnelleren Zugriff)
 */
export async function preloadGermanThesaurus(): Promise<void> {
  await loadGermanThesaurus();
}

export async function preloadEnglishThesaurus(): Promise<void> {
  await loadEnglishThesaurus();
}

export async function preloadAllThesauri(): Promise<void> {
  await Promise.all([loadGermanThesaurus(), loadEnglishThesaurus()]);
}

// Export für Kompatibilität mit altem Code
export { findSynonyms as findLocalSynonyms };
