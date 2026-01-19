//! RAG Context Builder for Fontaine
//! 
//! Builds relevant context for AI queries by:
//! 1. Including entities (characters, locations, etc.) from the database
//! 2. Keyword-based scene search for relevant passages
//! 3. Current scene content (truncated if needed)

use rusqlite::Connection;
use std::collections::HashSet;

/// Maximum characters for the full context (roughly 2000 tokens ≈ 6000 chars)
const MAX_CONTEXT_CHARS: usize = 6000;
/// Maximum characters per scene snippet
const MAX_SCENE_SNIPPET: usize = 500;
/// Maximum number of relevant scenes to include
const MAX_RELEVANT_SCENES: usize = 3;

/// Entity from the database
#[derive(Debug, Clone)]
pub struct ContextEntity {
    pub id: String,
    pub type_name: String,
    pub name: String,
    pub aliases: String,
    pub description: String,
}

/// Scene snippet for context
#[derive(Debug, Clone)]
pub struct SceneSnippet {
    pub scene_id: String,
    pub scene_title: String,
    pub chapter_title: String,
    pub content_snippet: String,
    pub relevance_score: i32,
}

/// Full context for AI query
#[derive(Debug, Clone)]
pub struct FontaineContext {
    pub project_title: String,
    pub entities: Vec<ContextEntity>,
    pub current_scene: Option<String>,
    pub current_scene_title: Option<String>,
    pub relevant_scenes: Vec<SceneSnippet>,
    pub rag_documents: Vec<(String, String)>, // (name, content snippet)
    pub knowledge_snippets: Vec<(String, String)>, // (title, content) from global knowledge base
    pub total_chars: usize,
}

impl FontaineContext {
    /// Format context as a string for the LLM prompt
    /// query_hint: optional query to prioritize relevant entities
    pub fn to_prompt_context(&self, query_hint: Option<&str>) -> String {
        let mut parts = Vec::new();
        let query_lower = query_hint.map(|q| q.to_lowercase()).unwrap_or_default();
        
        // Project title
        parts.push(format!("📖 Projekt: {}", self.project_title));
        
        // Entities (characters, locations, etc.)
        // Show full description for entities mentioned in query, abbreviated for others
        if !self.entities.is_empty() {
            parts.push("\n🎭 Bekannte Figuren & Elemente:".to_string());
            for entity in &self.entities {
                let is_relevant = !query_lower.is_empty() && (
                    query_lower.contains(&entity.name.to_lowercase()) ||
                    entity.aliases.split(',')
                        .any(|a| !a.trim().is_empty() && query_lower.contains(&a.trim().to_lowercase()))
                );
                
                let mut entry = format!("- {} ({})", entity.name, entity.type_name);
                if !entity.aliases.is_empty() {
                    entry.push_str(&format!(", auch bekannt als: {}", entity.aliases));
                }
                if !entity.description.is_empty() {
                    // Show full description (up to 500 chars) for relevant entities
                    let max_desc = if is_relevant { 500 } else { 150 };
                    let desc = if entity.description.len() > max_desc {
                        format!("{}...", &entity.description[..max_desc])
                    } else {
                        entity.description.clone()
                    };
                    entry.push_str(&format!(": {}", desc));
                }
                parts.push(entry);
            }
        }
        
        // Current scene
        if let Some(ref content) = self.current_scene {
            let title = self.current_scene_title.as_deref().unwrap_or("Aktuelle Szene");
            parts.push(format!("\n📄 {}:", title));
            // Truncate if too long
            let max_current = MAX_CONTEXT_CHARS / 2;
            if content.len() > max_current {
                parts.push(format!("{}...[gekürzt]", &content[..max_current]));
            } else {
                parts.push(content.clone());
            }
        }
        
        // Relevant scenes from other parts of the book
        if !self.relevant_scenes.is_empty() {
            parts.push("\n📚 Relevante Passagen aus anderen Szenen:".to_string());
            for scene in &self.relevant_scenes {
                parts.push(format!(
                    "- {} / {}: {}",
                    scene.chapter_title,
                    scene.scene_title,
                    scene.content_snippet
                ));
            }
        }
        
        // RAG documents (imported knowledge)
        if !self.rag_documents.is_empty() {
            parts.push("\n📎 Projekt-Hintergrundwissen:".to_string());
            for (name, snippet) in &self.rag_documents {
                parts.push(format!("- {}: {}", name, snippet));
            }
        }
        
        // Global knowledge base (app usage, writing craft, etc.)
        if !self.knowledge_snippets.is_empty() {
            parts.push("\n📚 Hintergrundwissen (in eigenen Worten wiedergeben, NICHT wörtlich zitieren):".to_string());
            for (_title, content) in &self.knowledge_snippets {
                parts.push(content.clone());
            }
        }
        
        parts.join("\n")
    }
}

