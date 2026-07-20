import { CodexProviderSnapshot } from './codexProvider';
import {
  CodexFileAggregate,
  CodexIndexCoverage,
  CodexStructuralSummary,
} from './codexIndex';
import {
  freshInputPlusOutput,
  processedTokens,
  ProviderLimitSnapshot,
  ProviderThreadRole,
  ProviderTokenCounts,
} from '../providerTypes';

export interface CodexMetricTotals {
  processed: number;
  fresh: number;
  input: number;
  cachedInput: number;
  output: number;
  reasoning: number;
}

export interface CodexUsageScopeView {
  total: CodexMetricTotals;
  rootTasks: number;
  threads: number;
  childThreads: number;
  childProcessedShare: number;
  childFreshShare: number;
  approvalReviewerThreads: number;
  approvalReviewerFreshShare: number;
  cacheShare: number;
  durationMs: number;
  structural: CodexStructuralSummary;
  models: Array<{ key: string; totals: CodexMetricTotals }>;
  efforts: Array<{ key: string; totals: CodexMetricTotals }>;
}

export interface CodexDailyUsageView {
  day: string;
  total: CodexMetricTotals;
  threads: number;
  childThreads: number;
  approvalReviewerThreads: number;
}

export interface CodexThreadUsageView {
  sessionKey: string;
  parentSessionKey?: string;
  title?: string;
  parentTitle?: string;
  agentNickname?: string;
  observedAt: number;
  role: ProviderThreadRole;
  projectKey: string;
  projectName?: string;
  projectDirectoryName?: string;
  models: string[];
  efforts: string[];
  total: CodexMetricTotals;
  durationMs: number;
  structural: CodexStructuralSummary;
}

export interface CodexProjectUsageView {
  projectKey: string;
  name?: string;
  directoryName?: string;
  lastActiveAt: number;
  threadCount: number;
  scope: CodexUsageScopeView;
}

export interface CodexTaskIdentityView {
  title?: string;
  projectName?: string;
  projectDirectoryName?: string;
  observedAt: number;
}

export interface CodexPeriodUsageView {
  period: string;
  total: CodexMetricTotals;
  threads: number;
}

export interface CodexTokenComposition {
  freshInput: number;
  cachedInput: number;
  output: number;
  reasoningWithinOutput: number;
}

export interface CodexBehaviorView {
  childThreadsPerRootTask: number;
  childFreshShare: number;
  approvalReviewerFreshShare: number;
  highEffortFreshShare: number;
  processedToFreshRatio: number;
  cacheShare: number;
  reasoningOutputShare: number;
  postPatchToolCallsPerPatchCall: number;
  patchCalls: number;
  compactCount: number;
}

export interface CodexBehaviorScopesView {
  recent: CodexBehaviorView | null;
  last7Days: CodexBehaviorView;
  last30Days: CodexBehaviorView;
  allTime: CodexBehaviorView;
}

export interface CodexUsageView {
  lastTask: CodexUsageScopeView | null;
  lastTaskIdentity: CodexTaskIdentityView | null;
  last7Days: CodexUsageScopeView;
  last30Days: CodexUsageScopeView;
  allTime: CodexUsageScopeView;
  projects: CodexProjectUsageView[];
  daily: CodexDailyUsageView[];
  last7DaysDaily: CodexDailyUsageView[];
  last30DaysDaily: CodexDailyUsageView[];
  monthly: CodexPeriodUsageView[];
  recentThreads: CodexThreadUsageView[];
  totalThreadCount: number;
  behaviorScopes: CodexBehaviorScopesView;
  /** Backward-compatible all-time behavior aggregate. */
  behavior: CodexBehaviorView;
  coverage: CodexIndexCoverage;
  qualityFlags: Array<{ flag: string; count: number }>;
  limits: ProviderLimitSnapshot[];
  limit: ProviderLimitSnapshot | null;
}

const MAX_DAILY_ROWS = 90;
const MAX_RECENT_THREAD_ROWS = 1_000;
const HIGH_EFFORTS = new Set(['high', 'xhigh', 'max', 'ultra']);
const DAY_MS = 24 * 60 * 60_000;

