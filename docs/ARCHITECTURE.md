# FeatherWorks Author – System Architecture
Version: 1.0 (2025-10-06)

## 1. High-Level Overview
Desktop Application (Tauri):
- Frontend: React + TypeScript (Vite) → WebView
- Backend: Rust command surface (Tauri invoke) + background workers
- Persistence: SQLite (WAL) + encrypted container export (.fwauthor)
- Optional AI Runtime: Local model inference via pluggable engine

```text
┌──────────────────────────────────────────────────────────────┐
│                    FeatherWorks (Tauri)                     │
│  ┌────────────┐    invoke/emit    ┌──────────────────────┐  │
│  │  Frontend  │ <----------------> │  Tauri Command Layer │  │
│  │  React/TS  │   events (IPC)    └─────────┬────────────┘  │
│  └─────┬──────┘                             │               │
│        │ Virtual DOM                        ▼               │
│        │                           ┌──────────────────┐     │
│        │                           │ Application Core │     │
│        │                           │ (Services)       │     │
│        │                           └──────┬───────────┘     │
│        │                                  │                 │
│        │                         ┌────────▼─────────┐       │
│        │                         │  Domain Modules   │       │
│        │                         │ (Editor, Entities │       │
│        │                         │  Plot, Analysis…) │       │
│        │                         └────────┬─────────┘       │
│        │                                  │                 │
│        │                    ┌─────────────▼────────────┐    │
│        │                    │ Persistence (SQLite)      │    │
│        │                    │ + Storage Adapters        │    │
│        │                    └─────────────┬────────────┘    │
│        │                                  │                 │
│        │                    ┌─────────────▼────────────┐    │
│        │                    │ Encrypted Container (I/O)│    │
│        │                    └──────────────────────────┘    │
│        │                                  │                 │
│        │                        ┌─────────▼────────┐        │
│        │                        │  AI Engine (Opt) │        │
│        │                        └──────────────────┘        │
└────────┴────────────────────────────────────────────────────┘
```

## 2. Module Layering
Layer rules (top cannot skip intermediate except via events/contracts):
- UI (React components, hooks, state stores)
- IPC (Tauri commands, emit events)
- Service Layer (Rust: orchestrates domain logic & transactions)
- Domain Modules (encapsulated business logic, minimal cross-talk)
- Infrastructure (DB, FS, crypto, AI runtime binding)

## 3. Data Model (Incremental Core)
Baseline tables (prefix `fw_` to reserve namespace):
- `fw_project (id PK, title, author, created_at, updated_at, metadata_json)`
- `fw_structure (id PK, project_id, parent_id, kind TEXT, sort_order, title, status, pov_character_id NULL, meta_json)`
  - kind ENUM: book|part|chapter|scene|note
- `fw_scene_content (structure_id FK, rev INTEGER, content_json, plain_text, word_count, char_count, updated_at)` (1 row current + historical in archive table)
- `fw_characters (id PK, project_id, name, display_name, description, attributes_json, created_at, updated_at)`
- `fw_character_rel (id PK, project_id, a_id, b_id, rel_type, meta_json)`
- `fw_locations (id PK, project_id, parent_id, name, description, attributes_json)`
- `fw_notes (id PK, project_id, target_type, target_id, body_json, created_at)`
- `fw_analysis_index (project_id, token, kind, positions_json)` (denormalized for highlighting)
- `fw_settings (key PK, value)` (per-user local)
- `fw_versions (id PK, project_id, created_at, author, message, diff_blob BLOB, parent_id)`
- `fw_export_templates (id PK, name, kind, template_blob, meta_json)`

Historical / Archive tables:
- `fw_scene_history (id PK, structure_id, rev, diff_blob, created_at)`

Indices:
- `idx_structure_parent_sort (parent_id, sort_order)`
- `idx_scene_plaintext_fts` (FTS5 virtual table for search) – introduced W2/W4

## 4. Editor Document Model
Representation: JSON AST (ProseMirror-inspired minimal schema):
```
{
  "type": "doc",
  "content": [ { "type": "paragraph", "content": [ { "type": "text", "text": "Hello", "marks": [ {"type": "bold"} ] } ] } ]
}
```
Marks supported W1: bold, italic, underline, strike. Blocks: paragraph, heading(level), bullet_list, ordered_list, list_item, blockquote, code_block (later). Scenes map to a document root.

