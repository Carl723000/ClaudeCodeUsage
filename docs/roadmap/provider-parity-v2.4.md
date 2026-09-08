# v2.4 Claude / Codex interaction-parity roadmap

This roadmap follows the v2.3.1 regression fixes. Its goal is to give equivalent information the same interaction, visual hierarchy, keyboard behavior, and feedback without pretending that Claude and Codex expose equivalent metrics. It is outside the v2.3.1 release scope; every item starts with a minimal failing fixture.

Current audit ledger: [简体中文](provider-parity-matrix-v2.4.zh-CN.md) ·
[English](provider-parity-matrix-v2.4.md).

## P0: inventory and independent audit

- Build a component-by-component Claude/Codex matrix covering status items, quota tooltips, summary cards, charts, tables, disclosures, empty/loading/error states, filters, sorting, drill-down, return paths, narrow layouts, and light/dark themes.
- Before adding a drill-down affordance, prove the required aggregate exists for each provider and source. Codex's materialized hourly sidecar is the first feasibility gate. If a source cannot support the same level truthfully, record an intentional semantic difference and offer a provider-appropriate detail (or no affordance) instead of a dead or invented chart.
- Run one read-only Claude CLI audit over production HTML/CSS/TypeScript and installed-build screenshots, classifying findings as missing, behavior mismatch, visual mismatch, or intentional semantic difference.
- The audit may use only source, synthetic fixtures, and privacy-safe screenshots; no account data, paths, thread titles, prompts, log bodies, or credentials.

## P0.5: accepted post-v2.3.1 audit follow-ups

At the start of the v2.3.2 stabilization branch, the accepted items have the
following status. Commit identifiers refer to the local candidate branch and
become release evidence only after maintainer review and merge.

- **Done — watcher recovery:** failed Claude/Codex file watchers rearm with
  bounded exponential backoff while polling remains the safe fallback. Tests
  cover repeated failure, recovery, and disposal without a hot loop
  (`cd7a100`).
- **Done — title-index cache:** `session_index.jsonl` is cached by verified
  size/mtime/device/inode with before/after race detection. Titles remain
  memory-only and every non-title field remains ignored (`e89784d`).
- **Done — time semantics and error boundary:** Webview rolling-30-day data no
  longer masquerades as a calendar month, and the unused hourly cache is gone.
  The stable `month` DOM tab id remains temporarily as a persistence-compatibility
  contract. Dynamic share errors now use DOM `textContent`, not HTML insertion
  (`d840976`, `e96c45a`).
- **Done — quality and quota migration:** all eight locales explain a non-zero
  `component-delta-clamped` flag. Quota compaction preserves the oldest and
  newest series endpoints before other window boundaries, with a small-retention
  migration fixture (`d840976`).
- **Done — browser boundaries:** an Advice snooze stays closed and resumable
  after a full Webview reload. Compare summaries remain provider-native token
  cards while cost and allowance stay in two provider-qualified panels
  (`cd482a5`).
- **Decided — legacy Claude Share Card:** do not expand a second sharing-settings
  surface. v2.3.x retains the current command, renderer, and export compatibility;
  v2.4 converges provider-specific export into the Compare sharing studio, then
  removes the old panel only after documentation migration and compatibility
  tests. New sharing capabilities go only into the unified studio.
- **Done — [#91](https://github.com/ClaudeCodeUsage/ClaudeCodeUsage/issues/91):**
  local display preferences accept a user-entered units-per-USD rate and bounded
  currency code/symbol. Formatting is deterministic and carries `≈`; underlying
  prices, aggregates, sorting, and persistence remain USD. No exchange-rate
  transport exists, provider-native usage credits bypass conversion, and both
  static and client-rendered drill-downs share the same formatter (`12bd21b`).
- **Preserved — concise Settings:** keep the detailed local-data inventory and
  destructive clear-path reference in `LOCAL-DATA.md` /
  `LOCAL-DATA.zh-CN.md`; do not reintroduce the verbose panel into the normal
  plugin Settings surface.

## P1: time-hierarchy chart drill-down

- All-time month bar: click or Enter/Space opens that month's daily data.
- Last-30-days day bar: click or Enter/Space opens that day's hourly data.
- Today hour bar: use the same selected/highlight/detail feedback without inventing unsupported granularity.
- Claude and Codex share selection, `aria-expanded`, `aria-controls`, focus, empty-state, back/collapse, and responsive-layout behavior.
- Drill-down must use materialized month/day/hour aggregates and perform zero JSONL reads on click. An incomplete hourly migration shows explicit subtotal/coverage state rather than unverified legacy totals.
- Preserve the expanded chain, selected period, keyboard focus, and scroll anchor through live refresh. Define which of those states survives a webview reload and test that contract explicitly.
- Zero-fill missing calendar dates/hours inside a selected range so sparse activity does not distort axes or make the hierarchy appear shorter than the requested range.

## P2: status bar and quota detail

- Both providers use configured-timezone Today for the main item and a structured tooltip table.
- Five-hour/weekly quotas share used-percent semantics, green/amber/red thresholds, progress bars, reset columns, and keyboard-reachable entry points.
- The status-item background follows the worst live window that the current preference renders; expired and no-observation states never leave a stale warning colour or an empty tooltip table.
- Evidence remains honest: Claude is official `/usage`; Codex is a last local observation. Visual parity must not imply equal authority.

## P3: component and state parity

- Align summary-card density, numeric typography, units, help copy, zero values, unpriced values, and indexed-subtotal treatment.
- Align table sorting, numeric alignment, row expansion, scrollers, empty rows, and narrow layouts.
- Align disclosure defaults, hit areas, focus treatment, and persistence rules.
- Align loading, no-data, partial-index, stale-observation, and error hierarchy while retaining provider-specific causes.
- Give every chart a provider-qualified accessible text alternative. In Compare, controls and regions must have unique accessible names even when the visible label is shared.
- Compare continues to combine only comparable activity; it never adds bills, allowances, or capability.

## P4: exit gate

- Maintain the tracked [provider parity matrix](provider-parity-matrix-v2.4.md), where every difference is aligned or intentionally different with a semantic rationale.
- Node fixtures cover non-UTC and DST conservation (`sum(hours) = day`, `sum(days) = month`, and Today uses the same day map), zero JSONL reads on click, quota thresholds, and Today status scope.
- Playwright covers mouse, Enter/Space, ARIA, focus, Light+/Dark+, 360 px, the longest locale, and drill-down/collapse flows.
- An isolated VS Code profile installs the VSIX and captures privacy-safe Claude/Codex Today status, quota tooltip, month-to-day, and day-to-hour evidence.
- After one read-only Claude CLI audit, allow one revision review for selected findings; all blockers close before candidate packaging.
