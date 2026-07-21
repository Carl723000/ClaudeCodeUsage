import {
  CodexInsight,
  CodexInsightEvidenceKey,
  CodexInsightKind,
  CodexScopedInsights,
} from './providers/codex/codexInsights';
import {
  CodexDailyUsageView,
  CodexBehaviorView,
  CodexMetricTotals,
  CodexPeriodUsageView,
  CodexThreadUsageView,
  CodexUsageScopeView,
  CodexUsageView,
  tokenComposition,
} from './providers/codex/codexUsage';
import { CodexLimitView } from './providers/codex/codexLimits';
import {
  createCodexLocalizedFormatters,
} from './codexFormat';

export interface CodexViewCopy {
  title: string;
  beta: string;
  overview: string;
  explore?: string;
  recommendations?: string;
  daily: string;
  date: string;
  role: string;
  scope: string;
  threadLabel: string;
  unnamedSession: string;
  unidentifiedProject: string;
  parentThread: string;
  searchThreads: string;
  all: string;
  localDirectory: string;
  lastActive: string;
  expand: string;
  rootRole: string;
  childRole: string;
  approvalReviewerRole: string;
  unknownRole: string;
  noDailyData: string;
  noMonthlyData?: string;
  noThreadData: string;
  lastTask: string;
  last7Days: string;
  last30Days: string;
  allTime: string;
  behavior: string;
  settings: string;
  monthly: string;
  tokenComposition: string;
  freshInput: string;
  reasoningSubset: string;
  threadRoleComposition: string;
  childThreadsPerRootTask: string;
  childFreshShare: string;
  approvalFreshShare: string;
  highEffortFreshShare: string;
  processedToFreshRatio: string;
  reasoningOutputShare: string;
  postPatchToolCallsPerPatchCall: string;
  patchCalls: string;
  compactions: string;
  projects: string;
  projectLabel: string;
  processed: string;
  fresh: string;
  input: string;
  cachedInput: string;
  output: string;
  reasoning: string;
  models: string;
  efforts: string;
  threads: string;
  rootTasks: string;
  childThreads: string;
  approvalReviewers: string;
  duration: string;
  cacheShare: string;
  coverage: string;
  quality: string;
  complete: string;
  partial: string;
  lastObserved: string;
  usageLimits: string;
  resets: string;
  credits: string;
  unlimited: string;
  unavailable: string;
  optimization: string;
  structuralProxy: string;
  pasteConstraint: string;
  constraintNoAgents: string;
  constraintLowerEffort: string;
  constraintPostPatch: string;
  constraintCacheContext: string;
  constraintApprovalReviewer: string;
  /** @deprecated Legacy locale overrides; no recommendation renderer uses these. */
  constraintTests?: string;
  /** @deprecated Legacy locale overrides; no recommendation renderer uses these. */
  constraintStop?: string;
  recommendationComposition: string;
  recommendationProxyKpi: string;
  recommendationEmpty: string;
  recommendationPartial: string;
  insightObservation: string;
  insightEvidence: string;
  insightConditionalAction: string;
  insightObservations: Record<CodexInsightKind, string>;
  insightTips: Record<CodexInsightKind, string>;
  insightEvidenceLabels: Record<CodexInsightEvidenceKey, string>;
  compareTitle: string;
  noRecentTask: string;
  sessions: string;
  modelsEffort: string;
  clearFilters: string;
  activeFilters: string;
  parentTask?: string;
  fiveHourWindow?: string;
  weeklyWindow?: string;
  used?: string;
  remaining?: string;
  localLogNotLive?: string;
  accountSnapshotLastObserved?: string;
  limitExpired?: string;
  limitMissing?: string;
  observedSessionDuration?: string;
  insightTitles: Record<CodexInsightKind, string>;
}

export const CODEX_COPY_EN: CodexViewCopy = {
  title: 'Codex usage',
  beta: 'Beta',
  overview: 'Overview',
  explore: 'Explore',
  recommendations: 'Recommendations',
  daily: 'Daily',
  date: 'Date',
  role: 'Role',
  scope: 'Scope',
  threadLabel: 'Thread',
  unnamedSession: 'Unnamed session',
  unidentifiedProject: 'Unidentified project',
  parentThread: 'Parent',
  searchThreads: 'Search sessions',
  all: 'All',
  localDirectory: 'Local folder',
  lastActive: 'Last active',
  expand: 'Expand',
  rootRole: 'Root',
  childRole: 'Subagent',
  approvalReviewerRole: 'Approval reviewer',
  unknownRole: 'Unknown',
  noDailyData: 'No daily Codex usage is indexed yet.',
  noMonthlyData: 'No monthly Codex usage is indexed yet.',
  noThreadData: 'No Codex threads are indexed yet.',
  lastTask: 'Recent task',
  last7Days: 'Last 7 days',
  last30Days: 'Last 30 days',
  allTime: 'All time',
  behavior: 'Behavior',
  settings: 'Settings',
  monthly: 'Monthly',
  tokenComposition: 'Token composition',
  freshInput: 'Fresh input',
  reasoningSubset: 'Reasoning is included within output',
  threadRoleComposition: 'Thread-role composition',
  childThreadsPerRootTask: 'Child threads / root task',
  childFreshShare: 'Child fresh share',
  approvalFreshShare: 'Approval fresh share',
  highEffortFreshShare: 'High-effort fresh share',
  processedToFreshRatio: 'Processed / fresh',
  reasoningOutputShare: 'Reasoning share of output',
  postPatchToolCallsPerPatchCall: 'Post-patch tool-call proxy / patch call',
  patchCalls: 'Patch calls',
  compactions: 'Compactions',
  projects: 'Projects',
  projectLabel: 'Project',
  processed: 'Processed tokens',
  fresh: 'Fresh input + output',
  input: 'Input tokens',
  cachedInput: 'Cached input',
  output: 'Output tokens',
  reasoning: 'Reasoning output',
  models: 'Models',
  efforts: 'Effort',
  threads: 'Threads',
  rootTasks: 'Root tasks',
  childThreads: 'Child threads',
  approvalReviewers: 'Approval reviewers',
  duration: 'Observed session duration total (proxy)',
  cacheShare: 'Input cache share',
  coverage: 'Coverage',
  quality: 'Quality',
  complete: 'Complete',
  partial: 'Partial',
  lastObserved: 'Last observed',
  usageLimits: 'Usage limits',
  resets: 'Resets',
  credits: 'Credits',
  unlimited: 'Unlimited',
  unavailable: 'Unavailable',
  optimization: 'Local optimization signals',
  structuralProxy: 'Structural proxy; tool-call details are not read.',
  pasteConstraint: 'Paste-ready constraint',
  constraintNoAgents: 'For comparable tasks, decide whether subagents are needed before spawning them.',
  constraintLowerEffort: 'On a representative task, A/B the observed high effort against one lower effort level.',
  constraintPostPatch: 'After the next patch, use the structural proxy to consider a shorter tool sequence.',
  constraintCacheContext: 'Keep the cache and context proxy in view when choosing the next task boundary.',
  constraintApprovalReviewer: 'Before adding approval reviewers, check whether that role is needed for this task.',
  recommendationComposition: 'Observed role, model, and effort composition',
  recommendationProxyKpi: 'Structural proxy KPI',
  recommendationEmpty: 'No evidence-based recommendations for this scope.',
  recommendationPartial: 'The daily index is catching up; recommendations for this range are unavailable.',
  insightObservation: 'Observation',
  insightEvidence: 'Evidence',
  insightConditionalAction: 'Conditional action',
  compareTitle: 'Provider comparison',
  noRecentTask: 'No recent Codex task is indexed yet.',
  sessions: 'Sessions',
  modelsEffort: 'Models & effort',
  clearFilters: 'Clear filters',
  activeFilters: 'Active filters',
  parentTask: 'Parent task',
  fiveHourWindow: '5-hour window',
  weeklyWindow: 'Weekly window',
  used: 'used',
  remaining: 'remaining',
  localLogNotLive: 'Local log · not live',
  accountSnapshotLastObserved: 'Account snapshot · last observed',
  limitExpired: 'Expired / stale last-observed limit',
  limitMissing: 'No locally observed usage limit',
  observedSessionDuration: 'Observed session duration total (proxy)',
  insightTitles: {
    'multi-agent-share': 'Subagent fresh-share proxy',
    'effort-comparison': 'Compare one lower effort level',
    'post-patch-tool-intensity': 'Post-patch tool intensity proxy',
    'cache-context': 'Cache and long-context context',
    'approval-reviewer-share': 'Approval-reviewer fresh-share proxy',
  },
  insightObservations: {
    'multi-agent-share': 'A substantial share of observed fresh usage is associated with subagent roles.',
    'effort-comparison': 'High effort appears in this structural proxy scope.',
    'post-patch-tool-intensity': 'Observed tool activity after patches is elevated in this structural proxy scope.',
    'cache-context': 'Processed activity is high relative to fresh activity; cache/context can affect this proxy.',
    'approval-reviewer-share': 'A material share of observed fresh usage is associated with approval-reviewer roles.',
  },
  insightTips: {
    'multi-agent-share': 'For comparable tasks, decide whether subagents are needed before spawning them.',
    'effort-comparison': 'On a representative task, A/B the observed high effort against one lower effort level.',
    'post-patch-tool-intensity': 'After the next patch, use this proxy to consider a shorter tool sequence.',
    'cache-context': 'Keep cache/context observations in view when choosing the next task boundary.',
    'approval-reviewer-share': 'Before adding approval reviewers, check whether that role is needed for this task.',
  },
  insightEvidenceLabels: {
    taskCount: 'Root tasks', rootSessionFresh: 'Root-role fresh usage', subagentFresh: 'Subagent fresh usage', approvalReviewerFresh: 'Approval-reviewer fresh usage', observedEffort: 'Observed effort', highEffortFresh: 'High-effort fresh usage', lowMediumEffortFresh: 'Lower-effort fresh usage', patchCalls: 'Patch calls (proxy)', toolCalls: 'Tool calls (proxy)', postPatchToolCalls: 'Post-patch tool calls (proxy)', compactCount: 'Context compactions (proxy)', taskCompleteCount: 'Task-complete events (proxy)', processedToFreshRatio: 'Processed / fresh proxy', cachedInputShare: 'Cached-input share', reasoningOutputShare: 'Reasoning share of output',
  },
};

