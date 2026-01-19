/**
 * Entity Highlighting Service
 * Handles fetching entity data and finding matches in text for editor highlighting
 */

import { invoke } from '@tauri-apps/api/tauri';

export interface EntityHighlight {
  id: string;
  type_id: string;
  name: string;
  aliases: string;  // comma-separated
  color: string;
}

export interface EntityMatch {
  from: number;
  to: number;
  entityId: string;
  entityName: string;
  typeId: string;
  color: string;
}

// Cache for entity highlights
let cachedEntities: EntityHighlight[] = [];
let cacheTimestamp = 0;
const CACHE_TTL = 5000; // 5 seconds

/**
 * Fetch entity highlights from backend (with caching)
 */
export async function fetchEntityHighlights(forceRefresh = false): Promise<EntityHighlight[]> {
  const now = Date.now();
  if (!forceRefresh && cachedEntities.length > 0 && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedEntities;
  }
  
  try {
    const entities = await invoke<EntityHighlight[]>('get_entity_highlights');
    cachedEntities = entities;
    cacheTimestamp = now;
    return entities;
  } catch (e) {
    console.warn('[entityHighlight] Failed to fetch entities:', e);
    return cachedEntities; // Return stale cache on error
  }
}

/**
 * Clear the entity cache (call when entities are modified)
 * Also emits a custom event that editors can listen to for re-highlighting
 */
export function invalidateEntityCache(): void {
  cachedEntities = [];
  cacheTimestamp = 0;
  
  // Emit custom event so editors know to refresh highlighting
  window.dispatchEvent(new CustomEvent('entity-cache-invalidated'));
}

/**
 * Find all entity name matches in text
 * Matches entity names and their aliases (case-insensitive, whole words only)
 */
export function findEntityMatches(text: string, entities: EntityHighlight[]): EntityMatch[] {
  if (!text || entities.length === 0) return [];
  
  const matches: EntityMatch[] = [];
  
  for (const entity of entities) {
    // Collect all names to search (main name + aliases)
    const namesToSearch: string[] = [entity.name];
    if (entity.aliases) {
      const aliases = entity.aliases.split(',').map(a => a.trim()).filter(a => a.length > 0);
      namesToSearch.push(...aliases);
    }
    
    for (const name of namesToSearch) {
      if (name.length < 2) continue; // Skip very short names
      
      // Create word-boundary regex (case-insensitive)
      // Escape special regex characters in the name
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedName}\\b`, 'gi');
      
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          from: match.index,
          to: match.index + match[0].length,
          entityId: entity.id,
          entityName: entity.name,
          typeId: entity.type_id,
          color: entity.color
        });
      }
    }
  }
  
  // Sort by position and remove overlaps (keep first/longest)
  matches.sort((a, b) => a.from - b.from || (b.to - b.from) - (a.to - a.from));
  
  const filtered: EntityMatch[] = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.from >= lastEnd) {
      filtered.push(m);
      lastEnd = m.to;
    }
  }
  
  return filtered;
}

/**
 * Get entity details for hover tooltip
 */
export async function getEntityDetails(entityId: string): Promise<{
  id: string;
  name: string;
  type: string;
  description: string;
  notes: string;
  color: string;
} | null> {
  try {
    const entity = await invoke<{
      id: string;
      entity_type: string;
      name: string;
      description: string;
      notes: string;
      color: string;
      metadata_json: string;
    }>('get_entity', { id: entityId });
    
    if (!entity) return null;
    
    return {
      id: entity.id,
      name: entity.name,
      type: entity.entity_type,
      description: entity.description,
      notes: entity.notes,
      color: entity.color
    };
  } catch (e) {
    console.warn('[entityHighlight] Failed to get entity details:', e);
    return null;
  }
}
