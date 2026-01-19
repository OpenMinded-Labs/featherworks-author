import type { TextIssue } from "./types"

/**
 * Common German "vampire verbs" (weak verbs that drain energy from writing)
 */
const VAMPIRE_VERBS = [
  "sein",
  "haben",
  "werden",
  "machen",
  "tun",
  "geben",
  "bekommen",
  "kriegen",
  "bringen",
  "nehmen",
  "kommen",
  "gehen",
  "stehen",
  "liegen",
  "sitzen",
  "lassen",
  "halten",
  "finden",
  "sehen",
  "hören",
  "fühlen",
  "denken",
  "wissen",
  "sagen",
  "sprechen",
  "erzählen",
  "meinen",
  "glauben",
]

/**
 * Common German filler words and weak constructions
 */
const FILLER_WORDS = [
  "sehr",
  "ziemlich",
  "etwas",
  "irgendwie",
  "eigentlich",
  "sozusagen",
  "gewissermaßen",
  "quasi",
  "praktisch",
  "relativ",
  "recht",
  "ganz",
  "durchaus",
  "wohl",
  "halt",
  "eben",
  "mal",
  "einfach",
]

/**
 * Analyzes text for various issues
 */
export function analyzeText(text: string): TextIssue[] {
  const issues: TextIssue[] = []

  if (!text || text.trim().length === 0) {
    return issues
  }

  // Analyze word repetitions
  issues.push(...findWordRepetitions(text))

  // Analyze vampire verbs
  issues.push(...findVampireVerbs(text))

  // Analyze filler words
  issues.push(...findFillerWords(text))

  // Analyze sentence structure
  issues.push(...analyzeSentenceStructure(text))

  // Analyze punctuation
  issues.push(...analyzePunctuation(text))

  return issues
}

/**
 * Finds words that are repeated too frequently
 */
function findWordRepetitions(text: string): TextIssue[] {
  const issues: TextIssue[] = []
  const words = text.toLowerCase().split(/\s+/)
  const wordCounts = new Map<string, number>()
  const wordPositions = new Map<string, number[]>()

  // Count words and track positions
  words.forEach((word, index) => {
    // Clean word from punctuation
    const cleanWord = word.replace(/[.,!?;:()"""'']/g, "")

    if (cleanWord.length > 4) {
      wordCounts.set(cleanWord, (wordCounts.get(cleanWord) || 0) + 1)

      if (!wordPositions.has(cleanWord)) {
        wordPositions.set(cleanWord, [])
      }
      wordPositions.get(cleanWord)?.push(index)
    }
  })

  // Find repetitions
  wordCounts.forEach((count, word) => {
    if (count > 3) {
      issues.push({
        id: `rep-${word}-${Date.now()}`,
        type: "repetition",
        message: `"${word}" wird ${count}× wiederholt`,
        context: `Das Wort "${word}" erscheint zu häufig im Text`,
        position: wordPositions.get(word)?.[0] || 0,
        suggestion: `Verwenden Sie Synonyme oder formulieren Sie Sätze um`,
      })
    }
  })

  return issues
}

/**
 * Finds vampire verbs (weak verbs)
 */
function findVampireVerbs(text: string): TextIssue[] {
  const issues: TextIssue[] = []
  const sentences = text.split(/[.!?]+/)

  sentences.forEach((sentence, sentenceIndex) => {
    const words = sentence.toLowerCase().split(/\s+/)

    words.forEach((word, wordIndex) => {
      const cleanWord = word.replace(/[.,!?;:()"""'']/g, "")

      // Check if word is a vampire verb or conjugated form
      const isVampireVerb = VAMPIRE_VERBS.some((verb) => {
        return (
          cleanWord === verb ||
          cleanWord.startsWith(verb) ||
          // Check common conjugations
          cleanWord === `${verb}e` ||
          cleanWord === `${verb}st` ||
          cleanWord === `${verb}t` ||
          cleanWord === `${verb}en`
        )
      })

      if (isVampireVerb) {
        // Get context (a few words around the verb)
        const contextStart = Math.max(0, wordIndex - 3)
        const contextEnd = Math.min(words.length, wordIndex + 4)
        const context = words.slice(contextStart, contextEnd).join(" ")

        issues.push({
          id: `vampire-${sentenceIndex}-${wordIndex}-${Date.now()}`,
          type: "vampire-verb",
          message: `Vampirverb: "${cleanWord}"`,
          context: `...${context}...`,
          position: sentenceIndex * 100 + wordIndex,
          suggestion: "Verwenden Sie ein stärkeres, präziseres Verb",
        })
      }
    })
  })

  return issues
}