export interface ProviderCompareInput {
  claude: { label: string; input: number; output: number; cache: number };
  codex: { label: string; input: number; output: number; cache: number };
}

export interface CodexRenderOptions {
  now?: number;
  formatNumber?: (value: number) => string;
  formatDateTime?: (timestamp: number) => string;
  formatDuration?: (milliseconds: number) => string;
  formatRelativeTime?: (targetTimestamp: number, now: number) => string;
  formatBytes?: (bytes: number) => string;
  settingsHtml?: string;
  optimizationEnabled?: boolean;
  locale?: string;
  timeZone?: string;
  exploreFilters?: CodexExploreFilters;
}

export interface CodexExploreFilters {
  query?: string;
  role?: string;
  projectViewKey?: string;
  model?: string;
  effort?: string;
  period?: string;
}

export interface CodexRenderFormatters {
  number: (value: number) => string;
  dateTime: (timestamp: number) => string;
  duration: (milliseconds: number) => string;
  relativeTime: (targetTimestamp: number, now: number) => string;
  bytes: (bytes: number) => string;
}

export interface CodexRenderContext {
  view: CodexUsageView;
  insights: CodexScopedInsights;
  copy: CodexViewCopy;
  formatters: CodexRenderFormatters;
  now: number;
  settingsHtml: string;
  optimizationEnabled: boolean;
  exploreFilters: CodexExploreFilters;
}

type NumberFormatter = (value: number) => string;

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function number(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString('en-US');
}

function formatted(format: NumberFormatter, value: number): string {
  return escapeHtml(format(Math.max(0, value)));
}

