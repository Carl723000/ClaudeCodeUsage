import {
  CodexInsight,
  CodexInsightKind,
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
  constraintTests: string;
  constraintStop: string;
  compareTitle: string;
  noRecentTask: string;
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
  constraintNoAgents: 'Do not start unnecessary subagents or independent review passes.',
  constraintLowerEffort: 'For this small change, compare one lower effort level on a representative task.',
  constraintTests: 'Run one focused test tied to the change, then one full test pass.',
  constraintStop: 'Stop when the acceptance criteria pass; do not expand this into production-grade hardening.',
  compareTitle: 'Provider comparison',
  noRecentTask: 'No recent Codex task is indexed yet.',
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
    'multi-agent-tax': 'Child-thread fresh usage',
    'effort-comparison': 'Compare one lower effort level',
    'post-patch-tool-call-intensity': 'Post-patch tool-call proxy',
    'cache-context': 'Cache and long-context context',
    'approval-reviewer': 'Approval-reviewer overhead',
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
}

export interface CodexScopedInsights {
  recent: CodexInsight[];
  last7Days: CodexInsight[];
  last30Days: CodexInsight[];
  allTime: CodexInsight[];
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
    ['threads', copy.threads],
  ];
  const metricValue = (row: CodexChartRow, key: string): number =>
    key === 'threads'
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
        threads: row.threads,
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
      return `<div class="hc-col"><div class="hc-barval codex-chart-value" data-codex-chart-value>${formatted(format, row.total.fresh)}</div><div class="chart-bar input-bar codex-chart-bar" style="height:${height}px" data-codex-chart="${escapeHtml(chartId)}" data-row-label="${escapeHtml(row.label)}" data-processed="${Math.max(0, row.total.processed)}" data-fresh="${Math.max(0, row.total.fresh)}" data-output="${Math.max(0, row.total.output)}" data-reasoning="${Math.max(0, row.total.reasoning)}" data-threads="${Math.max(0, row.threads)}" ${labelAttributes} title="${escapeHtml(row.label)} · ${escapeHtml(copy.fresh)}: ${formatted(format, row.total.fresh)}"></div></div>`;
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
  projects: Map<string, string>,
  totalCount: number,
  copy: CodexViewCopy,
  format: NumberFormatter,
  formatDateTime: (timestamp: number) => string = (timestamp) => observed(timestamp, copy),
  formatDuration: (milliseconds: number) => string = duration,
): string {
  if (rows.length === 0) {
    return `<p>${escapeHtml(copy.noThreadData)}</p>`;
  }
  const threadIds = new Map(
    rows.map((row, index) => [row.sessionKey, `t${index}`]),
  );
  const children = new Map<string, number>();
  for (const row of rows) {
    if (row.parentSessionKey) {
      children.set(
        row.parentSessionKey,
        (children.get(row.parentSessionKey) ?? 0) + 1,
      );
    }
  }
  const projectOptions = [...new Map(
    rows.map((row) => [
      projects.get(row.projectKey) ?? '',
      row.projectName ?? copy.unidentifiedProject,
    ]),
  ).entries()]
    .filter(([id]) => id)
    .sort((left, right) => left[1].localeCompare(right[1]))
    .map(([id, label]) => `<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`)
    .join('');
  const modelOptions = [...new Set(rows.flatMap((row) => row.models))]
    .sort()
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join('');
  const effortOptions = [...new Set(rows.flatMap((row) => row.efforts))]
    .sort()
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join('');
  const select = (
    filter: string,
    label: string,
    options: string,
  ): string => `<select class="sess-model-select" data-codex-thread-filter="${filter}" data-codex-action="filter-threads" aria-label="${escapeHtml(label)}"><option value="all">${escapeHtml(copy.all)} ${escapeHtml(label)}</option>${options}</select>`;
  const filters = `<div class="sess-filters codex-thread-filters">
    <input type="search" data-codex-thread-search data-codex-action="filter-threads" placeholder="${escapeHtml(copy.searchThreads)}">
    ${select('role', copy.role, [
      ['root', copy.rootRole],
      ['subagent', copy.childRole],
      ['approval-reviewer', copy.approvalReviewerRole],
      ['unknown', copy.unknownRole],
    ].map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join(''))}
    ${select('project', copy.projectLabel, projectOptions)}
    ${select('model', copy.models, modelOptions)}
    ${select('effort', copy.efforts, effortOptions)}
  </div>`;
  const body = rows
    .map((row) => {
      const threadId = threadIds.get(row.sessionKey) ?? '';
      const parentId = row.parentSessionKey
        ? threadIds.get(row.parentSessionKey) ?? ''
        : '';
      const projectId = projects.get(row.projectKey) ?? '';
      const title = row.title ?? row.agentNickname ?? copy.unnamedSession;
      const parent = row.parentTitle
        ? `<div class="model-details">${escapeHtml(copy.parentThread)}: ${escapeHtml(row.parentTitle)}</div>`
        : '';
      const childCount = children.get(row.sessionKey) ?? 0;
      const childToggle = childCount > 0
        ? `<button class="group-toggle" aria-expanded="true" title="${escapeHtml(copy.expand)}" data-codex-action="toggle-thread-children" data-codex-thread-key="${escapeHtml(threadId)}">▼</button>`
        : '';
      const project = row.projectName ?? copy.unidentifiedProject;
      const directory = row.projectDirectoryName && row.projectDirectoryName !== project
        ? `<div class="model-details">${escapeHtml(copy.localDirectory)}: ${escapeHtml(row.projectDirectoryName)}</div>`
        : '';
      const search = [title, row.parentTitle, project, ...row.models, ...row.efforts]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return `<tr class="sort-row codex-thread-row${parentId ? ' codex-child-thread' : ''}" data-codex-thread-row data-thread-id="${escapeHtml(threadId)}" data-parent-thread="${escapeHtml(parentId)}" data-search="${escapeHtml(search)}" data-role="${escapeHtml(row.role)}" data-project="${escapeHtml(projectId)}" data-models="${escapeHtml(row.models.join('|'))}" data-efforts="${escapeHtml(row.efforts.join('|'))}" data-sort-title="${escapeHtml(title.toLowerCase())}" data-sort-time="${Math.max(0, row.observedAt)}" data-sort-role="${escapeHtml(row.role)}" data-sort-project="${escapeHtml(project.toLowerCase())}" data-sort-model="${escapeHtml(row.models.join(',').toLowerCase())}" data-sort-effort="${escapeHtml(row.efforts.join(',').toLowerCase())}" data-sort-processed="${Math.max(0, row.total.processed)}" data-sort-fresh="${Math.max(0, row.total.fresh)}" data-sort-cache="${row.total.input > 0 ? row.total.cachedInput / row.total.input : 0}" data-sort-output="${Math.max(0, row.total.output)}" data-sort-reasoning="${Math.max(0, row.total.reasoning)}" data-sort-duration="${Math.max(0, row.durationMs)}"><td class="name-cell">${childToggle}<strong>${escapeHtml(title)}</strong>${parent}</td><td class="date-cell">${escapeHtml(formatDateTime(row.observedAt))}</td><td>${escapeHtml(roleLabel(row.role, copy))}</td><td><strong>${escapeHtml(project)}</strong>${directory}</td><td>${escapeHtml(row.models.join(', '))}</td><td>${escapeHtml(row.efforts.join(', '))}</td><td>${formatted(format, row.total.processed)}</td><td>${formatted(format, row.total.fresh)}</td><td>${percent(row.total.input > 0 ? row.total.cachedInput / row.total.input : 0)}</td><td>${formatted(format, row.total.output)}</td><td>${formatted(format, row.total.reasoning)}</td><td>${escapeHtml(formatDuration(row.durationMs))}</td></tr>`;
    })
    .join('');
  const th = (key: string, label: string): string =>
    `<th class="sortable" data-sortkey="${key}">${escapeHtml(label)}</th>`;
  return `<section class="daily-breakdown"><h3>${escapeHtml(copy.threads)}</h3><p class="model-details"><span data-codex-thread-visible>${formatted(format, rows.length)}</span>/${formatted(format, totalCount)} ${escapeHtml(copy.threads)}</p>${filters}<div class="daily-table-container"><table class="daily-table sortable-table"><thead><tr>${th('title', copy.threadLabel)}${th('time', copy.date)}${th('role', copy.role)}${th('project', copy.projectLabel)}${th('model', copy.models)}${th('effort', copy.efforts)}${th('processed', copy.processed)}${th('fresh', copy.fresh)}${th('cache', copy.cacheShare)}${th('output', copy.output)}${th('reasoning', copy.reasoning)}${th('duration', copy.duration)}</tr></thead><tbody>${body}</tbody></table></div></section>`;
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
    .map((project, index) => {
      const projectId = `p${index}`;
      const name = project.name ?? copy.unidentifiedProject;
      const directory = project.directoryName && project.directoryName !== name
        ? `<div class="model-details">${escapeHtml(copy.localDirectory)}: ${escapeHtml(project.directoryName)}</div>`
        : '';
      const threads = view.recentThreads
        .filter((thread) => thread.projectKey === project.projectKey)
        .slice(0, 20)
        .map((thread) => `<div class="codex-project-thread"><strong>${escapeHtml(thread.title ?? thread.agentNickname ?? copy.unnamedSession)}</strong><span>${escapeHtml(roleLabel(thread.role, copy))} · ${formatted(format, thread.total.fresh)} ${escapeHtml(copy.fresh)}</span></div>`)
        .join('');
      return `<tr class="sort-row codex-project-row" data-sort-name="${escapeHtml(name.toLowerCase())}" data-sort-lastactive="${Math.max(0, project.lastActiveAt)}" data-sort-processed="${Math.max(0, project.scope.total.processed)}" data-sort-fresh="${Math.max(0, project.scope.total.fresh)}" data-sort-output="${Math.max(0, project.scope.total.output)}" data-sort-reasoning="${Math.max(0, project.scope.total.reasoning)}" data-sort-roots="${Math.max(0, project.scope.rootTasks)}" data-sort-children="${Math.max(0, project.scope.childThreads)}"><td><button class="group-toggle" data-codex-project-toggle="${projectId}" aria-expanded="false" data-codex-action="toggle-project" data-codex-project-key="${projectId}">▶</button><strong>${escapeHtml(name)}</strong>${directory}</td><td>${escapeHtml(formatDateTime(project.lastActiveAt))}</td><td>${formatted(format, project.scope.total.processed)}</td><td>${formatted(format, project.scope.total.fresh)}</td><td>${formatted(format, project.scope.total.output)}</td><td>${formatted(format, project.scope.total.reasoning)}</td><td>${formatted(format, project.scope.rootTasks)}</td><td>${formatted(format, project.scope.childThreads)}</td><td>${formatted(format, project.scope.approvalReviewerThreads)}</td></tr><tr class="sort-child codex-project-detail-row" data-codex-project-detail="${projectId}" hidden><td colspan="9">${threads || escapeHtml(copy.noThreadData)}</td></tr>`;
    })
    .join('');
  const th = (key: string, label: string): string =>
    `<th class="sortable" data-sortkey="${key}">${escapeHtml(label)}</th>`;
  return `<section class="daily-breakdown"><h3>${escapeHtml(copy.projects)}</h3><div class="daily-table-container"><table class="daily-table sortable-table"><thead><tr>${th('name', copy.projectLabel)}${th('lastactive', copy.lastActive)}${th('processed', copy.processed)}${th('fresh', copy.fresh)}${th('output', copy.output)}${th('reasoning', copy.reasoning)}${th('roots', copy.rootTasks)}${th('children', copy.childThreads)}<th>${escapeHtml(copy.approvalReviewers)}</th></tr></thead><tbody>${body}</tbody></table></div></section>`;
}