/**
 * Finds filler words that weaken the text
 */
function findFillerWords(text: string): TextIssue[] {
  const issues: TextIssue[] = []
  const sentences = text.split(/[.!?]+/)

  sentences.forEach((sentence, sentenceIndex) => {
    const words = sentence.toLowerCase().split(/\s+/)

    words.forEach((word, wordIndex) => {
      const cleanWord = word.replace(/[.,!?;:()"""'']/g, "")

      if (FILLER_WORDS.includes(cleanWord)) {
        const contextStart = Math.max(0, wordIndex - 3)
        const contextEnd = Math.min(words.length, wordIndex + 4)
        const context = words.slice(contextStart, contextEnd).join(" ")

        issues.push({
          id: `filler-${sentenceIndex}-${wordIndex}-${Date.now()}`,
          type: "error",
          message: `Füllwort: "${cleanWord}"`,
          context: `...${context}...`,
          position: sentenceIndex * 100 + wordIndex,
          suggestion: "Streichen Sie das Füllwort für prägnantere Sprache",
        })
      }
    })
  })

  return issues
}

/**
 * Analyzes sentence structure
 */
function analyzeSentenceStructure(text: string): TextIssue[] {
  const issues: TextIssue[] = []
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0)

  sentences.forEach((sentence, index) => {
    const words = sentence.trim().split(/\s+/)
    const wordCount = words.length

    // Check for very long sentences
    if (wordCount > 35) {
      issues.push({
        id: `long-sentence-${index}-${Date.now()}`,
        type: "error",
        message: `Sehr langer Satz (${wordCount} Wörter)`,
        context: sentence.substring(0, 100) + "...",
        position: index * 1000,
        suggestion: "Teilen Sie den Satz in kürzere Sätze auf",
      })
    }

    // Check for very short sentences (might be fragments)
    if (wordCount < 3 && wordCount > 0) {
      issues.push({
        id: `short-sentence-${index}-${Date.now()}`,
        type: "error",
        message: `Sehr kurzer Satz (${wordCount} Wörter)`,
        context: sentence.trim(),
        position: index * 1000,
        suggestion: "Prüfen Sie, ob dies ein vollständiger Satz ist",
      })
    }
  })

  return issues
}

/**
 * Analyzes punctuation issues
 */
function analyzePunctuation(text: string): TextIssue[] {
  const issues: TextIssue[] = []

  // Check for multiple spaces
  const multipleSpaces = text.match(/\s{2,}/g)
  if (multipleSpaces) {
    issues.push({
      id: `spaces-${Date.now()}`,
      type: "error",
      message: "Mehrfache Leerzeichen gefunden",
      context: "Mehrere aufeinanderfolgende Leerzeichen im Text",
      position: 0,
      suggestion: "Entfernen Sie überflüssige Leerzeichen",
    })
  }

  // Check for missing space after punctuation
  const missingSpaces = text.match(/[.,!?;:][^\s"']/g)
  if (missingSpaces && missingSpaces.length > 0) {
    issues.push({
      id: `missing-space-${Date.now()}`,
      type: "error",
      message: "Fehlende Leerzeichen nach Satzzeichen",
      context: `${missingSpaces.length} Stelle(n) gefunden`,
      position: 0,
      suggestion: "Fügen Sie Leerzeichen nach Satzzeichen ein",
    })
  }

  // Check for double punctuation
  const doublePunctuation = text.match(/[.,!?;:]{2,}/g)
  if (doublePunctuation && doublePunctuation.length > 0) {
    issues.push({
      id: `double-punct-${Date.now()}`,
      type: "error",
      message: "Doppelte Satzzeichen gefunden",
      context: doublePunctuation.join(", "),
      position: 0,
      suggestion: "Entfernen Sie überflüssige Satzzeichen",
    })
  }

  return issues
}

/**
 * Gets statistics about the text
 */
export function getTextStatistics(text: string) {
  const plainText = text.replace(/<[^>]*>/g, "")
  const words = plainText.split(/\s+/).filter((w) => w.length > 0)
  const sentences = plainText.split(/[.!?]+/).filter((s) => s.trim().length > 0)
  const paragraphs = plainText.split(/\n\n+/).filter((p) => p.trim().length > 0)

  return {
    characters: plainText.length,
    charactersNoSpaces: plainText.replace(/\s/g, "").length,
    words: words.length,
    sentences: sentences.length,
    paragraphs: paragraphs.length,
    averageWordsPerSentence: sentences.length > 0 ? Math.round(words.length / sentences.length) : 0,
    readingTimeMinutes: Math.ceil(words.length / 200), // Average reading speed
  }
}