function percent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function duration(value: number): string {
  const minutes = Math.round(Math.max(0, value) / 60_000);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function summaryCard(label: string, value: string): string {
  return `<div class="summary-item"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`;
}

function metricCard(
  label: string,
  value: number,
  format: NumberFormatter,
): string {
  return summaryCard(label, format(Math.max(0, value)));
}

function dimensionTable(
  title: string,
  rows: Array<{ key: string; totals: CodexMetricTotals }>,
  copy: CodexViewCopy,
  format: NumberFormatter,
): string {
  const body = rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.key)}</td><td>${formatted(format, row.totals.processed)}</td><td>${formatted(format, row.totals.fresh)}</td><td>${formatted(format, row.totals.output)}</td></tr>`,
    )
    .join('');
  return `<section class="model-breakdown"><h3>${escapeHtml(title)}</h3><div class="daily-table-container"><table class="daily-table"><thead><tr><th></th><th>${escapeHtml(copy.processed)}</th><th>${escapeHtml(copy.fresh)}</th><th>${escapeHtml(copy.output)}</th></tr></thead><tbody>${body}</tbody></table></div></section>`;
}

function tokenCompositionBar(
  total: CodexMetricTotals,
  copy: CodexViewCopy,
  format: NumberFormatter,
): string {
  const composition = tokenComposition(total);
  const sum =
    composition.freshInput + composition.cachedInput + composition.output;
  const width = (value: number): string =>
    `${sum > 0 ? ((Math.max(0, value) / sum) * 100).toFixed(2) : '0.00'}%`;
  const item = (className: string, label: string, value: number): string =>
    `<span class="legend-item"><span class="legend-dot ${className}"></span>${escapeHtml(label)} ${formatted(format, value)} (${percent(sum > 0 ? value / sum : 0)})</span>`;
  return `<section class="cost-composition codex-token-composition">
    <div class="cost-comp-head">${escapeHtml(copy.tokenComposition)}</div>
    <div class="cost-comp-bar">
      <div class="cost-comp-seg seg-input" style="width: ${width(composition.freshInput)}"></div>
      <div class="cost-comp-seg seg-cache-read" style="width: ${width(composition.cachedInput)}"></div>
      <div class="cost-comp-seg seg-output" style="width: ${width(composition.output)}"></div>
    </div>
    <div class="cost-comp-legend">
      ${item('seg-input', copy.freshInput, composition.freshInput)}
      ${item('seg-cache-read', copy.cachedInput, composition.cachedInput)}
      ${item('seg-output', copy.output, composition.output)}
    </div>
    <p class="model-details">${escapeHtml(copy.reasoningSubset)}: ${formatted(format, composition.reasoningWithinOutput)}</p>
  </section>`;
}

function scopePanel(
  scope: CodexUsageScopeView,
  copy: CodexViewCopy,
  format: NumberFormatter,
  formatDuration: (milliseconds: number) => string = duration,
): string {
  return `<div class="codex-scope-panel">
    <section class="usage-summary"><div class="summary-grid">
      ${metricCard(copy.processed, scope.total.processed, format)}
      ${metricCard(copy.fresh, scope.total.fresh, format)}
      ${metricCard(copy.output, scope.total.output, format)}
      ${metricCard(copy.reasoning, scope.total.reasoning, format)}
    </div>${tokenCompositionBar(scope.total, copy, format)}</section>
    <div class="model-list"><div class="model-item"><div class="model-details-stacked">
      <span><span class="model-stat-label">${escapeHtml(copy.rootTasks)}</span><strong>${formatted(format, scope.rootTasks)}</strong></span>
      <span><span class="model-stat-label">${escapeHtml(copy.threads)}</span><strong>${formatted(format, scope.threads)}</strong></span>
      <span><span class="model-stat-label">${escapeHtml(copy.childThreads)}</span><strong>${formatted(format, scope.childThreads)} · ${percent(scope.childFreshShare)} ${escapeHtml(copy.fresh)}</strong></span>
      <span><span class="model-stat-label">${escapeHtml(copy.approvalReviewers)}</span><strong>${formatted(format, scope.approvalReviewerThreads)}</strong></span>
      <span><span class="model-stat-label">${escapeHtml(copy.cacheShare)}</span><strong>${percent(scope.cacheShare)}</strong></span>
      <span><span class="model-stat-label">${escapeHtml(copy.duration)}</span><strong>${escapeHtml(formatDuration(scope.durationMs))}</strong></span>
    </div></div></div>
    ${dimensionTable(copy.models, scope.models, copy, format)}
    ${dimensionTable(copy.efforts, scope.efforts, copy, format)}
  </div>`;
}

function dailyTable(
  rows: CodexDailyUsageView[],
  copy: CodexViewCopy,
  format: NumberFormatter,
): string {
  if (rows.length === 0) {
    return `<p>${escapeHtml(copy.noDailyData)}</p>`;
  }
  const body = rows
    .map(
      (row) => `<tr><td class="date-cell">${escapeHtml(row.day)}</td><td>${formatted(format, row.total.processed)}</td><td>${formatted(format, row.total.fresh)}</td><td>${formatted(format, row.total.input)}</td><td>${formatted(format, row.total.cachedInput)}</td><td>${formatted(format, row.total.output)}</td><td>${formatted(format, row.total.reasoning)}</td><td>${formatted(format, row.threads)}</td><td>${formatted(format, row.childThreads)}</td><td>${formatted(format, row.approvalReviewerThreads)}</td></tr>`,
    )
    .join('');
  return `<section class="daily-breakdown"><h3>${escapeHtml(copy.daily)}</h3><div class="daily-table-container"><table class="daily-table"><thead><tr><th>${escapeHtml(copy.date)}</th><th>${escapeHtml(copy.processed)}</th><th>${escapeHtml(copy.fresh)}</th><th>${escapeHtml(copy.input)}</th><th>${escapeHtml(copy.cachedInput)}</th><th>${escapeHtml(copy.output)}</th><th>${escapeHtml(copy.reasoning)}</th><th>${escapeHtml(copy.threads)}</th><th>${escapeHtml(copy.childThreads)}</th><th>${escapeHtml(copy.approvalReviewers)}</th></tr></thead><tbody>${body}</tbody></table></div></section>`;
}

function monthlyTable(
  rows: CodexPeriodUsageView[],
  copy: CodexViewCopy,
  format: NumberFormatter,
): string {
  if (rows.length === 0) {
    return `<section class="daily-breakdown"><h3>${escapeHtml(copy.monthly)}</h3><p>${escapeHtml(copy.noMonthlyData ?? 'No monthly Codex usage is indexed yet.')}</p></section>`;
  }
  const body = rows
    .map(
      (row) => `<tr><td class="date-cell">${escapeHtml(row.period)}</td><td>${formatted(format, row.total.processed)}</td><td>${formatted(format, row.total.fresh)}</td><td>${formatted(format, row.total.input)}</td><td>${formatted(format, row.total.cachedInput)}</td><td>${formatted(format, row.total.output)}</td><td>${formatted(format, row.total.reasoning)}</td><td>${formatted(format, row.threads)}</td></tr>`,
    )
    .join('');
  return `<section class="daily-breakdown"><h3>${escapeHtml(copy.monthly)}</h3><div class="daily-table-container"><table class="daily-table"><thead><tr><th>${escapeHtml(copy.date)}</th><th>${escapeHtml(copy.processed)}</th><th>${escapeHtml(copy.fresh)}</th><th>${escapeHtml(copy.input)}</th><th>${escapeHtml(copy.cachedInput)}</th><th>${escapeHtml(copy.output)}</th><th>${escapeHtml(copy.reasoning)}</th><th>${escapeHtml(copy.threads)}</th></tr></thead><tbody>${body}</tbody></table></div></section>`;
}

interface CodexChartRow {
  label: string;
  total: CodexMetricTotals;
  threads: number;
}

type CodexMetricKey = 'processed' | 'fresh' | 'output' | 'reasoning' | 'sessions';

function periodChart(
  chartId: string,
  rows: CodexChartRow[],
  copy: CodexViewCopy,
  format: NumberFormatter,
  coverage?: { range: string; complete: boolean },
): string {
  if (rows.length === 0) {
    const coverageAttributes = coverage
      ? ` data-codex-coverage-range="${escapeHtml(coverage.range)}" data-codex-coverage-status="${coverage.complete ? 'complete' : 'partial'}"`
      : '';
    return `<section class="daily-breakdown codex-period-chart" data-codex-chart-root="${escapeHtml(chartId)}"${coverageAttributes}></section>`;
  }
  const ordered = [...rows].reverse();
  const maxFresh = Math.max(0, ...ordered.map((row) => row.total.fresh));
  const chartHeight = 100;
  const metrics: Array<[string, string]> = [
    ['processed', copy.processed],
    ['fresh', copy.fresh],
    ['output', copy.output],
    ['reasoning', copy.reasoning],
    ['sessions', copy.threads],
  ];
  const metricValue = (row: CodexChartRow, key: string): number =>
    key === 'sessions'
      ? row.threads
      : row.total[key as keyof CodexMetricTotals];
  const axisAttributes = metrics.map(([key]) => {
    const maximum = Math.max(0, ...ordered.map((row) => metricValue(row, key)));
    return `data-axis-top-${key}="${formatted(format, maximum)}" data-axis-mid-${key}="${formatted(format, maximum / 2)}"`;
  }).join(' ');
  const buttons = metrics
    .map(
      ([key, label]) => `<button class="chart-tab ${key === 'fresh' ? 'active' : ''}" data-codex-chart-button="${escapeHtml(chartId)}:${key}" data-codex-action="select-chart-metric" data-codex-chart-id="${escapeHtml(chartId)}" data-codex-chart-metric="${key}">${escapeHtml(label)}</button>`,
    )
    .join('');
  const bars = ordered
    .map((row) => {
      const values: Record<string, number> = {
        processed: row.total.processed,
        fresh: row.total.fresh,
        output: row.total.output,
        reasoning: row.total.reasoning,
        sessions: row.threads,
      };
      const labelAttributes = metrics
        .map(
          ([key, label]) =>
            `data-label-${key}="${formatted(format, values[key])}" data-name-${key}="${escapeHtml(label)}"`,
        )
        .join(' ');
      const height = maxFresh > 0
        ? Math.max(2, Math.round((row.total.fresh / maxFresh) * chartHeight))
        : 2;
      return `<div class="hc-col"><div class="hc-barval codex-chart-value" data-codex-chart-value>${formatted(format, row.total.fresh)}</div><div class="chart-bar input-bar codex-chart-bar" style="height:${height}px" data-codex-chart="${escapeHtml(chartId)}" data-row-label="${escapeHtml(row.label)}" data-processed="${Math.max(0, row.total.processed)}" data-fresh="${Math.max(0, row.total.fresh)}" data-output="${Math.max(0, row.total.output)}" data-reasoning="${Math.max(0, row.total.reasoning)}" data-sessions="${Math.max(0, row.threads)}" data-threads="${Math.max(0, row.threads)}" ${labelAttributes} data-label-threads="${formatted(format, row.threads)}" title="${escapeHtml(row.label)} · ${escapeHtml(copy.fresh)}: ${formatted(format, row.total.fresh)}"></div></div>`;
    })
    .join('');
  const labels = ordered
    .map((row) => `<div class="hc-xlabel">${escapeHtml(row.label)}</div>`)
    .join('');
  const coverageAttributes = coverage
    ? ` data-codex-coverage-range="${escapeHtml(coverage.range)}" data-codex-coverage-status="${coverage.complete ? 'complete' : 'partial'}"`
    : '';
  return `<section class="daily-breakdown codex-period-chart" data-codex-chart-root="${escapeHtml(chartId)}"${coverageAttributes} ${axisAttributes}><div class="chart-tabs">${buttons}</div><div class="hc-wrap"><div class="hc-yaxis"><span class="hc-yval">${formatted(format, maxFresh)}</span><span class="hc-yval">${formatted(format, maxFresh / 2)}</span><span class="hc-yval">${formatted(format, 0)}</span></div><div class="hc-main"><div class="hc-scroll"><div class="hc-plot"><div class="hc-grid hc-grid-top"></div><div class="hc-grid hc-grid-mid"></div><div class="hc-bars chart-bars">${bars}</div></div><div class="hc-xlabels">${labels}</div></div></div></div></section>`;
}

function roleLabel(role: CodexThreadUsageView['role'], copy: CodexViewCopy): string {
  if (role === 'root') {
    return copy.rootRole;
  }
  if (role === 'subagent') {
    return copy.childRole;
  }
  if (role === 'approval-reviewer') {
    return copy.approvalReviewerRole;
  }
  return copy.unknownRole;
}

function observed(value: number, copy: CodexViewCopy): string {
  if (value <= 0) {
    return copy.unavailable;
  }
  return new Date(value).toISOString().replace('T', ' ').slice(0, 16);
}

function limitWindowLabel(limit: CodexLimitView, ctx: CodexRenderContext): string {
  if (limit.windowMinutes === 300) {
    return ctx.copy.fiveHourWindow ?? '5-hour window';
  }
  if (limit.windowMinutes === 10_080) {
    return ctx.copy.weeklyWindow ?? 'Weekly window';
  }
  return limit.windowMinutes
    ? ctx.formatters.duration(limit.windowMinutes * 60_000)
    : ctx.copy.usageLimits;
}

function limitSourceLabel(limit: CodexLimitView, copy: CodexViewCopy): string {
  return limit.source === 'oauth'
    ? copy.accountSnapshotLastObserved ?? 'Account snapshot · last observed'
    : copy.localLogNotLive ?? 'Local log · not live';
}

function renderLimitsSection(ctx: CodexRenderContext): string {
  const { copy, view } = ctx;
  const cards = view.limits.map((limit) => {
    const observed = limit.observedAt
      ? `<div class="model-details">${escapeHtml(copy.lastObserved)}: ${escapeHtml(ctx.formatters.dateTime(limit.observedAt))} · ${escapeHtml(limitSourceLabel(limit, copy))}</div>`
      : '';
    if (limit.state === 'missing') {
      return `<article class="model-item codex-limit-card" data-codex-limit-state="missing"><h3>${escapeHtml(copy.limitMissing ?? 'No locally observed usage limit')}</h3></article>`;
    }
    if (limit.state === 'unlimited') {
      return `<article class="model-item codex-limit-card" data-codex-limit-state="unlimited"><h3>${escapeHtml(limit.limitName ?? copy.usageLimits)}</h3><strong>${escapeHtml(copy.unlimited)}</strong>${observed}</article>`;
    }
    const used = limit.usedPercent ?? 0;
    const remaining = limit.remainingPercent ?? 100;
    const reset = limit.resetsAt && limit.state === 'current'
      ? `<div class="model-details">${escapeHtml(copy.resets)}: ${escapeHtml(ctx.formatters.dateTime(limit.resetsAt))} · ${escapeHtml(ctx.formatters.relativeTime(limit.resetsAt, ctx.now))}</div>`
      : `<div class="model-details">${escapeHtml(copy.limitExpired ?? 'Expired / stale last-observed limit')}</div>`;
    return `<article class="model-item codex-limit-card" data-codex-limit-state="${limit.state}"><h3>${escapeHtml(limit.limitName ?? limitWindowLabel(limit, ctx))}</h3><div class="codex-limit-window"><div class="cost-comp-head"><span>${escapeHtml(limitWindowLabel(limit, ctx))}</span><strong>${formatted(ctx.formatters.number, used)}% ${escapeHtml(copy.used ?? 'used')} · ${formatted(ctx.formatters.number, remaining)}% ${escapeHtml(copy.remaining ?? 'remaining')}</strong></div><div class="cost-comp-bar"><div class="cost-comp-seg seg-input" style="width:${used.toFixed(2)}%"></div></div>${reset}${observed}</div></article>`;
  }).join('');
  return `<section class="codex-limits" data-codex-section="limits"><h3>${escapeHtml(copy.usageLimits)}</h3><div class="model-list">${cards}</div></section>`;
}

function threadTable(
  rows: CodexThreadUsageView[],
  totalCount: number,
  copy: CodexViewCopy,
  format: NumberFormatter,
  filters: CodexExploreFilters = {},
  periodAvailability: CodexUsageView['sessionPeriodAvailability'],
  formatDateTime: (timestamp: number) => string = (timestamp) => observed(timestamp, copy),
  formatDuration: (milliseconds: number) => string = duration,
): string {
  if (rows.length === 0) {
    return `<p>${escapeHtml(copy.noThreadData)}</p>`;
  }
  const query = filters.query ?? '';
  const normalizedQuery = query.trim().toLowerCase();
  const roles = new Set(['root', 'subagent', 'approval-reviewer', 'unknown']);
  const projects = new Map(
    rows.map((row) => [
      row.projectViewKey,
      row.projectName ?? copy.unidentifiedProject,
    ]),
  );
  const models = new Set(rows.flatMap((row) => row.models));
  const efforts = new Set(rows.flatMap((row) => row.efforts));
  const periods = new Set(['recent', '7d', '30d', 'all']);
  const roleFilter = filters.role && roles.has(filters.role) ? filters.role : '';
  const projectFilter = filters.projectViewKey && projects.has(filters.projectViewKey)
    ? filters.projectViewKey
    : '';
  const modelFilter = filters.model && models.has(filters.model) ? filters.model : '';
  const effortFilter = filters.effort && efforts.has(filters.effort) ? filters.effort : '';
  const requestedPeriod = filters.period && periods.has(filters.period)
    ? filters.period
    : '';
  const periodFilter = requestedPeriod &&
    periodAvailability[requestedPeriod as keyof typeof periodAvailability]
    ? requestedPeriod
    : '';
  const hasFilters = Boolean(
    normalizedQuery || roleFilter || projectFilter || modelFilter ||
    effortFilter || periodFilter,
  );
  const matching = rows.filter((row) => {
    const searchable = [row.title, row.agentNickname, row.parentTitle, row.projectName, ...row.models, ...row.efforts]
      .filter(Boolean).join(' ').toLowerCase();
    return (!normalizedQuery || searchable.includes(normalizedQuery)) &&
      (!roleFilter || row.role === roleFilter) &&
      (!projectFilter || row.projectViewKey === projectFilter) &&
      (!modelFilter || row.models.includes(modelFilter)) &&
      (!effortFilter || row.efforts.includes(effortFilter)) &&
      (!periodFilter || row.periodMembership.includes(
        periodFilter as CodexThreadUsageView['periodMembership'][number],
      ));
  });
  const byParent = new Map<string, CodexThreadUsageView[]>();
  for (const row of matching) {
    if (row.parentViewKey) {
      const children = byParent.get(row.parentViewKey) ?? [];
      children.push(row);
      byParent.set(row.parentViewKey, children);
    }
  }
  const sortRecent = (left: CodexThreadUsageView, right: CodexThreadUsageView) =>
    right.observedAt - left.observedAt || left.viewKey.localeCompare(right.viewKey);
  const tree: CodexThreadUsageView[] = [];
  const visit = (row: CodexThreadUsageView, visited: Set<string>): void => {
    if (visited.has(row.viewKey)) return;
    visited.add(row.viewKey);
    tree.push(row);
    for (const child of (byParent.get(row.viewKey) ?? []).sort(sortRecent)) visit(child, visited);
  };
  const rowKeys = new Set(matching.map((row) => row.viewKey));
  for (const row of matching.filter((row) => !row.parentViewKey || !rowKeys.has(row.parentViewKey)).sort(sortRecent)) visit(row, new Set());
  for (const row of matching.sort(sortRecent)) if (!tree.some((item) => item.viewKey === row.viewKey)) visit(row, new Set());
  const displayed = hasFilters ? matching.sort(sortRecent) : tree;
  const children = new Map<string, number>();
  for (const row of displayed) {
    if (row.parentViewKey) {
      children.set(
        row.parentViewKey,
        (children.get(row.parentViewKey) ?? 0) + 1,
      );
    }
  }
  const option = (
    value: string,
    label: string,
    selectedValue: string,
    disabled = false,
  ): string => `<option value="${escapeHtml(value)}"${value === selectedValue ? ' selected' : ''}${disabled ? ' disabled aria-disabled="true"' : ''}>${escapeHtml(label)}</option>`;
  const projectOptions = [...projects.entries()]
    .filter(([id]) => id)
    .sort((left, right) => left[1].localeCompare(right[1]))
    .map(([id, label]) => option(id, label, projectFilter))
    .join('');
  const modelOptions = [...models]
    .sort()
    .map((value) => option(value, value, modelFilter))
    .join('');
  const effortOptions = [...efforts]
    .sort()
    .map((value) => option(value, value, effortFilter))
    .join('');
  const select = (
    filter: string,
    label: string,
    options: string,
    selectedValue: string,
    describedBy = '',
  ): string => `<select class="sess-model-select" data-codex-thread-filter="${filter}" data-codex-session-filter="${filter}" data-codex-action="filter-sessions" aria-label="${escapeHtml(label)}"${describedBy ? ` aria-describedby="${describedBy}"` : ''}>${option('', `${copy.all} ${label}`, selectedValue)}${options}</select>`;
  const roleLabels = new Map<string, string>([
    ['root', copy.rootRole],
    ['subagent', copy.childRole],
    ['approval-reviewer', copy.approvalReviewerRole],
    ['unknown', copy.unknownRole],
  ]);
  const periodLabels = new Map<string, string>([
    ['recent', copy.lastTask],
    ['7d', copy.last7Days],
    ['30d', copy.last30Days],
    ['all', copy.allTime],
  ]);
  const periodOptions = [...periodLabels.entries()].map(([value, label]) =>
    option(
      value,
      label,
      periodFilter,
      !periodAvailability[value as keyof typeof periodAvailability],
    ),
  ).join('');
  const chip = (key: string, label: string, value: string): string =>
    value ? `<button type="button" data-codex-filter-chip="${key}" data-codex-action="remove-filter" data-codex-filter-key="${key}">${escapeHtml(label)}: ${escapeHtml(value)} ×</button>` : '';
  const chips = [
    chip('query', copy.searchThreads, query),
    chip('role', copy.role, roleLabels.get(roleFilter) ?? ''),
    chip('project', copy.projectLabel, projects.get(projectFilter) ?? ''),
    chip('model', copy.models, modelFilter),
    chip('effort', copy.efforts, effortFilter),
    chip('period', copy.scope, periodLabels.get(periodFilter) ?? ''),
  ].join('');
  const hasUnavailablePeriods = Object.values(periodAvailability)
    .some((available) => !available);
  const periodNote = hasUnavailablePeriods
    ? `<p id="codex-session-period-note" class="model-details" data-codex-period-availability-note>${escapeHtml(copy.coverage)}: ${escapeHtml(copy.partial)} · ${escapeHtml(copy.unavailable)}</p>`
    : '';
  const filterToolbar = `<div class="sess-filters codex-thread-filters">
    <label for="codex-session-search">${escapeHtml(copy.searchThreads)}</label><input id="codex-session-search" type="search" value="${escapeHtml(query)}" data-codex-thread-search data-codex-session-search data-codex-action="filter-sessions" placeholder="${escapeHtml(copy.searchThreads)}">
    ${select('role', copy.role, [...roleLabels.entries()].map(([value, label]) => option(value, label, roleFilter)).join(''), roleFilter)}
    ${select('project', copy.projectLabel, projectOptions, projectFilter)}
    ${select('model', copy.models, modelOptions, modelFilter)}
    ${select('effort', copy.efforts, effortOptions, effortFilter)}
    ${select('period', copy.scope, periodOptions, periodFilter, hasUnavailablePeriods ? 'codex-session-period-note' : '')}
    ${periodNote}<div class="codex-filter-chips" aria-label="${escapeHtml(copy.activeFilters)}" data-codex-filter-chips data-codex-search-label="${escapeHtml(copy.searchThreads)}">${chips}</div><button class="btn-secondary" data-codex-action="clear-filters"${hasFilters ? '' : ' hidden'}>${escapeHtml(copy.clearFilters)}</button>
  </div>`;
  const body = displayed
    .map((row) => {
      const title = row.title ?? row.agentNickname ?? copy.unnamedSession;
      const parentLabel = copy.parentTask ?? 'Parent task';
      const parentValue = row.parentStatus === 'available'
        ? row.parentTitle ?? copy.unavailable
        : copy.unavailable;
      const parent = row.parentStatus !== 'none'
        ? `<div class="model-details" data-codex-filter-parent${hasFilters ? '' : ' hidden'}>${escapeHtml(parentLabel)}: ${escapeHtml(parentValue)}</div>`
        : '';
      const childCount = children.get(row.viewKey) ?? 0;
      const childToggle = childCount > 0
        ? `<button class="group-toggle" aria-expanded="true" title="${escapeHtml(copy.expand)}" data-codex-action="toggle-thread-children" data-codex-thread-key="${escapeHtml(row.viewKey)}">▼</button>`
        : '';
      const project = row.projectName ?? copy.unidentifiedProject;
      const directory = row.projectDirectoryName && row.projectDirectoryName !== project
        ? `<div class="model-details">${escapeHtml(copy.localDirectory)}: ${escapeHtml(row.projectDirectoryName)}</div>`
        : '';
      const search = [title, row.parentTitle, project, ...row.models, ...row.efforts]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const mobileFacts = [
        [copy.date, formatDateTime(row.observedAt)],
        [copy.role, roleLabel(row.role, copy)],
        [copy.projectLabel, project],
        ...(row.projectDirectoryName && row.projectDirectoryName !== project
          ? [[copy.localDirectory, row.projectDirectoryName]]
          : []),
        [parentLabel, row.parentStatus === 'none' ? copy.unavailable : parentValue],
        [copy.models, row.models.join(', ')],
        [copy.efforts, row.efforts.join(', ')],
        [copy.processed, formatted(format, row.total.processed)],
        [copy.fresh, formatted(format, row.total.fresh)],
        [copy.cacheShare, percent(row.total.input > 0 ? row.total.cachedInput / row.total.input : 0)],
        [copy.output, formatted(format, row.total.output)],
        [copy.reasoning, formatted(format, row.total.reasoning)],
        [copy.duration, formatDuration(row.durationMs)],
      ].map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
      const mobile = `<details class="codex-session-mobile"><summary aria-label="${escapeHtml(`${copy.threadLabel}: ${title}`)}">${escapeHtml(title)}</summary><dl>${mobileFacts}</dl></details>`;
      return `<tr class="sort-row codex-thread-row${!hasFilters && row.parentViewKey ? ' codex-child-thread' : ''}" tabindex="-1" data-codex-thread-row data-codex-view-key="${escapeHtml(row.viewKey)}" data-codex-root-task-view-key="${escapeHtml(row.rootTaskViewKey)}" data-parent-status="${row.parentStatus}"${row.parentViewKey ? ` data-codex-parent-view-key="${escapeHtml(row.parentViewKey)}"` : ''} data-search="${escapeHtml(search)}" data-role="${escapeHtml(row.role)}" data-project="${escapeHtml(row.projectViewKey)}" data-models="${escapeHtml(row.models.join('|'))}" data-efforts="${escapeHtml(row.efforts.join('|'))}" data-codex-periods="${escapeHtml(row.periodMembership.join('|'))}" data-sort-title="${escapeHtml(title.toLowerCase())}" data-sort-time="${Math.max(0, row.observedAt)}" data-sort-role="${escapeHtml(row.role)}" data-sort-project="${escapeHtml(project.toLowerCase())}" data-sort-model="${escapeHtml(row.models.join(',').toLowerCase())}" data-sort-effort="${escapeHtml(row.efforts.join(',').toLowerCase())}" data-sort-processed="${Math.max(0, row.total.processed)}" data-sort-fresh="${Math.max(0, row.total.fresh)}" data-sort-cache="${row.total.input > 0 ? row.total.cachedInput / row.total.input : 0}" data-sort-output="${Math.max(0, row.total.output)}" data-sort-reasoning="${Math.max(0, row.total.reasoning)}" data-sort-duration="${Math.max(0, row.durationMs)}"><td class="name-cell">${childToggle}<strong>${escapeHtml(title)}</strong>${parent}${mobile}</td><td class="date-cell">${escapeHtml(formatDateTime(row.observedAt))}</td><td>${escapeHtml(roleLabel(row.role, copy))}</td><td><strong>${escapeHtml(project)}</strong>${directory}</td><td>${escapeHtml(row.models.join(', '))}</td><td>${escapeHtml(row.efforts.join(', '))}</td><td class="number-cell">${formatted(format, row.total.processed)}</td><td class="number-cell">${formatted(format, row.total.fresh)}</td><td class="number-cell">${percent(row.total.input > 0 ? row.total.cachedInput / row.total.input : 0)}</td><td class="number-cell">${formatted(format, row.total.output)}</td><td class="number-cell">${formatted(format, row.total.reasoning)}</td><td class="number-cell">${escapeHtml(formatDuration(row.durationMs))}</td></tr>`;
    })
    .join('');
  const th = (key: string, label: string, legacyKey = key): string =>
    `<th class="sortable" data-sortkey="${legacyKey}" data-codex-action="sort-sessions" data-codex-sort-key="${key}" aria-sort="none">${escapeHtml(label)}</th>`;
  return `<section class="daily-breakdown" data-codex-session-layout="${hasFilters ? 'flat' : 'tree'}"><h3>${escapeHtml(copy.sessions)}</h3><p class="model-details" aria-live="polite"><span data-codex-thread-visible>${formatted(format, displayed.length)}</span>/${formatted(format, totalCount)} ${escapeHtml(copy.sessions)}</p>${filterToolbar}<div class="daily-table-container"><table class="daily-table sortable-table" data-codex-sort-table="sessions"><thead><tr>${th('title', copy.threadLabel)}${th('recent', copy.date, 'time')}${th('role', copy.role)}${th('project', copy.projectLabel)}${th('model', copy.models)}${th('effort', copy.efforts)}${th('processed', copy.processed)}${th('fresh', copy.fresh)}${th('cache', copy.cacheShare)}${th('output', copy.output)}${th('reasoning', copy.reasoning)}${th('duration', copy.duration)}</tr></thead><tbody>${body}</tbody></table></div></section>`;
}

function projectTable(
  view: CodexUsageView,
  copy: CodexViewCopy,
  format: NumberFormatter,
  formatDateTime: (timestamp: number) => string = (timestamp) => observed(timestamp, copy),
): string {
  if (view.projects.length === 0) {
    return `<p>${escapeHtml(copy.noRecentTask)}</p>`;
  }
  const body = view.projects
    .map((project) => {
      const name = project.name ?? copy.unidentifiedProject;
      const directory = project.directoryName && project.directoryName !== name
        ? `<div class="model-details">${escapeHtml(copy.localDirectory)}: ${escapeHtml(project.directoryName)}</div>`
        : '';
      const threads = project.recentThreads
        .map((thread) => `<div class="codex-project-thread"><strong>${escapeHtml(thread.title ?? thread.agentNickname ?? copy.unnamedSession)}</strong><span>${escapeHtml(roleLabel(thread.role, copy))} · ${formatted(format, thread.total.fresh)} ${escapeHtml(copy.fresh)}</span></div>`)
        .join('');
      const shown = project.recentThreads.length;
      return `<tr class="sort-row codex-project-row" data-codex-project-view-key="${escapeHtml(project.viewKey)}" data-sort-name="${escapeHtml(name.toLowerCase())}" data-sort-lastactive="${Math.max(0, project.lastActiveAt)}" data-sort-processed="${Math.max(0, project.scope.total.processed)}" data-sort-fresh="${Math.max(0, project.scope.total.fresh)}" data-sort-output="${Math.max(0, project.scope.total.output)}" data-sort-reasoning="${Math.max(0, project.scope.total.reasoning)}" data-sort-roots="${Math.max(0, project.scope.rootTasks)}" data-sort-children="${Math.max(0, project.scope.childThreads)}"><td><button class="group-toggle" aria-label="${escapeHtml(copy.expand)} ${escapeHtml(name)}" aria-expanded="false" data-codex-action="project-sessions" data-codex-project-view-key="${escapeHtml(project.viewKey)}">▶</button><strong>${escapeHtml(name)}</strong>${directory}<div class="model-details">${formatted(format, shown)}/${formatted(format, project.threadCount)} ${escapeHtml(copy.sessions)}</div></td><td>${escapeHtml(formatDateTime(project.lastActiveAt))}</td><td class="number-cell">${formatted(format, project.scope.total.processed)}</td><td class="number-cell">${formatted(format, project.scope.total.fresh)}</td><td class="number-cell">${formatted(format, project.scope.total.output)}</td><td class="number-cell">${formatted(format, project.scope.total.reasoning)}</td><td class="number-cell">${formatted(format, project.scope.rootTasks)}</td><td class="number-cell">${formatted(format, project.scope.childThreads)}</td><td class="number-cell">${formatted(format, project.scope.approvalReviewerThreads)}</td></tr><tr class="sort-child codex-project-detail-row" data-codex-project-detail="${escapeHtml(project.viewKey)}" hidden><td colspan="9">${threads || escapeHtml(copy.noThreadData)}</td></tr>`;
    })
    .join('');
  const th = (key: string, label: string): string =>
    `<th class="sortable" data-sortkey="${key}" data-codex-action="sort-projects" data-codex-sort-key="${key}" aria-sort="none">${escapeHtml(label)}</th>`;
  return `<section class="daily-breakdown"><h3>${escapeHtml(copy.projects)}</h3><div class="daily-table-container"><table class="daily-table sortable-table" data-codex-sort-table="projects"><thead><tr>${th('name', copy.projectLabel)}${th('lastactive', copy.lastActive)}${th('processed', copy.processed)}${th('fresh', copy.fresh)}${th('output', copy.output)}${th('reasoning', copy.reasoning)}${th('roots', copy.rootTasks)}${th('children', copy.childThreads)}<th>${escapeHtml(copy.approvalReviewers)}</th></tr></thead><tbody>${body}</tbody></table></div></section>`;
}

function insightCard(
  insight: CodexInsight,
  scopeLabel: string,
  copy: CodexViewCopy,
  format: NumberFormatter,
): string {
  const evidence = Object.entries(insight.evidence)
    .map(([key, value]) => {
      const label = copy.insightEvidenceLabels[key as CodexInsightEvidenceKey];
      const rendered = typeof value === 'number' ? formatted(format, value) : value;
      return `<span>${escapeHtml(label)}: ${escapeHtml(rendered)}</span>`;
    })
    .join('');
  return `<article class="model-item insight-card codex-insight codex-insight-${escapeHtml(insight.severity)}"><div class="insight-head"><span class="insight-tag">${escapeHtml(scopeLabel)}</span><h4>${escapeHtml(copy.insightTitles[insight.kind])}</h4></div><p class="insight-observation"><strong>${escapeHtml(copy.insightObservation)}:</strong> ${escapeHtml(copy.insightObservations[insight.kind])}</p><p class="insight-evidence"><strong>${escapeHtml(copy.insightEvidence)}:</strong> ${evidence}</p><p class="insight-note">${escapeHtml(copy.structuralProxy)}</p><p class="insight-tip"><strong>${escapeHtml(copy.insightConditionalAction)}:</strong> ${escapeHtml(copy.insightTips[insight.kind])}</p></article>`;
}

function localizedConstraint(
  insights: CodexInsight[],
  copy: CodexViewCopy,
): string {
  if (insights.length === 0) {
    return '';
  }
  const kinds = new Set(insights.map((insight) => insight.kind));
  const sentences: string[] = [];
  if (kinds.has('multi-agent-share')) {
    sentences.push(copy.constraintNoAgents);
  }
  if (kinds.has('effort-comparison')) {
    sentences.push(copy.constraintLowerEffort);
  }
  if (kinds.has('post-patch-tool-intensity')) {
    sentences.push(copy.constraintPostPatch);
  }
  if (kinds.has('cache-context')) {
    sentences.push(copy.constraintCacheContext);
  }
  if (kinds.has('approval-reviewer-share')) {
    sentences.push(copy.constraintApprovalReviewer);
  }
  return sentences.join(' ');
}

function behaviorScopePanel(
  scopeKey: string,
  scopeView: CodexUsageScopeView,
  behavior: CodexBehaviorView,
  active: boolean,
  copy: CodexViewCopy,
  format: NumberFormatter,
): string {
  const rootOrOtherShare = Math.max(
    0,
    1 - behavior.childFreshShare - behavior.approvalReviewerFreshShare,
  );
  const roleSegment = (
    className: string,
    share: number,
  ): string => `<div class="cost-comp-seg ${className}" style="width:${(
    Math.max(0, Math.min(1, share)) * 100
  ).toFixed(2)}%"></div>`;
  const roleLegend = (
    className: string,
    label: string,
    share: number,
  ): string => `<span class="legend-item"><span class="legend-dot ${className}"></span>${escapeHtml(label)} ${percent(share)}</span>`;
  return `<section class="codex-behavior-scope${active ? ' active' : ''}" data-codex-behavior-panel="${escapeHtml(scopeKey)}">
    <section class="usage-summary"><div class="summary-grid">
      ${summaryCard(copy.childThreadsPerRootTask, `${behavior.childThreadsPerRootTask.toFixed(1)}×`)}
      ${summaryCard(copy.childFreshShare, percent(behavior.childFreshShare))}
      ${summaryCard(copy.approvalFreshShare, percent(behavior.approvalReviewerFreshShare))}
      ${summaryCard(copy.highEffortFreshShare, percent(behavior.highEffortFreshShare))}
      ${summaryCard(copy.processedToFreshRatio, `${behavior.processedToFreshRatio.toFixed(1)}×`)}
      ${summaryCard(copy.cacheShare, percent(behavior.cacheShare))}
      ${summaryCard(copy.reasoningOutputShare, percent(behavior.reasoningOutputShare))}
      ${summaryCard(copy.postPatchToolCallsPerPatchCall, behavior.postPatchToolCallsPerPatchCall.toFixed(1))}
      ${metricCard(copy.patchCalls, behavior.patchCalls, format)}
      ${metricCard(copy.compactions, behavior.compactCount, format)}
    </div></section>
    <section class="cost-composition codex-role-composition">
      <div class="cost-comp-head">${escapeHtml(copy.threadRoleComposition)}</div>
      <div class="cost-comp-bar">
        ${roleSegment('seg-input', rootOrOtherShare)}
        ${roleSegment('seg-output', behavior.childFreshShare)}
        ${roleSegment('seg-cache-creation', behavior.approvalReviewerFreshShare)}
      </div>
      <div class="cost-comp-legend">
        ${roleLegend('seg-input', copy.rootRole, rootOrOtherShare)}
        ${roleLegend('seg-output', copy.childRole, behavior.childFreshShare)}
        ${roleLegend('seg-cache-creation', copy.approvalReviewerRole, behavior.approvalReviewerFreshShare)}
      </div>
    </section>
    ${dimensionTable(copy.models, scopeView.models, copy, format)}
    ${dimensionTable(copy.efforts, scopeView.efforts, copy, format)}
  </section>`;
}