Diff Strategy: Structural JSON patch (custom), compressed with LZ4. Undo stack keeps inverse patches; spill to disk after threshold (#actions > 500 or memory > 32MB).

## 5. Autosave & Undo Architecture
Flow:
- User action → Editor state change → Local ephemeral state updates word counts (worker) → Debounced (1s idle or 10s max) diff extraction → `save_scene_patch` IPC → Service applies patch inside transaction (validate rev) → Broadcast `scene_saved` event with new rev + persisted counts.
- Undo: Command ring; attempt merge for adjacent typing operations; export patch for redo.

Consistency Invariants:
- Scene rev strictly increments; no gaps.
- Latest full materializable state = base snapshot + fold of diffs; periodic snapshotting every N patches (e.g., every 20) for faster load.

## 6. Highlighting & Indexing
Pipeline (W3):
1. Background task scans scenes changed since last index rev.
2. Tokenize, detect entity tokens (characters/locations) via Aho-Corasick automaton built from active names.
3. Store positions in `fw_analysis_index` grouped by token.
4. Frontend requests highlight ranges per scene chunk lazily.

## 7. Search & FTS
Short-term: naive LIKE for small scale. Long-term (W2/W4): SQLite FTS5 virtual table `fw_scene_fts(content)`; triggers keep it synchronized on scene save (post-snapshot). Regex/advanced search executed in Rust streaming per scene when needed.

## 8. Analysis Pipelines (W4)
Architecture: Job scheduler (priority queue) with workers. Each job: (analysis_kind, scene_id, parameters, last_rev). Results stored in `fw_analysis_index` or dedicated result tables.
Kinds initial: weak_verbs, repetitions, readability, long_sentences, adverbs, filler_words. Each analysis pluggable via trait `AnalysisTask`.

## 9. Export Engine (W5)
Abstract `Exporter` trait:
```
pub trait Exporter {
  fn kind(&self) -> ExportKind;
  fn export(&self, project: &ProjectAggregate, opts: &ExportOptions) -> Result<Vec<u8>>;
}
```
Implementations: DocxExporter, EpubExporter, PdfExporter (HTML-to-PDF pipeline), PlainTextExporter. Template resolution layer (Tera) feeds exporters.

## 10. AI Integration (W7)
Components:
- Context Builder: Gathers top-N relevant scenes, characters, notes (vector search + heuristics)
- Model Runner: abstraction over candle/tch backends
- Chat Orchestrator: maintains session memory (summarized after threshold)
- Prompt Filter: redacts sensitive markers if future remote expansion (defense in depth)
- Caching: embedding store (sqlite table `fw_embeddings`)

## 11. Version Control (W8)
Semantic commit units: set of structure changes + scene diff references. Diff computation reuses patch engine. Visual diff view reconstructs side-by-side states. Branches: pointer to `fw_versions` head row (simple adjacency list). Merge: three-way on JSON AST (conflict markers inserted for manual resolution).

## 12. Plugin Sandbox (W9)
Phase 1 (read-only): WASM runtime (Wasmtime). Host API surface (cap-checked): list scenes, read AST, get metadata. No write. Manifest declares permissions. Resource quotas (time, memory). Future write operations require capability tokens.

## 13. Sync Engine (Wx)
Delta strategy: per-table row hash (xxhash) vs remote snapshot manifest. Conflict resolution rules per domain (scene = attempt patch merge; metadata = last-writer-wins + audit log). Encryption: client-side before upload (if zero-trust mode selected).

## 14. Settings & Configuration
Stored in `fw_settings` (JSON per key if complex). Exposed service caches in-memory with watch subscriptions. Example keys: editor.theme, editor.fontFamily, goals.dailyWords.

## 15. Crash Recovery
On each autosave attempt also write rolling recovery file (journal) with last stable patch window. On startup detect uncommitted journal, offer recovery diff preview → apply or discard.

## 16. Performance Strategies
- Large text: incremental parsing; keep plain text shadow for word counts.
- Highlight painting: chunk (e.g. 2k chars) virtualization
- Background tasks: cooperative scheduling with CPU budget (avoid UI jank)
- Memory: release old undo segments via snapshot compaction.

## 17. Testing Strategy
- Unit: patch engine, diff merge, analysis tasks
- Integration: scene save/load, encryption roundtrip, exporter fidelity (golden doc)
- Property Tests: patch apply ∘ inverse = identity, diff stability
- Benchmarks: indexing throughput, word count latency

## 18. Security Considerations
- Avoid executing untrusted template code (sandbox templates)
- WASM plugins restricted host calls; no FS except virtual resource API
- Encrypted container includes version + KDF params; tamper detection via AEAD tag

## 19. Observability (Local)
Debug overlay (dev only): fps, mem usage (RSS), active background tasks, last save latency.

## 20. File/Directory Conventions
- `src-tauri/src/services/*` (new) – orchestration modules
- `src-tauri/src/domain/*` – domain logic units (editor, structure, characters, etc.)
- `src-tauri/src/infrastructure/*` – db.rs, container.rs, exporters, ai runtime binding
- `src/frontend/domain/*` – state stores per domain
- `src/frontend/components/*` – UI components
- `tests/` – integration tests (naming: domain_action.rs)

## 21. Migration Procedure
Add migration file or code block with ordered id; run inside single transaction; backup snapshot if migration complexity > trivial DDL. Provide dry-run flag (dev).

## 22. Open Extension Points
- Exporter registration
- Analysis task registration
- Plugin host capabilities descriptor

## 23. Future Considerations
- Multi-doc tabbed editing
- Real-time coauthor with CRDT (yjs adapter) alternative to OT
- GPU acceleration for tokenization (investigate if needed for very large corpora)

## 24. Change Log
- 2025-10-06: Initial architecture baseline committed.

End of Architecture Document.