function zeroTokens(): ProviderTokenCounts {
  return {
    inputTotal: 0,
    cachedInput: 0,
    outputTotal: 0,
    reasoningOutput: 0,
  };
}

function addTokens(target: ProviderTokenCounts, source: ProviderTokenCounts): void {
  target.inputTotal += Math.max(0, source.inputTotal);
  target.cachedInput =
    (target.cachedInput ?? 0) + Math.max(0, source.cachedInput ?? 0);
  target.outputTotal += Math.max(0, source.outputTotal);
  target.reasoningOutput =
    (target.reasoningOutput ?? 0) + Math.max(0, source.reasoningOutput ?? 0);
}

function metrics(tokens: ProviderTokenCounts): CodexMetricTotals {
  return {
    processed: processedTokens(tokens),
    fresh: freshInputPlusOutput(tokens),
    input: Math.max(0, tokens.inputTotal),
    cachedInput: Math.max(0, tokens.cachedInput ?? 0),
    output: Math.max(0, tokens.outputTotal),
    reasoning: Math.max(0, tokens.reasoningOutput ?? 0),
  };
}

export function tokenComposition(
  total: CodexMetricTotals,
): CodexTokenComposition {
  const input = Math.max(0, total.input);
  const cachedInput = Math.min(input, Math.max(0, total.cachedInput));
  const output = Math.max(0, total.output);
  return {
    freshInput: Math.max(0, input - cachedInput),
    cachedInput,
    output,
    reasoningWithinOutput: Math.min(output, Math.max(0, total.reasoning)),
  };
}

function zeroStructural(): CodexStructuralSummary {
  return {
    patchCalls: 0,
    toolCalls: 0,
    postPatchToolCalls: 0,
    compactCount: 0,
    taskCompleteCount: 0,
  };
}

function addStructural(
  target: CodexStructuralSummary,
  source: CodexStructuralSummary,
): void {
  target.patchCalls += source.patchCalls;
  target.toolCalls += source.toolCalls;
  target.postPatchToolCalls += source.postPatchToolCalls;
  target.compactCount += source.compactCount;
  target.taskCompleteCount += source.taskCompleteCount;
}

function addBuckets(
  target: Map<string, ProviderTokenCounts>,
  source: Record<string, ProviderTokenCounts>,
  fallback: ProviderTokenCounts,
): void {
  const entries = Object.entries(source);
  if (entries.length === 0) {
    const current = target.get('unknown') ?? zeroTokens();
    addTokens(current, fallback);
    target.set('unknown', current);
    return;
  }
  for (const [rawKey, tokens] of entries) {
    const key = rawKey || 'unknown';
    const current = target.get(key) ?? zeroTokens();
    addTokens(current, tokens);
    target.set(key, current);
  }
}