function behaviorPanel(
  view: CodexUsageView,
  insights: CodexScopedInsights,
  quality: string,
  copy: CodexViewCopy,
  format: NumberFormatter,
  formatBytes: NumberFormatter,
): string {
  const scopes = [
    { key: 'recent', label: copy.lastTask, scope: view.lastTask, behavior: view.behaviorScopes.recent },
    { key: '7d', label: copy.last7Days, scope: view.last7Days, behavior: view.behaviorScopes.last7Days },
    { key: '30d', label: copy.last30Days, scope: view.last30Days, behavior: view.behaviorScopes.last30Days },
    { key: 'all', label: copy.allTime, scope: view.allTime, behavior: view.behaviorScopes.allTime },
  ];
  const defaultKey = view.lastTask && view.behaviorScopes.recent ? 'recent' : '7d';
  const buttons = scopes.map(({ key, label }) =>
    `<button class="chart-tab${key === defaultKey ? ' active' : ''}" data-codex-behavior-button="${key}" data-codex-action="select-behavior-scope" data-codex-behavior-scope="${key}">${escapeHtml(label)}</button>`,
  ).join('');
  const panels = scopes.map(({ key, scope, behavior }) =>
    scope && behavior
      ? behaviorScopePanel(key, scope, behavior, key === defaultKey, copy, format)
      : `<section class="codex-behavior-scope${key === defaultKey ? ' active' : ''}" data-codex-behavior-panel="${key}"><p>${escapeHtml(copy.noRecentTask)}</p></section>`,
  ).join('');
  const insightScopes: Array<[keyof CodexScopedInsights, string]> = [
    ['recent', copy.lastTask],
    ['last7Days', copy.last7Days],
    ['last30Days', copy.last30Days],
    ['allTime', copy.allTime],
  ];
  const insightHtml = insightScopes.map(([key, label]) => {
    const cards = insights[key].map((insight) => insightCard(insight, label, copy, format)).join('');
    return cards
      ? `<section class="codex-insight-scope" data-codex-insight-scope="${key}"><h4>${escapeHtml(label)}</h4>${cards}</section>`
      : '';
  }).join('');
  const constraint = localizedConstraint(insights.recent, copy);
  const constraintHtml = constraint
    ? `<details class="model-item"><summary>${escapeHtml(copy.pasteConstraint)}</summary><pre>${escapeHtml(constraint)}</pre></details>`
    : '';
  return `<section class="codex-behavior">
    <div class="chart-tabs codex-behavior-tabs">${buttons}</div>
    ${panels}
    <details class="model-item codex-coverage"><summary>${escapeHtml(copy.coverage)} · ${escapeHtml(copy.quality)}</summary><p><strong>${escapeHtml(copy.coverage)}</strong>: ${formatted(format, view.coverage.indexedFiles)}/${formatted(format, view.coverage.totalFiles)} files · ${formatted(formatBytes, view.coverage.indexedBytes)}/${formatted(formatBytes, view.coverage.totalBytes)} bytes · ${escapeHtml(view.coverage.complete ? copy.complete : copy.partial)}<br><strong>${escapeHtml(copy.quality)}</strong>: ${quality}</p></details>
    <section class="codex-insights"><h3>${escapeHtml(copy.optimization)} · ${escapeHtml(copy.lastTask)}</h3>${insightHtml}${constraintHtml}</section>
  </section>`;
}

