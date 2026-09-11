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

- **Done — X-06 brought forward from v2.3.3:** the existing Projects page now
  provides a shared, Token-only 30/90-day project × day heatmap and stacked
  daily trend for Claude and Codex. Exact tooltips, explicit coverage, bounded
  rows/cells/series, and an **Other projects** tail preserve truth and scale.
  Both providers reuse already-materialized indexes; opening or switching the
  matrix performs zero source-JSONL reads and adds no scanner, cache, timer,
  watcher, worker, dependency, or network path (`eaf2eb9`; model/index/UI tests).

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
  one compact dropdown selects a bundled currency preset and defaults to USD.
  The reference-rate snapshot is fixed and not user-editable; formatting is
  deterministic and carries `≈`, while underlying prices, aggregates, sorting,
  and persistence remain USD. No exchange-rate transport exists, provider-native
  usage credits bypass conversion, and both static and client-rendered drill-downs
  share the same formatter (`12bd21b`, refined in `c991d4f`).
- **Preserved — concise Settings:** keep the detailed local-data inventory and
  destructive clear-path reference in `LOCAL-DATA.md` /
  `LOCAL-DATA.zh-CN.md`; do not reintroduce the verbose panel into the normal
  plugin Settings surface.
- **Done — state-preserving live refresh:** ordinary same-shell data updates
  coalesce and replace only the active provider panel. The host-selected tab,
  drill-down chain, chart/hour selection, transient Optimizer input, keyboard
  focus, and nearest visible scroll anchor survive; a shell change or failed
  delivery falls back to a complete document (`3b46c09`).
- **Done — provider-qualified chart regions:** every chart scroller and heatmap
  receives a stable localized name composed from its provider, dashboard range,
  section, chart type, and current metric. Names update with metric changes and
  stay unique across the two Compare allowance charts (`fc6f53b`).
- **Done — Codex all-time month drill-down:** the host retains a complete daily
  view derived from the period slices already present in the index, while the
  share heatmap keeps its existing 370-day bound. Clicking a month transfers
  only that month, never rereads JSONL, and continues to the materialized hourly
  detail where rolling-hour coverage exists. Mouse, keyboard, nested state, and
  full-reload restoration are covered without an index-schema migration
  (`f51f29c`).

## P1: time-hierarchy chart drill-down

- All-time month bar: click or Enter/Space opens that month's daily data. The
  v2.3.2 candidate implements this for both providers (`f51f29c`).
- Last-30-days day bar: click or Enter/Space opens that day's hourly data. The
  v2.3.2 candidate materializes both provider paths (`84c84d7`).
- Today hour bar: use the same selected/highlight/detail feedback without inventing unsupported granularity.
- Claude and Codex share selection, `aria-expanded`, `aria-controls`, focus, empty-state, back/collapse, and responsive-layout behavior.
- Drill-down must use materialized month/day/hour aggregates and perform zero JSONL reads on click. An incomplete hourly migration shows explicit subtotal/coverage state rather than unverified legacy totals.
- Preserve the expanded chain, selected period, keyboard focus, and scroll anchor through live refresh. The v2.3.2 candidate now implements and tests this contract for ordinary Claude/Codex same-shell updates (`3b46c09`); structural changes retain the complete-reload path.
- Zero-fill missing calendar dates/hours inside a selected range so sparse activity does not distort axes or make the hierarchy appear shorter than the requested range.
- Hourly charts retain all zero-filled slots, axis labels, and table rows, but
  omit repeated zero value labels above the bars; genuine unpriced usage still
  shows `—` instead of being mistaken for no activity (`c991d4f`).

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
- Give every chart a provider-qualified accessible text alternative. The v2.3.2 candidate now labels all chart scrollers and heatmaps and verifies unique Compare names with the full Axe/keyboard suite (`fc6f53b`).
- Compare continues to combine only comparable activity; it never adds bills, allowances, or capability.

## P4: exit gate

- Maintain the tracked [provider parity matrix](provider-parity-matrix-v2.4.md), where every difference is aligned or intentionally different with a semantic rationale.
- Node fixtures cover non-UTC and DST conservation (`sum(hours) = day`, `sum(days) = month`, and Today uses the same day map), zero JSONL reads on click, quota thresholds, and Today status scope.
- Playwright covers mouse, Enter/Space, ARIA, focus, Light+/Dark+, 360 px, the longest locale, and drill-down/collapse flows.
- An isolated VS Code profile installs the VSIX and captures privacy-safe Claude/Codex Today status, quota tooltip, month-to-day, and day-to-hour evidence.
- After one read-only Claude CLI audit, allow one revision review for selected findings; all blockers close before candidate packaging.

## Later candidate (v2.6+): Remote-SSH and multi-host usage aggregation

This item is explicitly outside v2.4 and v2.5 and does not block either release.
For now, each Extension Host continues to read exactly one local `CODEX_HOME`:
Remote-SSH usage is visible separately only when the extension actually runs on
that remote Extension Host, and local plus remote hosts are not merged automatically.

- Any future implementation remains off by default and requires explicit host
  selection and pairing. SSH access, background synchronization, or remote
  scanning must never enter the ordinary refresh path implicitly.
- Hosts may exchange only versioned, bounded, privacy-safe numeric aggregates
  and coverage metadata. Raw JSONL, prompts/responses, thread titles, absolute
  paths, usernames, credentials, and full account identifiers never cross hosts.
- Token activity may be deduplicated and summed within stable pseudonymous
  host/source boundaries. Account allowance snapshots are never added across
  hosts: each allowance series uses its newest valid observation and displays
  the source host, observation time, and staleness explicitly.
- The dashboard must expose both combined values and per-host coverage. Offline
  hosts, disconnects, timezone differences, cross-host replay, and multiple
  sign-ins in one home remain visible uncertainty instead of invented history.
- Implementation requires a separate design and privacy gate covering Remote
  Extension Host lifecycle, resumable transfer, atomic checkpoints, cross-host
  deduplication, resource ceilings, and reversible clearing. No exact release
  is promised until those gates pass.
