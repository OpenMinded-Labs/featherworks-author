# FeatherWorks Author – Backlog
Source of Truth for actionable items. Sync with PLAN.md & ARCHITECTURE.md.

Status: ✅ Done · 🚧 In Progress · ⏳ Planned · 💤 Deferred · 🔒 Pro

---
## W1 – MVP Authoring (FEAT-001..FEAT-020)
| ID | Title | Description | Acceptance | Status |
|----|-------|-------------|------------|--------|
| FEAT-001 | Doc Model Baseline | Implement JSON AST (doc, paragraph, text, marks) | Load/save roundtrip identical | 🚧 (core schema + serialization) |
| FEAT-002 | Formatting Marks | Bold/Italic/Underline/Strike support | Toolbar + shortcuts apply & persist | ⏳ |
| FEAT-003 | Editor Component Integration | Replace current plaintext with CM6/Monaco wrapper | Cursor, selection intact after save | ⏳ |
| FEAT-004 | Structure CRUD | Create/reorder Book→Chapter→Scene | Drag reorder updates DB order | ⏳ |
| FEAT-005 | Autosave Diff Engine | Generate diffs (Insert/Delete/FullReplace) & save on debounce | No lost edits after forced crash test | 🚧 (diff + patch infra) |
| FEAT-006 | Undo/Redo Stack | Command history with inverse patches | 500 ops w/o perf drop | 🚧 (in-memory ringbuffer) |
| FEAT-007 | Word/Char Count Worker | WebWorker counting + DB cache | Counts update <300ms after pause | ⏳ |
| FEAT-008 | Live WPM Metric | Rolling window WPM | WPM visible updates every 5s | ⏳ |
| FEAT-009 | Basic Search & Replace | Current scene search (plain + regex) | All matches highlighted, replace works | ⏳ |
| FEAT-010 | Focus Mode | Dim non-active paragraph | Toggle persists setting | ⏳ |
| FEAT-011 | Distraction-Free Fullscreen | Hide chrome; ESC exit | Smooth transition <200ms | ⏳ |
| FEAT-012 | Font & Spacing Settings | Font family/size/line-height adjustable | Setting persists & applies instantly | ⏳ |
| FEAT-013 | Scene Load Aggregation | Single payload load_full_project matured | API returns structure + scenes meta | ✅ |
| FEAT-014 | Project Metadata Editing | Title/Author inline update | Persist + optimistic UI | ✅ |
| FEAT-015 | Encrypted Export/Import | Export to encrypted container | Roundtrip test green | ✅ |
| FEAT-016 | Temp Project Handling | Banner & state for imported temp | Flag clears on Save-As | ✅ |
| FEAT-017 | Performance Baseline Bench | Script capturing save/wordcount timings | Bench report committed | 🚧 (criterion harness added) |
| FEAT-018 | Crash Recovery Journal (Skeleton) | Write rolling journal (no UI restore yet) | Journal file appears on edits | ⏳ |
| FEAT-019 | Settings Storage Refactor | Central settings service abstraction | All settings via service API | ⏳ |
| FEAT-020 | Test Coverage ≥ 65% Core | Add unit tests patch + autosave | Coverage report shows threshold | ⏳ |