export function createCodexRenderContext(
  view: CodexUsageView,
  insights: CodexScopedInsights,
  copy: CodexViewCopy = CODEX_COPY_EN,
  options: CodexRenderOptions = {},
): CodexRenderContext {
  const now = options.now ?? Date.now();
  const resolved = new Intl.DateTimeFormat().resolvedOptions();
  const localized = createCodexLocalizedFormatters(
    options.locale ?? resolved.locale,
    options.timeZone ?? resolved.timeZone,
  );
  return {
    view,
    insights,
    copy,
    now,
    settingsHtml: options.settingsHtml ?? '',
    optimizationEnabled: options.optimizationEnabled !== false,
    exploreFilters: options.exploreFilters ?? {},
    formatters: {
      number: options.formatNumber ?? number,
      dateTime: options.formatDateTime ?? localized.formatDateTime,
      duration: options.formatDuration ?? localized.formatDuration,
      relativeTime: options.formatRelativeTime ?? localized.formatRelativeTime,
      bytes: options.formatBytes ?? localized.formatBytes,
    },
  };
}

export function renderCodexPrimaryNav(
  copy: CodexViewCopy,
  enabled: boolean,
): string {
  const pages = [
    { key: 'overview', label: copy.overview },
    { key: 'explore', label: copy.explore ?? copy.projects },
    {
      key: 'recommendations',
      label: copy.recommendations ?? copy.optimization,
    },
  ];
  const buttons = pages.map(({ key, label }, index) => {
    const selected = index === 0;
    const disabled = key === 'recommendations' && !enabled;
    return `<button class="tab${selected ? ' active' : ''}" id="codex-page-tab-${key}" role="tab" data-codex-page-button="${key}" aria-selected="${selected}" tabindex="${selected ? '0' : '-1'}" aria-controls="codex-page-panel-${key}" data-codex-action="select-page" data-codex-page-target="${key}"${disabled ? ' aria-disabled="true" disabled' : ''}>${escapeHtml(label)}</button>`;
  }).join('');
  return `<nav class="tabs codex-tabs" role="tablist" aria-label="${escapeHtml(copy.title)}">${buttons}</nav>`;
}

