import type { Entity } from "./types"

/**
 * Highlights entities in text by wrapping them with span elements
 */
export function highlightEntities(text: string, entities: Entity[]): string {
  if (!text || entities.length === 0) return text

  // Create a map of all searchable terms (names + aliases) to entities
  const termToEntity = new Map<string, Entity>()

  entities.forEach((entity) => {
    // Add main name
    termToEntity.set(entity.name.toLowerCase(), entity)

    // Add aliases
    if (entity.aliases) {
      entity.aliases.forEach((alias) => {
        termToEntity.set(alias.toLowerCase(), entity)
      })
    }
  })

  // Sort terms by length (longest first) to match longer phrases first
  const sortedTerms = Array.from(termToEntity.keys()).sort((a, b) => b.length - a.length)

  // Build regex pattern for all terms
  const pattern = sortedTerms.map((term) => escapeRegex(term)).join("|")

  if (!pattern) return text

  const regex = new RegExp(`\\b(${pattern})\\b`, "gi")

  // Track positions that are already highlighted to avoid nested highlights
  const highlightedRanges: Array<{ start: number; end: number }> = []

  let result = text
  let offset = 0

  // Find all matches
  const matches: Array<{ index: number; length: number; term: string; entity: Entity }> = []
  let match

  while ((match = regex.exec(text)) !== null) {
    const matchedTerm = match[0]
    const entity = termToEntity.get(matchedTerm.toLowerCase())

    if (entity) {
      matches.push({
        index: match.index,
        length: matchedTerm.length,
        term: matchedTerm,
        entity,
      })
    }
  }

  // Sort matches by position
  matches.sort((a, b) => a.index - b.index)

  // Apply highlights, avoiding overlaps
  matches.forEach((match) => {
    const start = match.index + offset
    const end = start + match.length

    // Check if this range overlaps with any existing highlight
    const overlaps = highlightedRanges.some((range) => {
      return (start >= range.start && start < range.end) || (end > range.start && end <= range.end)
    })

    if (!overlaps) {
      const before = result.substring(0, start)
      const highlighted = result.substring(start, end)
      const after = result.substring(end)

      const highlightSpan = `<span class="entity-highlight" data-entity-id="${match.entity.id}">${highlighted}</span>`

      result = before + highlightSpan + after

      // Update offset for next replacements
      const addedLength = highlightSpan.length - highlighted.length
      offset += addedLength

      // Track this highlighted range
      highlightedRanges.push({
        start: start,
        end: start + highlightSpan.length,
      })
    }
  })

  return result
}

/**
 * Escapes special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Extracts plain text from HTML content
 */
export function extractPlainText(html: string): string {
  const div = document.createElement("div")
  div.innerHTML = html
  return div.textContent || div.innerText || ""
}
