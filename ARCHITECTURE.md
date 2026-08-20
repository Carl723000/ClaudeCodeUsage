# Architecture

> A concise map of the extension's provider boundaries, data flow, and usage
> semantics. Update it whenever module ownership or provider behavior changes.
> A faithful Simplified-Chinese companion lives in
> [`ARCHITECTURE-zh-CN.md`](ARCHITECTURE-zh-CN.md).

## Product boundary

**Claude Code Usage** remains local-first, dependency-free, and read-mostly.
v2.3.0 preserves the complete Claude experience and adds Codex Beta as a
provider-specific usage and optimization view.

- Claude: exact local token buckets, model pricing estimates, and Anthropic
  OAuth 5-hour/weekly quota.
- Codex Beta: local processed/fresh/cache/output/reasoning metrics, model and
  effort breakdowns, thread structure, index coverage, quality flags, and
  structural optimization guidance.
- Compare: side-by-side compatible metrics only. It never sums provider cost,
  quota, or tokens into a misleading combined total.

Full invoice reconciliation, driving either coding agent, and background
telemetry are out of scope. Opt-in GitHub authentication and cross-device
aggregate sync are deferred to v2.4.x after a separate privacy review.

## Module map (`src/`)

| Module | Role |
|---|---|
| `extension.ts` | Activation, commands, settings, provider lifecycle, refresh orchestration, watchers, status/webview wiring, and anonymous diagnostics. |
| `dataLoader.ts` | Existing Claude discovery, parsing, deduplication, attribution, content analysis, and aggregation. |
| `providers/providerTypes.ts` | Provider-neutral token, event, confidence, outcome, coverage, and limit contracts. |
| `providers/claudeProvider.ts` | Thin compatibility adapter that exposes existing Claude aggregates without changing their results. |
| `providers/codex/codexSchema.ts` | Minimal safe JSON guards; never flattens or returns message/command/tool bodies. |
| `providers/codex/codexParser.ts` | Codex cumulative high-water parsing, pseudonymous lineage metadata, structural counters, quality flags, and last-observed limits. |
| `providers/codex/codexManifest.ts` | Allowlisted Codex directory discovery, HMAC file keys, fingerprints, and manifest diffing. |
| `providers/codex/codexIndex.ts` | Schema-2 persistent per-file numeric aggregates, bounded cold/tail parsing, independent aggregate/period coverage, and atomic save/load. |
| `providers/codex/codexIndexWorker.ts` / `codexIndexClient.ts` | Background worker, recent-first progress, cancellation, resume, and single-flight client. |
| `providers/codex/codexProvider.ts` | Extension-facing Codex snapshot facade and partial/unavailable/error outcomes. |
| `providers/codex/codexUsage.ts` | Codex-specific task/7-day/30-day/project view-model aggregation. |
| `providers/codex/codexInsights.ts` | Deterministic structural usage guidance; no prompt/body inspection. |
| `codexView.ts` / `codexViewComponents.ts` | Codex localized-copy and default-provider contracts; no HTML renderer, client script, or CSS ownership. |
| `settings.ts` | Canonical `SETTINGS` catalog and `SettingsStore`; do not scatter direct reads. |
| `statusBar.ts` / `codexStatus.ts` | Provider-specific status presentation and generic Claude quota formatting. |
| `webview.ts` | Single provider-aware Claude/Codex dashboard shell, shared render functions, shared client behavior, provider tabs, and Compare presentation. |
| `i18n.ts` | All user-facing copy for all eight UI locales. |
| `types.ts` | Shared extension and Claude contracts. |

Existing pure modules such as `quotaFormat.ts`, `dateKeys.ts`, `shareCard.ts`,
`heatmap.ts`, `conversationLog.ts`, and `miniMarkdown.ts` keep their current
ownership and tests.

## Provider data flow

```text
Claude JSONL ──> ClaudeDataLoader ──> Claude adapter ──> Claude status/dashboard

allowlisted Codex JSONL
  ──> manifest metadata
  ──> background worker
  ──> schema guard + lineage high-water parser
  ──> per-file numeric aggregate index
  ──> CodexProviderSnapshot
  ──> Codex scopes + insights
  ──> Codex status + provider-aware dashboard render inputs

Claude aggregates + Codex scopes ──> one `webview.ts` dashboard render stack
Claude aggregates + Codex scopes ──> side-by-side Compare (no cross-provider totals)
```

One provider may be unavailable or partial without clearing the other
provider's last verified snapshot. Claude-only remains the v2.2.1 behavior;
Codex-only defaults to Codex; when both exist, the dashboard defaults to Claude.

## Token and limit semantics

Claude records carry Anthropic's four token buckets. The extension validates,
deduplicates, sums, and prices them by model. Claude cost remains an estimate
from the configured rate table; it is not an invoice.

Codex uses these rules:

- processed = `input total + output total`
- fresh input + output = `max(0, input total - cached input) + output total`
- cached input is a subset of input; reasoning output is a subset of output
- neither subset is added again to processed totals
- fresh input + output is an optimization aid, not a cost/quota equivalence