export function renderCodexSettingsLauncher(copy: CodexViewCopy): string {
  return `<button class="btn-secondary" id="codex-open-settings" data-codex-action="open-settings" aria-controls="codex-page-panel-settings">${escapeHtml(copy.settings)}</button>`;
}

function renderRecentTaskSection(ctx: CodexRenderContext): string {
  const { view, copy } = ctx;
  const format = ctx.formatters.number;
  const identity = view.lastTaskIdentity;
  const taskIdentity = identity
    ? `<article class="model-item codex-task-identity" data-codex-task-key="${escapeHtml(identity.taskKey)}" data-codex-project-key="${escapeHtml(identity.projectKey)}"><h3>${escapeHtml(identity.title ?? copy.unnamedSession)}</h3><div class="model-details-stacked"><span><span class="model-stat-label">${escapeHtml(copy.projectLabel)}</span><strong>${escapeHtml(identity.projectName ?? copy.unidentifiedProject)}</strong></span><span><span class="model-stat-label">${escapeHtml(copy.lastObserved)}</span><strong>${escapeHtml(ctx.formatters.dateTime(identity.lastActiveAt))} · ${escapeHtml(ctx.formatters.relativeTime(identity.lastActiveAt, ctx.now))}</strong></span>${identity.projectDirectoryName && identity.projectDirectoryName !== identity.projectName ? `<span><span class="model-stat-label">${escapeHtml(copy.localDirectory)}</span><strong>${escapeHtml(identity.projectDirectoryName)}</strong></span>` : ''}</div><button class="btn-secondary" data-codex-action="view-task" data-codex-task-key="${escapeHtml(identity.taskKey)}" data-codex-project-key="${escapeHtml(identity.projectKey)}">${escapeHtml(copy.explore ?? 'Explore')}</button></article>`
    : '';
  const recent = view.lastTask
    ? taskIdentity + scopePanel(view.lastTask, copy, format, ctx.formatters.duration)
    : `<p>${escapeHtml(copy.noRecentTask)}</p>`;
  return `<section data-codex-section="recent-task"><h3>${escapeHtml(copy.lastTask)}</h3>${recent}</section>`;
}

