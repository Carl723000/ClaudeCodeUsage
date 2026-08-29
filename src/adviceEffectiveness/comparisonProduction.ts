import { isAdviceIdentifier } from './contract';
import {
  ComparableObservation,
  StoredComparablePair,
  StoredEffort,
  StoredModelFamily,
  buildComparableTaskPair,
} from './comparisonPairing';

export const CODEX_COMPARISON_MEASUREMENT_PROFILE_VERSION = 'codex-task-structural-v1';
export const CODEX_LOCAL_RECOMMENDATION_VERSION = 'codex-local-rule-v1';

export type ComparableCodexRecommendationId =
  | 'recommendation-codex-multi-agent-share'
  | 'recommendation-codex-effort-comparison'
  | 'recommendation-codex-post-patch-tool-intensity'
  | 'recommendation-codex-cache-context'
  | 'recommendation-codex-approval-reviewer-share';

export interface CodexComparableTaskProjection {
  observedAtEpochMs: number;
  total: {
    processed: number;
    fresh: number;
  };
  structural: {
    patchCalls: number;
    toolCalls: number;
    postPatchToolCalls: number;
    taskCompleteCount: number;
  };
  childFreshShare: number;
  approvalReviewerFreshShare: number;
  modelFamilies: StoredModelFamily[];
  efforts: StoredEffort[];
  coverage: {
    complete: boolean;
    identityComplete: boolean;
    qualityFlags: string[];
  };
}

export interface AppliedComparablePairsInput {
  adviceId: string;
  recommendationId: string;
  recommendationVersion: string;
  appliedAtEpochMs: number;
  tasks: readonly CodexComparableTaskProjection[];
}

export type AppliedComparablePairsResult =
  | {
      ok: true;
      status: 'comparable' | 'evidence-insufficient';
      pairs: StoredComparablePair[];
    }
  | { ok: false; reason: 'invalid-input' };

const INPUT_KEYS = [
  'adviceId',
  'appliedAtEpochMs',
  'recommendationId',
  'recommendationVersion',
  'tasks',
] as const;
const TASK_KEYS = [
  'approvalReviewerFreshShare',
  'childFreshShare',
  'coverage',
  'efforts',
  'modelFamilies',
  'observedAtEpochMs',
  'structural',
  'total',
] as const;
const TOTAL_KEYS = ['fresh', 'processed'] as const;
const STRUCTURAL_KEYS = [
  'patchCalls',
  'postPatchToolCalls',
  'taskCompleteCount',
  'toolCalls',
] as const;
const COVERAGE_KEYS = ['complete', 'identityComplete', 'qualityFlags'] as const;
const RECOMMENDATION_IDS = new Set<ComparableCodexRecommendationId>([
  'recommendation-codex-multi-agent-share',
  'recommendation-codex-effort-comparison',
  'recommendation-codex-post-patch-tool-intensity',
  'recommendation-codex-cache-context',
  'recommendation-codex-approval-reviewer-share',
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function isEpochMs(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isCount(value: unknown): value is number {
  return isFiniteNonNegative(value) && Number.isInteger(value);
}

function isShare(value: unknown): value is number {
  return isFiniteNonNegative(value) && value <= 1;
}

function parseIdentifierList(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > 32) return undefined;
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !isAdviceIdentifier(item) || seen.has(item)) return undefined;
    seen.add(item);
    result.push(item);
  }
  return result;
}

function parseEnumList<T extends string>(
  value: unknown,
  allowed: readonly T[],
  maximum: number,
): T[] | undefined {
  if (!Array.isArray(value) || value.length > maximum) return undefined;
  const result: T[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (
      typeof item !== 'string' ||
      !(allowed as readonly string[]).includes(item) ||
      seen.has(item)
    ) {
      return undefined;
    }
    seen.add(item);
    result.push(item as T);
  }
  return result;
}

