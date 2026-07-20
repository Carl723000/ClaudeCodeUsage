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

export interface CodexViewCopy {
  title: string;
  beta: string;
  overview: string;
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
  postChangeCommandsPerFile: string;
  patchRounds: string;
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
  insightTitles: Record<CodexInsightKind, string>;
}

export const CODEX_COPY_EN: CodexViewCopy = {
  title: 'Codex usage',
  beta: 'Beta',
  overview: 'Overview',
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
  postChangeCommandsPerFile: 'Post-change commands / file',
  patchRounds: 'Patch rounds',
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
  duration: 'Task-reported duration',
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
  structuralProxy: 'Structural proxy; command bodies are not read.',
  pasteConstraint: 'Paste-ready constraint',
  constraintNoAgents: 'Do not start unnecessary subagents or independent review passes.',
  constraintLowerEffort: 'For this small change, compare one lower effort level on a representative task.',
  constraintTests: 'Run one focused test tied to the change, then one full test pass.',
  constraintStop: 'Stop when the acceptance criteria pass; do not expand this into production-grade hardening.',
  compareTitle: 'Provider comparison',
  noRecentTask: 'No recent Codex task is indexed yet.',
  insightTitles: {
    'multi-agent-tax': 'Child-thread fresh usage',
    'effort-comparison': 'Compare one lower effort level',
    'post-change-command-intensity': 'Post-change command intensity',
    'cache-context': 'Cache and long-context context',
    'approval-reviewer': 'Approval-reviewer overhead',
  },
};

export interface ProviderCompareInput {
  claude: { label: string; input: number; output: number; cache: number };
  codex: { label: string; input: number; output: number; cache: number };
}

export interface CodexRenderOptions {
  formatNumber?: (value: number) => string;
  settingsHtml?: string;
  optimizationEnabled?: boolean;
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
      <span><span class="model-stat-label">${escapeHtml(copy.duration)}</span><strong>${duration(scope.durationMs)}</strong></span>
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
    return `<p>${escapeHtml(copy.noDailyData)}</p>`;
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
): string {
  if (rows.length === 0) {
    return '';
  }
  const ordered = [...rows].reverse();
  const maxFresh = Math.max(0, ...ordered.map((row) => row.total.fresh));
  const metrics: Array<[string, string]> = [
    ['processed', copy.processed],
    ['fresh', copy.fresh],
    ['output', copy.output],
    ['reasoning', copy.reasoning],
    ['threads', copy.threads],
  ];
  const buttons = metrics
    .map(
      ([key, label]) => `<button class="chart-tab ${key === 'fresh' ? 'active' : ''}" data-codex-chart-button="${escapeHtml(chartId)}:${key}" onclick="showCodexChartMetric('${escapeHtml(chartId)}','${key}')">${escapeHtml(label)}</button>`,
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
        ? Math.max(2, Math.round((row.total.fresh / maxFresh) * 140))
        : 2;
      return `<div class="chart-bar-container"><div class="codex-chart-value" data-codex-chart-value>${formatted(format, row.total.fresh)}</div><div class="chart-bar input-bar codex-chart-bar" style="height:${height}px" data-codex-chart="${escapeHtml(chartId)}" data-row-label="${escapeHtml(row.label)}" data-processed="${Math.max(0, row.total.processed)}" data-fresh="${Math.max(0, row.total.fresh)}" data-output="${Math.max(0, row.total.output)}" data-reasoning="${Math.max(0, row.total.reasoning)}" data-threads="${Math.max(0, row.threads)}" ${labelAttributes} title="${escapeHtml(row.label)} · ${escapeHtml(copy.fresh)}: ${formatted(format, row.total.fresh)}"></div><div class="chart-label">${escapeHtml(row.label)}</div></div>`;
    })
    .join('');
  return `<section class="daily-breakdown codex-period-chart" data-codex-chart-root="${escapeHtml(chartId)}"><div class="chart-tabs">${buttons}</div><div class="chart-container"><div class="chart-content"><div class="chart-bars">${bars}</div></div></div></section>`;
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