function renderTrendSection(ctx: CodexRenderContext): string {
  const { copy, view } = ctx;
  const format = ctx.formatters.number;
  const scopeRows: Array<{
    key: 'recent' | '7d' | '30d' | 'all';
    label: string;
    scope: CodexUsageScopeView | null;
    rows: CodexChartRow[];
    daily: boolean;
  }> = [
    {
      key: 'recent', label: copy.lastTask, scope: view.lastTask,
      rows: view.lastTask ? [{ label: copy.lastTask, total: view.lastTask.total, threads: view.lastTask.threads }] : [],
      daily: false,
    },
    {
      key: '7d', label: copy.last7Days, scope: view.last7Days,
      rows: view.last7DaysDaily.map((row) => ({ label: row.day, total: row.total, threads: row.threads })),
      daily: true,
    },
    {
      key: '30d', label: copy.last30Days, scope: view.last30Days,
      rows: view.last30DaysDaily.map((row) => ({ label: row.day, total: row.total, threads: row.threads })),
      daily: true,
    },
    {
      key: 'all', label: copy.allTime, scope: view.allTime,
      rows: view.monthly.map((row) => ({ label: row.period, total: row.total, threads: row.threads })),
      daily: false,
    },
  ];
  const scopeButtons = scopeRows.map(({ key, label }, index) =>
    `<button class="chart-tab${index === 0 ? ' active' : ''}" id="codex-overview-tab-${key}" role="tab" aria-controls="codex-overview-panel-${key}" aria-selected="${index === 0 ? 'true' : 'false'}" tabindex="${index === 0 ? '0' : '-1'}" data-codex-action="set-overview-scope" data-codex-overview-scope="${key}">${escapeHtml(label)}</button>`,
  ).join('');
  const metricRows: Array<[CodexMetricKey, string]> = [
    ['processed', copy.processed], ['fresh', copy.fresh], ['output', copy.output],
    ['reasoning', copy.reasoning], ['sessions', copy.threads],
  ];
  const metrics = metricRows.map(([key, label]) =>
    `<button class="chart-tab${key === 'processed' ? ' active' : ''}" data-codex-action="set-chart-metric" data-codex-chart-metric="${key}" aria-pressed="${key === 'processed' ? 'true' : 'false'}">${escapeHtml(label)}</button>`,
  ).join('');
  const panels = scopeRows.map(({ key, scope, rows, daily }, index) => {
    if (!scope) {
      return `<section id="codex-overview-panel-${key}" role="tabpanel" aria-labelledby="codex-overview-tab-${key}" data-codex-overview-panel="${key}" data-codex-overview-dataset="${key}"${index === 0 ? '' : ' hidden'}><p>${escapeHtml(copy.noRecentTask)}</p></section>`;
    }
    const maximum = (metric: CodexMetricKey): number => Math.max(0, ...rows.map((row) => metric === 'sessions' ? row.threads : row.total[metric]));
    const axis = metricRows.map(([metric]) =>
      `data-axis-top-${metric}="${formatted(format, maximum(metric))}" data-axis-mid-${metric}="${formatted(format, maximum(metric) / 2)}"`,
    ).join(' ');
    const maxProcessed = Math.max(1, maximum('processed'));
    const bars = rows.map((row) => {
      const labels = metricRows.map(([metric, label]) => {
        const value = metric === 'sessions' ? row.threads : row.total[metric];
        return `data-label-${metric}="${formatted(format, value)}" data-name-${metric}="${escapeHtml(label)}"`;
      }).join(' ');
      const dateAction = daily
        ? ` data-codex-action="drilldown-date" data-codex-date="${escapeHtml(row.label)}"`
        : '';
      return `<div class="hc-col"><span class="hc-barval codex-chart-value" data-codex-chart-value>${formatted(format, row.total.processed)}</span><button class="chart-bar cache-creation-bar codex-chart-bar" data-codex-chart-bar data-row-label="${escapeHtml(row.label)}" data-processed="${Math.max(0, row.total.processed)}" data-fresh="${Math.max(0, row.total.fresh)}" data-output="${Math.max(0, row.total.output)}" data-reasoning="${Math.max(0, row.total.reasoning)}" data-sessions="${Math.max(0, row.threads)}" ${labels}${dateAction} style="height:${Math.max(2, Math.round((row.total.processed / maxProcessed) * 100))}px" title="${escapeHtml(row.label)} · ${escapeHtml(copy.processed)}: ${formatted(format, row.total.processed)}"></button><span class="hc-xlabel">${escapeHtml(row.label)}</span></div>`;
    }).join('');
    const tableRows = rows.map((row) => {
      const rowAttribute = daily
        ? ` data-codex-date-row="${escapeHtml(row.label)}" tabindex="-1"`
        : key === 'all' ? ` data-codex-month-row="${escapeHtml(row.label)}"` : '';
      return `<tr${rowAttribute}><td class="date-cell">${escapeHtml(row.label)}</td><td>${formatted(format, row.total.processed)}</td><td>${formatted(format, row.total.fresh)}</td><td>${formatted(format, row.total.output)}</td><td>${formatted(format, row.threads)}</td></tr>`;
    }).join('');
    const table = rows.length
      ? `<div class="daily-table-container"><table class="daily-table"><thead><tr><th>${escapeHtml(copy.date)}</th><th>${escapeHtml(copy.processed)}</th><th>${escapeHtml(copy.fresh)}</th><th>${escapeHtml(copy.output)}</th><th>${escapeHtml(copy.threads)}</th></tr></thead><tbody>${tableRows}</tbody></table></div>`
      : `<p>${escapeHtml(daily ? copy.noDailyData : copy.noMonthlyData ?? copy.noDailyData)}</p>`;
    return `<section id="codex-overview-panel-${key}" role="tabpanel" aria-labelledby="codex-overview-tab-${key}" data-codex-overview-panel="${key}" data-codex-overview-dataset="${key}" ${axis}${index === 0 ? '' : ' hidden'}>${scopePanel(scope, copy, format, ctx.formatters.duration)}<div class="hc-wrap"><div class="hc-yaxis"><span class="hc-yval">${formatted(format, maximum('processed'))}</span><span class="hc-yval">${formatted(format, maximum('processed') / 2)}</span><span class="hc-yval">${formatted(format, 0)}</span></div><div class="hc-main"><div class="hc-scroll"><div class="hc-plot"><div class="hc-grid hc-grid-top"></div><div class="hc-grid hc-grid-mid"></div><div class="hc-bars chart-bars">${bars}</div></div></div></div></div>${table}</section>`;
  }).join('');
  return `<section class="daily-breakdown codex-overview-trend" data-codex-section="trend"><h3>${escapeHtml(copy.daily)}</h3><div class="chart-tabs codex-overview-scope" role="tablist">${scopeButtons}</div><div class="chart-tabs codex-overview-metric">${metrics}</div>${panels}</section>`;
}

function taskPanel(ctx: CodexRenderContext): string {
  const { view, copy } = ctx;
  const format = ctx.formatters.number;
  const quality = view.qualityFlags.length > 0
    ? view.qualityFlags.map((item) => `${escapeHtml(item.flag)}: ${formatted(format, item.count)}`).join(', ')
    : copy.complete;
  return `${renderLimitsSection(ctx)}${renderRecentTaskSection(ctx)}${renderTrendSection(ctx)}<details class="model-item codex-coverage"><summary>${escapeHtml(copy.coverage)} · ${escapeHtml(copy.quality)}</summary><p><strong>${escapeHtml(copy.coverage)}</strong>: ${formatted(format, view.coverage.indexedFiles)}/${formatted(format, view.coverage.totalFiles)} files · ${formatted(ctx.formatters.bytes, view.coverage.indexedBytes)}/${formatted(ctx.formatters.bytes, view.coverage.totalBytes)} bytes · ${escapeHtml(view.coverage.complete ? copy.complete : copy.partial)}<br><strong>${escapeHtml(copy.quality)}</strong>: ${quality}</p></details>`;
}

function coverageMarker(
  range: string,
  coverage: CodexUsageView['periodCoverage']['last7Days'],
  ctx: CodexRenderContext,
): string {
  return `<p class="model-details codex-period-coverage" data-codex-coverage-range="${range}" data-codex-coverage-status="${coverage.complete ? 'complete' : 'partial'}" data-codex-migrated-files="${Math.max(0, coverage.migratedFiles)}" data-codex-total-files="${Math.max(0, coverage.totalFiles)}" data-codex-migrated-bytes="${Math.max(0, coverage.migratedBytes)}" data-codex-total-bytes="${Math.max(0, coverage.totalBytes)}">${escapeHtml(ctx.copy.coverage)}: ${formatted(ctx.formatters.number, coverage.migratedFiles)}/${formatted(ctx.formatters.number, coverage.totalFiles)} files · ${formatted(ctx.formatters.bytes, coverage.migratedBytes)}/${formatted(ctx.formatters.bytes, coverage.totalBytes)} bytes · ${escapeHtml(coverage.complete ? ctx.copy.complete : ctx.copy.partial)}</p>`;
}

export function renderCodexOverview(ctx: CodexRenderContext): string {
  return taskPanel(ctx);
}

export function renderCodexExplore(ctx: CodexRenderContext): string {
  const { view, copy } = ctx;
  const format = ctx.formatters.number;
  const dailyChartRows = (rows: CodexDailyUsageView[]): CodexChartRow[] =>
    rows.map((row) => ({ label: row.day, total: row.total, threads: row.threads }));
  const monthlyChartRows: CodexChartRow[] = view.monthly.map((row) => ({
    label: row.period,
    total: row.total,
    threads: row.threads,
  }));
  const views = [
    ['projects', copy.projects],
    ['sessions', copy.sessions],
    ['models-effort', copy.modelsEffort],
  ];
  const viewButtons = views.map(([key, label], index) =>
    `<button class="chart-tab${index === 0 ? ' active' : ''}" id="codex-explore-tab-${key}" role="tab" aria-controls="codex-explore-panel-${key}" aria-selected="${index === 0 ? 'true' : 'false'}" tabindex="${index === 0 ? '0' : '-1'}" data-codex-explore-view-button="${key}" data-codex-action="select-explore-view" data-codex-explore-view="${key}">${escapeHtml(label)}</button>`,
  ).join('');
  const scopeRows: Array<[string, string, CodexUsageScopeView | null]> = [
    ['recent', copy.lastTask, view.lastTask],
    ['7d', copy.last7Days, view.last7Days],
    ['30d', copy.last30Days, view.last30Days],
    ['all', copy.allTime, view.allTime],
  ];
  const scopeButtons = scopeRows.map(([key, label], index) =>
    `<button class="chart-tab${index === 0 ? ' active' : ''}" id="codex-model-effort-tab-${key}" role="tab" aria-controls="codex-model-effort-panel-${key}" aria-selected="${index === 0 ? 'true' : 'false'}" tabindex="${index === 0 ? '0' : '-1'}" data-codex-action="set-model-effort-scope" data-codex-model-effort-scope="${key}">${escapeHtml(label)}</button>`,
  ).join('');
  const scopePanels = scopeRows.map(([key, _label, scope], index) => {
    let content: string;
    if (!scope) {
      content = `<p>${escapeHtml(copy.noRecentTask)}</p>`;
    } else if (key === '7d') {
      content = `${scopePanel(scope, copy, format, ctx.formatters.duration)}${coverageMarker('7d', view.periodCoverage.last7Days, ctx)}${periodChart('codex-7d', dailyChartRows(view.last7DaysDaily), copy, format)}`;
    } else if (key === '30d') {
      content = `${scopePanel(scope, copy, format, ctx.formatters.duration)}${coverageMarker('30d', view.periodCoverage.last30Days, ctx)}${periodChart('codex-30d', dailyChartRows(view.last30DaysDaily), copy, format)}`;
    } else if (key === 'all') {
      content = `<div data-codex-scope-summary="all">${scopePanel(scope, copy, format, ctx.formatters.duration)}</div><section class="codex-period-trend" data-codex-trend="all" data-codex-coverage-status="${view.periodCoverage.allTime.complete ? 'complete' : 'partial'}">${coverageMarker('all', view.periodCoverage.allTime, ctx)}${periodChart('codex-all', monthlyChartRows, copy, format, { range: 'all', complete: view.periodCoverage.allTime.complete })}${monthlyTable(view.monthly, copy, format)}</section>`;
    } else {
      content = scopePanel(scope, copy, format, ctx.formatters.duration);
    }
    return `<section class="codex-model-effort-scope${index === 0 ? ' active' : ''}" id="codex-model-effort-panel-${key}" role="tabpanel" aria-labelledby="codex-model-effort-tab-${key}"${index === 0 ? '' : ' hidden'} data-codex-model-effort-panel="${key}">${content}</section>`;
  }).join('');
  return `<nav class="chart-tabs codex-explore-views" id="codex-explore-tablist" role="tablist" aria-label="${escapeHtml(copy.explore ?? copy.projects)}">${viewButtons}</nav>
    <section class="codex-explore-view active" id="codex-explore-panel-projects" role="tabpanel" aria-labelledby="codex-explore-tab-projects" data-codex-explore-view="projects" data-codex-explore-panel="projects">${projectTable(view, copy, format, ctx.formatters.dateTime)}</section>
    <section class="codex-explore-view" id="codex-explore-panel-sessions" role="tabpanel" aria-labelledby="codex-explore-tab-sessions" hidden data-codex-explore-view="sessions" data-codex-explore-panel="sessions">${threadTable(view.recentThreads, view.totalThreadCount, copy, format, ctx.exploreFilters, view.sessionPeriodAvailability, ctx.formatters.dateTime, ctx.formatters.duration)}</section>
    <section class="codex-explore-view" id="codex-explore-panel-models-effort" role="tabpanel" aria-labelledby="codex-explore-tab-models-effort" hidden data-codex-explore-view="models-effort" data-codex-explore-panel="models-effort"><h3>${escapeHtml(copy.modelsEffort)}</h3><div class="chart-tabs" id="codex-model-effort-tablist" role="tablist" aria-label="${escapeHtml(copy.scope)}">${scopeButtons}</div>${scopePanels}</section>`;
}

