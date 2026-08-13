//! RAG Context Builder for Fontaine
//!
//! Builds relevant context for AI queries by:
//! 1. Including entities (characters, locations, etc.) from the database
//! 2. Keyword-based scene search for relevant passages
//! 3. Current scene content (truncated if needed)

use rusqlite::Connection;
use std::collections::HashSet;

/// Maximum characters per scene snippet (for *other* scenes, not the current one)
const MAX_SCENE_SNIPPET: usize = 500;
/// Maximum number of relevant scenes to include
const MAX_RELEVANT_SCENES: usize = 3;

/// Description budget for an entity the query asks about by name.
const DESC_QUERY_MATCH: usize = 1500;
/// Description budget for an entity that appears in the scene at hand.
const DESC_SCENE_MATCH: usize = 400;
/// How many described entities to include at most. Beyond this the cast is
/// listed by name only - a roster the model can still refer to, but that costs
/// a few tokens per entry instead of a few hundred.
const MAX_DESCRIBED_ENTITIES: usize = 12;

/// How relevant an entity is to the request at hand. Ordering matters: higher
/// variants win when the budget is tight.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum EntityRelevance {
    /// Not mentioned anywhere - name and type only.
    Roster,
    /// Appears in the scene the user is working on.
    InScene,
    /// Named in the question itself.
    InQuery,
}

/// Whether `name` occurs in `haystack` as a whole word.
///
/// Substring matching is not good enough here: a character called "Ana" would
/// otherwise match "Analyse", "Ananas" and "Banane", pulling irrelevant
/// descriptions into every single prompt.
fn mentions_word(haystack_lower: &str, name: &str) -> bool {
    let needle = name.trim().to_lowercase();
    if needle.is_empty() {
        return false;
    }

    let mut from = 0;
    while let Some(idx) = haystack_lower[from..].find(&needle) {
        let start = from + idx;
        let end = start + needle.len();

        let before_ok = haystack_lower[..start]
            .chars()
            .next_back()
            .is_none_or(|c| !c.is_alphanumeric());
        let after_ok = haystack_lower[end..]
            .chars()
            .next()
            .is_none_or(|c| !c.is_alphanumeric());

        if before_ok && after_ok {
            return true;
        }
        // Advance past this position; needle is non-empty so this terminates.
        from = start + needle.chars().next().map(char::len_utf8).unwrap_or(1);
        if from >= haystack_lower.len() {
            break;
        }
    }
    false
}