function limitPanel(
  limits: CodexUsageView['limits'],
  copy: CodexViewCopy,
  format: NumberFormatter,
): string {
  if (limits.length === 0) {
    return '';
  }
  const cards = limits.map((limit) => {
    const name = limit.limitName ?? limit.limitId ?? copy.usageLimits;
    const windows = limit.windows.map((window) => {
      const used = Math.max(0, Math.min(100, window.usedPercent));
      const reset = window.resetsAt
        ? `${escapeHtml(copy.resets)}: ${escapeHtml(observed(window.resetsAt, copy))}`
        : '';
      const durationLabel = window.windowMinutes
        ? ` · ${formatted(format, window.windowMinutes)}m`
        : '';
      return `<div class="codex-limit-window"><div class="cost-comp-head"><span>${escapeHtml(window.label ?? copy.usageLimits)}${durationLabel}</span><strong>${formatted(format, used)}%</strong></div><div class="cost-comp-bar"><div class="cost-comp-seg seg-input" style="width:${used.toFixed(2)}%"></div></div>${reset ? `<div class="model-details">${reset}</div>` : ''}</div>`;
    }).join('');
    const credit = limit.credits
      ? `<div class="model-details"><strong>${escapeHtml(copy.credits)}</strong>: ${limit.credits.unlimited ? escapeHtml(copy.unlimited) : escapeHtml(limit.credits.balance ?? (limit.credits.hasCredits ? copy.unavailable : '0'))}</div>`
      : '';
    return `<article class="model-item codex-limit-card"><h3>${escapeHtml(name)}</h3><div class="model-details">${escapeHtml(copy.lastObserved)}: ${escapeHtml(observed(limit.observedAt, copy))}</div>${windows}${credit}</article>`;
  }).join('');
  return `<section class="codex-limits"><h3>${escapeHtml(copy.usageLimits)}</h3><div class="model-list">${cards}</div></section>`;
}