function bucketRows(
  buckets: Map<string, ProviderTokenCounts>,
): Array<{ key: string; totals: CodexMetricTotals }> {
  return [...buckets.entries()]
    .map(([key, tokens]) => ({ key, totals: metrics(tokens) }))
    .sort(
      (left, right) =>
        right.totals.processed - left.totals.processed ||
        left.key.localeCompare(right.key),
    );
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function sessionDuration(file: CodexFileAggregate): number {
  const { startedAt, endedAt } = file.session;
  if (startedAt === undefined || endedAt === undefined) {
    return 0;
  }
  return Math.max(0, endedAt - startedAt);
}

function scope(files: CodexFileAggregate[]): CodexUsageScopeView {
  const totalTokens = zeroTokens();
  const childTokens = zeroTokens();
  const approvalTokens = zeroTokens();
  const structural = zeroStructural();
  const models = new Map<string, ProviderTokenCounts>();
  const efforts = new Map<string, ProviderTokenCounts>();
  let durationMs = 0;
  let rootTasks = 0;
  let childThreads = 0;
  let approvalReviewerThreads = 0;

  for (const file of files) {
    addTokens(totalTokens, file.total);
    addStructural(structural, file.structural);
    addBuckets(models, file.byModel, file.total);
    addBuckets(efforts, file.byEffort, file.total);
    durationMs += sessionDuration(file);
    if (file.session.role === 'root') {
      rootTasks += 1;
    } else if (file.session.role === 'subagent') {
      childThreads += 1;
      addTokens(childTokens, file.total);
    } else if (file.session.role === 'approval-reviewer') {
      approvalReviewerThreads += 1;
      addTokens(approvalTokens, file.total);
    }
  }

  const total = metrics(totalTokens);
  const child = metrics(childTokens);
  const approval = metrics(approvalTokens);
  return {
    total,
    rootTasks,
    threads: files.length,
    childThreads,
    childProcessedShare: ratio(child.processed, total.processed),
    childFreshShare: ratio(child.fresh, total.fresh),
    approvalReviewerThreads,
    approvalReviewerFreshShare: ratio(approval.fresh, total.fresh),
    cacheShare: Math.min(1, ratio(total.cachedInput, total.input)),
    durationMs,
    structural,
    models: bucketRows(models),
    efforts: bucketRows(efforts),
  };
}

function observedAt(file: CodexFileAggregate): number {
  return file.session.endedAt ?? file.session.startedAt ?? 0;
}

function sortedBucketKeys(
  buckets: Record<string, ProviderTokenCounts>,
): string[] {
  const rows = Object.entries(buckets);
  if (rows.length === 0) {
    return ['unknown'];
  }
  return rows
    .sort(
      ([leftKey, left], [rightKey, right]) =>
        processedTokens(right) - processedTokens(left) ||
        leftKey.localeCompare(rightKey),
    )
    .map(([key]) => key || 'unknown');
}

function dailyRows(files: CodexFileAggregate[]): CodexDailyUsageView[] {
  const days = new Map<
    string,
    {
      tokens: ProviderTokenCounts;
      threads: number;
      childThreads: number;
      approvalReviewerThreads: number;
    }
  >();
  for (const file of files) {
    for (const [day, tokens] of Object.entries(file.byDay)) {
      const row = days.get(day) ?? {
        tokens: zeroTokens(),
        threads: 0,
        childThreads: 0,
        approvalReviewerThreads: 0,
      };
      addTokens(row.tokens, tokens);
      row.threads += 1;
      if (file.session.role === 'subagent') {
        row.childThreads += 1;
      } else if (file.session.role === 'approval-reviewer') {
        row.approvalReviewerThreads += 1;
      }
      days.set(day, row);
    }
  }
  return [...days.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .slice(0, MAX_DAILY_ROWS)
    .map(([day, row]) => ({
      day,
      total: metrics(row.tokens),
      threads: row.threads,
      childThreads: row.childThreads,
      approvalReviewerThreads: row.approvalReviewerThreads,
    }));
}

function monthlyRows(files: CodexFileAggregate[]): CodexPeriodUsageView[] {
  const months = new Map<
    string,
    { tokens: ProviderTokenCounts; files: Set<CodexFileAggregate> }
  >();
  for (const file of files) {
    for (const [day, tokens] of Object.entries(file.byDay)) {
      const period = day.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(period)) {
        continue;
      }
      const row = months.get(period) ?? {
        tokens: zeroTokens(),
        files: new Set<CodexFileAggregate>(),
      };
      addTokens(row.tokens, tokens);
      row.files.add(file);
      months.set(period, row);
    }
  }
  return [...months.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([period, row]) => ({
      period,
      total: metrics(row.tokens),
      threads: row.files.size,
    }));
}

function rollingDailyRows(
  rows: CodexDailyUsageView[],
  now: number,
  days: number,
): CodexDailyUsageView[] {
  const end = new Date(now).toISOString().slice(0, 10);
  const start = new Date(now - Math.max(0, days - 1) * DAY_MS)
    .toISOString()
    .slice(0, 10);
  return rows.filter((row) => row.day >= start && row.day <= end);
}

function behaviorView(scopeView: CodexUsageScopeView): CodexBehaviorView {
  const highEffortFresh = scopeView.efforts
    .filter((row) => HIGH_EFFORTS.has(row.key.toLowerCase()))
    .reduce((total, row) => total + row.totals.fresh, 0);
  return {
    childThreadsPerRootTask: ratio(
      scopeView.childThreads,
      scopeView.rootTasks,
    ),
    childFreshShare: scopeView.childFreshShare,
    approvalReviewerFreshShare: scopeView.approvalReviewerFreshShare,
    highEffortFreshShare: ratio(highEffortFresh, scopeView.total.fresh),
    processedToFreshRatio: ratio(
      scopeView.total.processed,
      scopeView.total.fresh,
    ),
    cacheShare: scopeView.cacheShare,
    reasoningOutputShare: ratio(
      scopeView.total.reasoning,
      scopeView.total.output,
    ),
    postPatchToolCallsPerPatchCall: ratio(
      scopeView.structural.postPatchToolCalls,
      scopeView.structural.patchCalls,
    ),
    patchCalls: scopeView.structural.patchCalls,
    compactCount: scopeView.structural.compactCount,
  };
}

function recentThreadRows(
  files: CodexFileAggregate[],
): CodexThreadUsageView[] {
  const titles = new Map(
    files
      .filter((file) => file.session.sessionTitle)
      .map((file) => [file.session.sessionKey, file.session.sessionTitle!]),
  );
  return [...files]
    .sort((left, right) => observedAt(right) - observedAt(left))
    .slice(0, MAX_RECENT_THREAD_ROWS)
    .map((file) => ({
      sessionKey: file.session.sessionKey,
      parentSessionKey: file.session.parentSessionKey,
      title: file.session.sessionTitle,
      parentTitle: file.session.parentSessionKey
        ? titles.get(file.session.parentSessionKey)
        : undefined,
      agentNickname: file.session.agentNickname,
      observedAt: observedAt(file),
      role: file.session.role,
      projectKey: file.session.projectKey ?? 'project:unknown',
      projectName: file.session.projectName,
      projectDirectoryName: file.session.projectDirectoryName,
      models: sortedBucketKeys(file.byModel),
      efforts: sortedBucketKeys(file.byEffort),
      total: metrics(file.total),
      durationMs: sessionDuration(file),
      structural: { ...file.structural },
    }));
}

function recentTaskFiles(files: CodexFileAggregate[]): CodexFileAggregate[] {
  const latest = [...files].sort((left, right) => observedAt(right) - observedAt(left))[0];
  if (!latest) {
    return [];
  }
  const connections = new Map<string, Set<string>>();
  for (const file of files) {
    const key = file.session.sessionKey;
    const peers = connections.get(key) ?? new Set<string>();
    connections.set(key, peers);
    const parent = file.session.parentSessionKey;
    if (parent) {
      peers.add(parent);
      const parentPeers = connections.get(parent) ?? new Set<string>();
      parentPeers.add(key);
      connections.set(parent, parentPeers);
    }
  }
  const visited = new Set<string>();
  const pending = [latest.session.sessionKey];
  while (pending.length > 0) {
    const key = pending.pop()!;
    if (visited.has(key)) {
      continue;
    }
    visited.add(key);
    for (const peer of connections.get(key) ?? []) {
      if (!visited.has(peer)) {
        pending.push(peer);
      }
    }
  }
  return files.filter((file) => visited.has(file.session.sessionKey));
}

function identityValue(
  files: CodexFileAggregate[],
  field: 'projectName' | 'projectDirectoryName',
): string | undefined {
  return [...files]
    .filter((file) => Boolean(file.session[field]?.trim()))
    .sort(
      (left, right) =>
        observedAt(right) - observedAt(left) ||
        Number(right.session.role === 'root') -
          Number(left.session.role === 'root') ||
        left.session.sessionKey.localeCompare(right.session.sessionKey),
    )[0]?.session[field];
}

function taskRootFile(
  files: CodexFileAggregate[],
): CodexFileAggregate | undefined {
  return [...files]
    .filter(
      (file) =>
        file.session.role === 'root' || !file.session.parentSessionKey,
    )
    .sort(
      (left, right) =>
        Number(right.session.role === 'root') -
          Number(left.session.role === 'root') ||
        observedAt(right) - observedAt(left) ||
        left.session.sessionKey.localeCompare(right.session.sessionKey),
    )[0];
}

function validLimit(
  limit: ProviderLimitSnapshot | null,
  now: number,
): ProviderLimitSnapshot | null {
  if (!limit) {
    return null;
  }
  const windows = limit.windows.filter(
    (window) => window.resetsAt === undefined || window.resetsAt > now,
  );
  return windows.length > 0 ? { ...limit, windows } : null;
}

function validLimits(
  limits: ProviderLimitSnapshot[],
  now: number,
): ProviderLimitSnapshot[] {
  return limits
    .map((limit) => validLimit(limit, now))
    .filter((limit): limit is ProviderLimitSnapshot => limit !== null)
    .sort(
      (left, right) =>
        right.observedAt - left.observedAt ||
        (left.limitName ?? left.limitId ?? '').localeCompare(
          right.limitName ?? right.limitId ?? '',
        ),
    );
}

export function buildCodexUsageView(
  snapshot: CodexProviderSnapshot,
  now: number = Date.now(),
): CodexUsageView {
  const recent = recentTaskFiles(snapshot.files);
  const last7Days = snapshot.files.filter(
    (file) => observedAt(file) >= now - 7 * 24 * 60 * 60_000,
  );
  const last30Days = snapshot.files.filter(
    (file) => observedAt(file) >= now - 30 * 24 * 60 * 60_000,
  );
  const projects = new Map<string, CodexFileAggregate[]>();
  for (const file of snapshot.files) {
    const key = file.session.projectKey ?? 'project:unknown';
    const group = projects.get(key) ?? [];
    group.push(file);
    projects.set(key, group);
  }
  const recentScope = recent.length > 0 ? scope(recent) : null;
  const last7DaysScope = scope(last7Days);
  const last30DaysScope = scope(last30Days);
  const allTime = scope(snapshot.files);
  const daily = dailyRows(snapshot.files);
  const taskRoot = taskRootFile(recent);
  const sourceLimits = snapshot.limits.length > 0
    ? snapshot.limits
    : snapshot.limit
      ? [snapshot.limit]
      : [];
  const limits = validLimits(sourceLimits, now);

  return {
    lastTask: recentScope,
    lastTaskIdentity: recent.length > 0
      ? {
          title: taskRoot?.session.sessionTitle,
          projectName: identityValue(recent, 'projectName'),
          projectDirectoryName: identityValue(
            recent,
            'projectDirectoryName',
          ),
          observedAt: Math.max(...recent.map(observedAt)),
        }
      : null,
    last7Days: last7DaysScope,
    last30Days: last30DaysScope,
    allTime,
    projects: [...projects.entries()]
      .map(([projectKey, files]) => {
        return {
          projectKey,
          name: identityValue(files, 'projectName'),
          directoryName: identityValue(files, 'projectDirectoryName'),
          lastActiveAt: Math.max(0, ...files.map(observedAt)),
          threadCount: files.length,
          scope: scope(files),
        };
      })
      .sort(
        (left, right) =>
          right.scope.total.fresh - left.scope.total.fresh ||
          left.projectKey.localeCompare(right.projectKey),
      ),
    daily,
    last7DaysDaily: rollingDailyRows(daily, now, 7),
    last30DaysDaily: rollingDailyRows(daily, now, 30),
    monthly: monthlyRows(snapshot.files),
    recentThreads: recentThreadRows(snapshot.files),
    totalThreadCount: snapshot.files.length,
    behaviorScopes: {
      recent: recentScope ? behaviorView(recentScope) : null,
      last7Days: behaviorView(last7DaysScope),
      last30Days: behaviorView(last30DaysScope),
      allTime: behaviorView(allTime),
    },
    behavior: behaviorView(allTime),
    coverage: snapshot.coverage,
    qualityFlags: Object.entries(snapshot.qualityFlags)
      .map(([flag, count]) => ({ flag, count }))
      .sort((left, right) => left.flag.localeCompare(right.flag)),
    limits,
    limit: validLimit(snapshot.limit, now) ?? limits[0] ?? null,
  };
}