/// Build context for a Fontaine query
pub fn build_context(
    conn: &Connection,
    query: &str,
    current_scene_id: Option<&str>,
) -> Result<FontaineContext, String> {
    use super::knowledge::{KnowledgeBase, format_for_context};
    
    // Get project title
    let project_title: String = conn
        .query_row("SELECT title FROM project LIMIT 1", [], |r| r.get(0))
        .unwrap_or_else(|_| "Unbekanntes Projekt".to_string());
    
    // Get all entities
    let entities = get_entities(conn)?;
    
    // Get current scene content
    let (current_scene, current_scene_title) = if let Some(scene_id) = current_scene_id {
        get_scene_content(conn, scene_id)?
    } else {
        (None, None)
    };
    
    // Find relevant scenes based on keywords in the query
    let keywords = extract_keywords(query, &entities);
    let relevant_scenes = if !keywords.is_empty() {
        find_relevant_scenes(conn, &keywords, current_scene_id)?
    } else {
        Vec::new()
    };
    
    // Get RAG documents and find relevant snippets
    let rag_documents = get_relevant_rag_snippets(conn, &keywords)?;
    
    // Search global knowledge base for relevant articles
    let kb = KnowledgeBase::new();
    let knowledge_articles = kb.search(query, 2); // Max 2 articles to keep context size reasonable
    let knowledge_snippets: Vec<(String, String)> = knowledge_articles
        .into_iter()
        .map(|article| {
            (article.title.to_string(), format_for_context(article, 800))
        })
        .collect();
    
    // Calculate total characters
    let mut total_chars = project_title.len();
    for e in &entities {
        total_chars += e.name.len() + e.description.len() + e.aliases.len() + 50;
    }
    if let Some(ref s) = current_scene {
        total_chars += s.len();
    }
    for rs in &relevant_scenes {
        total_chars += rs.content_snippet.len() + rs.scene_title.len() + rs.chapter_title.len() + 20;
    }
    for (name, snippet) in &rag_documents {
        total_chars += name.len() + snippet.len() + 20;
    }
    for (title, content) in &knowledge_snippets {
        total_chars += title.len() + content.len() + 20;
    }
    
    Ok(FontaineContext {
        project_title,
        entities,
        current_scene,
        current_scene_title,
        relevant_scenes,
        rag_documents,
        knowledge_snippets,
        total_chars,
    })
}

/// Get all entities from the database
fn get_entities(conn: &Connection) -> Result<Vec<ContextEntity>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT e.id, et.name, e.name, e.aliases, e.description 
             FROM entities e 
             JOIN entity_types et ON e.type_id = et.id 
             ORDER BY et.order_num, e.name"
        )
        .map_err(|e| format!("Failed to prepare entity query: {}", e))?;
    
    let entities = stmt
        .query_map([], |row| {
            Ok(ContextEntity {
                id: row.get(0)?,
                type_name: row.get(1)?,
                name: row.get(2)?,
                aliases: row.get::<_, String>(3).unwrap_or_default(),
                description: row.get::<_, String>(4).unwrap_or_default(),
            })
        })
        .map_err(|e| format!("Failed to query entities: {}", e))?
        .filter_map(|r| r.ok())
        .collect();
    
    Ok(entities)
}