function insightCard(insight: CodexInsight, copy: CodexViewCopy): string {
  const evidence = Object.entries(insight.evidence)
    .map(([key, value]) => `<span>${escapeHtml(key)}: ${escapeHtml(value)}</span>`)
    .join('');
  return `<article class="model-item codex-insight codex-insight-${escapeHtml(insight.severity)}"><h4>${escapeHtml(copy.insightTitles[insight.kind])}</h4><div class="codex-evidence">${evidence}</div>${insight.proxy ? `<p>${escapeHtml(copy.structuralProxy)}</p>` : ''}</article>`;
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
  if (kinds.has('multi-agent-tax') || kinds.has('approval-reviewer')) {
    sentences.push(copy.constraintNoAgents);
  }
  if (kinds.has('effort-comparison')) {
    sentences.push(copy.constraintLowerEffort);
  }
  sentences.push(copy.constraintTests, copy.constraintStop);
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
    const cards = insights[key].map((insight) => insightCard(insight, copy)).join('');
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
  const scopeButtons = [
    ['recent', copy.lastTask], ['7d', copy.last7Days], ['30d', copy.last30Days], ['all', copy.allTime],
  ].map(([key, label]) => `<button class="chart-tab${key === '7d' ? ' active' : ''}" data-codex-action="set-overview-scope" data-codex-overview-scope="${key}">${escapeHtml(label)}</button>`).join('');
  const metrics = [
    ['processed', copy.processed], ['fresh', copy.fresh], ['output', copy.output], ['reasoning', copy.reasoning], ['threads', copy.threads],
  ].map(([key, label]) => `<button class="chart-tab${key === 'fresh' ? ' active' : ''}" data-codex-action="set-chart-metric" data-codex-chart-metric="${key}">${escapeHtml(label)}</button>`).join('');
  const rows = view.last7DaysDaily;
  const maxFresh = Math.max(1, ...rows.map((row) => row.total.fresh));
  const bars = rows.map((row) => `<button class="chart-bar input-bar codex-chart-bar" data-codex-action="drilldown-date" data-codex-date="${escapeHtml(row.day)}" data-processed="${Math.max(0, row.total.processed)}" data-fresh="${Math.max(0, row.total.fresh)}" data-output="${Math.max(0, row.total.output)}" data-reasoning="${Math.max(0, row.total.reasoning)}" data-threads="${Math.max(0, row.threads)}" style="height:${Math.max(2, Math.round((row.total.fresh / maxFresh) * 100))}px" title="${escapeHtml(row.day)} · ${escapeHtml(copy.fresh)}: ${formatted(format, row.total.fresh)}"></button>`).join('');
  const tableRows = rows.map((row) => `<tr><td class="date-cell">${escapeHtml(row.day)}</td><td>${formatted(format, row.total.processed)}</td><td>${formatted(format, row.total.fresh)}</td><td>${formatted(format, row.total.output)}</td><td>${formatted(format, row.threads)}</td></tr>`).join('');
  return `<section class="daily-breakdown codex-overview-trend" data-codex-section="trend"><h3>${escapeHtml(copy.daily)}</h3><div class="chart-tabs codex-overview-scope">${scopeButtons}</div>${scopePanel(view.last7Days, copy, format, ctx.formatters.duration)}<div class="chart-tabs codex-overview-metric">${metrics}</div><div class="hc-wrap"><div class="hc-main"><div class="hc-scroll"><div class="hc-plot"><div class="hc-grid hc-grid-top"></div><div class="hc-grid hc-grid-mid"></div><div class="hc-bars chart-bars">${bars}</div></div></div></div></div><div class="daily-table-container"><table class="daily-table"><thead><tr><th>${escapeHtml(copy.date)}</th><th>${escapeHtml(copy.processed)}</th><th>${escapeHtml(copy.fresh)}</th><th>${escapeHtml(copy.output)}</th><th>${escapeHtml(copy.threads)}</th></tr></thead><tbody>${tableRows}</tbody></table></div></section>`;
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
  const projectIndexes = new Map(
    view.projects.map((project, index) => [project.projectKey, `p${index}`]),
  );
  const dailyChartRows = (
    rows: CodexDailyUsageView[],
  ): CodexChartRow[] => rows.map((row) => ({
    label: row.day,
    total: row.total,
    threads: row.threads,
  }));
  const monthlyChartRows: CodexChartRow[] = view.monthly.map((row) => ({
    label: row.period,
    total: row.total,
    threads: row.threads,
  }));
  return `<section class="codex-explore-scope" data-codex-scope="7d">${coverageMarker('7d', view.periodCoverage.last7Days, ctx)}${scopePanel(view.last7Days, copy, format, ctx.formatters.duration)}${periodChart('codex-7d', dailyChartRows(view.last7DaysDaily), copy, format)}${dailyTable(view.last7DaysDaily, copy, format)}</section>
    <section class="codex-explore-scope" data-codex-scope="30d">${coverageMarker('30d', view.periodCoverage.last30Days, ctx)}${scopePanel(view.last30Days, copy, format, ctx.formatters.duration)}${periodChart('codex-30d', dailyChartRows(view.last30DaysDaily), copy, format)}${dailyTable(view.last30DaysDaily, copy, format)}</section>
    <section class="codex-explore-scope" data-codex-scope="all"><div data-codex-scope-summary="all">${scopePanel(view.allTime, copy, format, ctx.formatters.duration)}</div><section class="codex-period-trend" data-codex-trend="all" data-codex-coverage-status="${view.periodCoverage.allTime.complete ? 'complete' : 'partial'}">${coverageMarker('all', view.periodCoverage.allTime, ctx)}${periodChart('codex-all', monthlyChartRows, copy, format, { range: 'all', complete: view.periodCoverage.allTime.complete })}${monthlyTable(view.monthly, copy, format)}</section></section>
    ${threadTable(view.recentThreads, projectIndexes, view.totalThreadCount, copy, format, ctx.formatters.dateTime, ctx.formatters.duration)}
    ${projectTable(view, copy, format, ctx.formatters.dateTime)}`;
}

export function renderCodexRecommendations(ctx: CodexRenderContext): string {
  if (!ctx.optimizationEnabled) {
    return '';
  }
  const quality = ctx.view.qualityFlags.length > 0
    ? ctx.view.qualityFlags
        .map((item) => `${escapeHtml(item.flag)}: ${formatted(ctx.formatters.number, item.count)}`)
        .join(', ')
    : ctx.copy.complete;
  return `<h3>${escapeHtml(ctx.copy.behavior)}</h3>${behaviorPanel(
    ctx.view,
    ctx.insights,
    quality,
    ctx.copy,
    ctx.formatters.number,
    ctx.formatters.bytes,
  )}`;
}

export function renderCodexSettings(ctx: CodexRenderContext): string {
  return `<button class="btn-secondary" data-codex-action="close-settings">${escapeHtml(ctx.copy.overview)}</button>${adaptCodexSettingsHtml(ctx.settingsHtml)}`;
}

function adaptCodexSettingsHtml(html: string): string {
  return html.replace(
    /\s+on(click|change|input)\s*=\s*(["'])(.*?)\2/gi,
    (_attribute, eventName: string, _quote: string, handler: string) => {
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
      return ` data-codex-action="settings-${eventName.toLowerCase()}"`;
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