function threadTable(
  rows: CodexThreadUsageView[],
  projects: Map<string, string>,
  totalCount: number,
  copy: CodexViewCopy,
  format: NumberFormatter,
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
  ): string => `<select class="sess-model-select" data-codex-thread-filter="${filter}" aria-label="${escapeHtml(label)}" onchange="filterCodexThreads()"><option value="all">${escapeHtml(copy.all)} ${escapeHtml(label)}</option>${options}</select>`;
  const filters = `<div class="sess-filters codex-thread-filters">
    <input type="search" data-codex-thread-search placeholder="${escapeHtml(copy.searchThreads)}" oninput="filterCodexThreads()">
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
        ? `<button class="group-toggle" aria-expanded="true" title="${escapeHtml(copy.expand)}" onclick="toggleCodexThreadChildren('${escapeHtml(threadId)}')">▼</button>`
        : '';
      const project = row.projectName ?? copy.unidentifiedProject;
      const directory = row.projectDirectoryName && row.projectDirectoryName !== project
        ? `<div class="model-details">${escapeHtml(copy.localDirectory)}: ${escapeHtml(row.projectDirectoryName)}</div>`
        : '';
      const search = [title, row.parentTitle, project, ...row.models, ...row.efforts]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return `<tr class="sort-row codex-thread-row${parentId ? ' codex-child-thread' : ''}" data-codex-thread-row data-thread-id="${escapeHtml(threadId)}" data-parent-thread="${escapeHtml(parentId)}" data-search="${escapeHtml(search)}" data-role="${escapeHtml(row.role)}" data-project="${escapeHtml(projectId)}" data-models="${escapeHtml(row.models.join('|'))}" data-efforts="${escapeHtml(row.efforts.join('|'))}" data-sort-title="${escapeHtml(title.toLowerCase())}" data-sort-time="${Math.max(0, row.observedAt)}" data-sort-role="${escapeHtml(row.role)}" data-sort-project="${escapeHtml(project.toLowerCase())}" data-sort-model="${escapeHtml(row.models.join(',').toLowerCase())}" data-sort-effort="${escapeHtml(row.efforts.join(',').toLowerCase())}" data-sort-processed="${Math.max(0, row.total.processed)}" data-sort-fresh="${Math.max(0, row.total.fresh)}" data-sort-cache="${row.total.input > 0 ? row.total.cachedInput / row.total.input : 0}" data-sort-output="${Math.max(0, row.total.output)}" data-sort-reasoning="${Math.max(0, row.total.reasoning)}" data-sort-duration="${Math.max(0, row.durationMs)}"><td class="name-cell">${childToggle}<strong>${escapeHtml(title)}</strong>${parent}</td><td class="date-cell">${escapeHtml(observed(row.observedAt, copy))}</td><td>${escapeHtml(roleLabel(row.role, copy))}</td><td><strong>${escapeHtml(project)}</strong>${directory}</td><td>${escapeHtml(row.models.join(', '))}</td><td>${escapeHtml(row.efforts.join(', '))}</td><td>${formatted(format, row.total.processed)}</td><td>${formatted(format, row.total.fresh)}</td><td>${percent(row.total.input > 0 ? row.total.cachedInput / row.total.input : 0)}</td><td>${formatted(format, row.total.output)}</td><td>${formatted(format, row.total.reasoning)}</td><td>${duration(row.durationMs)}</td></tr>`;
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
      return `<tr class="sort-row codex-project-row" data-sort-name="${escapeHtml(name.toLowerCase())}" data-sort-lastactive="${Math.max(0, project.lastActiveAt)}" data-sort-processed="${Math.max(0, project.scope.total.processed)}" data-sort-fresh="${Math.max(0, project.scope.total.fresh)}" data-sort-output="${Math.max(0, project.scope.total.output)}" data-sort-reasoning="${Math.max(0, project.scope.total.reasoning)}" data-sort-roots="${Math.max(0, project.scope.rootTasks)}" data-sort-children="${Math.max(0, project.scope.childThreads)}"><td><button class="group-toggle" data-codex-project-toggle="${projectId}" aria-expanded="false" onclick="toggleCodexProject('${projectId}')">▶</button><strong>${escapeHtml(name)}</strong>${directory}</td><td>${escapeHtml(observed(project.lastActiveAt, copy))}</td><td>${formatted(format, project.scope.total.processed)}</td><td>${formatted(format, project.scope.total.fresh)}</td><td>${formatted(format, project.scope.total.output)}</td><td>${formatted(format, project.scope.total.reasoning)}</td><td>${formatted(format, project.scope.rootTasks)}</td><td>${formatted(format, project.scope.childThreads)}</td><td>${formatted(format, project.scope.approvalReviewerThreads)}</td></tr><tr class="sort-child codex-project-detail-row" data-codex-project-detail="${projectId}" hidden><td colspan="9">${threads || escapeHtml(copy.noThreadData)}</td></tr>`;
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
      ${summaryCard(copy.postChangeCommandsPerFile, behavior.postChangeCommandsPerFile.toFixed(1))}
      ${metricCard(copy.patchRounds, behavior.patchRounds, format)}
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
  insights: CodexInsight[],
  quality: string,
  copy: CodexViewCopy,
  format: NumberFormatter,
): string {
  const scopes = [
    { key: 'recent', label: copy.lastTask, scope: view.lastTask, behavior: view.behaviorScopes.recent },
    { key: '7d', label: copy.last7Days, scope: view.last7Days, behavior: view.behaviorScopes.last7Days },
    { key: '30d', label: copy.last30Days, scope: view.last30Days, behavior: view.behaviorScopes.last30Days },
    { key: 'all', label: copy.allTime, scope: view.allTime, behavior: view.behaviorScopes.allTime },
  ];
  const defaultKey = view.lastTask && view.behaviorScopes.recent ? 'recent' : '7d';
  const buttons = scopes.map(({ key, label }) =>
    `<button class="chart-tab${key === defaultKey ? ' active' : ''}" data-codex-behavior-button="${key}" onclick="showCodexBehaviorScope('${key}')">${escapeHtml(label)}</button>`,
  ).join('');
  const panels = scopes.map(({ key, scope, behavior }) =>
    scope && behavior
      ? behaviorScopePanel(key, scope, behavior, key === defaultKey, copy, format)
      : `<section class="codex-behavior-scope${key === defaultKey ? ' active' : ''}" data-codex-behavior-panel="${key}"><p>${escapeHtml(copy.noRecentTask)}</p></section>`,
  ).join('');
  const insightHtml = insights.map((insight) => insightCard(insight, copy)).join('');
  return `<section class="codex-behavior">
    <div class="chart-tabs codex-behavior-tabs">${buttons}</div>
    ${panels}
    <details class="model-item codex-coverage"><summary>${escapeHtml(copy.coverage)} · ${escapeHtml(copy.quality)}</summary><p><strong>${escapeHtml(copy.coverage)}</strong>: ${formatted(format, view.coverage.indexedFiles)}/${formatted(format, view.coverage.totalFiles)} files · ${formatted(format, view.coverage.indexedBytes)}/${formatted(format, view.coverage.totalBytes)} bytes · ${escapeHtml(view.coverage.complete ? copy.complete : copy.partial)}<br><strong>${escapeHtml(copy.quality)}</strong>: ${quality}</p></details>
    <section class="codex-insights"><h3>${escapeHtml(copy.optimization)} · ${escapeHtml(copy.lastTask)}</h3>${insightHtml}<details class="model-item"><summary>${escapeHtml(copy.pasteConstraint)}</summary><pre>${escapeHtml(localizedConstraint(insights, copy))}</pre></details></section>
  </section>`;
}

export function renderCodexView(
  view: CodexUsageView,
  insights: CodexInsight[],
  copy: CodexViewCopy = CODEX_COPY_EN,
  options: CodexRenderOptions = {},
): string {
  const format = options.formatNumber ?? number;
  const optimizationEnabled = options.optimizationEnabled !== false;
  const quality = view.qualityFlags.length > 0
    ? view.qualityFlags
        .map((item) => `${escapeHtml(item.flag)}: ${formatted(format, item.count)}`)
        .join(', ')
    : copy.complete;
  const identity = view.lastTaskIdentity;
  const taskIdentity = identity
    ? `<article class="model-item codex-task-identity"><h3>${escapeHtml(identity.title ?? copy.unnamedSession)}</h3><div class="model-details-stacked"><span><span class="model-stat-label">${escapeHtml(copy.projectLabel)}</span><strong>${escapeHtml(identity.projectName ?? copy.unidentifiedProject)}</strong></span><span><span class="model-stat-label">${escapeHtml(copy.lastObserved)}</span><strong>${escapeHtml(observed(identity.observedAt, copy))}</strong></span>${identity.projectDirectoryName && identity.projectDirectoryName !== identity.projectName ? `<span><span class="model-stat-label">${escapeHtml(copy.localDirectory)}</span><strong>${escapeHtml(identity.projectDirectoryName)}</strong></span>` : ''}</div></article>`
    : '';
  const taskPanel = view.lastTask
    ? taskIdentity + scopePanel(view.lastTask, copy, format)
    : `<p>${escapeHtml(copy.noRecentTask)}</p>`;
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
  const behaviorButton = optimizationEnabled
    ? `<button class="tab" data-codex-tab-button="behavior" onclick="showCodexTab('behavior')">${escapeHtml(copy.behavior)}</button>`
    : '';
  const behaviorContent = optimizationEnabled
    ? `<div class="codex-tab-content" data-codex-tab-content="behavior">${behaviorPanel(view, insights, quality, copy, format)}</div>`
    : '';

  return `<section class="codex-view" data-provider="codex">
    <nav class="tabs codex-tabs" aria-label="${escapeHtml(copy.title)}">
      <button class="tab active" data-codex-tab-button="recent" onclick="showCodexTab('recent')">${escapeHtml(copy.lastTask)}</button>
      <button class="tab" data-codex-tab-button="7d" onclick="showCodexTab('7d')">${escapeHtml(copy.last7Days)}</button>
      <button class="tab" data-codex-tab-button="30d" onclick="showCodexTab('30d')">${escapeHtml(copy.last30Days)}</button>
      <button class="tab" data-codex-tab-button="all" onclick="showCodexTab('all')">${escapeHtml(copy.allTime)}</button>
      <button class="tab" data-codex-tab-button="threads" onclick="showCodexTab('threads')">${escapeHtml(copy.threads)}</button>
      <button class="tab" data-codex-tab-button="projects" onclick="showCodexTab('projects')">${escapeHtml(copy.projects)}</button>
      ${behaviorButton}
      <button class="tab" data-codex-tab-button="settings" onclick="showCodexTab('settings')">${escapeHtml(copy.settings)}</button>
    </nav>
    <div class="codex-tab-content active" data-codex-tab-content="recent">${limitPanel(view.limits, copy, format)}${taskPanel}</div>
    <div class="codex-tab-content" data-codex-tab-content="7d">${scopePanel(view.last7Days, copy, format)}${periodChart('codex-7d', dailyChartRows(view.last7DaysDaily), copy, format)}${dailyTable(view.last7DaysDaily, copy, format)}</div>
    <div class="codex-tab-content" data-codex-tab-content="30d">${scopePanel(view.last30Days, copy, format)}${periodChart('codex-30d', dailyChartRows(view.last30DaysDaily), copy, format)}${dailyTable(view.last30DaysDaily, copy, format)}</div>
    <div class="codex-tab-content" data-codex-tab-content="all">${scopePanel(view.allTime, copy, format)}${periodChart('codex-all', monthlyChartRows, copy, format)}${monthlyTable(view.monthly, copy, format)}</div>
    <div class="codex-tab-content" data-codex-tab-content="threads">${threadTable(view.recentThreads, projectIndexes, view.totalThreadCount, copy, format)}</div>
    <div class="codex-tab-content" data-codex-tab-content="projects">${projectTable(view, copy, format)}</div>
    ${behaviorContent}
    <div class="codex-tab-content" data-codex-tab-content="settings">${options.settingsHtml ?? ''}</div>
  </section>`;
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