Codex `total_token_usage` is cumulative and may include an inherited parent
baseline. Parsing therefore uses per-component, per-lineage high-water marks.
Unknown parents, regressions, and schema drift produce quality flags rather
than negative or fabricated usage.

Codex `rate_limits.primary` found in local logs is a last-observed snapshot only.
It is hidden once its reset time passes. v2.3.0 does not read Codex credentials
or make a network call to refresh it.

## Privacy and persistence

Codex discovery is restricted to:

- `$CODEX_HOME/sessions/**/*.jsonl`
- `$CODEX_HOME/archived_sessions/**/*.jsonl`
- default `$CODEX_HOME`: `~/.codex`

It never reads `auth.json`, SQLite databases, config secrets, keychains, browser
state, or unknown files. Raw paths/session/parent IDs stay in short-lived local
worker memory. Disk persistence contains machine-salted pseudonymous keys and
numeric per-day/model/effort/session aggregates only—never prompt, response,
command, tool-argument, raw-line, or raw-path content.

The machine salt lives in VS Code `globalState`, not in the index file. Worker
progress/results/errors and diagnostics contain anonymous counts and timings,
not paths or identifiers.

### Schema 3 index contract

Schema 3 deliberately keeps the established `globalStorage` filename
`codex-index-v1.json`; the filename is a compatibility path, not a statement
about the JSON schema. Its persisted DTO is an explicit allowlist of numeric
aggregates, enum values, pseudonymous keys, cleaned labels, and opaque
fingerprints derived only from numeric token-counter vectors. A v3 file never
stores a raw incomplete line or a carry buffer. The only reader for those old
fields is the explicitly named legacy schema-1 migration boundary; it discards
the carry before the v3 index is saved. Schema-1 and schema-2 indexes are marked
for a bounded lineage rescan; their prior totals are not retained and added to
the rebuilt result.

Each physical rollout locks its first reliable session and tree identity. An
ordered numeric-event fingerprint trace then finds the copied prefix of a child
inside its verified parent while retaining every independent sibling suffix.
Nested forks and separate fork epochs apply their own prefix once. If the
reported parent is absent, the child stays conservatively counted in full and a
visible `missing-parent` quality warning replaces silent subtraction. Counter
regressions use component high-water containment; they never create negative
deltas or count a reset gap again. A verified ordered overlap for the same
pseudonymous session across active/archive copies is likewise counted once,
while conflicting identity metadata still keeps identity coverage incomplete.

There are two separate truth layers. The all-time view is built from the
verified aggregate of canonical file contributions. Time-bucketed period slices
are promoted independently, so a partial migration cannot overwrite, inflate,
or stand in for that all-time verified aggregate. Period coverage is anchored by
the target-zone `asOfDay` and reports separate 7-day, 30-day, and all-time
states. The 7/30-day views sum events in their natural calendar days; they do
not pull an entire older session into a range merely because the session's last
activity falls inside it.

Identity is also a coverage contract. Git SCP-style SSH and HTTPS repository
URLs are canonicalized to the same repository identity where their host/path
matches. Root titles use the latest trusted `updated_at` title, subagents retain
their reported nickname plus parent title, projects prefer the canonical
repository name over a directory fallback, and recent-task ordering uses the
maximum activity observed across a complete lineage. A strictly exact
active/archive pair is deduplicated only after both copies are verified and
their safe signatures agree; any other repeated session is ambiguous and keeps
identity coverage incomplete rather than guessing.

The five structural call proxies are `patchCalls`, `toolCalls`,
`postPatchToolCalls`, `compactCount`, and `taskCompleteCount`. They describe
observed structural envelopes only, not file, command, or review counts. They
produce no dollar cost and are never derived from prompt, response, command
body, or tool-argument content.

## Refresh and scale

Claude polling always honors `refreshInterval`; its file watcher uses the
configured quiet debounce. Codex uses its own quiet debounce (default 30
seconds, configurable to Off/10/30/60/120/300).

Codex history is designed for 2.4-GB-class local corpora:

- discovery and parsing run outside the Extension Host in a worker;
- files are indexed recent-first with progress and cancellation;
- unchanged warm refresh reads no JSONL body;
- each refresh has a 16 file passes / 32 MiB budget; the safe minimum is
  1 MiB + 1 byte, reads use 256 KiB chunks, and a JSONL line is capped at 1 MiB;
- append refresh reads only the new tail; an incomplete line stays only in the
  scanner's short-lived memory and is retried from the safe cursor, never in v3;
- truncation/replacement reparses only the affected file;
- cancellation checkpoints atomically save per-file contributions and migration
  progress, so the next run resumes from the verified cursor;
- concurrent refresh requests share one worker run.

## Release invariants

- Strict TypeScript, red-green TDD, full `node:test`, F5 smoke test, and installed
  VSIX smoke test are required in proportion to the change.
- User-visible strings cover `en`, `de-DE`, `zh-TW`, `zh-CN`, `ja`, `ko`,
  `pt-BR`, and `id`; all seven README editions move together.
- `package.json` is not manually version-bumped. Publishing the reviewed Release
  Drafter draft creates the tag; the publish workflow stamps that tag version.
- Contributor PR attribution is preserved by merging the contributor's original
  PR or, with authorization, adjusting that PR branch before merge.