## W2 – Structure & Metadata (FEAT-021..FEAT-040)
| ID | Title | Description | Acceptance | Status |
| FEAT-021 | Scene Status Field | Enum draft/wip/done | Displays badges in list | ⏳ |
| FEAT-022 | Plot Notes Table | Attach rich notes to scenes | Create/edit persists | ⏳ |
| FEAT-023 | POV Tracking | Scene foreign key to character | POV shows in structure tree | ⏳ |
| FEAT-024 | Goals (Daily Words) | Setting + progress bar | Reaches 100% when met | ⏳ |
| FEAT-025 | Project Dashboard | Aggregate stats view | Loads <500ms | ⏳ |
| FEAT-026 | Extended Metadata Fields | genre, target_pages, short_name | Fields editable & saved | ⏳ |
| FEAT-027 | Word Stats Aggregation | Per chapter/scene stored | Query returns aggregated map | ⏳ |
| FEAT-028 | FTS5 Integration | Full-text search across scenes | Multi-scene query <250ms (10k words) | ⏳ |
| FEAT-029 | Search Overlay UI | Ctrl+Shift+F overlay | Navigate next/prev works | ⏳ |
| FEAT-030 | Settings Sync to CSS Vars | Theming via custom properties | Live updates w/o reload | ⏳ |
| FEAT-031 | Snapshotting Strategy | Periodic full scene snapshots | Load doesn't replay >20 diffs | ⏳ |
| FEAT-032 | Scene Archive Pruning | Retain last N diffs after snapshot | Space usage stable | ⏳ |
| FEAT-033 | Recent Projects List | Persist MRU list | Open menu shows sorted | ⏳ |
| FEAT-034 | Project Templates | Seed from template JSON | Template appears in chooser | ⏳ |
| FEAT-035 | Plain Text Export | Baseline exporter | File matches content | ⏳ |
| FEAT-036 | Error Reporting Surface | Unified toast/error codes | Backend errors mapped nicely | ⏳ |
| FEAT-037 | Migration Framework | user_version with scripts | Migrations logged | ⏳ |
| FEAT-038 | Word Count Consistency Test | Cross-validate counts vs recompute | Test passes large sample | ⏳ |
| FEAT-039 | Developer Docs Update | Expand ARCHITECTURE diff | PR merges with doc update | ⏳ |
| FEAT-040 | Coverage ≥ 75% Structure | Additional tests | Report threshold met | ⏳ |

## W3 – Entities (FEAT-041..FEAT-060)
(Abbreviated for brevity; expand during W2 close)
- Character CRUD, attributes schema, highlighting, hover cards, relationship minimal, indexing pipeline, location DB, unified highlight API, performance benchmarks.

## W4 – Analysis (FEAT-061..FEAT-080)
- Analysis tasks, scheduler, persistence, UI panels, performance gating.

## W5 – Export Suite (FEAT-081..FEAT-100)
- DOCX import/export fidelity, PDF, ePub, templates editor, styling, golden tests.

... (Further waves to be elaborated as preceding waves mature)

---
## Cross-Cutting (Always Active)
| ID | Title | Description | Status |
|----|-------|-------------|--------|
| FEAT-X01 | Performance Budget Tracking | Automated bench harness | ⏳ |
| FEAT-X02 | Accessibility Pass | WCAG keyboard nav & contrast | ⏳ |
| FEAT-X03 | Memory Leak Watch | Long session soak tests | ⏳ |
| FEAT-X04 | Security Review | Crypto params & file perms audit | ⏳ |
| FEAT-X05 | Localization Framework | i18n pipeline & extraction | ⏳ |

---
## Engineering Tasks (Infra)
| ID | Title | Description | Status |
|----|-------|-------------|--------|
| ENG-001 | Service Layer Scaffolding | Introduce service modules directories | ⏳ |
| ENG-002 | DB Migration Script | Implement migration runner | ⏳ |
| ENG-003 | Test Utilities Module | Shared helpers for integration tests | ⏳ |
| ENG-004 | Benchmark Harness | Criterion-based bench suite | ⏳ |
| ENG-005 | Export Golden Fixtures | Sample docs for regression | ⏳ |

---
## Definitions of Done (DoD)
Each FEAT requires:
- Code + tests (unit/integration as applicable)
- Docs update (BACKLOG status, CHANGELOG excerpt)
- UI accessibility (keyboard reachable, ARIA where needed)
- Perf sanity (no new regression >10% in tracked benchmarks)
- No clippy/rustfmt/eslint errors

---
## Backlog Maintenance
Updated at end of each sprint; FEAT IDs immutable (do not reuse). New items append after highest number in wave range; if overflow, extend range.

---
End of Backlog.
