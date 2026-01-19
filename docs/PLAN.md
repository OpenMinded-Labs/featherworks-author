# FeatherWorks Author – Master Plan & Delivery Roadmap

Version: 1.0 (2025-10-06)
Owner: Engineering (refer to this as canonical product/dev source of truth)
Status Legend: ✅ Done · 🚧 In Progress · ⏳ Planned · 💤 Deferred · 🧪 Experimental · 🔒 Pro Only

---
## 0. Guiding Principles
1. Local-first, privacy by design (all core functions offline; AI & sync opt-in)
2. Deterministic persistence (no data loss; crash-safe invariants)
3. Optimistic responsive UI (all edits instant; background persistence & analysis)
4. Modular evolutionary architecture (feature domains loosely coupled via service layer)
5. Incremental delivery (vertical slices; production-hardening each wave)
6. Performance budget: <50ms perceived latency for common interactions; exports/AI tasks show progress feedback.

---
## 1. Release Wave Overview
| Wave | Codename | Focus | Core Deliverables | Exit Criteria |
|------|----------|-------|-------------------|---------------|
| W0 | Baseline | Existing foundation | Project open/save, encrypted export/import | All existing tests green & stability ✅ |
| W1 | MVP Authoring | Core writing loop | Rich Editor (formatting), hierarchy (Book→Chapter→Scene), autosave, word count, undo/redo, basic search | 2h uninterrupted writing without errors ⏳ |
| W2 | Structure & Metadata | Narrative scaffolding | Scene status, plot notes, POV tracking, extended metadata, basic stats | Persistent structural edits stable |
| W3 | Entities | Characters & Locations | Character DB + highlighting + hover, location DB + highlighting | <3% CPU idle impact highlighting |
| W4 | Analysis | Text quality tools | Repetition, weak verbs, readability, sentence/word analytics | Reports generated <5s for 100k words |
| W5 | Export Suite | Publishing formats | DOCX, PDF, ePub, TXT + templates | Roundtrip DOCX fidelity >95% |
| W6 | Advanced Plot | Visual planning | Kanban board, timelines (basic), templates engine | Users reorganize 100 scenes smoothly |
| W7 | AI (Pro) | Fontain local AI | Contextual chat, suggestion injection, local model mgmt | All AI offline; memory <4GB |
| W8 | Collaboration | Versioning & review | Internal VCS, visual diff, comments, track changes | No data divergence after merges |
| W9 | Ecosystem | Extensibility | Plugin API (read-only first), theme export, marketplace seed | 3 example plugins run sandboxed |
| Wx | Cloud & Sync (Pro) | Multi-device continuity | Drive/iCloud sync, conflict UI | Consistent state after offline reconnection |

Parallel Streams: Security Hardening (S1), Performance (P1), Accessibility (A11Y) – each wave includes relevant acceptance gates.

---
## 2. Feature Priority Matrix (MoSCoW Simplified)
MUST (W1–W3), SHOULD (W2–W5), COULD (≥W5), WON'T (Re-evaluate later).
A mapping is maintained in BACKLOG with IDs (FEAT-XXX).

---
## 3. Milestone Acceptance Gates
Each wave closes only after passing:
- Functional: All FEAT in scope implemented & test coverage ≥ 80% for domain logic
- Stability: 6-hour soak test (editor idle/edit loop) no panics/memory leaks
- Performance: Word count update ≤ 40ms for 10k text changes; DB autosave commit ≤ 25ms p95
- QA Checklist: Manual exploration script executed & signed off
- Docs: User-facing CHANGELOG + internal architecture delta

---
## 4. Progressive Domain Enablement
1. Editor Core → 2. Structural Model → 3. Entities (Character/Location) → 4. Analysis Pipelines → 5. Export Formats → 6. AI Contextualization → 7. Version Control & Collaboration → 8. Extensibility → 9. Cloud Sync.

---
## 5. Risk Register (Top)
| Risk | Impact | Likelihood | Mitigation | Owner |
|------|--------|------------|------------|-------|
| Rich text complexity (format consistency) | Data corruption | Medium | Canonical JSON AST + migration tests | Core |
| Undo/Redo memory growth | Perf degrade | Medium | Compressed diffs + sliding window + spill to disk | Core |
| Highlighting scalability | CPU spike in large docs | High | Incremental token index + Aho-Corasick streaming | Entities |
| AI model load size | Startup delay | Medium | Lazy load on first use + progress UI | AI |
| Export fidelity (DOCX) | User trust loss | Medium | Golden file regression suite | Export |
| VCS merge complexity | Conflicts frustration | Medium | Structured semantic diff for scenes | Collab |

