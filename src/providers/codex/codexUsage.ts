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

export interface CodexUsageView {
  lastTask: CodexUsageScopeView | null;
  last7Days: CodexUsageScopeView;
  last30Days: CodexUsageScopeView;
  projects: Array<{ projectKey: string; scope: CodexUsageScopeView }>;
  coverage: CodexIndexCoverage;
  qualityFlags: Array<{ flag: string; count: number }>;
  limit: ProviderLimitSnapshot | null;
}

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

function zeroStructural(): CodexStructuralSummary {
  return {
    filesChanged: 0,
    patchRounds: 0,
    commands: 0,
    postChangeCommands: 0,
    compactCount: 0,
    taskCompleteCount: 0,
  };
}

function addStructural(
  target: CodexStructuralSummary,
  source: CodexStructuralSummary,
): void {
  target.filesChanged += source.filesChanged;
  target.patchRounds += source.patchRounds;
  target.commands += source.commands;
  target.postChangeCommands += source.postChangeCommands;
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
    durationMs += Math.max(
      0,
      (file.session.endedAt ?? 0) - (file.session.startedAt ?? 0),
    );
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

function recentTaskFiles(files: CodexFileAggregate[]): CodexFileAggregate[] {
  const latest = [...files].sort((left, right) => observedAt(right) - observedAt(left))[0];
  if (!latest) {
    return [];
  }
  const bySession = new Map(files.map((file) => [file.session.sessionKey, file]));
  const rootOf = (file: CodexFileAggregate): string => {
    let current = file;
    const visited = new Set<string>();
    while (
      current.session.parentSessionKey &&
      !visited.has(current.session.parentSessionKey)
    ) {
      visited.add(current.session.sessionKey);
      const parent = bySession.get(current.session.parentSessionKey);
      if (!parent) {
        return current.session.parentSessionKey;
      }
      current = parent;
    }
    return current.session.sessionKey;
  };
  const rootKey = rootOf(latest);
  return files.filter((file) => rootOf(file) === rootKey);
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

  return {
    lastTask: recent.length > 0 ? scope(recent) : null,
    last7Days: scope(last7Days),
    last30Days: scope(last30Days),
    projects: [...projects.entries()]
      .map(([projectKey, files]) => ({ projectKey, scope: scope(files) }))
      .sort(
        (left, right) =>
          right.scope.total.fresh - left.scope.total.fresh ||
          left.projectKey.localeCompare(right.projectKey),
      ),
    coverage: snapshot.coverage,
    qualityFlags: Object.entries(snapshot.qualityFlags)
      .map(([flag, count]) => ({ flag, count }))
      .sort((left, right) => left.flag.localeCompare(right.flag)),
    limit: validLimit(snapshot.limit, now),
  };
}
