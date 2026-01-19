# AI Background Pipeline - Konzept

**Stand:** 19. Januar 2026  
**Status:** Geplant (Post-MVP)  
**Geschätzter Aufwand:** ~40-50h

---

## 🎯 Vision

Die KI arbeitet **proaktiv im Hintergrund** während der User schreibt. Wenn der User auf einen Button klickt (Entities, Lektorat, etc.), sind die Ergebnisse **bereits da** – gefühlt Instant-Response.

Die KI verhält sich wie ein **echter Co-Autor/Lektor**, nicht wie ein simpler Textanalysator:
- Vollständige, nutzbare Entity-Einträge
- Konkrete, actionable Lektorat-Vorschläge
- Projekt-weite Konsistenz-Prüfung

---

## 🏗️ Multi-Layer Architektur

```
┌─────────────────────────────────────────────────────────────────┐
│                    LAYER 0: TEXT TRACKING                        │
│  Hash-basierte Änderungserkennung pro Paragraph/Chunk           │
│  "Hat sich dieser Text seit letzter Analyse geändert?"          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 LAYER 1: CONTEXT EXTRACTION                      │
│  SCHNELL (~500 Tokens, ~2-3s) - Läuft bei JEDER Änderung        │
│  ─────────────────────────────────────────────────────────────  │
│  Input: Aktueller Paragraph + 2 Sätze davor/danach              │
│  Output:                                                         │
│    • Aktive Charaktere (Namen + Pronomen-Auflösung)             │
│    • Aktueller Ort                                               │
│    • Emotionaler Ton                                             │
│    • Zeitpunkt (falls erkennbar)                                │
│  → Speichern in: paragraph_context_cache                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 LAYER 2: SCENE SUMMARY                           │
│  MITTEL (~1000 Tokens, ~4-6s) - Läuft wenn Paragraphen stabil   │
│  ─────────────────────────────────────────────────────────────  │
│  Input: Alle Paragraph-Contexts einer Szene                      │
│  Output:                                                         │
│    • Szenen-Zusammenfassung (3-5 Sätze)                         │
│    • Beteiligte Charaktere + Rollen                              │
│    • Plot-Punkte                                                 │
│    • Stimmungs-Arc                                               │
│  → Speichern in: scene_context_cache                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 LAYER 3: DEEP ANALYSIS                           │
│  LANGSAM (~2000-4000 Tokens, ~10-15s) - Läuft im Idle           │
│  ─────────────────────────────────────────────────────────────  │
│  A) ENTITY EXTRACTION                                            │
│     Input: Chunk + Scene Summary + Known Entities                │
│     Output: Neue/aktualisierte Entities mit Confidence           │
│                                                                  │
│  B) LEKTORAT                                                     │
│     Input: Chunk + Char-Profiles + Scene Context                 │
│     Output: Stil-Feedback, Fehler, Vorschläge                   │
│                                                                  │
│  C) CONSISTENCY CHECK                                            │
│     Input: Entity + alle Erwähnungen                             │
│     Output: Widersprüche, Timeline-Fehler                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Smart Chunking Strategie

### Das Problem

Kontextfenster ist begrenzt (~4k-8k Tokens nutzbar). Aber:
- Chunks dürfen nicht Kontext verlieren ("Wer ist 'er'?")
- Keine willkürlichen Schnitte mitten im Gedanken

### Chunk-Grenzen (Priorität)

```rust
enum ChunkBoundary {
    // Bevorzugt (natürliche Grenzen)
    SceneBreak,           // "***" oder "---"
    ParagraphWithDialog,  // Dialog-Ende ist gute Grenze
    ParagraphEnd,         // Absatzende
    
    // Notfall (wenn Paragraph zu lang)
    SentenceEnd,          // Punkt + Großbuchstabe
    
    // NIEMALS
    // - Mitten im Satz
    // - Mitten im Dialog
}
```

### Kontext-Injection pro Chunk

Jeder Chunk bekommt komprimierten Kontext mitgeliefert:

```rust
struct ChunkWithContext {
    // Der eigentliche Text (~1500-2000 Tokens)
    text: String,
    
