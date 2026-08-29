# Claude cold-build A/B — v2.3.1 candidate

This is a fixed-corpus measurement, not a release benchmark. Both runs used the same deterministic one-file Claude JSONL fixture (50,000 assistant records spanning 365 calendar days) and `America/New_York`.

| run | body reads | bytes | parsed lines | elapsed | hourly buckets |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline, per-record zone/hour helpers | 1 | 17,227,780 | 50,000 | 15,885.58 ms | 8,759 |
| candidate, one formatter + recent-hour window | 1 | 17,227,780 | 50,000 | 6,791.68 ms | 764 |
| candidate warm unchanged | 0 | 0 | 0 | 13.47 ms | unchanged |

The comparison supports the narrow optimization: formatter construction and unbounded hour materialization were a material part of cold-build time. Day, month, all-time and record semantics remain unchanged; only the transient hourly sidecar is limited to the configured recent 30 civil days. Historical date expansion still uses the in-memory visible records and never reopens JSONL.

Resource ownership remains single-producer: the existing Claude incremental index owns parsing and aggregates; the existing refresh coordinator owns its watcher/timer lifecycle. Codex migration keeps its existing worker/index producer, with a 10-second blur deadline for the one bounded first-history exception. The deadline cancels cooperatively, checkpoints the safe cursor, and leaves the persisted background state eligible for resume. Warm unchanged refreshes read zero JSONL bodies, and disabling or disposing the extension releases timers, watchers, workers, network leases, and backfill leases with no long-lived resource left behind.

This fixture does not claim a 2.4-GB wall-clock or energy benchmark; that remains a release-candidate dependency.
