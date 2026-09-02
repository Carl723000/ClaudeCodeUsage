# Local data and privacy

Claude Code Usage is local-first. It reads provider-owned usage logs, stores
only bounded derived state needed for fast refresh and reset-aware estimates,
and never treats API-equivalent cost as a bill.

This page is the user-facing inventory for v2.3.1. The normative field-level
contract is in
[`docs/superpowers/specs/2026-09-02-v2.3.1-local-data-contract.md`](docs/superpowers/specs/2026-09-02-v2.3.1-local-data-contract.md).

## What the extension reads and retains

| Data class | Source | What is retained by the extension | Retention and clearing | Remote interaction |
|---|---|---|---|---|
| Claude usage records | Claude Code's local `projects/**/*.jsonl` | Runtime usage records and an in-memory per-file index; bounded prompt samples only when content analysis is enabled | Released on window reload/exit. Data controls never touch source logs; the separately opt-in Session Actions feature may move one exactly confirmed log to the OS trash (recoverable) | None unless the user separately previews and sends an advice request |
| Codex usage records | `$CODEX_HOME/sessions/**/*.jsonl` and `archived_sessions/**/*.jsonl` | A versioned incremental index of pseudonymous file keys, offsets, numeric usage, dates, model/effort, and sanitized structural aggregates | Until rebuild, explicit clear, schema replacement, or host removal | None |
| Codex titles | Exactly `$CODEX_HOME/session_index.jsonl` | `id → thread_name` is streamed for runtime display; titles are not written to the index | Runtime only | None |
| Quota observations | Claude's official quota response or structured Codex rate-limit events | Provider, machine-local anonymous account epoch, observed/reset time, period, used/remaining fraction, anonymous window identity, source, confidence, and quality flags | At most 180 days and 512 observations per provider/account/period after boundary-preserving compaction; clear separately or with all derived data | Claude quota lookup contacts Anthropic when enabled; Codex quota evidence is local |
| Settings and UI preferences | User choices | Typed extension settings, selected tab/filters, bounded background-work state, heatmap title/range/privacy preview | Until reset, clear, or uninstall; ordinary VS Code settings may participate in Settings Sync | No extension-initiated transfer |
| Share destination | User-entered GitHub target | Optional `owner/repository/path`; no GitHub credential | Until sharing preferences are reset | Only after an explicit publish action and exact destination confirmation |
| Advice evidence | Derived local aggregates and explicit feedback | Coarse observations, recommendations, ratings, snoozes, comparable-task metrics, coverage, and versions | Bounded local ledger; clear independently | Nothing by default; only the exact previewed request is sent after a separate action |
| Advice API key | User-provided secret | Secret value in VS Code SecretStorage only | Until the key or all derived data is cleared | Used only as the authorization credential for the explicitly configured endpoint |

## What is never cached

- OAuth access or refresh tokens, cookies, authorization headers, or GitHub
  credentials.
- API keys outside VS Code SecretStorage.
- Full account identifiers, email addresses, display names, or subscription
  names. Account continuity uses a machine-local HMAC fingerprint or an
  isolated unattributed epoch.
- Raw prompt/response bodies, tool arguments, commands, complete CLI output,
  absolute source-log paths, repository remotes, or persistent thread titles.

Different anonymous account fingerprints are not merged. If local Codex logs
cannot establish one coherent account/window, the dashboard shows only used
API-equivalent value and explains why it cannot claim an account-level unused
allowance.

## Combined heatmap and exports

The Compare heatmap reuses daily provider aggregates; it does not scan logs
again or create another statistics cache.

```text
Claude processed = input + cache creation + cache read + output
Codex processed  = input total + output total
Combined activity = Claude processed + Codex processed
```

Codex cached input is already part of input total, and reasoning is already
part of output total, so neither is added again. Combined activity is local
token volume—not productivity, billing, model capability, or provider
equivalence.

Local SVG and Markdown exports contain only a bounded title, selected date
range, daily Claude/Codex/combined aggregates, labels, and caveats. They do not
contain accounts, projects, thread titles, paths, prompts, or log content.

Direct GitHub publication is optional and never runs in the background. v2.3.1
requests `public_repo`, verifies the repository is public and resolves its
default branch, then asks the user to confirm the exact
`owner/repository/branch/path` and whether the file will be created or replaced.
Private repositories use local SVG plus Markdown instead of silently requesting
broader access.

## Clear and migration behavior

The Data settings expose separate controls to rebuild the Codex derived index,
clear quota history, clear advice data, reset UI or sharing preferences, and
remove the BYOK secret. “Clear all extension-derived data” first lists its
targets. None of these controls deletes Claude or Codex source logs or
provider-owned credentials.

Clearing all quota history atomically replaces the quota store with one valid
empty schema-2 document and removes only its exact quarantine/interrupted-write
siblings under the same cross-process lease. A provider/account-only clear
fails closed when quarantined data or an unresolved legacy migration cannot be
assigned safely; the user may then explicitly choose the all-history clear.

Clear All deletes an exact catalog of released setting/state names, not every
key beginning with `ccu.setting.`. Unknown or future keys are preserved. Before
any mutation it checks all currently visible configuration scopes; an
unregistered legacy setting that VS Code cannot safely update blocks the whole
operation, leaves existing data intact, and is reported for manual removal.
Queued activation writes are drained before deletion and exact postconditions
are verified afterward. If the Webview cannot acknowledge its allowlisted
browser-state reset, a value-free pending action marker is retried on the next
panel open instead of reporting a false success.

This clearing boundary is separate from the opt-in Session Actions feature.
That feature can move one user-selected Claude session log to the OS trash only
after its own modal confirmation; it never participates in Clear All.

v2.3.1 validates and atomically migrates known legacy quota/config state before
removing the legacy copy. Corrupt or future-schema files fail closed; an old
valid file is not overwritten until the replacement validates. Uninstall may
leave host-managed extension storage behind, so the explicit clear command is
the reliable deletion route.

VS Code only lets the running extension inspect Global, the current Workspace,
and currently open Workspace Folder configuration scopes. A legacy value that
exists only in a closed workspace remains there until that workspace is opened
and the clear control is run again (or the setting is removed manually).

## Known limits

- A reset that never appears in an official response or local structured event
  cannot be reconstructed. Day-only Codex evidence lowers boundary confidence.
- Local Codex histories may include several sign-ins. Ambiguous overlap remains
  used-only; the extension never invents an account split.
- API-equivalent values use currently known public API prices and pricing
  coverage. They are estimates, not provider bills or subscription prices.
- Retention of source logs is controlled by Claude Code and Codex, not this
  extension.
