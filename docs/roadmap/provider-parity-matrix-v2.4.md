# v2.4 provider parity matrix

[简体中文](provider-parity-matrix-v2.4.zh-CN.md) · English

Snapshot: 2026-09-09, local candidate branch `codex/v2.3.2-stabilization`.
Commit identifiers are development evidence, not published-release claims.

This matrix records interaction parity without pretending Claude and Codex
expose equivalent data. “Aligned” means the user interaction and visual
hierarchy match. “Intentional difference” means the available source evidence
does not support the same behavior. “Partial” means a known contract remains to
be implemented or verified. “Candidate” means the behavior exists only on the
local branch and has passed its listed tests.

## Component matrix

| Area | Claude | Codex | Status | Evidence and boundary |
|:--|:--|:--|:--|:--|
| Provider navigation | Shared tablist, automatic activation, roving keyboard focus | Same | Aligned | `providerNavClient.ts`; keyboard and Axe coverage in `tests/ui/codex-accessibility.spec.mjs` |
| Dashboard navigation | Today / Last 30 days / All time plus Claude-supported destinations | Same shared tabs, with unsupported Branches and Workflows omitted | Aligned with intentional destination difference | `showTab` owns one state and ARIA path; `codex-interactions.spec.mjs` covers navigation and reload |
| Summary cards | Claude cost, messages, token/cache totals | Qualified API-equivalent value and Codex-native token totals | Aligned layout, intentional metrics | Shared production stylesheet and geometry contracts in `codex-visual.spec.mjs` |
| Model disclosures | Green displayed cost, token detail in disclosure | Green API-equivalent value, Codex-native token detail | Aligned | `codex-visual.spec.mjs` verifies headline meaning and shared disclosure geometry |
| Today hourly primary chart | Cost and token/message switches | API-equivalent value and Codex token/thread switches | Aligned | Both use the same chart controls, grid, stacked cost treatment, and configured-zone hour labels |
| Today hourly selection | Selectable hour, synchronized detail line and table row | Same | Candidate (`fbaa693`) | Mouse, Enter, Space, metric synchronization, no host message, reload restoration, and tab-reset behavior pass in `codex-interactions.spec.mjs` |
| Today token composition | Claude input, cache write, cache read, output | Fresh input, cached input, output; reasoning remains a subset note rather than a second output segment | Aligned with intentional token semantics | Shared composition renderer; Codex never double-counts reasoning |
| Last-30-days primary chart | Daily values and metric switches | Same interaction with Codex-native metrics | Aligned | Shared chart stack and `chart-date-labels.spec.mjs`; configured-zone daily keys remain stable |
| Last-30-days day → hour | Click/table disclosure uses a bounded rolling-hour DTO already embedded in the Webview | Click/table disclosure uses the persisted rolling-hour sidecar in the Webview | Candidate (`84c84d7`) | Neither path sends a host message or rereads JSONL on click. Claude transfers sparse active-hour rows and completes the selected day to an exact 24-hour presentation in the browser; days without materialized detail expose no dead control |
| All-time month → day | Click/table disclosure regroups already loaded records by configured-zone day | No entry: the Codex index currently exposes monthly all-time rows but only rolling-30-day daily rows | Intentional difference | Do not add a dead Codex control. Add parity only after an audited all-time daily aggregate exists with bounded storage |
| Chart expansion semantics | One expanded period, matching table button and chart state, `aria-expanded` / `aria-controls` | Same for supported day → hour rows | Aligned | Reload and keyboard contracts pass in `codex-interactions.spec.mjs` and `codex-accessibility.spec.mjs` |
| Empty / partial hourly detail | Claude no-data response inside the controlled row | Explicit no-data row plus hourly migration coverage | Aligned hierarchy, intentional provenance copy | Codex never falls back to unverified legacy totals |
| Missing-period zero fill | Today presents all 24 hours; Last 30 days presents exactly 30 configured-zone civil dates without widening source aggregates | Complete Today coverage presents all 24 hours; partial indexing stays sparse; Last 30 days presents exactly 30 dates | Candidate (`7b86a54`) | Synthetic zero rows render as real zero values rather than unpriced data. Claude zero days expose no dead drill-down control. Helper unit tests and `time-range-presentation.spec.mjs` cover the exact ranges |
| Metric persistence | Selected metric survives full Webview reload | Same | Aligned | `chartMetrics` state and browser coverage |
| Expansion / selection persistence | Expansion and Today-hour selection survive Webview reload and reset on a user-initiated top-tab switch | Same for supported interactions | Candidate (`3b46c09`) | Ordinary same-shell refresh replaces only the provider panel and preserves the host-selected tab, expanded chain, chart/hour selection, transient Optimizer input, keyboard focus, and nearest visible anchor. Same-turn updates coalesce; structural changes or failed delivery fall back to a complete document. Node and Playwright coverage exercise Claude and Codex |
| Page scroll | Debounced per-provider/tab position plus nearest-anchor restoration during live replacement | Same | Candidate (`3b46c09`, `7b86a54`) | Continuous scrolling writes once after the gesture; late Chromium scroll/pagehide events cannot synchronously rewrite an identical position. Live replacement restores the nearest visible stable element; complete reload restoration remains covered in `codex-interactions.spec.mjs` |
| Tables | Shared numeric alignment, sortable semantics where applicable, bounded horizontal scrollers | Same | Aligned | Keyboard sorting, 360 px, long-locale, and desktop overflow tests |
| Weekly allowance-value detail | Provider-qualified Claude panel; details collapsed by default | Separate provider-qualified Codex panel; details collapsed by default | Aligned layout, intentional evidence authority | Claude uses official observations; Codex uses local last-observed evidence. Compare never sums them |
| Status-bar quota detail | Official `/usage`, shared progress table and thresholds | Last-observed local evidence, same progress table and thresholds | Aligned layout, intentional authority | Provider-specific provenance stays visible and must never be inferred from matching colors |
| Sharing | Legacy Claude export remains compatible during v2.3.x | Compare studio exports privacy-safe provider components | Partial by decision | New sharing work goes only to the Compare studio; legacy removal waits for documentation and compatibility migration |
| Settings | Concise provider-aware controls | Same | Aligned | Detailed local-data inventory and destructive controls remain repository documentation only |
| Accessible chart alternatives | Interactive controls have names and state; empty states are live regions | Same | Partial | Every complete chart still needs one provider-qualified text alternative or labelled region, including duplicate-looking Compare regions |
| Installed VSIX evidence | Not yet captured for this branch | Not yet captured for this branch | Partial | Candidate packaging must capture privacy-safe real VS Code screenshots for status, quota, and both supported drill-down levels |