/// Truncate at a char boundary. Slicing a `String` by byte index panics if the
/// index lands inside a multi-byte character (umlauts, emoji, ...), so never
/// use `&s[..n]` directly on user text.
fn truncate_chars(s: &str, max_chars: usize) -> String {
    match s.char_indices().nth(max_chars) {
        Some((byte_idx, _)) => format!("{}...", &s[..byte_idx]),
        None => s.to_string(),
    }
}

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
    /// Rates every entity against the question and the scene at hand.
    ///
    /// Split out from `to_prompt_context` so the ranking can be tested without
    /// building a whole prompt.
    fn rank_entities(&self, query_hint: Option<&str>) -> Vec<(&ContextEntity, EntityRelevance)> {
        let query_lower = query_hint.map(|q| q.to_lowercase()).unwrap_or_default();
        let scene_lower = self
            .current_scene
            .as_deref()
            .map(|s| s.to_lowercase())
            .unwrap_or_default();

        let mut rated: Vec<(&ContextEntity, EntityRelevance)> = self
            .entities
            .iter()
            .map(|entity| {
                // An entity is addressed either by its name or by any alias.
                let names = std::iter::once(entity.name.as_str())
                    .chain(entity.aliases.split(',').map(str::trim))
                    .filter(|n| !n.is_empty());

                let mut relevance = EntityRelevance::Roster;
                for name in names {
                    if !query_lower.is_empty() && mentions_word(&query_lower, name) {
                        relevance = EntityRelevance::InQuery;
                        break;
                    }
                    if !scene_lower.is_empty() && mentions_word(&scene_lower, name) {
                        relevance = EntityRelevance::InScene;
                    }
                }
                (entity, relevance)
            })
            .collect();

        // Highest relevance first; ties keep the database order (type, name) so
        // the prompt prefix stays stable across requests and the KV cache hits.
        rated.sort_by(|a, b| b.1.cmp(&a.1));
        rated
    }

    /// Format context as a string for the LLM prompt
    /// query_hint: optional query to prioritize relevant entities
    pub fn to_prompt_context(&self, query_hint: Option<&str>) -> String {
        let mut parts = Vec::new();

        // Project title
        parts.push(format!("📖 Projekt: {}", self.project_title));

        // Entities (characters, locations, etc.)
        //
        // Dumping every description into every prompt was the single largest
        // context cost: a cast of 50 easily added ~20k characters that had
        // nothing to do with the question. Only entities the query or the
        // current scene actually mention get a description now; the rest stay
        // as a name roster so the model still knows they exist.
        if !self.entities.is_empty() {
            parts.push("\n🎭 Bekannte Figuren & Elemente:".to_string());

            let rated = self.rank_entities(query_hint);
            let mut described = 0;
            let mut roster: Vec<String> = Vec::new();

            for (entity, relevance) in rated {
                let budget = match relevance {
                    EntityRelevance::InQuery => Some(DESC_QUERY_MATCH),
                    EntityRelevance::InScene => Some(DESC_SCENE_MATCH),
                    EntityRelevance::Roster => None,
                };

                let describe = budget.is_some()
                    && described < MAX_DESCRIBED_ENTITIES
                    && !entity.description.is_empty();

                if !describe {
                    roster.push(format!("{} ({})", entity.name, entity.type_name));
                    continue;
                }

                described += 1;
                let mut entry = format!("- {} ({})", entity.name, entity.type_name);
                if !entity.aliases.is_empty() {
                    entry.push_str(&format!(", auch bekannt als: {}", entity.aliases));
                }
                entry.push_str(&format!(
                    ": {}",
                    truncate_chars(&entity.description, budget.unwrap())
                ));
                parts.push(entry);
            }

            if !roster.is_empty() {
                parts.push(format!("- Weitere: {}", roster.join(", ")));
            }
        }

        // Current scene — always included in FULL. This is the primary material
        // the user is asking about; truncating it makes the model answer as if it
        // had only seen the opening paragraphs.
        if let Some(ref content) = self.current_scene {
            let title = self
                .current_scene_title
                .as_deref()
                .unwrap_or("Aktuelle Szene");
            parts.push(format!("\n📄 {}:", title));
            parts.push(content.clone());
        }

        // Relevant scenes from other parts of the book
        if !self.relevant_scenes.is_empty() {
            parts.push("\n📚 Relevante Passagen aus anderen Szenen:".to_string());
            for scene in &self.relevant_scenes {
                parts.push(format!(
                    "- {} / {}: {}",
                    scene.chapter_title, scene.scene_title, scene.content_snippet
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
            parts.push(
                "\n📚 Hintergrundwissen (in eigenen Worten wiedergeben, NICHT wörtlich zitieren):"
                    .to_string(),
            );
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
    use super::knowledge::{format_for_context, KnowledgeBase};

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
        .map(|article| (article.title.to_string(), format_for_context(article, 800)))
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
        total_chars +=
            rs.content_snippet.len() + rs.scene_title.len() + rs.chapter_title.len() + 20;
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
             ORDER BY et.order_num, e.name",
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
        (
            &["alt", "alter", "age", "old", "jung", "young"],
            &["geboren", "jahr", "years", "born", "birthday", "geburtstag"],
        ),
        // Relationship-related
        (
            &["beziehung", "relationship", "verhältnis", "liebe", "love"],
            &[
                "freund",
                "freundin",
                "partner",
                "verheiratet",
                "married",
                "zusammen",
                "liebt",
                "loves",
            ],
        ),
        // Conflict-related
        (
            &["konflikt", "conflict", "streit", "fight", "problem"],
            &[
                "gegen", "against", "hasst", "hates", "feind", "enemy", "wütend", "angry",
            ],
        ),
        // Background/history
        (
            &[
                "hintergrund",
                "background",
                "geschichte",
                "history",
                "vergangenheit",
                "past",
            ],
            &["früher", "damals", "before", "ursprünglich", "originally"],
        ),
        // Appearance
        (
            &["aussehen", "appearance", "aussieht", "looks"],
            &[
                "haar", "hair", "augen", "eyes", "groß", "tall", "klein", "short",
            ],
        ),
        // Location
        (
            &["wohnt", "lives", "lebt", "zuhause", "home"],
            &[
                "haus",
                "house",
                "wohnung",
                "apartment",
                "stadt",
                "city",
                "dorf",
                "village",
            ],
        ),
        // Motivation/goals
        (
            &["will", "wants", "ziel", "goal", "motivation"],
            &[
                "plant", "plans", "versucht", "tries", "hofft", "hopes", "träumt", "dreams",
            ],
        ),
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
        "der", "die", "das", "ein", "eine", "und", "oder", "aber", "wenn", "weil", "ist", "sind",
        "war", "waren", "hat", "haben", "wird", "werden", "kann", "wie", "was", "wer", "wo",
        "wann", "warum", "welche", "welcher", "welches", "mit", "für", "von", "zu", "bei", "nach",
        "vor", "über", "unter", "durch", "the", "and", "or", "but", "if", "is", "are", "was",
        "were", "has", "have", "how", "what", "who", "where", "when", "why", "which", "with",
        "for", "from", "mir", "mich", "dir", "dich", "ihm", "ihr", "uns", "euch", "sie", "ihnen",
        "mein", "dein", "sein", "unser", "euer", "kein", "nicht", "noch", "schon", "gib", "sag",
        "tell", "give", "show", "zeig", "erkläre", "explain",
    ]
    .into_iter()
    .collect();

    for word in query.split_whitespace() {
        let clean = word
            .trim_matches(|c: char| !c.is_alphanumeric())
            .to_lowercase();
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
        keywords
            .iter()
            .map(|k| format!(
                "(CASE WHEN s.content LIKE '%{}%' THEN 1 ELSE 0 END)",
                k.replace("'", "''")
            ))
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
        truncate_chars(content, MAX_SCENE_SNIPPET)
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
            let truncated = truncate_chars(&snippet, MAX_RAG_SNIPPET);
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

    fn entity(name: &str, aliases: &str, description: &str) -> ContextEntity {
        ContextEntity {
            id: name.to_string(),
            type_name: "Charakter".to_string(),
            name: name.to_string(),
            aliases: aliases.to_string(),
            description: description.to_string(),
        }
    }

    fn context_with(entities: Vec<ContextEntity>, scene: Option<&str>) -> FontaineContext {
        FontaineContext {
            project_title: "Testbuch".to_string(),
            entities,
            current_scene: scene.map(str::to_string),
            current_scene_title: Some("Szene".to_string()),
            relevant_scenes: Vec::new(),
            rag_documents: Vec::new(),
            knowledge_snippets: Vec::new(),
            total_chars: 0,
        }
    }

    #[test]
    fn word_match_ignores_substrings() {
        // The bug this guards against: "Ana" matching "Banane" dragged an
        // unrelated character description into every prompt.
        assert!(mentions_word("wo ist ana gerade?", "Ana"));
        assert!(!mentions_word("er ass eine banane", "Ana"));
        assert!(!mentions_word("die analyse ergab nichts", "Ana"));
        // Punctuation is a boundary, casing is already normalised by the caller.
        assert!(mentions_word("und dann rief ana!", "ana"));
    }

    #[test]
    fn entities_named_in_the_query_rank_highest() {
        let ctx = context_with(
            vec![
                entity("Marla", "", "Die Protagonistin."),
                entity("Herbert", "", "Ein Sachse in Bayern."),
            ],
            Some("Herbert stand am Fenster."),
        );

        let ranked = ctx.rank_entities(Some("Was denkt Marla?"));
        assert_eq!(ranked[0].0.name, "Marla");
        assert_eq!(ranked[0].1, EntityRelevance::InQuery);
        // Herbert is not asked about, but he is in the scene.
        let herbert = ranked.iter().find(|(e, _)| e.name == "Herbert").unwrap();
        assert_eq!(herbert.1, EntityRelevance::InScene);
    }

    #[test]
    fn aliases_count_as_mentions() {
        let ctx = context_with(vec![entity("Herbert", "Herbi, Bert", "Sachse.")], None);
        let ranked = ctx.rank_entities(Some("Wo ist Herbi?"));
        assert_eq!(ranked[0].1, EntityRelevance::InQuery);
    }

    /// "Welche Augenfarbe hat Jack nochmal?" while Jack is nowhere near the
    /// current scene. The lookup must not depend on the visible text: entities
    /// are loaded from the database, so a question alone is enough to pull the
    /// full description in.
    #[test]
    fn a_character_absent_from_the_scene_is_still_looked_up() {
        let ctx = context_with(
            vec![
                entity("Marla", "", "Die Protagonistin."),
                entity("Jack", "", "Grüne Augen, Narbe über der Braue."),
            ],
            // Jack does not appear here at all.
            Some("Marla stand allein am Fenster und wartete."),
        );

        let prompt = ctx.to_prompt_context(Some("Welche Augenfarbe hat Jack nochmal?"));
        assert!(
            prompt.contains("Grüne Augen"),
            "asked about Jack but his description never reached the prompt:\n{prompt}"
        );
    }

    /// Where the name-matching retrieval genuinely fails. Not a wishlist: each
    /// case below is a question a user would plausibly type, and the current
    /// lookup returns nothing for all of them. Kept as a live test so the
    /// limitation is documented rather than assumed away.
    #[test]
    fn retrieval_misses_questions_that_do_not_spell_the_name() {
        let ctx = context_with(
            vec![ContextEntity {
                id: "jack".into(),
                type_name: "Charakter".into(),
                name: "Jack".into(),
                aliases: String::new(),
                description: "Grüne Augen. Kapitän der Nordwind.".into(),
            }],
            Some("Marla stand allein am Fenster."),
        );

        let missed = [
            // Pronoun: the name only appeared in an earlier chat turn.
            "Welche Augenfarbe hat er nochmal?",
            // Role instead of name.
            "Wie sieht der Kapitän aus?",
            // Typo.
            "Welche Augenfarbe hat Jak?",
            // Inflected form - German genitive does not match the bare name.
            "Was ist Jacks Augenfarbe?",
        ];

        for question in missed {
            let prompt = ctx.to_prompt_context(Some(question));
            assert!(
                !prompt.contains("Grüne Augen"),
                "retrieval unexpectedly succeeded for {question:?} - \
                 if this now works, delete the case instead of loosening it"
            );
        }
    }

    /// The narrowed-scope case: the user marked one paragraph, so the model sees
    /// a sliver of prose. Entity lookup must be unaffected by that narrowing.
    #[test]
    fn entity_lookup_survives_a_narrowed_scene_scope() {
        let entities = vec![entity("Jack", "", "Grüne Augen, Narbe über der Braue.")];
        let question = Some("Welche Augenfarbe hat Jack?");

        let full = context_with(entities.clone(), Some("Ein langes Kapitel ohne Jack."));
        let narrowed = context_with(entities, Some("Ein Satz."));

        assert!(full.to_prompt_context(question).contains("Grüne Augen"));
        assert!(
            narrowed.to_prompt_context(question).contains("Grüne Augen"),
            "narrowing the scene scope hid an entity the user asked about"
        );
    }

    #[test]
    fn unmentioned_entities_are_listed_without_description() {
        let ctx = context_with(
            vec![
                entity("Marla", "", "Die Protagonistin."),
                entity("Zrassha", "", "GEHEIMNIS-BESCHREIBUNG"),
            ],
            Some("Marla stand am Fenster."),
        );

        let prompt = ctx.to_prompt_context(Some("Was tut Marla?"));
        assert!(prompt.contains("Die Protagonistin."));
        // Named, so the model knows she exists - but without the payload.
        assert!(prompt.contains("Zrassha"));
        assert!(
            !prompt.contains("GEHEIMNIS-BESCHREIBUNG"),
            "description of an unmentioned entity leaked into the prompt"
        );
    }

    #[test]
    fn large_cast_stays_bounded() {
        // Every entity is mentioned in the scene, so without a cap all of them
        // would be described.
        let names: Vec<String> = (0..40).map(|i| format!("Figur{i}")).collect();
        let scene = names.join(" trifft ");
        let entities: Vec<ContextEntity> = names
            .iter()
            .map(|n| entity(n, "", &"x".repeat(2000)))
            .collect();

        let ctx = context_with(entities, Some(&scene));
        let prompt = ctx.to_prompt_context(Some("Was passiert?"));

        let described = prompt.matches("): x").count();
        assert!(
            described <= MAX_DESCRIBED_ENTITIES,
            "described {described} entities, cap is {MAX_DESCRIBED_ENTITIES}"
        );
        // The undescribed ones still appear by name.
        assert!(prompt.contains("Weitere:"));
        assert!(prompt.contains("Figur39"));
    }

    #[test]
    #[ignore = "measurement, not an assertion"]
    fn measure_prompt_size_for_a_realistic_cast() {
        // 50 entities with a paragraph of description each, a 6k-char scene,
        // and a question that names exactly one of them.
        let entities: Vec<ContextEntity> = (0..50)
            .map(|i| {
                entity(
                    &format!("Figur{i}"),
                    "",
                    &format!("Beschreibung von Figur {i}. {}", "Detail. ".repeat(60)),
                )
            })
            .collect();
        let scene = "Figur3 ging durch den Regen. ".repeat(200);

        let ctx = context_with(entities, Some(&scene));
        let prompt = ctx.to_prompt_context(Some("Was motiviert Figur7?"));

        // What the previous implementation would have emitted: every entity
        // described, 400 chars each (1500 for the one named in the query).
        let before: usize = ctx
            .entities
            .iter()
            .map(|e| {
                let budget = if e.name == "Figur7" { 1500 } else { 400 };
                e.name.chars().count()
                    + e.type_name.chars().count()
                    + truncate_chars(&e.description, budget).chars().count()
                    + 6
            })
            .sum::<usize>()
            + scene.chars().count();

        println!("scene chars   : {}", scene.chars().count());
        println!("before (chars): {before}  (~{} tokens)", before / 4);
        println!(
            "after  (chars): {}  (~{} tokens)",
            prompt.chars().count(),
            prompt.chars().count() / 4
        );
    }

    #[test]
    fn test_extract_keywords() {
        let entities = vec![ContextEntity {
            id: "1".to_string(),
            type_name: "Charakter".to_string(),
            name: "Herbert".to_string(),
            aliases: "Herbi, Bert".to_string(),
            description: "Ein Sachse in Bayern".to_string(),
        }];

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

    #[test]
    fn truncate_chars_does_not_split_multibyte() {
        // Cutting at char 3 must land after "üäö", not inside a byte sequence.
        let s = "üäöü";
        assert_eq!(truncate_chars(s, 3), "üäö...");
        // Shorter than the limit -> returned verbatim, no ellipsis.
        assert_eq!(truncate_chars(s, 99), "üäöü");
        assert_eq!(truncate_chars("", 10), "");
    }

    #[test]
    fn current_scene_is_never_truncated() {
        let long_scene = "Ä".repeat(50_000);
        let ctx = FontaineContext {
            project_title: "Test".to_string(),
            entities: vec![],
            current_scene: Some(long_scene.clone()),
            current_scene_title: Some("Szene 1".to_string()),
            relevant_scenes: vec![],
            rag_documents: vec![],
            knowledge_snippets: vec![],
            total_chars: 0,
        };

        let prompt = ctx.to_prompt_context(None);
        assert!(prompt.contains(&long_scene), "scene must be passed in full");
        assert!(!prompt.contains("[gekürzt]"));
    }
}