    // Komprimierter Kontext (~300-500 Tokens)
    context: ChunkContext,
}

struct ChunkContext {
    // Aus Layer 1 (paragraph_context)
    active_characters: Vec<CharacterRef>,  // "Max (Protagonist, 32, nervös)"
    current_location: Option<String>,       // "Büro des Anwalts"
    time_context: Option<String>,           // "Abends, nach dem Streit"
    
    // Aus Layer 2 (scene_context)  
    scene_summary: String,  // "Max konfrontiert seinen Vater..."
    preceding_events: String,  // "Zuvor: Lisa hat das Geheimnis verraten"
    
    // Aus bekannten Entities
    relevant_entities: Vec<EntityBrief>,  // Nur die in dieser Szene aktiven
}
```

### Prompt-Template

```
KONTEXT:
- Ort: {current_location}
- Zeit: {time_context}
- Aktive Charaktere: {active_characters}
- Was bisher geschah: {preceding_events}
- Szenen-Zusammenfassung: {scene_summary}

RELEVANTE CHARAKTERE:
{für jeden relevanten Charakter: Name, Beschreibung, Beziehungen}

---

TEXT ZUR ANALYSE:
{chunk_text}

---

AUFGABE: {entity_extraction | lektorat | consistency_check}
```

---

## 📊 Prioritäts-System

```rust
#[derive(PartialOrd, Ord)]
enum AnalysisPriority {
    // P0: User hat gerade geklickt
    UserRequested = 0,
    
    // P1: Cursor-Position (User schreibt hier gerade)
    ActiveParagraph = 10,
    
    // P2: Sichtbarer Bereich
    VisibleViewport = 20,
    
    // P3: Aktuelle Szene (aber nicht sichtbar)
    CurrentScene = 30,
    
    // P4: Aktuelles Kapitel
    CurrentChapter = 40,
    
    // P5: Kürzlich bearbeitet (letzte 5 Minuten)
    RecentlyEdited = 50,
    
    // P6: Rest vom Projekt
    Background = 100,
}

struct AnalysisJob {
    chunk_id: ChunkId,
    analysis_type: AnalysisType,
    priority: AnalysisPriority,
    text_hash: u64,  // Für Invalidierung
    dependencies: Vec<JobId>,  // Layer 3 wartet auf Layer 1
}
```

---

## 🔄 Invalidierungs-Logik

```rust
fn on_paragraph_changed(para_id: ParagraphId, new_hash: u64) {
    // 1. Layer 1 Cache für diesen Paragraph invalidieren
    invalidate_paragraph_context(para_id);
    
    // 2. Scene Summary muss neu berechnet werden
    let scene_id = get_scene_for_paragraph(para_id);
    mark_scene_summary_stale(scene_id);
    
    // 3. Deep Analysis für diesen Chunk invalidieren
    invalidate_deep_analysis(para_id);
    
    // 4. Aber: Entity-Daten behalten! (nur Confidence senken)
    reduce_entity_confidence_for_source(para_id);
    
    // 5. Jobs neu einreihen mit erhöhter Priorität
    queue_analysis_job(para_id, AnalysisPriority::RecentlyEdited);
}
```

---

## 🤖 Agent Mode vs Standard Mode

```rust
enum AiMode {
    Standard {
        // Background-Processing läuft
        // Ergebnisse in Cache
        // User muss Button klicken um:
        //   - Entities in DB zu übernehmen
        //   - Lektorat anzuzeigen
        //   - Kommentare zu erstellen
    },
    
    Agent {
        // Alles automatisch:
        auto_accept_entities: bool,      // Entities direkt in DB
        auto_show_lektorat: bool,        // Inline-Kommentare
        auto_fix_typos: bool,            // Offensichtliche Fehler korrigieren
        confidence_threshold: f32,        // Nur bei >90% Confidence
    },
}
```

---

## 📁 DB Schema Erweiterung

```sql
-- Layer 1: Paragraph Context Cache
CREATE TABLE paragraph_context (
    paragraph_id TEXT PRIMARY KEY,
    text_hash INTEGER NOT NULL,
    active_characters TEXT,  -- JSON Array
    current_location TEXT,
    emotional_tone TEXT,
    time_context TEXT,
    computed_at INTEGER,
    FOREIGN KEY (paragraph_id) REFERENCES paragraphs(id)
);