/// Get scene content by ID
fn get_scene_content(
    conn: &Connection,
    scene_id: &str,
) -> Result<(Option<String>, Option<String>), String> {
    let result = conn.query_row(
        "SELECT title, content FROM scenes WHERE id = ?1",
        [scene_id],
        |row| {
            let title: String = row.get(0)?;
            let content: Option<String> = row.get(1)?;
            Ok((content, Some(title)))
        },
    );
    
    match result {
        Ok((content, title)) => Ok((content, title)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok((None, None)),
        Err(e) => Err(format!("Failed to get scene content: {}", e)),
    }
}

/// Extract keywords from a query, including entity names
fn extract_keywords(query: &str, entities: &[ContextEntity]) -> Vec<String> {
    let mut keywords = HashSet::new();
    let query_lower = query.to_lowercase();
    
    // Add entity names that appear in the query
    for entity in entities {
        if query_lower.contains(&entity.name.to_lowercase()) {
            keywords.insert(entity.name.clone());
        }
        // Check aliases too
        for alias in entity.aliases.split(',').map(|s| s.trim()) {
            if !alias.is_empty() && query_lower.contains(&alias.to_lowercase()) {
                keywords.insert(alias.to_string());
                // Also add the main name when an alias matches
                keywords.insert(entity.name.clone());
            }
        }
    }
    
    // Semantic expansion: Add related search terms for common question types
    let semantic_expansions: &[(&[&str], &[&str])] = &[
        // Age-related
        (&["alt", "alter", "age", "old", "jung", "young"], &["geboren", "jahr", "years", "born", "birthday", "geburtstag"]),
        // Relationship-related  
        (&["beziehung", "relationship", "verhältnis", "liebe", "love"], &["freund", "freundin", "partner", "verheiratet", "married", "zusammen", "liebt", "loves"]),
        // Conflict-related
        (&["konflikt", "conflict", "streit", "fight", "problem"], &["gegen", "against", "hasst", "hates", "feind", "enemy", "wütend", "angry"]),
        // Background/history
        (&["hintergrund", "background", "geschichte", "history", "vergangenheit", "past"], &["früher", "damals", "before", "ursprünglich", "originally"]),
        // Appearance
        (&["aussehen", "appearance", "aussieht", "looks"], &["haar", "hair", "augen", "eyes", "groß", "tall", "klein", "short"]),
        // Location
        (&["wohnt", "lives", "lebt", "zuhause", "home"], &["haus", "house", "wohnung", "apartment", "stadt", "city", "dorf", "village"]),
        // Motivation/goals
        (&["will", "wants", "ziel", "goal", "motivation"], &["plant", "plans", "versucht", "tries", "hofft", "hopes", "träumt", "dreams"]),
    ];
    
    for (triggers, expansions) in semantic_expansions {
        if triggers.iter().any(|t| query_lower.contains(t)) {
            for exp in *expansions {
                keywords.insert(exp.to_string());
            }
        }
    }
    
    // Add significant words from the query (> 3 chars, not stop words)
    let stop_words: HashSet<&str> = [
        "der", "die", "das", "ein", "eine", "und", "oder", "aber", "wenn", "weil",
        "ist", "sind", "war", "waren", "hat", "haben", "wird", "werden", "kann",
        "wie", "was", "wer", "wo", "wann", "warum", "welche", "welcher", "welches",
        "mit", "für", "von", "zu", "bei", "nach", "vor", "über", "unter", "durch",
        "the", "and", "or", "but", "if", "is", "are", "was", "were", "has", "have",
        "how", "what", "who", "where", "when", "why", "which", "with", "for", "from",
        "mir", "mich", "dir", "dich", "ihm", "ihr", "uns", "euch", "sie", "ihnen",
        "mein", "dein", "sein", "unser", "euer", "kein", "nicht", "noch", "schon",
        "gib", "sag", "tell", "give", "show", "zeig", "erkläre", "explain",
    ].into_iter().collect();
    
    for word in query.split_whitespace() {
        let clean = word.trim_matches(|c: char| !c.is_alphanumeric()).to_lowercase();
        if clean.len() > 3 && !stop_words.contains(clean.as_str()) {
            keywords.insert(clean);
        }
    }
    
    keywords.into_iter().collect()
}

/// Find scenes that contain the given keywords
fn find_relevant_scenes(
    conn: &Connection,
    keywords: &[String],
    exclude_scene_id: Option<&str>,
) -> Result<Vec<SceneSnippet>, String> {
    if keywords.is_empty() {
        return Ok(Vec::new());
    }
    
    // Build LIKE conditions for each keyword
    let conditions: Vec<String> = keywords
        .iter()
        .map(|k| format!("s.content LIKE '%{}%'", k.replace("'", "''")))
        .collect();
    
    let where_clause = conditions.join(" OR ");
    let exclude_clause = if let Some(id) = exclude_scene_id {
        format!(" AND s.id != '{}'", id.replace("'", "''"))
    } else {
        String::new()
    };
    
    let query = format!(
        "SELECT s.id, s.title, c.title, s.content, 
                ({}) as relevance
         FROM scenes s
         JOIN chapters c ON s.chapter_id = c.id
         WHERE ({}){}
         AND s.content IS NOT NULL AND s.content != ''
         ORDER BY relevance DESC
         LIMIT {}",
        // Count matching keywords as relevance score
        keywords.iter()
            .map(|k| format!("(CASE WHEN s.content LIKE '%{}%' THEN 1 ELSE 0 END)", k.replace("'", "''")))
            .collect::<Vec<_>>()
            .join(" + "),
        where_clause,
        exclude_clause,
        MAX_RELEVANT_SCENES
    );
    
    let mut stmt = conn
        .prepare(&query)
        .map_err(|e| format!("Failed to prepare scene search: {}", e))?;
    
    let scenes = stmt
        .query_map([], |row| {
            let scene_id: String = row.get(0)?;
            let scene_title: String = row.get(1)?;
            let chapter_title: String = row.get(2)?;
            let content: String = row.get::<_, Option<String>>(3)?.unwrap_or_default();
            let relevance_score: i32 = row.get(4)?;
            
            // Find the most relevant snippet containing keywords
            let snippet = find_best_snippet(&content, keywords);
            
            Ok(SceneSnippet {
                scene_id,
                scene_title,
                chapter_title,
                content_snippet: snippet,
                relevance_score,
            })
        })
        .map_err(|e| format!("Failed to search scenes: {}", e))?
        .filter_map(|r| r.ok())
        .filter(|s| !s.content_snippet.is_empty())
        .collect();
    
    Ok(scenes)
}

/// Find the best snippet in content that contains keywords
fn find_best_snippet(content: &str, keywords: &[String]) -> String {
    let content_lower = content.to_lowercase();
    
    // Find the first keyword occurrence
    let mut best_pos = None;
    for keyword in keywords {
        if let Some(pos) = content_lower.find(&keyword.to_lowercase()) {
            if best_pos.is_none() || pos < best_pos.unwrap() {
                best_pos = Some(pos);
            }
        }
    }
    
    if let Some(pos) = best_pos {
        // Extract snippet around the keyword
        let start = if pos > 100 { pos - 100 } else { 0 };
        let end = (pos + MAX_SCENE_SNIPPET - 100).min(content.len());
        
        // Find word boundaries
        let snippet_start = content[..start].rfind(' ').map(|p| p + 1).unwrap_or(start);
        let snippet_end = content[end..].find(' ').map(|p| end + p).unwrap_or(end);
        
        let mut snippet = content[snippet_start..snippet_end].to_string();
        
        // Add ellipsis if truncated
        if snippet_start > 0 {
            snippet = format!("...{}", snippet);
        }
        if snippet_end < content.len() {
            snippet = format!("{}...", snippet);
        }
        
        snippet
    } else {
        // No keyword found, return beginning of content
        if content.len() > MAX_SCENE_SNIPPET {
            format!("{}...", &content[..MAX_SCENE_SNIPPET])
        } else {
            content.to_string()
        }
    }
}

/// Get relevant snippets from RAG documents based on keywords
fn get_relevant_rag_snippets(
    conn: &Connection,
    keywords: &[String],
) -> Result<Vec<(String, String)>, String> {
    // Get all RAG documents
    let mut stmt = conn
        .prepare("SELECT name, content FROM rag_documents")
        .map_err(|e| format!("Failed to prepare RAG query: {}", e))?;
    
    let docs: Vec<(String, String)> = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| format!("Failed to query RAG documents: {}", e))?
        .filter_map(|r| r.ok())
        .collect();
    
    if docs.is_empty() || keywords.is_empty() {
        return Ok(Vec::new());
    }
    
    // Find relevant snippets in each document
    const MAX_RAG_DOCS: usize = 2;
    const MAX_RAG_SNIPPET: usize = 400;
    
    let mut results: Vec<(String, String, i32)> = Vec::new(); // (name, snippet, score)
    
    for (name, content) in docs {
        let content_lower = content.to_lowercase();
        let mut score = 0;
        
        for kw in keywords {
            let kw_lower = kw.to_lowercase();
            score += content_lower.matches(&kw_lower).count() as i32;
        }
        
        if score > 0 {
            // Find a relevant snippet
            let snippet = find_best_snippet(&content, keywords);
            let truncated = if snippet.len() > MAX_RAG_SNIPPET {
                format!("{}...", &snippet[..MAX_RAG_SNIPPET])
            } else {
                snippet
            };
            results.push((name, truncated, score));
        }
    }
    
    // Sort by relevance and take top N
    results.sort_by(|a, b| b.2.cmp(&a.2));
    let top_results: Vec<(String, String)> = results
        .into_iter()
        .take(MAX_RAG_DOCS)
        .map(|(name, snippet, _)| (name, snippet))
        .collect();
    
    Ok(top_results)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_extract_keywords() {
        let entities = vec![
            ContextEntity {
                id: "1".to_string(),
                type_name: "Charakter".to_string(),
                name: "Herbert".to_string(),
                aliases: "Herbi, Bert".to_string(),
                description: "Ein Sachse in Bayern".to_string(),
            },
        ];
        
        let keywords = extract_keywords("Welche Augenfarbe hat Herbert?", &entities);
        assert!(keywords.contains(&"Herbert".to_string()));
        assert!(keywords.contains(&"augenfarbe".to_string()));
    }
    
    #[test]
    fn test_find_best_snippet() {
        let content = "Dies ist ein langer Text. Herbert hat blaue Augen und rote Haare. Er arbeitet bei der Firma Günther. Das ist das Ende.";
        let keywords = vec!["Herbert".to_string(), "Augen".to_string()];
        
        let snippet = find_best_snippet(content, &keywords);
        assert!(snippet.contains("Herbert"));
        assert!(snippet.contains("Augen"));
    }
}