export function renderCodexRecommendations(ctx: CodexRenderContext): string {
  if (!ctx.optimizationEnabled) {
    return '';
  }
  const scopes: Array<{
    key: keyof CodexScopedInsights;
    domKey: 'recent' | '7d' | '30d' | 'all';
    label: string;
    scope: CodexUsageScopeView | null;
    partial: boolean;
  }> = [
    { key: 'recent', domKey: 'recent', label: ctx.copy.lastTask, scope: ctx.view.lastTask, partial: false },
    { key: 'last7Days', domKey: '7d', label: ctx.copy.last7Days, scope: ctx.view.last7Days, partial: !ctx.view.periodCoverage.last7Days.complete },
    { key: 'last30Days', domKey: '30d', label: ctx.copy.last30Days, scope: ctx.view.last30Days, partial: !ctx.view.periodCoverage.last30Days.complete },
    // All-time summary uses verified aggregates; its trend migration state does not gate advice.
    { key: 'allTime', domKey: 'all', label: ctx.copy.allTime, scope: ctx.view.allTime, partial: false },
  ];
  const defaultScope = scopes.find((item) => !item.partial && item.scope)?.domKey ?? 'recent';
  const buttons = scopes.map((item) => `<button class="chart-tab${item.domKey === defaultScope ? ' active' : ''}" id="codex-recommendation-tab-${item.domKey}" role="tab" aria-controls="codex-recommendation-panel-${item.domKey}" aria-selected="${item.domKey === defaultScope ? 'true' : 'false'}" tabindex="${item.domKey === defaultScope ? '0' : '-1'}" data-codex-action="set-recommendation-scope" data-codex-recommendation-scope="${item.domKey}"${item.partial ? ' disabled aria-disabled="true"' : ''}>${escapeHtml(item.label)}</button>`).join('');
  const partialNote = scopes.some((item) => item.partial)
    ? `<p class="insight-note codex-recommendation-coverage-note">${escapeHtml(ctx.copy.recommendationPartial)}</p>`
    : '';
  const panels = scopes.map((item) => {
    const cards = item.partial
      ? ''
      : ctx.insights[item.key].map((insight) => insightCard(insight, item.label, ctx.copy, ctx.formatters.number)).join('');
    const empty = item.partial || cards
      ? ''
      : `<article class="model-item codex-insight-empty"><p class="insight-note">${escapeHtml(ctx.copy.recommendationEmpty)}</p></article>`;
    const composition = item.scope ? recommendationComposition(item.scope, ctx.copy, ctx.formatters.number) : '';
    const constraint = item.partial ? '' : localizedConstraint(ctx.insights[item.key], ctx.copy);
    const constraintHtml = constraint
      ? `<details class="model-item"><summary>${escapeHtml(ctx.copy.pasteConstraint)}</summary><pre>${escapeHtml(constraint)}</pre></details>`
      : '';
    return `<section class="codex-recommendation-scope${item.domKey === defaultScope ? ' active' : ''}" id="codex-recommendation-panel-${item.domKey}" role="tabpanel" aria-labelledby="codex-recommendation-tab-${item.domKey}" data-codex-recommendation-panel="${item.domKey}"${item.domKey === defaultScope ? '' : ' hidden'}>${composition}${cards}${empty}${constraintHtml}</section>`;
  }).join('');
  return `<section class="codex-recommendations"><h3>${escapeHtml(ctx.copy.recommendations ?? ctx.copy.optimization)}</h3><div class="chart-tabs codex-recommendation-tabs" role="tablist">${buttons}</div>${partialNote}${panels}</section>`;
}

function recommendationComposition(
  scope: CodexUsageScopeView,
  copy: CodexViewCopy,
  format: NumberFormatter,
): string {
  const totalFresh = Math.max(0, scope.total.fresh);
  const childFresh = totalFresh * Math.max(0, Math.min(1, scope.childFreshShare));
  const reviewerFresh = totalFresh * Math.max(0, Math.min(1, scope.approvalReviewerFreshShare));
  const rootFresh = Math.max(0, totalFresh - childFresh - reviewerFresh);
  const freshFact = (label: string, fresh: number): string =>
    `${escapeHtml(label)}: ${formatted(format, fresh)} ${escapeHtml(copy.fresh)} (${percent(totalFresh > 0 ? fresh / totalFresh : 0)})`;
  const roles = [
    freshFact(copy.rootRole, rootFresh),
    freshFact(copy.childRole, childFresh),
    freshFact(copy.approvalReviewerRole, reviewerFresh),
  ].join(' · ');
  const dimension = (items: CodexUsageScopeView['models']): string => items
    .map((item) => freshFact(item.key, Math.max(0, item.totals.fresh)))
    .join(', ') || escapeHtml(copy.unavailable);
  const models = dimension(scope.models);
  const efforts = dimension(scope.efforts);
  const structural = scope.structural;
  const proxyKpi = [
    `${escapeHtml(copy.patchCalls)}: ${formatted(format, structural.patchCalls)}`,
    `${escapeHtml(copy.postPatchToolCallsPerPatchCall)}: ${formatted(format, structural.patchCalls > 0 ? structural.postPatchToolCalls / structural.patchCalls : 0)}`,
    `${escapeHtml(copy.compactions)}: ${formatted(format, structural.compactCount)}`,
  ].join(' · ');
  return `<section class="model-item codex-recommendation-composition"><h4>${escapeHtml(copy.recommendationComposition)}</h4><p>${roles}</p><p>${escapeHtml(copy.models)}: ${models} · ${escapeHtml(copy.efforts)}: ${efforts}</p><p class="insight-note"><strong>${escapeHtml(copy.recommendationProxyKpi)}:</strong> ${proxyKpi}</p></section>`;
}

export function renderCodexSettings(ctx: CodexRenderContext): string {
  return `<button class="btn-secondary" data-codex-action="close-settings">${escapeHtml(ctx.copy.overview)}</button>${adaptCodexSettingsHtml(ctx.settingsHtml)}`;
}

function adaptCodexSettingsHtml(html: string): string {
  return html.replace(
    /\s+on(click|change|input)\s*=\s*(["'])(.*?)\2/gi,
    (_attribute, _eventName: string, _quote: string, handler: string) => {
      const resetKeys = parseCodexResetKeys(handler);
      if (resetKeys) {
        return ` data-codex-action="reset-settings" data-codex-setting-keys="${escapeHtml(JSON.stringify(resetKeys))}"`;
      }
      const setting = handler.match(
        /^setSetting\('([a-zA-Z0-9._-]+)',\s*this\.(checked|value),\s*'(boolean|number|string)'\)$/,
      );
      if (setting) {
        return ` data-codex-action="set-setting" data-codex-setting-key="${escapeHtml(setting[1])}" data-codex-setting-value-source="${setting[2]}" data-codex-setting-type="${setting[3]}"`;
      }
      return '';
    },
  );
}

function parseCodexResetKeys(handler: string): string[] | null {
  const call = handler.match(/^resetAllSettings\((.*)\)$/);
  if (!call) {
    return null;
  }
  const serialized = call[1]
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (
      !Array.isArray(parsed) ||
      parsed.length > 100 ||
      parsed.some(
        (key) =>
          typeof key !== 'string' ||
          key.length === 0 ||
          key.length > 100 ||
          !/^[a-zA-Z0-9._-]+$/.test(key),
      )
    ) {
      return null;
    }
    return [...new Set(parsed)];
  } catch {
    return null;
  }
}

export function renderProviderCompare(
  input: ProviderCompareInput,
  copy: CodexViewCopy = CODEX_COPY_EN,
): string {
  const provider = (
    value: ProviderCompareInput['claude'] | ProviderCompareInput['codex'],
  ): string => `<article class="summary-item provider-compare-card"><h3>${escapeHtml(value.label)}</h3><dl><dt>${escapeHtml(copy.input)}</dt><dd>${number(value.input)}</dd><dt>${escapeHtml(copy.cachedInput)}</dt><dd>${number(value.cache)}</dd><dt>${escapeHtml(copy.output)}</dt><dd>${number(value.output)}</dd></dl></article>`;
  return `<section class="provider-compare"><h2>${escapeHtml(copy.compareTitle)}</h2><div class="provider-compare-grid">${provider(input.claude)}${provider(input.codex)}</div></section>`;
}

export function defaultDashboardProvider(
  hasClaude: boolean,
  hasCodex: boolean,
): 'claude' | 'codex' {
  return hasClaude || !hasCodex ? 'claude' : 'codex';
}