-- Layer 2: Scene Context Cache  
CREATE TABLE scene_context (
    scene_id TEXT PRIMARY KEY,
    summary TEXT,
    characters_involved TEXT,  -- JSON
    plot_points TEXT,          -- JSON
    mood_arc TEXT,
    is_stale BOOLEAN DEFAULT 0,
    computed_at INTEGER
);

-- Layer 3: Deep Analysis Results
CREATE TABLE analysis_results (
    id TEXT PRIMARY KEY,
    chunk_id TEXT NOT NULL,
    analysis_type TEXT NOT NULL,  -- 'entity', 'lektorat', 'consistency'
    text_hash INTEGER NOT NULL,
    result_json TEXT,
    confidence REAL,
    is_accepted BOOLEAN DEFAULT 0,  -- User hat übernommen
    computed_at INTEGER
);

-- Tracking für Smart Scheduling
CREATE TABLE analysis_queue (
    id TEXT PRIMARY KEY,
    chunk_id TEXT NOT NULL,
    analysis_type TEXT NOT NULL,
    priority INTEGER NOT NULL,
    dependencies TEXT,  -- JSON Array of job IDs
    status TEXT DEFAULT 'pending',  -- pending, running, done, failed
    created_at INTEGER,
    started_at INTEGER,
    completed_at INTEGER
);
```

---

## 🎯 Entity Extraction - Vollständige Einträge

Die KI liefert nicht nur "Max gefunden", sondern **komplette Datenbank-Einträge**:

### Charakter-Entity

```typescript
interface ExtractedCharacter {
  name: string;                    // "Maximilian 'Max' Berger"
  aliases: string[];               // ["Max", "der Anwalt", "Vaters Sohn"]
  
  // Physische Beschreibung (aus Text extrahiert)
  appearance: {
    age?: string;                  // "Anfang 30" 
    height?: string;               // "groß"
    hair?: string;                 // "dunkelbraun, kurz geschnitten"
    eyes?: string;                 // "grüne Augen"
    distinguishing?: string[];     // ["Narbe an der Stirn", "trägt immer Anzug"]
    first_mention: TextRef;        // Wo im Text beschrieben
  };
  
  // Persönlichkeit (aus Handlungen/Dialog abgeleitet)
  personality: {
    traits: string[];              // ["stur", "loyal", "impulsiv"]
    speech_patterns?: string;      // "spricht formal, vermeidet Konfrontation"
    evidence: TextRef[];           // Belege im Text
  };
  
  // Beziehungen
  relationships: {
    character: string;             // "Thomas Berger"
    relation: string;              // "Vater"
    dynamic: string;               // "angespannt, Max fühlt sich nicht anerkannt"
    evidence: TextRef[];
  }[];
  
  // Entwicklung/Arc
  arc: {
    initial_state: string;         // "unsicher, sucht Anerkennung"
    key_moments: { description: string; scene_ref: SceneRef; }[];
    current_state: string;         // "beginnt eigene Entscheidungen zu treffen"
  };
  
  // Meta
  role: "protagonist" | "antagonist" | "supporting" | "minor";
  first_appearance: SceneRef;
  scene_count: number;
  word_count: number;
  confidence: number;              // 0.0 - 1.0
}
```

### Ort-Entity

```typescript
interface ExtractedLocation {
  name: string;                    // "Kanzlei Berger & Partner"
  aliases: string[];               // ["die Kanzlei", "Vaters Büro"]
  
  description: {
    atmosphere: string;            // "steril, einschüchternd"
    physical: string;              // "Großraumbüro im 15. Stock"
    details: string[];             // ["Mahagoni-Schreibtisch", "Glaswände"]
    evidence: TextRef[];
  };
  
