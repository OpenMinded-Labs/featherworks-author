# Performance Baseline – FeatherWorks Author
Date: 2025-10-06
Scope: W1 Early Patch/Undo Infrastructure

## Targets (from PLAN)
- Patch apply p95 < 25ms (large 25–30k char scenes)
- Undo/Redo p95 < 20ms
- Autosave debounce processing < 40ms (word count + patch persist)

## Current Bench Harness
Benchmark: `apply_full_replace_large` (~28k chars)
Command (dev): `cargo bench --bench patch_bench apply_full_replace_large`

(Execution not captured yet – run locally to fill figures.)

## Planned Metrics Table
| Metric | Current p50 | Current p95 | Goal p95 | Notes |
|--------|-------------|-------------|----------|-------|
| FullReplace Apply (28k) | TBD | TBD | <25ms | Baseline no diff compression |
| InsertText (10 char) | TBD | TBD | <2ms | To be added to bench |
| DeleteRange (20 char) | TBD | TBD | <2ms | To be added |
| Undo (FullReplace) | TBD | TBD | <10ms | In-memory apply |
| Redo (FullReplace) | TBD | TBD | <10ms | In-memory apply |
| Snapshot Apply Cost | TBD | TBD | <30ms | Occurs every 25 patches |

## Next Performance Actions
1. Add micro benchmarks for Insert/Delete
2. Add memory profiling (RSS baseline during 500 patch loop)
3. Journal write latency measurement (fsync vs buffered) – maybe batch
4. Introduce optional compression for large FullReplace patches (later waves)

## Instrumentation Plan
- Add feature flag `perf_instrument` to record durations (std::time::Instant) → ring buffer expose over dev command
- Export JSON metrics to `.featherworks/perf.json` (local only)

## Risk Watch
- Large scenes > 150k chars: consider incremental rope structure if apply > 60ms
- Journal growth: enforce rotation at size threshold (e.g. 5MB)

## TODO
- [ ] Capture first real numbers
- [ ] Add Insert/Delete benches
- [ ] Add memory snapshot script

End of PERF baseline.