function parseTask(value: unknown): CodexComparableTaskProjection | undefined {
  if (!isObject(value) || !hasExactKeys(value, TASK_KEYS)) return undefined;
  if (
    !isEpochMs(value.observedAtEpochMs) ||
    !isObject(value.total) ||
    !hasExactKeys(value.total, TOTAL_KEYS) ||
    !isObject(value.structural) ||
    !hasExactKeys(value.structural, STRUCTURAL_KEYS) ||
    !isObject(value.coverage) ||
    !hasExactKeys(value.coverage, COVERAGE_KEYS) ||
    !isFiniteNonNegative(value.total.processed) ||
    !isFiniteNonNegative(value.total.fresh) ||
    !isCount(value.structural.patchCalls) ||
    !isCount(value.structural.toolCalls) ||
    !isCount(value.structural.postPatchToolCalls) ||
    !isCount(value.structural.taskCompleteCount) ||
    !isShare(value.childFreshShare) ||
    !isShare(value.approvalReviewerFreshShare) ||
    typeof value.coverage.complete !== 'boolean' ||
    typeof value.coverage.identityComplete !== 'boolean'
  ) {
    return undefined;
  }
  const modelFamilies = parseEnumList(
    value.modelFamilies,
    ['opus', 'sonnet', 'haiku', 'fable', 'other'] as const,
    5,
  );
  const efforts = parseEnumList(
    value.efforts,
    ['low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'unknown'] as const,
    7,
  );
  const qualityFlags = parseIdentifierList(value.coverage.qualityFlags);
  if (!modelFamilies || !efforts || !qualityFlags) return undefined;
  return {
    observedAtEpochMs: value.observedAtEpochMs,
    total: { processed: value.total.processed, fresh: value.total.fresh },
    structural: {
      patchCalls: value.structural.patchCalls,
      toolCalls: value.structural.toolCalls,
      postPatchToolCalls: value.structural.postPatchToolCalls,
      taskCompleteCount: value.structural.taskCompleteCount,
    },
    childFreshShare: value.childFreshShare,
    approvalReviewerFreshShare: value.approvalReviewerFreshShare,
    modelFamilies,
    efforts,
    coverage: {
      complete: value.coverage.complete,
      identityComplete: value.coverage.identityComplete,
      qualityFlags,
    },
  };
}

export function isComparableCodexRecommendationId(
  value: string,
): value is ComparableCodexRecommendationId {
  return RECOMMENDATION_IDS.has(value as ComparableCodexRecommendationId);
}

function complexityBand(task: CodexComparableTaskProjection): 'low' | 'medium' | 'high' {
  if (
    task.structural.patchCalls === 1 &&
    task.structural.toolCalls <= 8 &&
    task.total.fresh <= 50_000
  ) {
    return 'low';
  }
  if (
    task.structural.patchCalls <= 2 &&
    task.structural.toolCalls <= 24 &&
    task.total.fresh <= 200_000
  ) {
    return 'medium';
  }
  return 'high';
}

function metric(
  recommendationId: ComparableCodexRecommendationId,
  task: CodexComparableTaskProjection,
): ComparableObservation['metric'] | undefined {
  if (recommendationId === 'recommendation-codex-effort-comparison') {
    return {
      name: 'fresh-tokens',
      unit: 'tokens',
      direction: 'lower-is-better',
      value: task.total.fresh,
    };
  }
  if (recommendationId === 'recommendation-codex-post-patch-tool-intensity') {
    return {
      name: 'post-patch-tool-intensity',
      unit: 'multiple',
      direction: 'lower-is-better',
      value: task.structural.postPatchToolCalls / task.structural.patchCalls,
    };
  }
  if (recommendationId === 'recommendation-codex-multi-agent-share') {
    return {
      name: 'subagent-fresh-share',
      unit: 'ratio',
      direction: 'lower-is-better',
      value: task.childFreshShare,
    };
  }
  if (recommendationId === 'recommendation-codex-approval-reviewer-share') {
    return {
      name: 'approval-reviewer-fresh-share',
      unit: 'ratio',
      direction: 'lower-is-better',
      value: task.approvalReviewerFreshShare,
    };
  }
  if (task.total.fresh === 0) return undefined;
  return {
    name: 'processed-to-fresh-ratio',
    unit: 'multiple',
    direction: 'lower-is-better',
    value: task.total.processed / task.total.fresh,
  };
}

function observation(
  recommendationId: ComparableCodexRecommendationId,
  task: CodexComparableTaskProjection,
): ComparableObservation | undefined {
  if (
    !task.coverage.complete ||
    !task.coverage.identityComplete ||
    task.coverage.qualityFlags.length > 0 ||
    task.structural.taskCompleteCount < 1 ||
    task.structural.patchCalls < 1 ||
    task.structural.patchCalls > 2 ||
    task.modelFamilies.length !== 1 ||
    task.efforts.length !== 1 ||
    task.efforts[0] === 'unknown'
  ) {
    return undefined;
  }
  const primaryMetric = metric(recommendationId, task);
  if (!primaryMetric || !Number.isFinite(primaryMetric.value) || primaryMetric.value < 0) {
    return undefined;
  }
  return {
    context: {
      scope: 'task-cohort',
      taskKind: 'small-change',
      complexityBand: complexityBand(task),
      provider: 'codex',
      modelFamily: task.modelFamilies[0],
      effort: task.efforts[0],
      measurementProfileVersion: CODEX_COMPARISON_MEASUREMENT_PROFILE_VERSION,
      metricDefinitionVersion: `${primaryMetric.name}-v1`,
      qualityRubricId: 'task-quality-rubric-v1',
    },
    metric: primaryMetric,
    quality: {
      score: 1,
      passed: 'passed',
      evidenceCount: task.structural.taskCompleteCount,
    },
    evidence: { coverage: 'complete', confidence: 'high', qualityFlags: [] },
    observedAtEpochMs: task.observedAtEpochMs,
  };
}

function cohortKey(value: ComparableObservation): string {
  return JSON.stringify({
    context: value.context,
    metric: {
      name: value.metric.name,
      unit: value.metric.unit,
      direction: value.metric.direction,
    },
  });
}

/**
 * Match already materialized, completed Codex task projections around one
 * explicit applied event. No task key survives this boundary: observations are
 * distinguished only by coarse context, numeric measurements, and timestamp.
 */
export function buildAppliedComparablePairs(input: unknown): AppliedComparablePairsResult {
  if (!isObject(input) || !hasExactKeys(input, INPUT_KEYS)) {
    return { ok: false, reason: 'invalid-input' };
  }
  if (
    typeof input.adviceId !== 'string' ||
    typeof input.recommendationId !== 'string' ||
    typeof input.recommendationVersion !== 'string' ||
    !isAdviceIdentifier(input.adviceId) ||
    !isAdviceIdentifier(input.recommendationId) ||
    !isAdviceIdentifier(input.recommendationVersion) ||
    !isEpochMs(input.appliedAtEpochMs) ||
    !Array.isArray(input.tasks) ||
    input.tasks.length > 1_000
  ) {
    return { ok: false, reason: 'invalid-input' };
  }
  const tasks: CodexComparableTaskProjection[] = [];
  for (const raw of input.tasks) {
    const parsed = parseTask(raw);
    if (!parsed) return { ok: false, reason: 'invalid-input' };
    tasks.push(parsed);
  }
  if (!isComparableCodexRecommendationId(input.recommendationId)) {
    return { ok: true, status: 'evidence-insufficient', pairs: [] };
  }

  const seen = new Set<string>();
  const observations = tasks
    .map((task) => observation(input.recommendationId as ComparableCodexRecommendationId, task))
    .filter((item): item is ComparableObservation => item !== undefined)
    .filter((item) => {
      const key = JSON.stringify(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const beforeByCohort = new Map<string, ComparableObservation[]>();
  const afterByCohort = new Map<string, ComparableObservation[]>();
  for (const item of observations) {
    const target = item.observedAtEpochMs < input.appliedAtEpochMs
      ? beforeByCohort
      : item.observedAtEpochMs > input.appliedAtEpochMs
        ? afterByCohort
        : undefined;
    if (!target) continue;
    const key = cohortKey(item);
    const cohort = target.get(key) ?? [];
    cohort.push(item);
    target.set(key, cohort);
  }

  const pairs: StoredComparablePair[] = [];
  for (const [key, after] of [...afterByCohort.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const before = beforeByCohort.get(key) ?? [];
    before.sort((left, right) => right.observedAtEpochMs - left.observedAtEpochMs);
    after.sort((left, right) => left.observedAtEpochMs - right.observedAtEpochMs);
    const count = Math.min(before.length, after.length);
    for (let index = 0; index < count; index += 1) {
      const paired = buildComparableTaskPair({
        adviceId: input.adviceId,
        recommendationId: input.recommendationId,
        recommendationVersion: input.recommendationVersion,
        before: before[index],
        after: after[index],
        recordedAtEpochMs: after[index].observedAtEpochMs,
      });
      if (paired.ok) pairs.push(paired.value);
    }
  }
  pairs.sort((left, right) => left.pairId.localeCompare(right.pairId));
  return {
    ok: true,
    status: pairs.length > 0 ? 'comparable' : 'evidence-insufficient',
    pairs,
  };
}
