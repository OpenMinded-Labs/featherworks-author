//! AI-gestützte Entity-Extraktion
//! Analysiert Manuskript-Text und extrahiert Charaktere, Orte, etc.
//!
//! 2-Pass System:
//! 1. Discovery Pass: Schnelles Scannen nach Namen (simples Listen-Format)
//! 2. Detail Pass: Validierung + JSON-Anreicherung in Batches

use serde::{Deserialize, Serialize};

/// Extrahierte Entity aus dem Text
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedEntity {
    /// Typ: "character", "location", "item", etc.
    pub entity_type: String,
    /// Name der Entity
    pub name: String,
    /// Aliase (Spitznamen, alternative Namen)
    #[serde(default)]
    pub aliases: Vec<String>,
    /// Beschreibung aus dem Text
    #[serde(default)]
    pub description: String,
    /// Kontext/Notizen aus dem Text
    #[serde(default)]
    pub notes: String,
    /// Konfidenz (0.0-1.0)
    #[serde(default = "default_confidence")]
    pub confidence: f32,
    /// Textstellen wo die Entity vorkommt
    #[serde(default)]
    pub occurrences: Vec<String>,
}

fn default_confidence() -> f32 {
    0.8
}

/// Maximale Textgröße pro Chunk (in Zeichen)
/// Kleinere Chunks für Phi-3 Mini - besser für fokussierte Extraktion
const CHUNK_SIZE: usize = 3000;
/// Überlappung zwischen Chunks um Entities an Grenzen nicht zu verpassen
const CHUNK_OVERLAP: usize = 400;

/// Teilt langen Text in überlappende Chunks
pub fn split_into_chunks(text: &str) -> Vec<String> {
    if text.len() <= CHUNK_SIZE {
        return vec![text.to_string()];
    }

    let mut chunks = Vec::new();
    let mut start = 0;

    while start < text.len() {
        // Bestimme Ende des Chunks
        let mut end = std::cmp::min(start + CHUNK_SIZE, text.len());

        // Finde gute Stelle zum Trennen (Absatz, Satz, Wort)
        if end < text.len() {
            // Suche zuerst nach Absatzende
            if let Some(para_end) = text[start..end].rfind("\n\n") {
                end = start + para_end + 2;
            } else if let Some(sent_end) = text[start..end].rfind(". ") {
                // Dann nach Satzende
                end = start + sent_end + 2;
            } else if let Some(word_end) = text[start..end].rfind(' ') {
                // Mindestens Wortgrenze
                end = start + word_end + 1;
            }
        }

        chunks.push(text[start..end].to_string());

        // Nächster Chunk mit Überlappung
        if end >= text.len() {
            break;
        }
        start = if end > CHUNK_OVERLAP {
            end - CHUNK_OVERLAP
        } else {
            end
        };
    }

    log::info!(
        "[entity_extraction] Split text ({} chars) into {} chunks",
        text.len(),
        chunks.len()
    );
    chunks
}

/// Prompt für die Entity-Extraktion eines Chunks
/// Verwendet Sandwich-Struktur (Instruktion am Anfang UND Ende) + One-Shot-Beispiel
/// LEGACY - wird durch 2-Pass System ersetzt
pub fn build_extraction_prompt(text: &str, entity_types: &[&str]) -> String {
    let types_str = entity_types.join(", ");

    // Kürze den Text für bessere LLM-Performance - kleiner für Phi-3
    const MAX_TEXT_CHARS: usize = 2500;
    let truncated_text = if text.len() > MAX_TEXT_CHARS {
        let truncate_at = text
            .char_indices()
            .take_while(|(i, _)| *i < MAX_TEXT_CHARS)
            .last()
            .map(|(i, _)| i)
            .unwrap_or(MAX_TEXT_CHARS);
        let clean_end = text[..truncate_at]
            .rfind(". ")
            .map(|p| p + 1)
            .unwrap_or(truncate_at);
        &text[..clean_end]
    } else {
        text
    };

    // Phi-3 optimiert: Kompakter Prompt, klare Struktur, strikte Filterregeln
    format!(
        r#"<|system|>
Du extrahierst benannte Entitäten aus Romantexten. Nur konkrete, benannte Dinge.
KEINE abstrakten Konzepte (Dunkelheit, Bewusstsein, Luft, Stille).
KEINE Pronomen (sie, er, es).
KEINE atmosphärischen Beschreibungen.
NUR: Personennamen, Ortsnamen, wichtige Objekte mit Namen.
<|end|>
<|user|>
Finde {types_str} in diesem Text:

{truncated_text}

Regeln:
- Nur BENANNTE Entities (echte Namen, nicht "kalter Boden")
- Pro Entity: name, entity_type, description (1 Satz aus Text)
- Charakter = Person mit Name, Ort = benannter Platz, Gegenstand = wichtiges Objekt
- Bei Unsicherheit: weglassen
JSON-Array:
<|end|>
<|assistant|>
[{{"name":""#
    )
}

// ============================================================================
// 2-Pass Entity Extraction System
// ============================================================================

/// Scan-Phase für das 2-Pass System
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ScanPhase {
    /// Charaktere/Personen finden
    Characters,
    /// Orte finden
    Locations,
    /// Gegenstände finden
    Items,
    /// Gruppierungen/Fraktionen finden
    Factions,
    /// Details sammeln und validieren
    Details,
    /// Fertig
    Done,
}

impl ScanPhase {
    /// Menschenlesbare Bezeichnung (Deutsch) - Legacy
    pub fn display_name(&self) -> &'static str {
        match self {
            ScanPhase::Characters => "Charaktere finden",
            ScanPhase::Locations => "Orte finden",
            ScanPhase::Items => "Gegenstände finden",
            ScanPhase::Factions => "Gruppierungen finden",
            ScanPhase::Details => "Details sammeln",
            ScanPhase::Done => "Fertig",
        }
    }

    /// Menschenlesbare Bezeichnung mit Sprachauswahl
    pub fn display_name_localized(&self, lang: &str) -> &'static str {
        if lang == "en" {
            match self {
                ScanPhase::Characters => "Finding characters",
                ScanPhase::Locations => "Finding locations",
                ScanPhase::Items => "Finding items",
                ScanPhase::Factions => "Finding groups",
                ScanPhase::Details => "Collecting details",
                ScanPhase::Done => "Done",
            }
        } else {
            self.display_name()
        }
    }

    /// Entity-Typ für diese Phase
    pub fn entity_type(&self) -> Option<&'static str> {
        match self {
            ScanPhase::Characters => Some("character"),
            ScanPhase::Locations => Some("location"),
            ScanPhase::Items => Some("item"),
            ScanPhase::Factions => Some("faction"),
            _ => None,
        }
    }
}

/// Entdeckte Entity aus Pass 1 (nur Name und Typ)
#[derive(Debug, Clone)]
pub struct DiscoveredEntity {
    pub name: String,
    pub entity_type: String,
}