---
## 6. Non-Functional Targets
- Startup time (cold): < 2.5s (macOS M-series) to usable editor
- Memory footprint (baseline project 50k words): < 450MB (without AI loaded)
- Crash-free session rate: 99.5%
- Export operations: Feedback UI within 150ms
- Spellcheck throughput: ≥ 150k tokens/sec local dictionary

---
## 7. Metrics & Telemetry (Local Only / Opt-in)
Local counters persisted: write sessions, words/day, feature usage toggles, performance timings (ring buffer). No external analytics without explicit consent.

---
## 8. Deliverables per Wave (Detailed)
### W1 (MVP Authoring)
Scope IDs: FEAT-001..FEAT-020
- Rich Editor (inline marks, block separation, JSON doc model)
- Formatting toolbar + shortcuts
- Book→Chapter→Scene CRUD & reorder
- Autosave diff system
- Unlimited undo/redo (bounded resource strategy)
- Word/char count (live) + WPM
- Basic search & replace (current scene)
- Focus & distraction-free modes
- Adjustable fonts / spacing
Exit Extras: Developer doc for doc model, baseline performance benchmark.

### W2 (Structure & Metadata)
Adds: Scene status, plot notes, POV per scene, daily goals, project dashboard, aggregated word stats.

### W3 (Entities)
Character & location systems, name highlighting, hover cards, relationship modeling (MVP subset), indexing pipeline.

### W4 (Analysis)
Weak verbs, repetitions, readability, long sentences, adverbs, filler words, metrics dashboard. Background pipeline scheduler.

### W5 (Export Suite)
DOCX (import/export), ePub, PDF, TXT, template gallery, styling editor.

### W6 (Advanced Plot)
Kanban board, simple timeline (horizontal scroll), tension curve manual tagging.

### W7 (AI – Pro)
Local inference harness, context extraction & RAG, chat UI, suggestions injection (opt-in), memory budget controls.

### W8 (Collaboration)
Internal VCS (commit graph), visual diff viewer, comments anchored to spans, track changes layer.

### W9 (Extensibility)
Plugin sandbox (read-only doc APIs), theme export/import, plugin examples.

### Wx (Sync)
Cloud provider abstraction, delta-sync engine, conflict resolution UI.

---
## 9. Incremental Data Model Strategy
All new tables gated by migrations with idempotent pattern; user_version PRAGMA increments; forward-only scripted & reversible fallback via backup snapshot.

---
## 10. Quality Gates Automation
- Pre-commit: format (rustfmt, eslint), lint, fast unit tests
- CI Stage 1: Rust tests (unit/integration), frontend typecheck/build
- CI Stage 2: Golden exports diff, performance smoke (word count microbench)
- Nightly: Long-run memory & leak detection (valgrind/macos instruments), large project benchmarks

---
## 11. Security & Privacy
- Encrypted container format (current) extended with versioned header
- Secrets: None stored remotely; key derivation Argon2id tunable parameters stored with container header
- AI models local only; optional encrypted model cache

---
## 12. Licensing & Pro Feature Flagging
Core = free local authoring. Pro gating via license file (signed JSON) validated offline (Ed25519). Grace period and downgrade path maintained.

---
## 13. Open Questions (Track & Resolve)
- Rich text model: adopt existing (e.g., ProseMirror schema subset) vs bespoke? (Decide W1 Sprint 1)
- Spellcheck dictionary shipping size tradeoffs (German + English baseline). (Decide before W3)
- AI model default size (7B vs 3B) for baseline hardware compatibility. (Decide W7 Sprint 1)

---
## 14. Change Management
All amendments appended with a dated CHANGE LOG block referencing FEAT IDs; never silently rewrite scope—preserve traceability.

---
## 15. Immediate Next Actions (To Sprint Backlog)
Refer to `BACKLOG.md` – initial sprint seeds FEAT-001..FEAT-012.

---
## 16. Document Hierarchy
- PLAN.md (this): Roadmap & strategic framing
- ARCHITECTURE.md: Technical system design
- BACKLOG.md: Granular implementable tasks

---
## 17. Maintenance
Reviewed bi-weekly; versioned (increment minor on scope change). Keep PR template referencing affected FEAT IDs.

---
End of Plan.
