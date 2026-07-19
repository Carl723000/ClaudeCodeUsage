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
| `providers/codex/codexIndex.ts` | Persistent per-file numeric aggregates, cold/tail parsing, coverage, and atomic save/load. |
| `providers/codex/codexIndexWorker.ts` / `codexIndexClient.ts` | Background worker, recent-first progress, cancellation, resume, and single-flight client. |
| `providers/codex/codexProvider.ts` | Extension-facing Codex snapshot facade and partial/unavailable/error outcomes. |
| `providers/codex/codexUsage.ts` | Codex-specific task/7-day/30-day/project view-model aggregation. |
| `providers/codex/codexInsights.ts` | Deterministic structural usage guidance; no prompt/body inspection. |
| `codexView.ts` | Dependency-free Codex and Compare HTML renderers. |
| `settings.ts` | Canonical `SETTINGS` catalog and `SettingsStore`; do not scatter direct reads. |
| `statusBar.ts` / `codexStatus.ts` | Provider-specific status presentation and generic Claude quota formatting. |
| `webview.ts` | Existing Claude dashboard plus provider tabs and isolated Codex/Compare render slots. |
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
  ──> Codex status/dashboard

Claude view + Codex view ──> side-by-side Compare (no cross-provider totals)
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

## Refresh and scale

Claude polling always honors `refreshInterval`; its file watcher uses the
configured quiet debounce. Codex uses its own quiet debounce (default 30
seconds, configurable to Off/10/30/60/120/300).

Codex history is designed for 2.4-GB-class local corpora:

- discovery and parsing run outside the Extension Host in a worker;
- files are indexed recent-first with progress and cancellation;
- unchanged warm refresh reads no JSONL body;
- append refresh reads only the new tail and preserves an incomplete line;
- truncation/replacement reparses only the affected file;
- atomic persistence and per-file contributions allow resume after interruption;
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