/// Pass 1: Discovery-Prompt - Findet alle Namen einer Kategorie
/// Einfaches Listen-Format für robustes Parsing
/// `lang`: "de" für Deutsch, "en" für Englisch
pub fn build_discovery_prompt(text: &str, phase: ScanPhase, lang: &str) -> String {
    // Kürze den Text
    const MAX_TEXT_CHARS: usize = 2800;
    let truncated_text = if text.len() > MAX_TEXT_CHARS {
        let truncate_at = text
            .char_indices()
            .take_while(|(i, _)| *i < MAX_TEXT_CHARS)
            .last()
            .map(|(i, _)| i)
            .unwrap_or(MAX_TEXT_CHARS);
        let clean_end = text[..truncate_at]
            .rfind(". ")
            .map(|p| p + 1)
            .unwrap_or(truncate_at);
        &text[..clean_end]
    } else {
        text
    };

    let is_english = lang == "en";

    let (task, valid_examples, invalid_examples) = match phase {
        ScanPhase::Characters => {
            if is_english {
                (
                    "List all CHARACTER NAMES (first or last names) from the text",
                    "John, Dr. Smith, Sarah, Williams",
                    "she, he, the woman, the man, someone, a person",
                )
            } else {
                (
                    "Liste alle PERSONENNAMEN (Vor- oder Nachnamen) aus dem Text",
                    "Maria, Dr. Schmidt, Caitlin, Keane",
                    "sie, er, die Frau, der Mann, jemand, eine Person",
                )
            }
        }
        ScanPhase::Locations => {
            if is_english {
                (
                "List all LOCATIONS where scenes take place (cities, buildings, important story locations)", 
                "New York, Central Park, the cemetery, the old church, the hospital",
                "room, darkness, floor, outside, here, inside"
            )
            } else {
                (
                "Liste alle ORTE wo Szenen spielen aus dem Text (Städte, Gebäude, wichtige Handlungsorte)", 
                "Berlin, Café Luna, der Friedhof, die alte Kirche, das Krankenhaus, der Park",
                "Zimmer, Raum, Dunkelheit, Boden, draußen, hier, oben, innen"
            )
            }
        }
        ScanPhase::Items => {
            if is_english {
                (
                    "List all NAMED important objects from the text",
                    "Excalibur, the Book of Shadows, Grandfather's Ring",
                    "stone, water, air, hands, door, bed, chair",
                )
            } else {
                (
                    "Liste alle BENANNTEN wichtigen Gegenstände aus dem Text",
                    "Excalibur, das Buch der Schatten, Großvaters Ring",
                    "Stein, Wasser, Luft, Hände, Tür, Bett, Stuhl",
                )
            }
        }
        ScanPhase::Factions => {
            if is_english {
                (
                    "List all NAMED organizations or groups from the text",
                    "The Illuminati, Clan MacDonald, The Mage Guild",
                    "the people, humans, everyone, a group, they",
                )
            } else {
                (
                    "Liste alle BENANNTEN Organisationen oder Gruppen aus dem Text",
                    "Die Illuminati, Clan MacDonald, Die Gilde der Magier",
                    "die Leute, Menschen, alle, eine Gruppe, sie",
                )
            }
        }
        _ => return String::new(),
    };

    if is_english {
        format!(
            r#"<|system|>
You extract names from text. Answer ONLY with a list of names, one per line.
<|end|>
<|user|>
{task}.

VALID (examples): {valid_examples}
INVALID (examples): {invalid_examples}

TEXT:
{truncated_text}

If no matching names found: answer with NONE
Names (one per line):
<|end|>
<|assistant|>
"#
        )
    } else {
        format!(
            r#"<|system|>
Du extrahierst Namen aus Text. Antworte NUR mit einer Liste von Namen, einen pro Zeile.
<|end|>
<|user|>
{task}.

GÜLTIG (Beispiele): {valid_examples}
UNGÜLTIG (Beispiele): {invalid_examples}

TEXT:
{truncated_text}

Wenn keine passenden Namen gefunden: antworte mit KEINE
Namen (einen pro Zeile):
<|end|>
<|assistant|>
"#
        )
    }
}

/// Parse Discovery-Antwort (einfaches Listen-Format)
pub fn parse_discovery_response(response: &str, entity_type: &str) -> Vec<DiscoveredEntity> {
    let mut entities = Vec::new();

    let response = response.trim();

    // "KEINE" / "NONE" oder leere Antwort
    if response.is_empty()
        || response.to_uppercase().contains("KEINE")
        || response.to_uppercase().contains("NONE")
    {
        return entities;
    }

    // Parse Zeile für Zeile
    for line in response.lines() {
        let line = line.trim();

        // Skip leere Zeilen, Marker, Nummerierungen
        if line.is_empty()
            || line.starts_with('-') && line.len() < 3
            || line.starts_with('#')
            || line.to_uppercase() == "KEINE"
        {
            continue;
        }

        // Entferne Aufzählungszeichen und Nummerierung
        let name = line
            .trim_start_matches(|c: char| {
                c == '-' || c == '*' || c == '•' || c.is_ascii_digit() || c == '.' || c == ')'
            })
            .trim();

        // Filter zu kurze Namen oder offensichtlich ungültige
        if name.len() >= 2 && name.len() <= 100 {
            entities.push(DiscoveredEntity {
                name: name.to_string(),
                entity_type: entity_type.to_string(),
            });
        }
    }

    entities
}

/// Pass 2: Detail-Prompt - Validiert und reichert Entities an
/// Verarbeitet Batches von Entities
/// `lang`: "de" für Deutsch, "en" für Englisch
pub fn build_detail_prompt(text: &str, entities: &[DiscoveredEntity], lang: &str) -> String {
    // Kürze den Text
    const MAX_TEXT_CHARS: usize = 2000;
    let truncated_text = if text.len() > MAX_TEXT_CHARS {
        let truncate_at = text
            .char_indices()
            .take_while(|(i, _)| *i < MAX_TEXT_CHARS)
            .last()
            .map(|(i, _)| i)
            .unwrap_or(MAX_TEXT_CHARS);
        let clean_end = text[..truncate_at]
            .rfind(". ")
            .map(|p| p + 1)
            .unwrap_or(truncate_at);
        &text[..clean_end]
    } else {
        text
    };

    // Baue Entity-Liste
    let entity_list: Vec<String> = entities
        .iter()
        .enumerate()
        .map(|(i, e)| format!("{}. {} ({})", i + 1, e.name, e.entity_type))
        .collect();
    let entities_str = entity_list.join("\n");

    // Wenn keine Entities, leeres Array zurückgeben
    if entities.is_empty() {
        return String::new();
    }

    let is_english = lang == "en";

    // Kein Prefill am Ende ("[{\"name\":\"").
    //
    // Der Trick stammt aus der Completion-API, wo der Modelltext direkt an den
    // Prompt anschliesst. Ueber die Chat-API ist das Prefill Teil der
    // *Nutzer*-Nachricht: das Modell setzt es nicht fort, sondern ahmt es nach
    // und antwortet mit "Marla Keane","entity_type":... - ohne oeffnende
    // Klammer und mit Zeilenumbruechen statt Kommas. Gemessen: das Parsen
    // schlug damit jedes Mal fehl, die Detail-Phase lieferte also nie etwas,
    // und der Fallback trug leere Beschreibungen ein.
    if is_english {
        format!(
            r#"Create a JSON array for these entities.

Candidates:
{entities_str}

TEXT:
{truncated_text}

For each candidate that is a real name (person, place, object, organization),
emit one object:
{{"name":"NAME","entity_type":"character|location|item|faction","aliases":[],"description":"short"}}

Rules:
- entity_type MUST be one of: character, location, item, faction
- If a candidate is not a real name (e.g. "darkness", "pain"): omit it
- Answer with the JSON array only, no explanation"#
        )
    } else {
        format!(
            r#"Erstelle ein JSON-Array für diese Entities.

Kandidaten:
{entities_str}

TEXT:
{truncated_text}

Für jeden Kandidaten, der ein echter Name ist (Person, Ort, Gegenstand,
Organisation), geben ein Objekt aus:
{{"name":"NAME","entity_type":"character|location|item|faction","aliases":[],"description":"kurz"}}

Regeln:
- entity_type MUSS einer von: character, location, item, faction sein
- Wenn ein Kandidat kein echter Name ist (z.B. "Dunkelheit", "Schmerz"): weglassen
- Antworte nur mit dem JSON-Array, ohne Erklärung"#
        )
    }
}

/// Prompt für den Validierungs-Pass: LLM prüft ob Entities wirklich benannte Entities sind
/// `lang`: "de" für Deutsch, "en" für Englisch
pub fn build_validation_prompt(entities: &[ExtractedEntity], lang: &str) -> String {
    // Baue eine kompakte Liste der Entities
    let entity_list: Vec<String> = entities
        .iter()
        .enumerate()
        .map(|(i, e)| format!("{}. \"{}\" ({})", i + 1, e.name, e.entity_type))
        .collect();
    let entities_str = entity_list.join("\n");

    let is_english = lang == "en";

    if is_english {
        format!(
            r#"<|system|>
You check if extracted entities are real named entities from a novel.
<|end|>
<|user|>
Check this list. Which are REAL named entities (character names, place names, important objects)?

{entities_str}

Answer ONLY with the numbers of VALID entities, comma-separated.
Invalid are: abstract concepts (darkness, consciousness), pronouns (she, he), generic terms (floor, hand), atmospheric descriptions.
Example answer: 1,3,5
<|end|>
<|assistant|>
"#
        )
    } else {
        format!(
            r#"<|system|>
Du prüfst ob extrahierte Entities wirklich benannte Entities aus einem Roman sind.
<|end|>
<|user|>
Prüfe diese Liste. Welche sind ECHTE benannte Entities (Personennamen, Ortsnamen, wichtige Gegenstände)?

{entities_str}

Antworte NUR mit den Nummern der GÜLTIGEN Entities, kommagetrennt.
Ungültig sind: abstrakte Konzepte (Dunkelheit, Bewusstsein), Pronomen (sie, er), generische Begriffe (Boden, Hand), atmosphärische Beschreibungen.
Beispiel-Antwort: 1,3,5
<|end|>
<|assistant|>
"#
        )
    }
}