  associated_characters: string[];
  scenes_set_here: SceneRef[];
  significance: string;            // "Symbol für Vaters Macht"
}
```

### Gegenstand-Entity

```typescript
interface ExtractedObject {
  name: string;                    // "Großvaters Taschenuhr"
  description: string;             // "antike goldene Taschenuhr mit Gravur"
  symbolism?: string;              // "Steht für Familientradition"
  owner: string;
  appearances: { scene: SceneRef; context: string; }[];
}
```

### Inkrementelles Entity-Building

Die KI sieht einen Charakter nicht nur einmal, sondern **baut das Profil über Zeit auf**:

```
Szene 1: "Max betrat das Büro."
  → Entity erstellt: { name: "Max", confidence: 0.3 }

Szene 2: "Der Anwalt zog seine Krawatte zurecht."
  → Context weiß: Max ist hier, er ist Anwalt
  → Entity updated: { occupation: "Anwalt", aliases: ["der Anwalt"] }

Szene 5: "Max dachte an seinen Vater, den er seit 10 Jahren nicht gesehen hatte."
  → Relationship: { character: "Vater", dynamic: "entfremdet" }

Szene 12: "Seine grünen Augen verengten sich."
  → Appearance: { eyes: "grün" }
```

---

## 📝 Lektorat - Actionable Feedback

### Stil-Analyse

```typescript
interface LektoratStyle {
  // Wortwiederholungen
  repetitions: {
    word: string;
    count: number;
    positions: TextPosition[];
    suggestion: string;          // "Varianten: X, Y, Z"
    severity: "info" | "warning" | "error";
  }[];
  
  // Füllwörter / Schwache Verben
  weak_words: {
    word: string;
    position: TextPosition;
    suggestion: string;          // "'ging' → 'schlenderte', 'hastete'"
    context: string;
  }[];
  
  // Satzlängen-Analyse
  sentence_rhythm: {
    avg_length: number;
    variance: "monoton" | "gut" | "zu chaotisch";
    suggestion?: string;
  };
  
  // Adjektiv-Häufung
  adjective_clusters: {
    position: TextPosition;
    text: string;
    suggestion: string;
  }[];
}
```

### Show don't Tell

```typescript
interface ShowDontTell {
  position: TextPosition;
  original: string;              // "Er war wütend."
  suggestion: string;            // "Zeige die Wut: Körpersprache, Dialog"
  example?: string;              // "Seine Hände ballten sich zu Fäusten..."
  severity: "suggestion" | "warning";
}
```

### Dialog-Analyse

```typescript
interface DialogAnalysis {
  // Talking Heads (Dialog ohne Action)
  talking_heads: {
    start: TextPosition;
    length: number;
    suggestion: string;
  }[];
  
  // Dialog-Tags
  tags: {
    position: TextPosition;
    tag: string;                 // "sagte er lächelnd"
    issue: string;               // "Adverb im Dialog-Tag"
    suggestion: string;
  }[];
  
  // Charakter-Stimmen
  voice_consistency: {
    character: string;
    issue?: string;              // "Max spricht hier formeller als sonst"
    evidence: TextRef;
  }[];
}
```

### POV-Konsistenz

```typescript
interface POVAnalysis {
  violations: {
    position: TextPosition;
    issue: string;               // "Kopfspringen - wir sind in Max' POV"
    original: string;
    suggestion: string;
  }[];
  current_pov: string;           // "Max (3rd Person Limited)"
}
```

### Positives Feedback!

```typescript
interface Highlights {
  position: TextPosition;
  text: string;
  praise: string;                // "Starke Metapher", "Guter Dialog-Beat"
}
```

### Gesamt-Scores

```typescript
interface LektoratScores {
  style: number;       // 0-100
  clarity: number;
  engagement: number;
  technical: number;
  overall: number;
}
```

---

## 🔍 Konsistenz-Checks

```typescript
interface ConsistencyResult {
  // Timeline-Fehler
  timeline: {
    issue: string;
    scenes: SceneRef[];
    severity: "error" | "warning";
  }[];
  