## Read and persistence boundaries

| Interaction | Source read allowed on activation | Persisted across Webview reload | Reset boundary |
|:--|:--|:--|:--|
| Today hour selection | None; DOM state only | Selected hour and selected metric | User switches the top dashboard tab |
| Last 30 days day → hour (Claude) | Existing materialized Webview DTO only; no host message | Expanded day and metric | User switches the top dashboard tab |
| Last 30 days day → hour (Codex) | Existing materialized Webview DTO only; no host message | Expanded day and metric | User switches the top dashboard tab |
| All time month → day (Claude) | Existing in-memory records only; no filesystem read | Expanded month and metric | User switches the top dashboard tab |
| Sort / filter | Existing rendered DTO only | Sort, session range, and model filter | Explicit user change or UI reset |
| Scroll | Browser scroll position only | Per provider and dashboard tab | UI reset |
| Live data replacement | Newly rendered provider-panel HTML plus the bounded Claude rolling-hour DTO; no source-log read in the client | Active tab, expansion chain, chart/hour selection, transient focused control, keyboard focus, and nearest visible anchor | Structural shell change, provider change, rejected delivery, or UI reset |

No interaction in this table may initiate a JSONL rescan. A new aggregation
must be built during the existing index/update pass and transferred through a
bounded DTO before a new drill-down control is added.

## Next implementation order

1. Add provider-qualified labelled chart regions or text alternatives and test
   duplicate-looking Compare regions for unique accessible names.
2. Decide whether an all-time Codex daily aggregate has acceptable storage and
   migration cost. Until then, month → day remains an explicit semantic
   difference rather than a nonfunctional control.
3. Capture the installed-VSIX status, quota, and supported drill-down evidence
   before candidate packaging.