/// Parse die Validierungs-Antwort und gib die gültigen Indizes zurück
pub fn parse_validation_response(response: &str, total_count: usize) -> Vec<usize> {
    let mut valid_indices = Vec::new();

    // Extrahiere Zahlen aus der Antwort
    for part in response.split(|c: char| !c.is_ascii_digit()) {
        if let Ok(num) = part.trim().parse::<usize>() {
            // 1-basiert zu 0-basiert, und Bounds-Check
            if num >= 1 && num <= total_count {
                valid_indices.push(num - 1);
            }
        }
    }

    // Falls LLM keine gültigen Nummern zurückgibt, behalte alle (Fallback)
    if valid_indices.is_empty() && total_count > 0 {
        log::warn!(
            "[entity_validation] No valid indices parsed from response, keeping all entities"
        );
        return (0..total_count).collect();
    }

    valid_indices
}

/// Filtere Entities basierend auf Validierungs-Indizes
pub fn filter_by_validation(
    entities: Vec<ExtractedEntity>,
    valid_indices: &[usize],
) -> Vec<ExtractedEntity> {
    entities
        .into_iter()
        .enumerate()
        .filter(|(i, _)| valid_indices.contains(i))
        .map(|(_, e)| e)
        .collect()
}

/// Merge entities from multiple chunks, removing duplicates
/// Erkennt auch Teilnamen wie "Caitlin" und "Caitlin Keane" als dieselbe Entity
pub fn merge_entities(all_entities: Vec<Vec<ExtractedEntity>>) -> Vec<ExtractedEntity> {
    use std::collections::HashMap;

    let mut merged: HashMap<String, ExtractedEntity> = HashMap::new();

    log::info!(
        "[entity_merge] Starting merge of {} entity batches",
        all_entities.len()
    );

    for entities in all_entities {
        for entity in entities {
            let entity_type_lower = entity.entity_type.to_lowercase();
            let name_lower = entity.name.to_lowercase().trim().to_string();
            let key = format!("{}:{}", entity_type_lower, name_lower);

            log::debug!(
                "[entity_merge] Processing: '{}' ({})",
                entity.name,
                entity_type_lower
            );

            // Suche nach existierender Entity die ein Substring-Match ist
            // z.B. "Caitlin" matched "Caitlin Keane" oder umgekehrt
            let mut found_match: Option<String> = None;

            if entity_type_lower == "character" {
                log::info!(
                    "[entity_merge] Character '{}': checking against {} existing entities",
                    entity.name,
                    merged.len()
                );

                for (existing_key, existing) in merged.iter() {
                    if !existing_key.starts_with("character:") {
                        continue;
                    }
                    let existing_name_lower = existing.name.to_lowercase();

                    log::debug!(
                        "[entity_merge] Comparing '{}' vs '{}'",
                        name_lower,
                        existing_name_lower
                    );

                    // Prüfe ob einer ein Substring des anderen ist
                    // Aber nur für echte Namen (>2 Zeichen), nicht für generische Wörter
                    if name_lower.len() > 2 && existing_name_lower.len() > 2 {
                        // "Caitlin" ist in "Caitlin Keane" enthalten
                        // oder "Caitlin Keane" enthält "Caitlin"
                        let substring_match = existing_name_lower.contains(&name_lower)
                            || name_lower.contains(&existing_name_lower);

                        if substring_match {
                            log::info!(
                                "[entity_merge] MATCH: '{}' matches existing '{}' (substring)",
                                entity.name,
                                existing.name
                            );
                            found_match = Some(existing_key.clone());
                            break;
                        }

                        // Prüfe auch auf Namens-Teile (Vorname/Nachname Match)
                        let name_parts: Vec<&str> = name_lower.split_whitespace().collect();
                        let existing_parts: Vec<&str> =
                            existing_name_lower.split_whitespace().collect();

                        // Wenn ein Teil des Namens im anderen vorkommt (mind. 3 Zeichen)
                        for part in &name_parts {
                            if part.len() >= 3 && existing_parts.iter().any(|ep| *ep == *part) {
                                log::info!(
                                    "[entity_merge] MATCH: '{}' matches existing '{}' (part '{}')",
                                    entity.name,
                                    existing.name,
                                    part
                                );
                                found_match = Some(existing_key.clone());
                                break;
                            }
                        }
                        if found_match.is_some() {
                            break;
                        }
                    }
                }
            }

            let merge_key = found_match.unwrap_or(key);

            if let Some(existing) = merged.get_mut(&merge_key) {
                // Merge: längerer Name gewinnt (hat mehr Info)
                if entity.name.len() > existing.name.len() {
                    // Alter Name wird zu Alias
                    if !existing.aliases.contains(&existing.name) && existing.name != entity.name {
                        existing.aliases.push(existing.name.clone());
                    }
                    existing.name = entity.name.clone();
                } else if entity.name != existing.name && !existing.aliases.contains(&entity.name) {
                    // Neuer kürzerer Name wird zu Alias
                    existing.aliases.push(entity.name.clone());
                }

                // Höhere Konfidenz gewinnt
                if entity.confidence > existing.confidence {
                    existing.confidence = entity.confidence;
                }
                // Längere Beschreibung gewinnt
                if entity.description.len() > existing.description.len() {
                    existing.description = entity.description.clone();
                }
                // Aliase zusammenführen
                for alias in &entity.aliases {
                    if !existing.aliases.contains(alias) && *alias != existing.name {
                        existing.aliases.push(alias.clone());
                    }
                }
                // Occurrences zusammenführen
                for occ in &entity.occurrences {
                    if !existing.occurrences.contains(occ) {
                        existing.occurrences.push(occ.clone());
                    }
                }

                log::debug!(
                    "[entity_merge] Merged '{}' into '{}' (aliases: {:?})",
                    entity.name,
                    existing.name,
                    existing.aliases
                );
            } else {
                merged.insert(merge_key, entity);
            }
        }
    }

    // === ZWEITER PASS: Konsolidierung ===
    // Nachdem alle Entities eingefügt wurden, prüfe ob kürzere Namen
    // mit längeren zusammengeführt werden können
    // z.B. "Caitlin" sollte zu "Caitlin Keane" gemerged werden
    let keys: Vec<String> = merged.keys().cloned().collect();
    let mut keys_to_remove: Vec<String> = Vec::new();

    for key1 in &keys {
        if keys_to_remove.contains(key1) {
            continue;
        }
        if !key1.starts_with("character:") {
            continue;
        }

        let entity1 = match merged.get(key1) {
            Some(e) => e.clone(),
            None => continue,
        };
        let name1_lower = entity1.name.to_lowercase();

        for key2 in &keys {
            if key1 == key2 {
                continue;
            }
            if keys_to_remove.contains(key2) {
                continue;
            }
            if !key2.starts_with("character:") {
                continue;
            }

            let entity2 = match merged.get(key2) {
                Some(e) => e,
                None => continue,
            };
            let name2_lower = entity2.name.to_lowercase();

            // Prüfe ob einer ein Teil des anderen ist
            let should_merge = if name1_lower.len() != name2_lower.len() {
                // Substring-Match
                name1_lower.contains(&name2_lower) || name2_lower.contains(&name1_lower)
            } else {
                false
            };

            if should_merge {
                // Längerer Name gewinnt
                let (winner_key, loser_key, loser_name) = if entity1.name.len() > entity2.name.len()
                {
                    (key1.clone(), key2.clone(), entity2.name.clone())
                } else {
                    (key2.clone(), key1.clone(), entity1.name.clone())
                };

                log::info!(
                    "[entity_merge] CONSOLIDATE: '{}' merging into winner key",
                    loser_name
                );

                // Füge den kürzeren Namen als Alias hinzu
                if let Some(winner) = merged.get_mut(&winner_key) {
                    if !winner.aliases.contains(&loser_name) && winner.name != loser_name {
                        winner.aliases.push(loser_name.clone());
                    }
                }

                keys_to_remove.push(loser_key);
            }
        }
    }

    // Entferne die konsolidierten Keys
    for key in keys_to_remove {
        merged.remove(&key);
    }

    let mut result: Vec<ExtractedEntity> = merged.into_values().collect();
    // Sortiere nach Konfidenz (höchste zuerst)
    result.sort_by(|a, b| {
        b.confidence
            .partial_cmp(&a.confidence)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    result
}

/// Parse die JSON-Antwort vom LLM
pub fn parse_extraction_response(response: &str) -> Result<Vec<ExtractedEntity>, String> {
    // If the LLM returned an explicit error marker, forward it as-is
    if response.contains("[LLM_ERROR") {
        return Err(response.trim().to_string());
    }

    // Strip common code fences / noise
    let response = response.trim();
    // Remove markdown code fences
    let response = response
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    // Handle empty responses
    if response.is_empty() || response == "]" {
        return Ok(vec![]);
    }

    // Prompt ends with `["` - prepend that if response doesn't start with bracket
    let response = if response.starts_with('[') {
        response.to_string()
    } else if response.starts_with('{') {
        // LLM started directly with object - wrap in array
        format!("[{}]", response)
    } else {
        // LLM continues from `["` prefix - likely started with object directly
        format!("[{}", response)
    };
    let response = response.as_str();

    // Empty array is valid
    if response == "[]"
        || response == "["
        || response == "[{"
        || response == r#"[{"name":""#
        || response == "[{}"
    {
        return Ok(vec![]);
    }

    // Finde JSON Array in der Antwort
    let has_bracket = response.find('[');
    let first_brace = response.find('{');

    // If LLM returned objects without outer brackets, wrap them
    let json_str: String = if has_bracket.is_none() && first_brace.is_some() {
        // No [ but has { - LLM returned individual objects
        format!("[{}]", response)
    } else if let Some(json_start) = has_bracket {
        // Try to find closing bracket, if not found try to fix truncated JSON
        let json_end = match response.rfind(']') {
            Some(pos) => pos,
            None => {
                // No closing bracket - try to close it
                let fixed = format!("{}]", response);
                return parse_extraction_response_inner(&fixed);
            }
        };
        if json_end <= json_start {
            return Err("Ungültiges JSON Format".to_string());
        }
        response[json_start..=json_end].to_string()
    } else {
        return Err("Kein JSON gefunden".to_string());
    };

    parse_extraction_response_inner(&json_str)
}

fn parse_extraction_response_inner(json_str: &str) -> Result<Vec<ExtractedEntity>, String> {
    // Try to parse - if it fails, try cleaning up common issues
    let entities = match serde_json::from_str::<Vec<ExtractedEntity>>(&json_str) {
        Ok(entities) => entities,
        Err(e) => {
            // Try removing trailing commas (common LLM mistake)
            let cleaned = json_str
                .replace(",]", "]")
                .replace(",\n]", "\n]")
                .replace(", ]", "]");

            match serde_json::from_str::<Vec<ExtractedEntity>>(&cleaned) {
                Ok(entities) => entities,
                Err(_) => {
                    // Fallback: extract individual valid JSON objects
                    let mut entities = Vec::new();
                    let mut depth = 0;
                    let mut obj_start = None;

                    for (i, ch) in json_str.char_indices() {
                        match ch {
                            '{' => {
                                if depth == 0 {
                                    obj_start = Some(i);
                                }
                                depth += 1;
                            }
                            '}' => {
                                depth -= 1;
                                if depth == 0 {
                                    if let Some(start) = obj_start {
                                        let obj_str = &json_str[start..=i];
                                        if let Ok(entity) =
                                            serde_json::from_str::<ExtractedEntity>(obj_str)
                                        {
                                            entities.push(entity);
                                        }
                                    }
                                    obj_start = None;
                                }
                            }
                            _ => {}
                        }
                    }

                    if entities.is_empty() {
                        return Err(format!("JSON Parse Error: {}", e));
                    }
                    entities
                }
            }
        }
    };

    // Post-processing: Nur Basis-Filter (leere Namen, zu kurz)
    // Die eigentliche Validierung erfolgt im zweiten LLM-Pass
    let filtered = basic_entity_filter(entities);
    Ok(filtered)
}

/// Korrigiert ungültige entity_types zum nächstliegenden gültigen Typ
fn normalize_entity_type(entity_type: &str) -> Option<String> {
    let valid_types = ["character", "location", "item", "faction"];
    let type_lower = entity_type.to_lowercase();

    // Exakter Match
    if valid_types.contains(&type_lower.as_str()) {
        return Some(type_lower);
    }

    // Mapping von häufigen LLM-Fehlern zu korrekten Typen
    let type_mapping: &[(&str, &str)] = &[
        // Character-ähnliche
        ("person", "character"),
        ("charakter", "character"),
        ("protagonist", "character"),
        ("antagonist", "character"),
        ("figur", "character"),
        ("figure", "character"),
        ("human", "character"),
        ("mensch", "character"),
        ("creature", "character"),
        ("being", "character"),
        ("npc", "character"),
        // Location-ähnliche
        ("place", "location"),
        ("ort", "location"),
        ("setting", "location"),
        ("gebäude", "location"),
        ("building", "location"),
        ("room", "location"),
        ("raum", "location"),
        ("stadt", "location"),
        ("city", "location"),
        ("land", "location"),
        ("country", "location"),
        ("region", "location"),
        ("world", "location"),
        ("welt", "location"),
        // Item-ähnliche
        ("object", "item"),
        ("objekt", "item"),
        ("gegenstand", "item"),
        ("thing", "item"),
        ("weapon", "item"),
        ("waffe", "item"),
        ("tool", "item"),
        ("artifact", "item"),
        ("artefakt", "item"),
        // Faction-ähnliche
        ("group", "faction"),
        ("gruppe", "faction"),
        ("organization", "faction"),
        ("organisation", "faction"),
        ("guild", "faction"),
        ("gilde", "faction"),
        ("clan", "faction"),
        ("order", "faction"),
        ("orden", "faction"),
        ("tribe", "faction"),
        ("stamm", "faction"),
        ("company", "faction"),
        ("firma", "faction"),
        ("army", "faction"),
        ("armee", "faction"),
        ("team", "faction"),
    ];

    for (pattern, target) in type_mapping {
        if type_lower.contains(pattern) {
            log::debug!(
                "[entity_type_normalize] Mapped '{}' -> '{}'",
                entity_type,
                target
            );
            return Some(target.to_string());
        }
    }

    // Ungültige Typen wie "atmospheres", "concept", "abstract" etc. → filtern
    log::warn!(
        "[entity_type_normalize] Invalid entity_type '{}' - filtering out",
        entity_type
    );
    None
}

/// Basis-Filter: Entfernt nur grammatikalisch offensichtlich ungültige Entities
/// Die semantische Validierung (ist es Story-relevant?) erfolgt durch das LLM
fn basic_entity_filter(entities: Vec<ExtractedEntity>) -> Vec<ExtractedEntity> {
    entities
        .into_iter()
        .filter_map(|mut e| {
            // ZUERST: entity_type validieren/korrigieren
            match normalize_entity_type(&e.entity_type) {
                Some(normalized_type) => {
                    if normalized_type != e.entity_type.to_lowercase() {
                        log::debug!(
                            "[entity_filter] Normalized entity_type '{}' -> '{}' for '{}'",
                            e.entity_type,
                            normalized_type,
                            e.name
                        );
                    }
                    e.entity_type = normalized_type;
                }
                None => {
                    log::debug!(
                        "[entity_filter] Filtered '{}': invalid entity_type '{}'",
                        e.name,
                        e.entity_type
                    );
                    return None;
                }
            }

            let name_trimmed = e.name.trim();
            let name_lower = name_trimmed.to_lowercase();

            // Filter empty or too short names
            if name_trimmed.len() < 2 {
                log::debug!("[entity_filter] Filtered '{}': too short", e.name);
                return None;
            }

            // Filter names that are ONLY articles
            let articles = ["das", "der", "die", "ein", "eine", "the", "a", "an"];
            if articles.contains(&name_lower.as_str()) {
                log::debug!("[entity_filter] Filtered '{}': article only", e.name);
                return None;
            }

            // Filter pure pronouns
            let pronouns = [
                "sie", "er", "es", "ich", "wir", "ihr", "du", "ihm", "ihn", "ihnen", "mir", "mich",
                "uns", "euch", "dir", "dich", "sich", "mein", "dein", "sein", "unser", "euer",
                "he", "she", "it", "they", "we", "you", "i", "me", "him", "her", "them", "us",
                "man", "jemand", "niemand", "etwas", "nichts", "alles",
            ];
            if pronouns.contains(&name_lower.as_str()) {
                log::debug!("[entity_filter] Filtered '{}': pronoun", e.name);
                return None;
            }

            // Filter "Gruppe der/derjenigen die..." - klar erfundene LLM-Muster
            if name_lower.starts_with("gruppe der")
                || name_lower.starts_with("gruppe von")
                || name_lower.contains("derjenigen")
            {
                log::debug!(
                    "[entity_filter] Filtered '{}': invented faction pattern",
                    e.name
                );
                return None;
            }

            // Filter "Die Gilde der..." Muster - erfundene Fraktionen
            if name_lower.starts_with("die gilde")
                || name_lower.starts_with("gilde der")
                || name_lower.starts_with("der orden")
                || name_lower.starts_with("orden der")
            {
                log::debug!(
                    "[entity_filter] Filtered '{}': invented guild/order pattern",
                    e.name
                );
                return None;
            }

            // Filter generische Wörter (auch als Einzelwort oder in Komposita)
            // Diese sind niemals story-relevante Entities
            let generic_words = [
                // Körperteile
                "hand",
                "hände",
                "kopf",
                "auge",
                "augen",
                "bein",
                "beine",
                "arm",
                "arme",
                "finger",
                "fuß",
                "füße",
                "haar",
                "haare",
                "herz",
                "körper",
                "gesicht",
                // Elemente/Natur
                "luft",
                "wasser",
                "feuer",
                "erde",
                "wind",
                "regen",
                "schnee",
                "sonne",
                "mond",
                "air",
                "water",
                "fire",
                "earth",
                "rain",
                "snow",
                "sun",
                "moon",
                // Abstrakte Konzepte
                "dunkelheit",
                "licht",
                "schatten",
                "stille",
                "zeit",
                "raum",
                "liebe",
                "hass",
                "angst",
                "furcht",
                "schmerz",
                "freude",
                "hoffnung",
                "verzweiflung",
                "darkness",
                "light",
                "shadow",
                "silence",
                "time",
                "space",
                "love",
                "hate",
                "fear",
                "pain",
                "joy",
                "hope",
                "despair",
                // Generische Objekte
                "stein",
                "steine",
                "grabstein",
                "grabsteine",
                "holz",
                "metall",
                "glas",
                "papier",
                "buch",
                "brief",
                "stone",
                "stones",
                "wood",
                "metal",
                "glass",
                "paper",
                "book",
                "letter",
                // Generische Orte (ohne Eigenname)
                "haus",
                "zimmer",
                "raum",
                "straße",
                "weg",
                "pfad",
                "wald",
                "berg",
                "tal",
                "fluss",
                "house",
                "room",
                "street",
                "way",
                "path",
                "forest",
                "mountain",
                "valley",
                "river",
                // Sonstige generische
                "kreuz",
                "kreuze",
                "holzkreuz",
            ];

            // Exakter Match
            if generic_words.contains(&name_lower.as_str()) {
                log::debug!("[entity_filter] Filtered '{}': generic word", e.name);
                return None;
            }

            // Auch filtern wenn das Wort Teil eines generischen Kompositums ist
            // z.B. "Grabsteine" enthält "stein"
            for generic in &generic_words {
                if generic.len() >= 4 && name_lower == *generic {
                    log::debug!(
                        "[entity_filter] Filtered '{}': matches generic '{}'",
                        e.name,
                        generic
                    );
                    return None;
                }
            }

            // Filter wenn der Name NUR aus Artikel + einem generischen Wort besteht
            // z.B. "Der Boden", "Die Luft" - aber "Die Illuminati" ist OK
            let generic_after_article = [
                "boden", "luft", "himmel", "wand", "decke", "tür", "fenster", "mann", "frau",
                "kind", "leute", "menschen",
            ];
            for article in &["der ", "die ", "das ", "the "] {
                if name_lower.starts_with(article) {
                    let rest = &name_lower[article.len()..];
                    if generic_after_article.contains(&rest) {
                        log::debug!(
                            "[entity_filter] Filtered '{}': article + generic noun",
                            e.name
                        );
                        return None;
                    }
                }
            }

            // Filter Namen die zu lang sind (wahrscheinlich Beschreibungen statt Namen)
            // "Ein Friedhof, verwildert, vergessen" ist keine Entity, sondern eine Beschreibung
            if name_trimmed.len() > 50 {
                log::debug!(
                    "[entity_filter] Filtered '{}': name too long (description?)",
                    e.name
                );
                return None;
            }

            // Filter Namen die mit "Ein/Eine" beginnen (Beschreibungen)
            if name_lower.starts_with("ein ")
                || name_lower.starts_with("eine ")
                || name_lower.starts_with("a ")
                || name_lower.starts_with("an ")
            {
                log::debug!(
                    "[entity_filter] Filtered '{}': starts with indefinite article (description?)",
                    e.name
                );
                return None;
            }

            // Filter Namen mit Kommas (mehrere Beschreibungen zusammen)
            if name_trimmed.contains(',') && !name_trimmed.contains('"') {
                log::debug!(
                    "[entity_filter] Filtered '{}': contains comma (list/description?)",
                    e.name
                );
                return None;
            }

            // Filter "Großvaters/Vaters/Mutters X" Pattern - generische Verwandtschafts-Objekte
            // AUSSER wenn es ein bekannter Eigenname ist
            if name_lower.starts_with("großvaters ")
                || name_lower.starts_with("großmutters ")
                || name_lower.starts_with("vaters ")
                || name_lower.starts_with("mutters ")
                || name_lower.starts_with("grandfather's ")
                || name_lower.starts_with("grandmother's ")
                || name_lower.starts_with("father's ")
                || name_lower.starts_with("mother's ")
            {
                // Nur filtern wenn es ein generisches Objekt ist, nicht wenn es ein Eigenname sein könnte
                let after_possessive: &str = name_lower
                    .split_whitespace()
                    .skip(1)
                    .collect::<Vec<_>>()
                    .join(" ")
                    .leak();
                let generic_possessions = [
                    "ring", "haus", "house", "buch", "book", "schwert", "sword", "uhr", "watch",
                    "kette", "necklace", "tasche", "bag", "brief", "letter",
                ];
                if generic_possessions
                    .iter()
                    .any(|g| after_possessive.contains(g))
                {
                    log::debug!(
                        "[entity_filter] Filtered '{}': possessive + generic object",
                        e.name
                    );
                    return None;
                }
            }

            Some(e)
        })
        .collect()
}

/// Validiert Entities gegen den Originaltext
/// Entfernt halluzinierte Entities, die nicht im Text vorkommen
/// UND filtert generische/nicht-story-relevante Wörter
pub fn validate_entities_against_text(
    entities: Vec<ExtractedEntity>,
    original_text: &str,
) -> Vec<ExtractedEntity> {
    let text_lower = original_text.to_lowercase();

    // === SCHEMA-ARTEFAKTE: Feldnamen und Typwerte, die das LLM manchmal als
    // Entity ausgibt, statt sie als Struktur zu verwenden ===
    //
    // Hier stand frueher zusaetzlich eine Liste der Beispielnamen aus unseren
    // Prompts ("maria", "john", "sarah", "berlin", "excalibur", ...), die
    // bedingungslos geloescht wurden - ohne je in den Text zu schauen. Damit
    // war eine Figur namens Maria oder eine Stadt namens Berlin nicht
    // auffindbar, egal wie oft sie im Manuskript stand.
    //
    // Die Liste war ausserdem ueberfluessig: gegen abgeschriebene Beispiele
    // schuetzt bereits Filter 3, der jeden Namen im Originaltext nachschlaegt.
    // Ein Beispiel, das nicht im Manuskript steht, faellt dort ohnehin raus.
    // Uebrig bleiben nur die Schema-Woerter, denn "description" kann in einem
    // deutschen Text durchaus vorkommen und waere dann faelschlich eine Figur.
    let schema_artifacts: std::collections::HashSet<&str> = [
        "name",
        "entity_type",
        "aliases",
        "description",
        "notes",
        "confidence",
        "occurrences",
        "character",
        "location",
        "item",
        "faction",
    ]
    .iter()
    .cloned()
    .collect();

    // Generische Wörter die niemals Eigennamen sein können
    // Diese werden auch gefiltert wenn sie im Text vorkommen
    let generic_words: std::collections::HashSet<&str> = [
        // Körperteile
        "hand",
        "hände",
        "kopf",
        "köpfe",
        "auge",
        "augen",
        "bein",
        "beine",
        "arm",
        "arme",
        "finger",
        "fuß",
        "füße",
        "haar",
        "haare",
        "herz",
        "herzen",
        "körper",
        "gesicht",
        "gesichter",
        "hands",
        "head",
        "heads",
        "eye",
        "eyes",
        "leg",
        "legs",
        "arm",
        "arms",
        "body",
        "bodies",
        "face",
        "faces",
        // Elemente/Natur
        "luft",
        "wasser",
        "feuer",
        "erde",
        "wind",
        "regen",
        "schnee",
        "sonne",
        "mond",
        "himmel",
        "air",
        "water",
        "fire",
        "earth",
        "rain",
        "snow",
        "sun",
        "moon",
        "sky",
        // Abstrakte Konzepte
        "dunkelheit",
        "licht",
        "schatten",
        "stille",
        "zeit",
        "raum",
        "liebe",
        "hass",
        "angst",
        "furcht",
        "schmerz",
        "freude",
        "hoffnung",
        "verzweiflung",
        "mut",
        "kraft",
        "darkness",
        "light",
        "shadow",
        "silence",
        "time",
        "space",
        "love",
        "hate",
        "fear",
        "pain",
        "joy",
        "hope",
        "despair",
        "courage",
        "power",
        // Generische Objekte
        "stein",
        "steine",
        "grabstein",
        "grabsteine",
        "holz",
        "metall",
        "glas",
        "papier",
        "buch",
        "brief",
        "tisch",
        "stuhl",
        "tür",
        "türen",
        "fenster",
        "wand",
        "wände",
        "boden",
        "decke",
        "stone",
        "stones",
        "wood",
        "metal",
        "glass",
        "paper",
        "book",
        "letter",
        "books",
        "letters",
        "table",
        "chair",
        "door",
        "doors",
        "window",
        "windows",
        "wall",
        "walls",
        "floor",
        "ceiling",
        // Generische Orte (ohne Eigenname)
        "haus",
        "häuser",
        "zimmer",
        "raum",
        "räume",
        "straße",
        "straßen",
        "weg",
        "wege",
        "pfad",
        "wald",
        "wälder",
        "berg",
        "berge",
        "tal",
        "täler",
        "fluss",
        "flüsse",
        "see",
        "seen",
        "house",
        "houses",
        "room",
        "rooms",
        "street",
        "streets",
        "path",
        "paths",
        "forest",
        "forests",
        "mountain",
        "mountains",
        "valley",
        "valleys",
        "river",
        "rivers",
        "lake",
        "lakes",
        // Sonstige generische
        "kreuz",
        "kreuze",
        "holzkreuz",
        "kerze",
        "kerzen",
        "lampe",
        "lampen",
        "cross",
        "crosses",
        "candle",
        "candles",
        "lamp",
        "lamps",
        // Generische Personenbezeichnungen
        "mann",
        "männer",
        "frau",
        "frauen",
        "kind",
        "kinder",
        "leute",
        "menschen",
        "person",
        "personen",
        "man",
        "men",
        "woman",
        "women",
        "child",
        "children",
        "people",
        "person",
        "persons",
        // Kleidung/Alltägliches
        "kleid",
        "kleider",
        "mantel",
        "mäntel",
        "hut",
        "hüte",
        "schuh",
        "schuhe",
        "dress",
        "dresses",
        "coat",
        "coats",
        "hat",
        "hats",
        "shoe",
        "shoes",
    ]
    .iter()
    .cloned()
    .collect();

    entities
        .into_iter()
        .filter(|e| {
            let name_trimmed = e.name.trim();
            let name_lower = name_trimmed.to_lowercase();

            // === FILTER 0: Prompt-Beispiele (vom LLM kopiert) ===
            if schema_artifacts.contains(name_lower.as_str()) {
                log::info!(
                    "[entity_filter] Filtered '{}': JSON schema word, not an entity name",
                    e.name
                );
                return false;
            }

            // === FILTER 1: Generische Wörter (exakter Match) ===
            if generic_words.contains(name_lower.as_str()) {
                log::info!(
                    "[entity_filter] Filtered '{}': generic word (not a proper noun)",
                    e.name
                );
                return false;
            }

            // === FILTER 2: Artikel + generisches Wort (z.B. "Der Stein", "Die Luft") ===
            let articles = ["der ", "die ", "das ", "ein ", "eine ", "the ", "a ", "an "];
            for article in &articles {
                if name_lower.starts_with(article) {
                    let rest = &name_lower[article.len()..];
                    if generic_words.contains(rest) {
                        log::info!(
                            "[entity_filter] Filtered '{}': article + generic word",
                            e.name
                        );
                        return false;
                    }
                }
            }

            // === FILTER 3: Text-Validierung (Halluzinations-Prüfung) ===
            let name_parts: Vec<&str> = name_trimmed.split_whitespace().collect();

            let found = if name_parts.len() > 1 {
                // Mehrteiliger Name: ALLE signifikanten Teile müssen vorkommen
                let significant_parts: Vec<_> = name_parts
                    .iter()
                    .filter(|p| {
                        p.len() >= 4 && !articles.iter().any(|a| a.trim() == p.to_lowercase())
                    })
                    .collect();

                if significant_parts.is_empty() {
                    text_lower.contains(&name_lower)
                } else {
                    significant_parts.iter().all(|part| {
                        let part_lower = part.to_lowercase();
                        let pattern = format!(r"\b{}\b", regex::escape(&part_lower));
                        if let Ok(re) = regex::Regex::new(&pattern) {
                            re.is_match(&text_lower)
                        } else {
                            text_lower.contains(&part_lower)
                        }
                    })
                }
            } else {
                let pattern = format!(r"\b{}\b", regex::escape(&name_lower));
                if let Ok(re) = regex::Regex::new(&pattern) {
                    re.is_match(&text_lower)
                } else {
                    text_lower.contains(&name_lower)
                }
            };

            if !found {
                log::info!(
                    "[entity_filter] Filtered '{}': not found in original text (hallucination)",
                    e.name
                );
                return false;
            }

            true
        })
        .collect()
}

/// Extrahiert Spitznamen aus dem Text und fügt sie zu passenden Charakteren hinzu
/// Erkennt Muster wie: "Caitlin 'Caite' Keane" oder "Caitlin „Caite" Keane"
/// Das Spitzname wird dann als Alias zum passenden Charakter hinzugefügt
pub fn extract_nicknames_from_text(
    mut entities: Vec<ExtractedEntity>,
    original_text: &str,
) -> Vec<ExtractedEntity> {
    // Regex für Spitznamen in verschiedenen Anführungszeichen-Formaten
    // Matches: Name 'Nickname' Name, Name "Nickname" Name, Name „Nickname" Name, Name ‚Nickname' Name
    // Verwende Unicode-Escapes für deutsche Anführungszeichen
    let nickname_patterns = [
        // Englische einfache Anführungszeichen
        r"(\w+)\s+'([^']+)'\s+(\w+)",
        // Englische doppelte Anführungszeichen
        r#"(\w+)\s+"([^"]+)"\s+(\w+)"#,
        // Deutsche Anführungszeichen: „ = U+201E, " = U+201C
        r"(\w+)\s+\u{201E}([^\u{201C}]+)\u{201C}\s+(\w+)",
        // Deutsche einfache Anführungszeichen: ‚ = U+201A, ' = U+2019
        r"(\w+)\s+\u{201A}([^\u{2019}]+)\u{2019}\s+(\w+)",
    ];

    for pattern in &nickname_patterns {
        if let Ok(re) = regex::Regex::new(pattern) {
            for caps in re.captures_iter(original_text) {
                if let (Some(first_name), Some(nickname), Some(last_name)) =
                    (caps.get(1), caps.get(2), caps.get(3))
                {
                    let first = first_name.as_str();
                    let nick = nickname.as_str().trim();
                    let last = last_name.as_str();

                    // Ignoriere zu kurze oder zu lange "Nicknames"
                    if nick.len() < 2 || nick.len() > 20 || nick.contains(' ') {
                        continue;
                    }

                    log::info!(
                        "[nickname_extract] Found potential nickname: {} '{}' {}",
                        first,
                        nick,
                        last
                    );

                    // Suche passenden Charakter
                    for entity in entities.iter_mut() {
                        if entity.entity_type != "character" {
                            continue;
                        }

                        let entity_name_lower = entity.name.to_lowercase();
                        let first_lower = first.to_lowercase();
                        let last_lower = last.to_lowercase();

                        // Match wenn:
                        // 1. Entity-Name enthält den Vornamen ODER Nachnamen
                        // 2. ODER Entity-Name ist der vollständige Name
                        let full_name = format!("{} {}", first, last).to_lowercase();
                        let matches = entity_name_lower.contains(&first_lower)
                            || entity_name_lower.contains(&last_lower)
                            || entity_name_lower == full_name
                            || full_name.contains(&entity_name_lower);

                        if matches {
                            // Füge Spitzname als Alias hinzu (wenn nicht schon vorhanden)
                            let nick_lower = nick.to_lowercase();
                            if !entity
                                .aliases
                                .iter()
                                .any(|a| a.to_lowercase() == nick_lower)
                                && entity.name.to_lowercase() != nick_lower
                            {
                                log::info!(
                                    "[nickname_extract] Adding '{}' as alias to '{}'",
                                    nick,
                                    entity.name
                                );
                                entity.aliases.push(nick.to_string());

                                // Füge auch Vorname und Nachname als Aliase hinzu wenn noch nicht vorhanden
                                if !entity
                                    .aliases
                                    .iter()
                                    .any(|a| a.to_lowercase() == first_lower)
                                    && entity.name.to_lowercase() != first_lower
                                    && first_lower.len() >= 3
                                {
                                    entity.aliases.push(first.to_string());
                                }
                                if !entity
                                    .aliases
                                    .iter()
                                    .any(|a| a.to_lowercase() == last_lower)
                                    && entity.name.to_lowercase() != last_lower
                                    && last_lower.len() >= 3
                                {
                                    entity.aliases.push(last.to_string());
                                }
                            }
                            break;
                        }
                    }
                }
            }
        }
    }

    entities
}

/// Lektorat-Anmerkung
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LektoratNote {
    /// Zeilennummer (1-basiert)
    pub line: usize,
    /// Art: "style", "grammar", "spelling", "suggestion", "repetition", "clarity"
    #[serde(rename = "type")]
    pub note_type: String,
    /// Schweregrad: "error", "warning", "info"
    pub severity: String,
    /// Kurze Beschreibung
    pub message: String,
    /// Vorschlag zur Verbesserung (optional)
    pub suggestion: Option<String>,
}

/// Prompt für Lektorat-Analyse - STRIKT JSON-ONLY
/// Verwendet Sandwich-Struktur + One-Shot für maximale Format-Treue
/// `lang`: "de" für Deutsch, "en" für Englisch
/// `include_grammar`: wenn true, wird auch Grammatik geprüft
pub fn build_lektorat_prompt(text: &str, lang: &str, include_grammar: bool) -> String {
    // Text kürzen für bessere LLM-Performance
    const MAX_TEXT_CHARS: usize = 5000;
    let truncated_text = if text.len() > MAX_TEXT_CHARS {
        let truncate_at = text
            .char_indices()
            .take_while(|(i, _)| *i < MAX_TEXT_CHARS)
            .last()
            .map(|(i, _)| i)
            .unwrap_or(MAX_TEXT_CHARS);
        let clean_end = text[..truncate_at].rfind('\n').unwrap_or(truncate_at);
        &text[..clean_end]
    } else {
        text
    };

    // Zeilennummern für den Text berechnen
    let numbered_lines: String = truncated_text
        .lines()
        .enumerate()
        .take(100) // Max 100 Zeilen für bessere Performance
        .map(|(i, line)| format!("{}: {}", i + 1, line))
        .collect::<Vec<_>>()
        .join("\n");

    let is_english = lang == "en";

    // Prüfkategorien je nach include_grammar
    let (check_categories_de, check_categories_en, example_type) = if include_grammar {
        (
            "Stilprobleme (Passiv, schwache Verben, Wiederholungen, lange Sätze) UND Grammatikfehler (Kasus, Konjugation, Satzbau)",
            "style issues (passive voice, weak verbs, repetitions, long sentences) AND grammar errors (case, conjugation, sentence structure)",
            if is_english { "grammar" } else { "grammar" }
        )
    } else {
        (
            "Stilprobleme (Passiv, schwache Verben, Wiederholungen, lange Sätze)",
            "style issues (passive voice, weak verbs, repetitions, long sentences)",
            "style",
        )
    };

    // Phi-3 Chat-Format mit Sandwich + One-Shot für maximale Format-Treue
    if is_english {
        let grammar_example = if include_grammar {
            r#"EXAMPLE 1 (style):
Text: "1: The man was being walked."
Answer: [{"line":1,"type":"style","severity":"warning","message":"Passive construction","suggestion":"The man walked."}]

EXAMPLE 2 (grammar):
Text: "1: He don't know nothing."
Answer: [{"line":1,"type":"grammar","severity":"error","message":"Double negative and wrong verb form","suggestion":"He doesn't know anything."}]"#
        } else {
            r#"EXAMPLE:
Text: "1: The man was being walked."
Answer: [{"line":1,"type":"style","severity":"warning","message":"Passive construction","suggestion":"The man walked."}]"#
        };

        format!(
            r#"<|system|>
You are a JSON generator for proofreading. Answer EXCLUSIVELY with a JSON array. No explanations, no markdown, no prose.
<|end|>
<|user|>
{grammar_example}

TASK:
Analyze the following text for {check_categories_en}:

{numbered_lines}

IMPORTANT: Answer ONLY with the JSON array. Format: [{{"line":N,"type":"{example_type}","severity":"warning|error","message":"...","suggestion":"..."}}]
No issues found? Answer: []
<|end|>
<|assistant|>
["#
        )
    } else {
        let grammar_example = if include_grammar {
            r#"BEISPIEL 1 (Stil):
Text: "1: Der Mann war gegangen worden."
Antwort: [{"line":1,"type":"style","severity":"warning","message":"Passiv-Konstruktion","suggestion":"Der Mann ging."}]

BEISPIEL 2 (Grammatik):
Text: "1: Er haben das Buch gelest."
Antwort: [{"line":1,"type":"grammar","severity":"error","message":"Falsche Konjugation und Rechtschreibung","suggestion":"Er hat das Buch gelesen."}]"#
        } else {
            r#"BEISPIEL:
Text: "1: Der Mann war gegangen worden."
Antwort: [{"line":1,"type":"style","severity":"warning","message":"Passiv-Konstruktion","suggestion":"Der Mann ging."}]"#
        };

        format!(
            r#"<|system|>
Du bist ein JSON-Generator für Lektorat. Antworte AUSSCHLIESSLICH mit einem JSON-Array. Keine Erklärungen, kein Markdown, keine Autorenlisten, keine Fließtexte.
<|end|>
<|user|>
{grammar_example}

AUFGABE:
Analysiere folgenden Text auf {check_categories_de}:

{numbered_lines}

WICHTIG: Antworte NUR mit dem JSON-Array. Format: [{{"line":N,"type":"{example_type}","severity":"warning|error","message":"...","suggestion":"..."}}]
Keine Probleme gefunden? Antworte: []
<|end|>
<|assistant|>
["#
        )
    }
}

/// Parse Lektorat-Antwort
pub fn parse_lektorat_response(response: &str) -> Result<Vec<LektoratNote>, String> {
    // Strip common code fences / noise
    let response = response.trim();
    let response = response
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    // Since we prefix the prompt with "[", prepend it if the response doesn't start with "["
    let response = if !response.starts_with('[') && !response.is_empty() {
        format!("[{}", response)
    } else {
        response.to_string()
    };
    let response = response.as_str();

    // Empty array is valid
    if response == "[]" || response == "[" || response == "[{" {
        return Ok(vec![]);
    }

    // Finde JSON Array in der Antwort
    let has_bracket = response.find('[');
    let first_brace = response.find('{');

    // If LLM returned objects without outer brackets, wrap them
    let json_str: String = if has_bracket.is_none() && first_brace.is_some() {
        // No [ but has { - LLM returned individual objects
        format!("[{}]", response)
    } else if let Some(json_start) = has_bracket {
        let json_end = match response.rfind(']') {
            Some(pos) => pos,
            None => return Err("Kein JSON Array Ende gefunden".to_string()),
        };
        if json_end <= json_start {
            return Err("Ungültiges JSON Format".to_string());
        }
        response[json_start..=json_end].to_string()
    } else {
        return Err("Kein JSON gefunden".to_string());
    };

    // Try to parse - if it fails, try cleaning up common issues
    match serde_json::from_str::<Vec<LektoratNote>>(&json_str) {
        Ok(notes) => Ok(notes),
        Err(e) => {
            // Try removing trailing commas (common LLM mistake)
            let cleaned = json_str
                .replace(",]", "]")
                .replace(",\n]", "\n]")
                .replace(", ]", "]");

            match serde_json::from_str::<Vec<LektoratNote>>(&cleaned) {
                Ok(notes) => Ok(notes),
                Err(_) => {
                    // Fallback: extract individual valid JSON objects
                    let mut notes = Vec::new();
                    let mut depth = 0;
                    let mut obj_start = None;

                    for (i, ch) in json_str.char_indices() {
                        match ch {
                            '{' => {
                                if depth == 0 {
                                    obj_start = Some(i);
                                }
                                depth += 1;
                            }
                            '}' => {
                                depth -= 1;
                                if depth == 0 {
                                    if let Some(start) = obj_start {
                                        let obj_str = &json_str[start..=i];
                                        if let Ok(note) =
                                            serde_json::from_str::<LektoratNote>(obj_str)
                                        {
                                            notes.push(note);
                                        }
                                    }
                                    obj_start = None;
                                }
                            }
                            _ => {}
                        }
                    }

                    if notes.is_empty() {
                        Err(format!("JSON Parse Error: {}", e))
                    } else {
                        Ok(notes)
                    }
                }
            }
        }
    }
}

// ============================================================================
// Szenen-/Kapitel-Zusammenfassungen für KI-Kontext
// ============================================================================

/// Prompt für Szenen-Zusammenfassung - STRIKT Prosa, kurz
pub fn build_scene_summary_prompt(scene_title: &str, scene_content: &str) -> String {
    // Begrenze den Text für effiziente Verarbeitung
    // UTF-8 sicher: finde gültige Char-Grenze
    const MAX_CHARS: usize = 10000;
    let content_truncated = if scene_content.len() > MAX_CHARS {
        let truncate_at = scene_content
            .char_indices()
            .take_while(|(i, _)| *i < MAX_CHARS)
            .last()
            .map(|(i, _)| i)
            .unwrap_or(MAX_CHARS.min(scene_content.len()));
        let clean_end = scene_content[..truncate_at]
            .rfind(' ')
            .unwrap_or(truncate_at);
        format!("{}...", &scene_content[..clean_end])
    } else {
        scene_content.to_string()
    };

    format!(
        r#"<|user|>
Fasse diese Szene in 2-3 Sätzen zusammen. Schreibe als Prosa, NICHT als JSON. Nenne die wichtigsten Figuren und was passiert.

SZENE: "{scene_title}"
TEXT:
{content_truncated}

Antworte NUR mit der Zusammenfassung (2-3 Sätze), nichts anderes.
<|end|>
<|assistant|>
"#
    )
}

/// Prompt für Kapitel-Zusammenfassung basierend auf Szenen-Zusammenfassungen
pub fn build_chapter_summary_prompt(
    chapter_title: &str,
    scene_summaries: &[(String, Option<String>)],
) -> String {
    let scenes_text: String = scene_summaries
        .iter()
        .enumerate()
        .map(|(i, (title, summary))| {
            let sum_text = summary.as_deref().unwrap_or("(Keine Zusammenfassung)");
            format!("{}. {}: {}", i + 1, title, sum_text)
        })
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        r#"<|user|>
Fasse dieses Kapitel in 2-4 Sätzen zusammen. Schreibe als Prosa, NICHT als JSON.

KAPITEL: "{chapter_title}"
SZENEN:
{scenes_text}

Antworte NUR mit der Zusammenfassung (2-4 Sätze), nichts anderes.
<|end|>
<|assistant|>
"#
    )
}

/// Parse die Zusammenfassung - extrahiert nur den Prosa-Text
pub fn parse_summary_response(response: &str) -> String {
    // Entferne führende/nachfolgende Whitespace und eventuell verbliebene Tags
    let cleaned = response
        .trim()
        .trim_start_matches("<|assistant|>")
        .trim_start_matches("<|end|>")
        .trim_end_matches("<|end|>")
        .trim();

    // Nimm nur die ersten 500 Zeichen falls zu lang
    if cleaned.len() > 500 {
        format!("{}...", &cleaned[..497])
    } else {
        cleaned.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_extraction() {
        let response = r#"Hier sind die Entities:
```json
[
  {
    "entity_type": "character",
    "name": "Anna",
    "aliases": [],
    "description": "Junge Frau",
    "notes": "",
    "confidence": 0.9,
    "occurrences": ["Anna ging..."]
  }
]
```"#;

        let entities = parse_extraction_response(response).unwrap();
        assert_eq!(entities.len(), 1);
        assert_eq!(entities[0].name, "Anna");
    }

    fn extracted(name: &str, entity_type: &str) -> ExtractedEntity {
        ExtractedEntity {
            entity_type: entity_type.to_string(),
            name: name.to_string(),
            aliases: Vec::new(),
            description: String::new(),
            notes: String::new(),
            confidence: 0.9,
            occurrences: Vec::new(),
        }
    }

    /// The hallucination filter drops names that appear in our own prompts, so
    /// the model cannot smuggle its examples in as findings. That list is
    /// applied without ever looking at the manuscript, so a real character who
    /// happens to share a name with an example is deleted too - and the names
    /// chosen as examples are among the most common ones there are.
    #[test]
    fn common_first_names_survive_the_prompt_example_filter() {
        let text = "Maria trat ans Fenster. Hinter ihr wartete Elena, waehrend \
                    Marcus schwieg. Sarah kam aus Berlin, John blieb draussen.";

        let entities = vec![
            extracted("Maria", "character"),
            extracted("Elena", "character"),
            extracted("Marcus", "character"),
            extracted("Sarah", "character"),
            extracted("John", "character"),
            extracted("Berlin", "location"),
        ];

        let kept = validate_entities_against_text(entities, text);
        let names: Vec<&str> = kept.iter().map(|e| e.name.as_str()).collect();

        assert!(
            names.contains(&"Maria"),
            "a character standing in the text was deleted because a prompt \
             elsewhere uses the same name as an example; kept: {names:?}"
        );
        assert_eq!(names.len(), 6, "kept: {names:?}");
    }

    /// The other half of the same rule: a name the model invented, or copied
    /// from the instructions, must still be dropped.
    #[test]
    fn names_absent_from_the_text_are_still_dropped() {
        let text = "Marla trat ans Fenster.";

        let kept = validate_entities_against_text(
            vec![
                extracted("Marla", "character"),
                // Never written by the user - either hallucinated or copied
                // out of the prompt examples.
                extracted("Maria", "character"),
                extracted("Dr. Schmidt", "character"),
                extracted("Excalibur", "item"),
            ],
            text,
        );
        let names: Vec<&str> = kept.iter().map(|e| e.name.as_str()).collect();

        assert_eq!(names, vec!["Marla"], "kept: {names:?}");
    }
}