  // Charakter-Widersprüche
  character_contradictions: {
    character: string;
    attribute: string;           // "Augenfarbe"
    values: { value: string; scene: SceneRef; text: string; }[];
  }[];
  
  // Verschwundene Charaktere
  missing_characters: {
    character: string;
    last_seen: SceneRef;
    scenes_since: number;
    note: string;
  }[];
  
  // Ungelöste Plot-Punkte
  loose_threads: {
    description: string;
    introduced: SceneRef;
    last_mentioned: SceneRef;
  }[];
}
```

---

## 💡 Clevere Optimierungen

### 1. Pronomen-Auflösung Cache

```rust
struct PronounResolution {
    pronoun: String,        // "er"
    resolved_to: EntityId,  // → "Max"
    confidence: f32,
    position: TextPosition,
}
```

### 2. Rolling Context Window

```rust
struct RollingContext {
    previous_chunk_summary: String,  // ~100 Tokens
    current_chunk: String,           // ~2000 Tokens
    next_chunk_preview: String,      // ~100 Tokens
}
```

### 3. Entity Mention Tracking

```rust
struct EntityMention {
    entity_id: EntityId,
    chunk_id: ChunkId,
    text_span: String,          // "der große Mann mit dem Hut"
    mention_type: MentionType,  // Name, Pronoun, Description
    context: String,
}
```

---

## ⏱️ Performance-Ziele

| Layer | Tokens | Zeit (Phi-3) | Häufigkeit |
|-------|--------|--------------|------------|
| Layer 1 | ~500 | ~2-3s | Bei jeder Änderung |
| Layer 2 | ~1000 | ~4-6s | Wenn Szene stabil |
| Layer 3 | ~2500 | ~10-15s | Im Idle |

---

## 🚀 Implementierungs-Phasen

### Phase 1: Foundation (~8h)
- [ ] Hash-basierter Cache in SQLite
- [ ] Invalidierungs-Logik bei Textänderung
- [ ] Basis Priority Queue

### Phase 2: Layer 1 - Context Extraction (~10h)
- [ ] Schnelle Context-Extraction Prompts
- [ ] Pronomen-Auflösung
- [ ] paragraph_context_cache befüllen

### Phase 3: Smart Scheduling (~6h)
- [ ] Idle-Detection (User tippt nicht)
- [ ] Cursor/Viewport-Tracking
- [ ] Priority-basierte Job-Ausführung

### Phase 4: Layer 2 - Scene Summaries (~8h)
- [ ] Scene Summary Generation
- [ ] Plot-Point Extraction
- [ ] Stimmungs-Arc Analyse

### Phase 5: Layer 3 - Deep Analysis (~12h)
- [ ] Entity Extraction mit Kontext-Injection
- [ ] Vollständige Entity-Objekte
- [ ] Lektorat mit konkreten Vorschlägen
- [ ] Konsistenz-Checks

### Phase 6: Agent Mode (~6h)
- [ ] Auto-Accept Logic
- [ ] Confidence Thresholds
- [ ] Inline-Kommentar-System
- [ ] Settings UI

---

## 🎯 User Experience Ziel

**Beim Klick auf "Entities":**
- Vollständig ausgefüllte Charakter-Sheets
- Mit Belegen (Klick → springt zur Stelle)
- Beziehungs-Übersicht
- Badge: "Neu gefunden: 2 Charaktere, 1 Ort"

**Beim Klick auf "Lektorat":**
- Inline-Kommentare mit konkreten Vorschlägen
- Farbkodiert (Rot/Gelb/Grün)
- Gesamt-Score pro Szene
- Positive Highlights!

**Im Agent-Mode:**
- Alles automatisch
- Entities direkt in DB
- Lektorat-Kommentare inline
- Konsistenz-Warnungen als Notifications

---

*Dieses Dokument beschreibt die Vision für die Background AI Pipeline. Implementierung geplant für Post-MVP Phase.*
