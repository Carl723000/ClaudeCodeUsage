import {
  CodexInsight,
  CodexInsightKind,
  pasteReadyConstraint,
} from './providers/codex/codexInsights';
import {
  CodexMetricTotals,
  CodexUsageScopeView,
  CodexUsageView,
} from './providers/codex/codexUsage';

export interface CodexViewCopy {
  title: string;
  beta: string;
  lastTask: string;
  last7Days: string;
  last30Days: string;
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
  unavailable: string;
  optimization: string;
  structuralProxy: string;
  pasteConstraint: string;
  compareTitle: string;
  noRecentTask: string;
  insightTitles: Record<CodexInsightKind, string>;
}

export const CODEX_COPY_EN: CodexViewCopy = {
  title: 'Codex usage',
  beta: 'Beta',
  lastTask: 'Recent task',
  last7Days: 'Last 7 days',
  last30Days: 'Last 30 days',
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
  unavailable: 'Unavailable',
  optimization: 'Local optimization signals',
  structuralProxy: 'Structural proxy; command bodies are not read.',
  pasteConstraint: 'Paste-ready constraint',
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

function metricCard(label: string, value: number): string {
  return `<div class="codex-metric-card"><div class="codex-metric-label">${escapeHtml(label)}</div><div class="codex-metric-value">${number(value)}</div></div>`;
}

function dimensionTable(
  title: string,
  rows: Array<{ key: string; totals: CodexMetricTotals }>,
  copy: CodexViewCopy,
): string {
  const body = rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.key)}</td><td>${number(row.totals.processed)}</td><td>${number(row.totals.fresh)}</td><td>${number(row.totals.output)}</td></tr>`,
    )
    .join('');
  return `<section class="codex-dimension"><h3>${escapeHtml(title)}</h3><table><thead><tr><th></th><th>${escapeHtml(copy.processed)}</th><th>${escapeHtml(copy.fresh)}</th><th>${escapeHtml(copy.output)}</th></tr></thead><tbody>${body}</tbody></table></section>`;
}

function scopePanel(scope: CodexUsageScopeView, copy: CodexViewCopy): string {
  return `<div class="codex-scope-panel">
    <div class="codex-metric-grid">
      ${metricCard(copy.processed, scope.total.processed)}
      ${metricCard(copy.fresh, scope.total.fresh)}
      ${metricCard(copy.output, scope.total.output)}
      ${metricCard(copy.reasoning, scope.total.reasoning)}
    </div>
    <div class="codex-thread-card">
      <span>${escapeHtml(copy.rootTasks)}: ${number(scope.rootTasks)}</span>
      <span>${escapeHtml(copy.threads)}: ${number(scope.threads)}</span>
      <span>${escapeHtml(copy.childThreads)}: ${number(scope.childThreads)} (${percent(scope.childFreshShare)} fresh)</span>
      <span>${escapeHtml(copy.approvalReviewers)}: ${number(scope.approvalReviewerThreads)}</span>
      <span>${escapeHtml(copy.cacheShare)}: ${percent(scope.cacheShare)}</span>
      <span>${escapeHtml(copy.duration)}: ${duration(scope.durationMs)}</span>
    </div>
    <div class="codex-dimension-grid">
      ${dimensionTable(copy.models, scope.models, copy)}
      ${dimensionTable(copy.efforts, scope.efforts, copy)}
    </div>
  </div>`;
}

function insightCard(insight: CodexInsight, copy: CodexViewCopy): string {
  const evidence = Object.entries(insight.evidence)
    .map(([key, value]) => `<span>${escapeHtml(key)}: ${escapeHtml(value)}</span>`)
    .join('');
  return `<article class="codex-insight codex-insight-${escapeHtml(insight.severity)}"><h4>${escapeHtml(copy.insightTitles[insight.kind])}</h4><div class="codex-evidence">${evidence}</div>${insight.proxy ? `<p>${escapeHtml(copy.structuralProxy)}</p>` : ''}</article>`;
}

export function renderCodexView(
  view: CodexUsageView,
  insights: CodexInsight[],
  copy: CodexViewCopy = CODEX_COPY_EN,
): string {
  const quality = view.qualityFlags.length > 0
    ? view.qualityFlags
        .map((item) => `${escapeHtml(item.flag)}: ${number(item.count)}`)
        .join(', ')
    : copy.complete;
  const limit = view.limit?.windows[0];
  const limitText = limit
    ? `${escapeHtml(copy.lastObserved)}: ${number(limit.usedPercent)}%`
    : `${escapeHtml(copy.lastObserved)}: ${escapeHtml(copy.unavailable)}`;
  const insightHtml = insights.map((insight) => insightCard(insight, copy)).join('');
  const projectOptions = view.projects
    .map(
      (_, index) =>
        `<option value="project-${index}">${escapeHtml(copy.projectLabel)} ${index + 1}</option>`,
    )
    .join('');
  const taskPanel = view.lastTask
    ? scopePanel(view.lastTask, copy)
    : `<p>${escapeHtml(copy.noRecentTask)}</p>`;
  const projectPanels = view.projects
    .map(
      (project, index) =>
        `<div data-codex-scope-panel="project-${index}" hidden>${scopePanel(project.scope, copy)}</div>`,
    )
    .join('');

  return `<section class="codex-view" data-provider="codex">
    <header class="codex-header"><h2>${escapeHtml(copy.title)} <span class="codex-beta">${escapeHtml(copy.beta)}</span></h2>
      <label><span class="sr-only">Scope</span><select class="codex-scope-select" data-codex-scope>
        <option value="task">${escapeHtml(copy.lastTask)}</option>
        <option value="7d">${escapeHtml(copy.last7Days)}</option>
        <option value="30d">${escapeHtml(copy.last30Days)}</option>
        ${projectOptions}
      </select></label>
    </header>
    <div data-codex-scope-panel="task">${taskPanel}</div>
    <div data-codex-scope-panel="7d" hidden>${scopePanel(view.last7Days, copy)}</div>
    <div data-codex-scope-panel="30d" hidden>${scopePanel(view.last30Days, copy)}</div>
    ${projectPanels}
    <div class="codex-coverage-card"><strong>${escapeHtml(copy.coverage)}</strong>: ${number(view.coverage.indexedFiles)}/${number(view.coverage.totalFiles)} files · ${number(view.coverage.indexedBytes)}/${number(view.coverage.totalBytes)} bytes · ${escapeHtml(view.coverage.complete ? copy.complete : copy.partial)}<br><strong>${escapeHtml(copy.quality)}</strong>: ${quality}</div>
    <div class="codex-limit-card">${limitText}</div>
    <section class="codex-insights"><h3>${escapeHtml(copy.optimization)}</h3>${insightHtml}<details><summary>${escapeHtml(copy.pasteConstraint)}</summary><pre>${escapeHtml(pasteReadyConstraint(insights))}</pre></details></section>
  </section>`;
}

export function renderProviderCompare(
  input: ProviderCompareInput,
  copy: CodexViewCopy = CODEX_COPY_EN,
): string {
  const provider = (
    value: ProviderCompareInput['claude'] | ProviderCompareInput['codex'],
  ): string => `<article class="provider-compare-card"><h3>${escapeHtml(value.label)}</h3><dl><dt>${escapeHtml(copy.input)}</dt><dd>${number(value.input)}</dd><dt>${escapeHtml(copy.cachedInput)}</dt><dd>${number(value.cache)}</dd><dt>${escapeHtml(copy.output)}</dt><dd>${number(value.output)}</dd></dl></article>`;
  return `<section class="provider-compare"><h2>${escapeHtml(copy.compareTitle)}</h2><div class="provider-compare-grid">${provider(input.claude)}${provider(input.codex)}</div></section>`;
}

export function defaultDashboardProvider(
  hasClaude: boolean,
  hasCodex: boolean,
): 'claude' | 'codex' {
  return hasClaude || !hasCodex ? 'claude' : 'codex';
}
